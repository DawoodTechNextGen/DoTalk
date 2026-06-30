import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ChatGroup } from './chat-group.entity';
import { User } from './user.entity';

@Entity('chat_group_members')
@Unique(['groupId', 'userId'])
export class ChatGroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'group_id' })
  groupId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @Column({ name: 'encrypted_group_key', type: 'text', nullable: true, default: null })
  encryptedGroupKey: string | null;

  @ManyToOne(() => ChatGroup, (group) => group.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @ManyToOne(() => User, (user) => user.groupMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
