import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('contacts')
  async getContacts(@Req() req) {
    return this.chatService.getContacts(req.user);
  }

  @Get('groups')
  async getGroups(@Req() req) {
    return this.chatService.getUserGroups(req.user.id);
  }

  @Get('technologies')
  async getTechnologies() {
    return this.chatService.getTechnologies();
  }

  @Get('internship-types')
  async getInternshipTypes() {
    return this.chatService.getInternshipTypes();
  }

  @Post('groups')
  async createGroup(
    @Req() req,
    @Body() data: { 
      groupName: string; 
      memberIds: number[]; 
      techId?: number; 
      internshipType?: number;
      memberKeys?: { [userId: number]: string };
    },
  ) {
    const creatorId = req.user.id;
    return this.chatService.createGroup(
      data.groupName,
      creatorId,
      data.memberIds,
      data.techId,
      data.internshipType,
      data.memberKeys,
    );
  }

  @Get('history/private/:contactId')
  async getPrivateHistory(@Req() req, @Param('contactId', ParseIntPipe) contactId: number) {
    return this.chatService.getPrivateHistory(req.user.id, contactId);
  }

  @Get('history/group/:groupId')
  async getGroupHistory(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.chatService.getGroupHistory(groupId);
  }

  @Post('read/direct/:senderId')
  async markDirectRead(@Req() req, @Param('senderId', ParseIntPipe) senderId: number) {
    const receiverId = req.user.id;
    await this.chatService.markDirectMessagesAsRead(senderId, receiverId);
    return { success: true };
  }

  @Delete('groups/:groupId/members/:userId')
  async removeMember(
    @Req() req,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const requesterId = req.user.id;
    return this.chatService.removeGroupMember(groupId, userId, requesterId);
  }

  @Post('public-key')
  async savePublicKey(@Req() req, @Body('publicKey') publicKey: string) {
    await this.chatService.savePublicKey(req.user.id, publicKey);
    return { success: true };
  }

  @Get('public-key/:userId')
  async getPublicKey(@Param('userId', ParseIntPipe) userId: number) {
    const publicKey = await this.chatService.getPublicKey(userId);
    return { publicKey };
  }
}
