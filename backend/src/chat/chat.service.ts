import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { ChatGroup } from '../database/entities/chat-group.entity';
import { ChatGroupMember } from '../database/entities/chat-group-member.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Technology } from '../database/entities/technology.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ChatGroup)
    private groupRepository: Repository<ChatGroup>,
    @InjectRepository(ChatGroupMember)
    private memberRepository: Repository<ChatGroupMember>,
    @InjectRepository(ChatMessage)
    private messageRepository: Repository<ChatMessage>,
    @InjectRepository(Technology)
    private techRepository: Repository<Technology>,
  ) {}

  // List all users in the system (contacts list), with unread count, last message preview, and last seen
  async getContacts(currentUser: User): Promise<any[]> {
    const users = await this.userRepository.find({
      where: { id: In(await this.getAvailableContactIds(currentUser.id)) },
      relations: ['technology', 'technology.supervisor'],
      order: { name: 'ASC' },
    });

    const contactsWithMeta = await Promise.all(
      users.map(async (u) => {
        // Unread count
        const unreadCount = await this.messageRepository.count({
          where: { senderId: u.id, receiverId: currentUser.id, isRead: 0 },
        });

        // Last message between these two users
        const lastMessages = await this.messageRepository.find({
          where: [
            { senderId: currentUser.id, receiverId: u.id },
            { senderId: u.id, receiverId: currentUser.id },
          ],
          order: { createdAt: 'DESC' },
          take: 1,
        });
        const lastMessage = lastMessages[0] || null;

        // Check if this contact is a supervisor of any technology
        const isSupervisor = u.userRole === 'supervisor' || u.technology?.supervisorId === u.id;

        return {
          ...u,
          unreadCount,
          lastMessage: lastMessage
            ? {
                text:
                  lastMessage.messageType === 'text'
                    ? lastMessage.message
                    : lastMessage.messageType === 'image'
                    ? '📷 Photo'
                    : '📎 File',
                createdAt: lastMessage.createdAt,
                isMine: lastMessage.senderId === currentUser.id,
              }
            : null,
          isSupervisor,
        };
      }),
    );

    return contactsWithMeta;
  }


  private async getAvailableContactIds(currentUserId: number): Promise<number[]> {
    const users = await this.userRepository.find({ 
      select: ['id'],
      where: { userRole: Not('1') }
    });
    return users.map((u) => u.id).filter((id) => id !== currentUserId);
  }

  getInternshipTypes() {
    return [
      { id: 0, name: 'Task-based' },
      { id: 1, name: 'Learning-based' }
    ];
  }

  // Create a new group and add creator + initial members
  async createGroup(
    groupName: string,
    creatorId: number,
    memberIds: number[],
    techId?: number,
    internshipType?: number,
    memberKeys?: { [userId: number]: string },
  ): Promise<ChatGroup> {
    // Check if technology has supervisor
    let supervisorId = null;
    if (techId) {
      const tech = await this.techRepository.findOne({
        where: { id: techId },
        relations: ['supervisor'],
      });
      if (tech && tech.supervisor) {
        supervisorId = tech.supervisor.id;
      }
    }

    const group = this.groupRepository.create({
      groupName,
      createdBy: creatorId,
      techId,
      internshipType,
      supervisorId,
    });

    const savedGroup = await this.groupRepository.save(group);

    const allMemberIds = [...memberIds];
    if (supervisorId) {
      allMemberIds.push(supervisorId);
    }

    // Add creator as member
    const creatorMember = this.memberRepository.create({
      groupId: savedGroup.id,
      userId: creatorId,
      encryptedGroupKey: memberKeys?.[creatorId] || null,
    });
    await this.memberRepository.save(creatorMember);

    // Add additional members
    if (allMemberIds && allMemberIds.length > 0) {
      const uniqueMemberIds = Array.from(new Set(allMemberIds)).filter((id) => id !== creatorId);
      const memberEntities = uniqueMemberIds.map((userId) =>
        this.memberRepository.create({
          groupId: savedGroup.id,
          userId,
          encryptedGroupKey: memberKeys?.[userId] || null,
        }),
      );
      await this.memberRepository.save(memberEntities);
    }

    return this.getGroupDetails(savedGroup.id);
  }

  // Fetch full details of a specific group, including its members
  async getGroupDetails(groupId: number): Promise<ChatGroup> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['members', 'members.user', 'members.user.technology', 'technology'],
    });

    if (!group) {
      throw new BadRequestException('Group not found');
    }

    return group;
  }

  // Get all groups the user is currently a member of, with unread count + last message per group
  async getUserGroups(userId: number): Promise<any[]> {
    const memberships = await this.memberRepository.find({
      where: { userId },
      select: ['groupId'],
    });

    if (memberships.length === 0) {
      return [];
    }

    const groupIds = memberships.map((m) => m.groupId);

    const groups = await this.groupRepository.find({
      where: { id: In(groupIds) },
      relations: ['members', 'members.user', 'members.user.technology', 'technology'],
    });

    // Attach unread count + last message per group
    const groupsWithMeta = await Promise.all(
      groups.map(async (g) => {
        const unreadCount = await this.messageRepository.count({
          where: { groupId: g.id, isRead: 0 },
        });
        const myCount = await this.messageRepository.count({
          where: { groupId: g.id, senderId: userId, isRead: 0 },
        });

        // Last message in this group
        const lastMessages = await this.messageRepository.find({
          where: { groupId: g.id },
          relations: ['sender'],
          order: { createdAt: 'DESC' },
          take: 1,
        });
        const lastMsg = lastMessages[0] || null;

        return {
          ...g,
          unreadCount: Math.max(0, unreadCount - myCount),
          lastMessage: lastMsg
            ? {
                text:
                  lastMsg.messageType === 'text'
                    ? lastMsg.message
                    : lastMsg.messageType === 'image'
                    ? '📷 Photo'
                    : '📎 File',
                senderName: lastMsg.sender?.name || '',
                createdAt: lastMsg.createdAt,
                isMine: lastMsg.senderId === userId,
              }
            : null,
        };
      }),
    );

    return groupsWithMeta;
  }

  // Save a new message
  async saveMessage(
    senderId: number,
    receiverId: number | null,
    groupId: number | null,
    messageText: string | null,
    messageType: 'text' | 'image' | 'file' = 'text',
    filePath: string | null = null,
    parentId: number | null = null,
    encryptedKeyReceiver: string | null = null,
    encryptedKeySender: string | null = null,
    iv: string | null = null,
  ): Promise<ChatMessage> {
    if (!receiverId && !groupId) {
      throw new BadRequestException('Message must have a recipient or a group');
    }

    const message = this.messageRepository.create({
      senderId,
      receiverId,
      groupId,
      message: messageText,
      messageType,
      filePath,
      parentId,
      isRead: 0,
      encryptedKeyReceiver,
      encryptedKeySender,
      iv,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Fetch the message with relations for socket broadcasting
    return this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'receiver', 'group', 'parent', 'parent.sender'],
    });
  }

  // Load private chat history between two users
  async getPrivateHistory(userId1: number, userId2: number): Promise<ChatMessage[]> {
    return this.messageRepository.find({
      where: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      relations: ['sender', 'receiver', 'parent', 'parent.sender'],
      order: { createdAt: 'ASC' },
      take: 100, // Limit message history
    });
  }

  // Load group chat history
  async getGroupHistory(groupId: number): Promise<ChatMessage[]> {
    return this.messageRepository.find({
      where: { groupId },
      relations: ['sender', 'group', 'parent', 'parent.sender'],
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  // Mark messages as read
  async markAsRead(messageIds: number[]): Promise<void> {
    if (messageIds.length === 0) return;
    await this.messageRepository.update(
      { id: In(messageIds) },
      { isRead: 1 },
    );
  }

  // Mark all direct messages from a specific sender to receiver as read
  async markDirectMessagesAsRead(senderId: number, receiverId: number): Promise<void> {
    await this.messageRepository.update(
      { senderId, receiverId, isRead: 0 },
      { isRead: 1 },
    );
  }

  // Remove a member from a group (only by group creator)
  async removeGroupMember(groupId: number, userId: number, requesterId: number): Promise<ChatGroup> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId }
    });

    if (!group) {
      throw new BadRequestException('Group not found');
    }

    if (group.createdBy !== requesterId) {
      throw new BadRequestException('Only the group creator can remove members');
    }

    if (userId === group.createdBy) {
      throw new BadRequestException('Group creator cannot be removed from the group');
    }

    // Delete membership
    await this.memberRepository.delete({ groupId, userId });

    return this.getGroupDetails(groupId);
  }

  async getTechnologies() {
    return this.techRepository.find({ order: { name: 'ASC' } });
  }

  // Update user's last seen timestamp (called on socket disconnect)
  async updateLastSeen(userId: number): Promise<void> {
    await this.userRepository.update({ id: userId }, { lastSeen: new Date() });
  }

  // Register public key
  async savePublicKey(userId: number, publicKey: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { publicKey });
  }

  // Get user public key
  async getPublicKey(userId: number): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['publicKey'],
    });
    return user ? user.publicKey : null;
  }
}

