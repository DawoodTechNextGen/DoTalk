import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ChatGroup } from './chat-group.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sender_id' })
  senderId: number;

  @Column({ name: 'receiver_id', nullable: true })
  receiverId: number;

  @Column({ name: 'group_id', nullable: true })
  groupId: number;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({
    name: 'message_type',
    type: 'enum',
    enum: ['text', 'image', 'file'],
    default: 'text',
  })
  messageType: 'text' | 'image' | 'file';

  @Column({ name: 'file_path', nullable: true })
  filePath: string;

  @Column({ name: 'is_read', type: 'tinyint', default: 0 })
  isRead: number;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.sentMessages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @ManyToOne(() => User, (user) => user.receivedMessages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiver_id' })
  receiver: User;

  @ManyToOne(() => ChatGroup, (group) => group.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: ChatMessage;
}
