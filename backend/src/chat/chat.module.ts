import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { CloudinaryService } from './cloudinary.service';
import { User } from '../database/entities/user.entity';
import { ChatGroup } from '../database/entities/chat-group.entity';
import { ChatGroupMember } from '../database/entities/chat-group-member.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Technology } from '../database/entities/technology.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ChatGroup, ChatGroupMember, ChatMessage, Technology]),
    NotificationsModule,
    AuthModule,
    // Import JwtModule again config-bound so we can inject JwtService in ChatGateway
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [ChatService, ChatGateway, CloudinaryService],
  controllers: [ChatController],
  exports: [ChatService, CloudinaryService],
})
export class ChatModule {}
