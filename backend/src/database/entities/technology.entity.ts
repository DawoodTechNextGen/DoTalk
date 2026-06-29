import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { ChatGroup } from './chat-group.entity';

@Entity('technologies')
export class Technology {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'supervisor_id', nullable: true })
  supervisorId: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;

  @OneToMany(() => User, (user) => user.technology)
  users: User[];

  @OneToMany(() => ChatGroup, (group) => group.technology)
  chatGroups: ChatGroup[];
}
