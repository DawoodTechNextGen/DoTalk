import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Technology } from './technology.entity';
import { ChatGroup } from './chat-group.entity';
import { ChatGroupMember } from './chat-group-member.entity';
import { ChatMessage } from './chat-message.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false }) // Hide password by default in queries
  password: string;

  @Column({ name: 'user_role', default: 'user' })
  userRole: string;

  @Column({ name: 'supervisor_id', nullable: true })
  supervisorId: number;

  @Column({ name: 'tech_id', nullable: true })
  techId: number;

  @Column({ name: 'internship_type', nullable: true })
  internshipType: number;

  @ManyToOne(() => Technology, (tech) => tech.users, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tech_id' })
  technology: Technology;

  @ManyToOne(() => User, (user) => user.subordinates, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;

  @OneToMany(() => User, (user) => user.supervisor)
  subordinates: User[];

  @OneToMany(() => ChatGroup, (group) => group.creator)
  createdGroups: ChatGroup[];

  @OneToMany(() => ChatGroupMember, (member) => member.user)
  groupMemberships: ChatGroupMember[];

  @OneToMany(() => ChatMessage, (message) => message.sender)
  sentMessages: ChatMessage[];

  @OneToMany(() => ChatMessage, (message) => message.receiver)
  receivedMessages: ChatMessage[];

  @OneToMany(() => PushSubscriptionEntity, (sub) => sub.user)
  pushSubscriptions: PushSubscriptionEntity[];
}
