import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { AuthService } from './auth.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // API upload file avatar vào thư mục uploads/avatars/
  @Post('upload-avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'avatars');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `avatar_${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(
            new BadRequestException('Chỉ chấp nhận các định dạng ảnh (jpg, jpeg, png, gif, webp)!'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB tối đa
      },
    }),
  )
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file ảnh tải lên!');
    }
    const uploadRes = await this.cloudinaryService.uploadFile(file, 'avatars');
    return {
      success: true,
      avatarUrl: uploadRes.fileUrl,
      filename: file.filename,
    };
  }

  @Post('register')
  async register(
    @Body()
    body: {
      username: string;
      displayName: string;
      password: string;
      phone?: string;
    },
  ) {
    return this.authService.register(body.username, body.displayName, body.password, body.phone);
  }

  @Post('login')
  async login(@Body() body: { account: string; password: string }) {
    return this.authService.login(body.account, body.password);
  }

  // API tìm kiếm người dùng theo Số điện thoại hoặc Tên
  @Get('search')
  async searchUsers(
    @Query('q') query: string,
    @Query('current') currentUsername?: string,
  ) {
    return this.authService.searchUsers(query, currentUsername);
  }

  // API lấy danh sách các cuộc trò chuyện gần đây của người dùng từ SQL Server
  // Dùng để hiển thị danh sách chat 1-1 ở cột bên trái (kể cả khi người kia đang offline)
  @Get('conversations')
  async getConversations(@Query('user') username: string) {
    return this.authService.getUserConversations(username);
  }

  @Put('profile')
  async updateProfile(
    @Body()
    body: {
      username: string;
      displayName?: string;
      avatarUrl?: string;
    },
  ) {
    return this.authService.updateProfile(body.username, body.displayName, body.avatarUrl);
  }

  @Put('change-password')
  async changePassword(
    @Body()
    body: {
      username: string;
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changePassword(body.username, body.currentPassword, body.newPassword);
  }
}
