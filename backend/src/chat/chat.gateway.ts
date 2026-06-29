import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseFilters, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from './cloudinary.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  
  // Track active users and their socket IDs: userId -> Set of socketIds
  private activeConnections = new Map<number, Set<string>>();

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Authenticate via token in handshake
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Disconnecting client ${client.id}: No auth token provided.`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload; // Store payload: { id, email, role }

      const userId = payload.id;
      
      // Track connection
      if (!this.activeConnections.has(userId)) {
        this.activeConnections.set(userId, new Set());
      }
      this.activeConnections.get(userId).add(client.id);

      // Join personal room for direct messages
      await client.join(`user_${userId}`);
      this.logger.log(`User ${userId} (socket ${client.id}) connected.`);

      // Join rooms for all groups the user belongs to
      const groups = await this.chatService.getUserGroups(userId);
      for (const group of groups) {
        await client.join(`group_${group.id}`);
        this.logger.debug(`User ${userId} joined room group_${group.id}`);
      }

      // Broadcast user online status
      this.server.emit('userStatusChanged', { userId, status: 'online' });

    } catch (err) {
      this.logger.error(`Connection authentication failed for client ${client.id}: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (user) {
      const userId = user.id;
      const connections = this.activeConnections.get(userId);
      if (connections) {
        connections.delete(client.id);
        if (connections.size === 0) {
          this.activeConnections.delete(userId);
          // Broadcast user offline status
          this.server.emit('userStatusChanged', { userId, status: 'offline' });
          this.logger.log(`User ${userId} went completely offline.`);
        }
      }
      this.logger.log(`User ${userId} (socket ${client.id}) disconnected.`);
    }
  }

  private extractToken(client: Socket): string | null {
    // Check auth handshake object
    let token = client.handshake.auth?.token;
    if (token) return token;

    // Check authorization header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      receiverId: number | null;
      groupId: number | null;
      message: string | null;
      messageType?: 'text' | 'image' | 'file';
      filePath?: string | null;
      parentId?: number | null;
    },
  ) {
    const sender = client.data.user;
    if (!sender) return;

    const messageType = data.messageType || 'text';
    let filePath = data.filePath || null;
    const parentId = data.parentId || null;

    if (filePath && filePath.startsWith('data:')) {
      try {
        filePath = await this.cloudinaryService.uploadBase64(filePath);
      } catch (err) {
        this.logger.error('Failed to upload file to Cloudinary', err);
      }
    }

    // Save message to database
    const savedMsg = await this.chatService.saveMessage(
      sender.id,
      data.receiverId,
      data.groupId,
      data.message,
      messageType,
      filePath,
      parentId,
    );

    // Emit message to appropriate channels
    if (data.groupId) {
      // Group message: emit to the group room
      this.server.to(`group_${data.groupId}`).emit('messageReceived', savedMsg);
      
      // Notify group members who are offline/inactive via Push Notifications
      const group = await this.chatService.getGroupDetails(data.groupId);
      const textPreview = messageType === 'text' ? data.message : `Sent a ${messageType}`;
      
      const offlineMembers = group.members
        .map((m) => m.userId)
        .filter((userId) => userId !== sender.id && !this.isUserOnline(userId));

      for (const userId of offlineMembers) {
        await this.notificationsService.sendNotification(
          userId,
          `Group: ${group.groupName}`,
          `${savedMsg.sender.name}: ${textPreview}`,
          `/chat`,
        );
      }
    } else if (data.receiverId) {
      // Direct message: emit to sender and receiver personal rooms
      this.server.to(`user_${data.receiverId}`).emit('messageReceived', savedMsg);
      this.server.to(`user_${sender.id}`).emit('messageReceived', savedMsg);

      // Check if receiver is offline to trigger Push Notification
      if (!this.isUserOnline(data.receiverId)) {
        const textPreview = messageType === 'text' ? data.message : `Sent a ${messageType}`;
        await this.notificationsService.sendNotification(
          data.receiverId,
          `New message from ${savedMsg.sender.name}`,
          textPreview,
          `/chat`,
        );
      }
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: number | null; groupId: number | null; isTyping: boolean },
  ) {
    const user = client.data.user;
    if (!user) return;

    const payload = { userId: user.id, isTyping: data.isTyping };

    if (data.groupId) {
      // Broadcast to other members in the group room
      client.to(`group_${data.groupId}`).emit('typingStatus', { ...payload, groupId: data.groupId });
    } else if (data.receiverId) {
      // Send directly to receiver personal room
      client.to(`user_${data.receiverId}`).emit('typingStatus', { ...payload, receiverId: data.receiverId });
    }
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: number[]; senderId?: number },
  ) {
    const user = client.data.user;
    if (!user) return;

    if (data.messageIds && data.messageIds.length > 0) {
      await this.chatService.markAsRead(data.messageIds);
      
      // If a senderId was provided, notify their personal room that messages have been read
      if (data.senderId) {
        this.server.to(`user_${data.senderId}`).emit('messagesMarkedRead', {
          readerId: user.id,
          messageIds: data.messageIds,
        });
      }
    }
  }

  // Subscribe to newly created groups dynamically
  @SubscribeMessage('joinGroupRoom')
  async handleJoinGroupRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: number },
  ) {
    const user = client.data.user;
    if (!user) return;
    
    await client.join(`group_${data.groupId}`);
    this.logger.log(`Socket ${client.id} (User ${user.id}) joined new group room: group_${data.groupId}`);
  }

  private isUserOnline(userId: number): boolean {
    const connections = this.activeConnections.get(userId);
    return connections !== undefined && connections.size > 0;
  }
}
