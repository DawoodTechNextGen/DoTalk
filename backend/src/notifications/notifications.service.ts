import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushSubscriptionEntity } from '../database/entities/push-subscription.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private subscriptionRepository: Repository<PushSubscriptionEntity>,
    private configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const email = this.configService.get<string>('VAPID_EMAIL');

    if (publicKey && privateKey && email) {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.logger.log('Web Push VAPID details configured successfully.');
    } else {
      this.logger.error('Web Push VAPID credentials are missing in env.');
    }
  }

  async saveSubscription(userId: number, subscriptionJson: any): Promise<PushSubscriptionEntity> {
    const subStr = typeof subscriptionJson === 'string' 
      ? subscriptionJson 
      : JSON.stringify(subscriptionJson);

    // Check if subscription already exists for user to avoid duplicate notifications
    let subscription = await this.subscriptionRepository.findOne({
      where: { userId, subscriptionJson: subStr },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        userId,
        subscriptionJson: subStr,
      });
      await this.subscriptionRepository.save(subscription);
    }

    return subscription;
  }

  async sendNotification(
    userId: number,
    title: string,
    body: string,
    url: string,
    options?: {
      tag?: string;          // Notification grouping tag (same tag replaces old notification)
      senderInitial?: string; // First letter of sender name for avatar
    },
  ): Promise<void> {
    const subscriptions = await this.subscriptionRepository.find({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No push subscriptions found for user ID: ${userId}`);
      return;
    }

    // Rich payload — service worker will use all these fields
    const payload = JSON.stringify({
      title,
      body,
      url,
      tag: options?.tag || `dotalk-user-${userId}`,
      senderInitial: options?.senderInitial || '💬',
      timestamp: Date.now(),
    });

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = JSON.parse(sub.subscriptionJson);
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err) {
        this.logger.error(`Failed to send web push notification: ${err.message}`);
        // If subscription is expired or invalid (410 Gone / 404 Not Found), delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          this.logger.warn(`Removing expired push subscription ID: ${sub.id}`);
          await this.subscriptionRepository.delete(sub.id);
        }
      }
    });

    await Promise.all(sendPromises);
  }
}
