import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';

// Import Entities
import { User } from './database/entities/user.entity';
import { Technology } from './database/entities/technology.entity';
import { ChatGroup } from './database/entities/chat-group.entity';
import { ChatGroupMember } from './database/entities/chat-group-member.entity';
import { ChatMessage } from './database/entities/chat-message.entity';
import { PushSubscriptionEntity } from './database/entities/push-subscription.entity';

@Module({
  imports: [
    // Configure environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // TypeORM MySQL connection setup
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'task_management'),
        entities: [
          User,
          Technology,
          ChatGroup,
          ChatGroupMember,
          ChatMessage,
          PushSubscriptionEntity,
        ],
        synchronize: false, // Ensure we don't drop or alter DB columns automatically in production/existing tables
        logging: false,
      }),
    }),

    AuthModule,
    ChatModule,
    NotificationsModule,
  ],
})
export class AppModule {}
