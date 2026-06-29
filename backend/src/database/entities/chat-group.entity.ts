import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Technology } from './technology.entity';
import { User } from './user.entity';
import { ChatGroupMember } from './chat-group-member.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_groups')
export class ChatGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'group_name' })
  groupName: string;

  @Column({ name: 'tech_id', nullable: true })
  techId: number;

  @Column({ name: 'internship_type', nullable: true })
  internshipType: number;

  @Column({ name: 'supervisor_id', nullable: true })
  supervisorId: number;

  @Column({ name: 'created_by' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Technology, (tech) => tech.chatGroups, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tech_id' })
  technology: Technology;

  @ManyToOne(() => User, (user) => user.createdGroups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;

  @OneToMany(() => ChatGroupMember, (member) => member.group)
  members: ChatGroupMember[];

  @OneToMany(() => ChatMessage, (message) => message.group)
  messages: ChatMessage[];
}
