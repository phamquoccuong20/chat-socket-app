import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'chat');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `chat_${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024, // Tối đa 25MB mỗi file
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy tệp tải lên!');
    }

    // Xử lý encode tên file tiếng Việt chính xác
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch {
      originalName = file.originalname;
    }

    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:8000';
    const fileUrl = `${baseUrl}/uploads/chat/${file.filename}`;

    return {
      success: true,
      fileUrl,
      fileName: originalName,
      fileType: file.mimetype || 'application/octet-stream',
      fileSize: file.size,
    };
  }

  // API lấy danh sách các nhóm chat của user
  @Get('groups')
  async getUserGroups(@Query('user') username: string) {
    if (!username) return [];
    return this.chatService.getUserGroups(username);
  }

  // API tạo nhóm chat mới
  @Post('groups')
  async createGroup(
    @Body()
    body: {
      name: string;
      creatorUsername: string;
      memberUsernames: string[];
    },
  ) {
    const group = await this.chatService.createGroup(
      body.name,
      body.creatorUsername,
      body.memberUsernames || [],
    );

    // Bắn socket thông báo nhóm mới cho tất cả thành viên
    this.chatGateway.notifyGroupCreated(group, [body.creatorUsername, ...(body.memberUsernames || [])]);

    return { success: true, group };
  }

  // API lấy danh sách thành viên trong nhóm
  @Get('groups/:id/members')
  async getGroupMembers(@Param('id') roomId: string) {
    return this.chatService.getGroupMembers(roomId);
  }

  // API cập nhật tên và ảnh đại diện của nhóm
  @Put('groups/:id')
  async updateGroup(
    @Param('id') roomId: string,
    @Body() body: { name?: string; avatarUrl?: string; updatedBy?: string },
  ) {
    const result = await this.chatService.updateGroup(
      roomId,
      body.name,
      body.avatarUrl,
      body.updatedBy,
    );

    // Bắn socket thông báo nhóm đã được cập nhật cho tất cả thành viên trong phòng
    this.chatGateway.server.to(roomId).emit('groupUpdated', result.group);

    if (result.systemMessages && result.systemMessages.length > 0) {
      for (const msg of result.systemMessages) {
        this.chatGateway.server.to(roomId).emit('newMessage', msg);
      }
    }

    return { success: true, ...result };
  }

  // API lấy danh sách toàn bộ file và ảnh đã gửi trong phòng chat
  @Get('rooms/:id/media')
  async getRoomMedia(@Param('id') roomId: string) {
    return this.chatService.getRoomMedia(roomId);
  }

  // API thêm thành viên mới vào nhóm
  @Post('groups/:id/members')
  async addGroupMembers(
    @Param('id') roomId: string,
    @Body()
    body: {
      memberUsernames: string[];
      addedBy: string;
    },
  ) {
    const result = await this.chatService.addGroupMembers(
      roomId,
      body.memberUsernames || [],
      body.addedBy,
    );

    const room = await this.chatService.getOrCreateRoom(roomId);
    const updatedGroup = {
      id: roomId,
      name: room.name,
      isGroup: true,
      memberCount: result.members.length,
      members: result.members,
    };

    const allTargetUsernames = [
      ...(body.memberUsernames || []),
      ...(result.addedUsernames || []),
      ...(result.addedDisplayNames || []),
    ];
    this.chatGateway.notifyGroupUpdated(roomId, allTargetUsernames, updatedGroup, result.systemMessage);

    return { success: true, result };
  }

  // API xóa nhóm chat
  @Delete('groups/:id')
  async deleteGroup(@Param('id') roomId: string) {
    const result = await this.chatService.deleteGroup(roomId);
    this.chatGateway.notifyGroupDeleted(roomId);
    return { success: true, result };
  }

  // API rời khỏi nhóm chat
  @Post('groups/:id/leave')
  async leaveGroup(
    @Param('id') roomId: string,
    @Body() body: { username: string },
  ) {
    const result = await this.chatService.leaveGroup(roomId, body.username);
    if (result.groupDeleted) {
      this.chatGateway.notifyGroupDeleted(roomId);
    } else {
      const room = await this.chatService.getOrCreateRoom(roomId);
      const updatedGroup = {
        id: roomId,
        name: room.name,
        isGroup: true,
        memberCount: result.remainingCount,
        members: result.members,
      };
      this.chatGateway.server.to(roomId).emit('groupUpdated', updatedGroup);
      if (result.systemMessage) {
        this.chatGateway.server.to(roomId).emit('newMessage', result.systemMessage);
      }
      if (result.transferSystemMessage) {
        this.chatGateway.server.to(roomId).emit('newMessage', result.transferSystemMessage);
      }
    }
    return { success: true, result };
  }

  // API chuyển quyền trưởng nhóm
  @Post('groups/:id/transfer-leader')
  async transferGroupLeader(
    @Param('id') roomId: string,
    @Body() body: { targetUserId: string; currentUsername: string },
  ) {
    const result = await this.chatService.transferGroupLeader(
      roomId,
      body.targetUserId,
      body.currentUsername,
    );
    const room = await this.chatService.getOrCreateRoom(roomId);
    const updatedGroup = {
      id: roomId,
      name: room.name,
      avatarUrl: (room as any).avatarUrl || null,
      isGroup: true,
      memberCount: result.members.length,
      members: result.members,
    };
    this.chatGateway.server.to(roomId).emit('groupUpdated', updatedGroup);
    if (result.systemMessage) {
      this.chatGateway.server.to(roomId).emit('newMessage', result.systemMessage);
    }
    return { success: true, result };
  }

  // API xóa cuộc trò chuyện 1-1
  @Delete('conversations/:roomId')
  async deleteConversation(@Param('roomId') roomId: string) {
    const result = await this.chatService.deleteConversation(roomId);
    this.chatGateway.notifyConversationDeleted(roomId);
    return { success: true, result };
  }
}

