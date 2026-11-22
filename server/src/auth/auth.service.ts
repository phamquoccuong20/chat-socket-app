import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // Kiểm tra độ phức tạp của mật khẩu
  validatePasswordComplexity(password: string): void {
    if (!password || password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự!');
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 1 chữ thường (a-z)!');
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 1 chữ hoa (A-Z)!');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (ví dụ: !@#$%^&*...)!');
    }
  }

  // Đăng ký tài khoản mới (kèm số điện thoại)
  async register(username: string, displayName: string, password: string, phone?: string) {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim().replace(/\s+/g, '') : undefined;
    
    // Kiểm tra độ phức tạp mật khẩu
    this.validatePasswordComplexity(password);

    // Kiểm tra tên đăng nhập đã tồn tại chưa
    const existingUser = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existingUser) {
      throw new BadRequestException('Tên đăng nhập này đã được sử dụng!');
    }

    // Kiểm tra số điện thoại đã tồn tại chưa
    if (cleanPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: cleanPhone },
      });

      if (existingPhone) {
        throw new BadRequestException('Số điện thoại này đã được đăng ký cho tài khoản khác!');
      }
    }

    // Mã hóa mật khẩu bảo mật bằng bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: cleanUsername,
        displayName: displayName.trim() || cleanUsername,
        phone: cleanPhone || null,
        password: hashedPassword,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // Đăng nhập bằng Tên đăng nhập HOẶC Số điện thoại
  async login(account: string, password: string) {
    const cleanAccount = account.trim();

    // Tìm kiếm bằng username hoặc phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanAccount.toLowerCase() },
          { phone: cleanAccount },
        ],
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Tên đăng nhập / Số điện thoại hoặc mật khẩu không đúng!');
    }

    // So sánh mật khẩu
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Tên đăng nhập / Số điện thoại hoặc mật khẩu không đúng!');
    }

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // Cập nhật Profile (Tên hiển thị, Avatar)
  async updateProfile(username: string, displayName?: string, avatarUrl?: string) {
    const cleanUsername = username.trim().toLowerCase();

    const user = await this.prisma.user.update({
      where: { username: cleanUsername },
      data: {
        displayName: displayName ? displayName.trim() : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // Đổi mật khẩu
  async changePassword(username: string, currentPassword: string, newPassword: string) {
    const cleanUsername = username.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Người dùng không tồn tại!');
    }

    // Kiểm tra mật khẩu cũ
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác!');
    }

    // Kiểm tra độ phức tạp mật khẩu mới
    this.validatePasswordComplexity(newPassword);

    // Băm mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { username: cleanUsername },
      data: {
        password: hashedPassword,
      },
    });

    return {
      success: true,
      message: 'Đổi mật khẩu thành công!',
    };
  }

  // Tìm kiếm bạn bè qua Số điện thoại hoặc Tên đăng nhập / Tên hiển thị (nếu để trống trả về danh sách gợi ý)
  async searchUsers(query?: string, currentUsername?: string) {
    const cleanQuery = query ? query.trim() : '';

    return this.prisma.user.findMany({
      where: {
        AND: [
          currentUsername ? { username: { not: currentUsername.toLowerCase() } } : {},
          cleanQuery
            ? {
                OR: [
                  { phone: { contains: cleanQuery } },
                  { username: { contains: cleanQuery.toLowerCase() } },
                  { displayName: { contains: cleanQuery } },
                ],
              }
            : {},
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        phone: true,
        avatarUrl: true,
      },
      take: 25,
    });
  }

  /**
   * LẤY DANH SÁCH CÁC CUỘC TRÒ CHUYỆN GẦN ĐÂY CỦA USER TỪ SQL SERVER:
   * - Mục đích: Khi người dùng đăng nhập vào web, hệ thống tự động tải lại danh sách những người
   *   họ từng nhắn tin để hiển thị ở mục "CHAT RIÊNG 1-1" bên cột trái (kể cả khi đối phương đang Offline).
   * - Bao gồm: Tên bạn chat, Avatar, nội dung tin nhắn gần nhất, và thời gian gửi (giờ Việt Nam).
   */
  async getUserConversations(identifier: string) {
    if (!identifier) return [];
    const cleanId = identifier.trim();

    // Bước 1: Tìm thông tin người dùng hiện tại trong bảng users
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanId.toLowerCase() },
          { displayName: cleanId },
        ],
      },
    });

    if (!user) return [];

    // Bước 2: Quét toàn bộ tin nhắn trong SQL Server thuộc các phòng chat riêng ('dm_...')
    // mà người này có liên quan (hoặc là người gửi, hoặc tên nằm trong mã phòng)
    // Sắp xếp 'desc' (mới nhất lên đầu) để dễ lấy tin nhắn sau cùng.
    const messages = await this.prisma.message.findMany({
      where: {
        roomId: { startsWith: 'dm_' },
        OR: [
          { senderId: user.id },
          { roomId: { contains: user.username } },
          { roomId: { contains: user.displayName } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Bước 3: Gom nhóm theo từng phòng (roomId) để lấy tin nhắn mới nhất làm preview
    const conversationMap = new Map<string, any>();

    for (const msg of messages) {
      if (!conversationMap.has(msg.roomId)) {
        // Tách lấy tên của người chat cùng từ roomId (dạng: dm_UserA_UserB)
        const parts = msg.roomId.replace('dm_', '').split('_');
        const otherName = parts.find((p) => p !== user.username && p !== user.displayName) || parts[0];

        // Hiển thị nội dung tin nhắn xem trước ở cột trái:
        // Nếu là ảnh: '[Hình ảnh]', nếu là file: '[Tệp] ...', nếu thu hồi: 'Tin nhắn đã được thu hồi'
        let previewText = msg.content;
        if ((msg as any).isRevoked) {
          previewText = 'Tin nhắn đã được thu hồi';
        } else if (!previewText || !previewText.trim()) {
          if ((msg as any).fileUrl) {
            previewText = (msg as any).fileType?.startsWith('image/')
              ? '[Hình ảnh]'
              : `[Tệp] ${(msg as any).fileName || 'tài liệu'}`;
          }
        }

        conversationMap.set(msg.roomId, {
          roomId: msg.roomId,
          contactName: otherName,
          lastMessage: previewText,
          lastTime: msg.createdAt.toISOString().replace('Z', '+07:00'), // Giờ Việt Nam GMT+7
          lastSender: msg.sender.displayName || msg.sender.username,
        });
      }
    }

    // Bước 4: Lấy đầy đủ thông tin (Tên hiển thị, Avatar, SĐT) của người chat cùng để trả về Frontend
    const conversations = [];
    for (const item of conversationMap.values()) {
      const contact = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: item.contactName.toLowerCase() },
            { displayName: item.contactName },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          phone: true,
          avatarUrl: true,
        },
      });

      conversations.push({
        ...item,
        contactUser: contact || {
          username: item.contactName,
          displayName: item.contactName,
          avatarUrl: null,
        },
      });
    }

    return conversations;
  }
}
