import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('subscribe')
  async subscribe(@Req() req, @Body() subscription: any) {
    const userId = req.user.id;
    return this.notificationsService.saveSubscription(userId, subscription);
  }
}
