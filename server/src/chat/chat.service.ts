import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'messages') AND name = 'replyToId')
        BEGIN
          ALTER TABLE messages ADD replyToId NVARCHAR(100) NULL, replyToSender NVARCHAR(255) NULL, replyToContent NVARCHAR(MAX) NULL;
        END

        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'rooms') AND name = 'creatorId')
        BEGIN
          ALTER TABLE rooms ADD creatorId NVARCHAR(100) NULL;
        END

        UPDATE r
        SET r.creatorId = m.senderId
        FROM rooms r
        JOIN messages m ON m.roomId = r.id
        WHERE r.isGroup = 1 AND r.creatorId IS NULL AND (m.content LIKE N'%đã tạo nhóm%' OR m.content LIKE N'%tạo nhóm%');

        UPDATE r
        SET r.creatorId = (
          SELECT TOP 1 rm.userId FROM room_members rm WHERE rm.roomId = r.id ORDER BY rm.joinedAt ASC
        )
        FROM rooms r
        WHERE r.isGroup = 1 AND r.creatorId IS NULL;
      `);
      console.log('[DB] Checked/added reply & creatorId columns successfully');
    } catch (err) {
      console.warn('[DB] Could not ensure columns on tables:', err);
    }
  }

  // Tạo hoặc lấy User từ database
  async getOrCreateUser(username: string) {
    // 1. Tìm user theo username hoặc displayName
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { displayName: username }],
      },
    });

    if (existing) return existing;

    // 2. Nếu chưa có thì tạo mới
    try {
      return await this.prisma.user.create({
        data: {
          username,
          displayName: username,
        },
      });
    } catch {
      return this.prisma.user.findFirst({
        where: {
          OR: [{ username }, { displayName: username }],
        },
      });
    }
  }

  // Tạo hoặc lấy Room từ database
  async getOrCreateRoom(roomId: string, name?: string, isGroup = true) {
    const existing = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (existing) return existing;

    return this.prisma.room.create({
      data: {
        id: roomId,
        name: name || roomId,
        isGroup,
      },
    });
  }

  /**
   * LƯU TIN NHẮN MỚI VÀO SQL SERVER (Bảng messages):
   * - Hỗ trợ cả tin nhắn văn bản, tệp tin và hình ảnh
   * - Khi bất kỳ ai gửi tin nhắn (dù người nhận đang online hay offline),
   *   hệ thống đều lập tức ghi xuống SQL Server để bảo toàn dữ liệu vĩnh viễn.
   * - Tự động tính toán theo chuẩn giờ Việt Nam (GMT+7) để DBeaver hiển thị chính xác.
   */
  async saveMessage(
    roomId: string,
    username: string,
    content: string,
    fileData?: {
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
    },
    replyData?: {
      replyToId?: string;
      replyToSender?: string;
      replyToContent?: string;
    },
  ) {
    const user = await this.getOrCreateUser(username);
    const room = await this.getOrCreateRoom(roomId);

    // Lưu theo múi giờ Việt Nam (GMT+7)
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const id = require('crypto').randomUUID();

    const cleanContent = (content || '').trim();
    const fileUrl = fileData?.fileUrl || null;
    const fileName = fileData?.fileName || null;
    const fileType = fileData?.fileType || null;
    const fileSize = fileData?.fileSize ? Number(fileData.fileSize) : null;
    const replyToId = replyData?.replyToId || null;
    const replyToSender = replyData?.replyToSender || null;
    const replyToContent = replyData?.replyToContent || null;

    // Lưu an toàn vào SQL Server
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, content, senderId, roomId, fileUrl, fileName, fileType, fileSize, replyToId, replyToSender, replyToContent, createdAt, isRevoked, isPinned)
      VALUES (
        '${id}',
        N'${cleanContent.replace(/'/g, "''")}',
        '${user.id}',
        '${room.id}',
        ${fileUrl ? `'${fileUrl.replace(/'/g, "''")}'` : 'NULL'},
        ${fileName ? `N'${fileName.replace(/'/g, "''")}'` : 'NULL'},
        ${fileType ? `'${fileType.replace(/'/g, "''")}'` : 'NULL'},
        ${fileSize !== null ? fileSize : 'NULL'},
        ${replyToId ? `'${replyToId.replace(/'/g, "''")}'` : 'NULL'},
        ${replyToSender ? `N'${replyToSender.replace(/'/g, "''")}'` : 'NULL'},
        ${replyToContent ? `N'${replyToContent.replace(/'/g, "''")}'` : 'NULL'},
        '${vnTime.toISOString()}',
        0,
        0
      )
    `);

    return {
      id,
      roomId: room.id,
      sender: user.displayName || user.username,
      content: cleanContent,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      replyToId,
      replyToSender,
      replyToContent,
      isRevoked: false,
      isPinned: false,
      createdAt: vnTime.toISOString().replace('Z', '+07:00'),
    };
  }

  /**
   * TẢI LỊCH SỬ TIN NHẮN CỦA MỘT PHÒNG TỪ SQL SERVER:
   * - Kích hoạt khi: Người dùng bấm vào phòng chat hoặc vừa online trở lại (joinRoom).
   * - Nạp đầy đủ thông tin tệp tin / hình ảnh / ghim / thu hồi / phản hồi tin nhắn.
   */
  async getRoomMessages(roomId: string, limit = 50) {
    const rawMessages: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT TOP (${Number(limit)})
        m.id, m.content, ISNULL(m.isRevoked, 0) as isRevoked, ISNULL(m.isPinned, 0) as isPinned,
        m.fileUrl, m.fileName, m.fileType, m.fileSize,
        m.replyToId, m.replyToSender, m.replyToContent,
        m.createdAt, m.roomId,
        u.displayName, u.username
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.roomId = '${roomId.replace(/'/g, "''")}'
      ORDER BY m.createdAt ASC
    `);

    return rawMessages.map((m) => {
      const isSystem =
        Boolean(m.content?.startsWith('🚪')) ||
        Boolean(m.content?.includes('đã rời khỏi nhóm')) ||
        Boolean(m.content?.startsWith('🎉')) ||
        Boolean(m.content?.includes('đã tạo nhóm')) ||
        Boolean(m.content?.includes('đã thêm')) ||
        Boolean(m.content?.startsWith('🖼️')) ||
        Boolean(m.content?.includes('ảnh đại diện')) ||
        Boolean(m.content?.startsWith('✏️')) ||
        Boolean(m.content?.includes('đổi tên nhóm')) ||
        Boolean(m.content?.startsWith('👑')) ||
        Boolean(m.content?.includes('trưởng nhóm')) ||
        Boolean(m.content?.includes('đã tham gia'));

      return {
        id: m.id,
        roomId: m.roomId,
        sender: isSystem ? 'System' : (m.displayName || m.username),
        isSystem,
        content: Boolean(m.isRevoked) ? 'Tin nhắn đã được thu hồi' : m.content,
        fileUrl: Boolean(m.isRevoked) ? null : m.fileUrl,
        fileName: Boolean(m.isRevoked) ? null : m.fileName,
        fileType: Boolean(m.isRevoked) ? null : m.fileType,
        fileSize: Boolean(m.isRevoked) ? null : m.fileSize,
        replyToId: m.replyToId || null,
        replyToSender: m.replyToSender || null,
        replyToContent: m.replyToContent || null,
        isRevoked: Boolean(m.isRevoked),
        isPinned: Boolean(m.isPinned),
        createdAt: new Date(m.createdAt).toISOString().replace('Z', '+07:00'),
      };
    });
  }

  /**
   * LẤY TOÀN BỘ FILE VÀ HÌNH ẢNH ĐÃ CHIA SẺ TRONG PHÒNG:
   * - Phục vụ tính năng xem kho lưu trữ media/file tương tự Zalo & Telegram
   * - Chỉ lấy những tin nhắn có fileUrl và chưa bị thu hồi
   */
  async getRoomMedia(roomId: string) {
    const raw: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT 
        m.id, m.content, m.fileUrl, m.fileName, m.fileType, m.fileSize,
        m.createdAt, m.roomId,
        u.displayName, u.username
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.roomId = '${roomId.replace(/'/g, "''")}'
        AND m.fileUrl IS NOT NULL
        AND (m.isRevoked = 0 OR m.isRevoked IS NULL)
      ORDER BY m.createdAt DESC
    `);

    return raw.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      sender: m.displayName || m.username,
      content: m.content,
      fileUrl: m.fileUrl,
      fileName: m.fileName,
      fileType: m.fileType,
      fileSize: m.fileSize,
      createdAt: new Date(m.createdAt).toISOString().replace('Z', '+07:00'),
    }));
  }

  /**
   * THU HỒI TIN NHẮN:
   * - Kiểm tra quyền (chỉ người gửi mới được thu hồi)
   * - Nếu tin nhắn có đính kèm file hoặc hình ảnh, tự động xóa file vật lý trên ổ cứng server
   * - Đánh dấu isRevoked = 1, chuyển nội dung thành 'Tin nhắn đã được thu hồi' và xóa sạch fileUrl trong SQL Server
   */
  async revokeMessage(messageId: string, username: string) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT m.id, m.content, m.fileUrl, m.senderId, m.roomId, m.createdAt,
             u.displayName, u.username
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.id = '${messageId.replace(/'/g, "''")}'
    `);

    if (!rows || rows.length === 0) {
      throw new Error('Tin nhắn không tồn tại!');
    }

    const message = rows[0];
    const senderName = message.displayName || message.username;
    if (senderName !== username && message.username !== username) {
      throw new Error('Bạn chỉ có thể thu hồi tin nhắn của chính mình!');
    }

    // Nếu tin nhắn có đính kèm file hoặc hình ảnh, xóa file vật lý trên máy chủ
    if (message.fileUrl) {
      try {
        const fileName = path.basename(message.fileUrl);
        const filePath = path.join(process.cwd(), 'uploads', 'chat', fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[File Deleted] Successfully removed file from disk: ${filePath}`);
        }
      } catch (err) {
        console.error('Lỗi khi xóa file vật lý trên máy chủ:', err);
      }
    }

    // Cập nhật SQL Server: đánh dấu isRevoked = 1 và xóa thông tin fileUrl
    await this.prisma.$executeRawUnsafe(
      `UPDATE messages SET isRevoked = 1, content = N'Tin nhắn đã được thu hồi', fileUrl = NULL, fileName = NULL, fileSize = NULL WHERE id = '${messageId.replace(/'/g, "''")}'`
    );

    return {
      id: message.id,
      roomId: message.roomId,
      sender: senderName,
      content: 'Tin nhắn đã được thu hồi',
      fileUrl: null,
      fileName: null,
      fileType: null,
      fileSize: null,
      isRevoked: true,
      createdAt: new Date(message.createdAt).toISOString().replace('Z', '+07:00'),
    };
  }

  /**
   * GHIM / BỎ GHIM TIN NHẮN TRONG PHÒNG (Hỗ trợ ghim nhiều tin nhắn cùng lúc)
   */
  async togglePinMessage(messageId: string, roomId: string) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT m.id, m.content, ISNULL(m.isPinned, 0) as isPinned, m.roomId,
             u.displayName, u.username
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.id = '${messageId.replace(/'/g, "''")}'
    `);

    if (!rows || rows.length === 0) {
      throw new Error('Tin nhắn không tồn tại!');
    }

    const message = rows[0];
    const currentPinned = Boolean(message.isPinned);
    const newPinned = !currentPinned;

    // Cập nhật trạng thái isPinned cho tin nhắn này (không reset các tin nhắn khác -> cho phép ghim nhiều tin)
    await this.prisma.$executeRawUnsafe(
      `UPDATE messages SET isPinned = ${newPinned ? 1 : 0} WHERE id = '${messageId.replace(/'/g, "''")}'`
    );

    return {
      messageId: message.id,
      roomId,
      isPinned: newPinned,
      sender: message.displayName || message.username,
      content: message.content,
    };
  }

  /**
   * 1. TẠO NHÓM CHAT MỚI:
   * - Lưu nhóm vào bảng rooms (isGroup = 1)
   * - Thêm người tạo và tất cả thành viên được chọn vào bảng room_members
   * - Tạo tin nhắn hệ thống thông báo tạo nhóm
   */
  async createGroup(name: string, creatorUsername: string, memberUsernames: string[]) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Tên nhóm không được để trống!');

    const creator = await this.getOrCreateUser(creatorUsername);
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const roomId = 'group_' + Date.now() + '_' + Math.round(Math.random() * 1e6);

    // Tạo room trong SQL Server
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO rooms (id, name, isGroup, creatorId, createdAt)
      VALUES ('${roomId}', N'${cleanName.replace(/'/g, "''")}', 1, '${creator.id}', '${vnTime.toISOString()}')
    `);

    // Danh sách tất cả thành viên (bao gồm người tạo)
    const allUsernames = Array.from(
      new Set([creator.username, ...(creator.displayName ? [creator.displayName] : []), ...memberUsernames])
    ).filter(Boolean);

    // Tìm thông tin tất cả users
    const users: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT id, username, displayName, avatarUrl, phone FROM users
      WHERE username IN (${allUsernames.map((u) => `'${u.replace(/'/g, "''")}'`).join(',')})
         OR displayName IN (${allUsernames.map((u) => `N'${u.replace(/'/g, "''")}'`).join(',')})
    `);

    // Luôn đảm bảo creator có trong danh sách
    if (!users.some((u) => u.id === creator.id)) {
      users.push(creator);
    }

    // Thêm từng thành viên vào bảng room_members
    for (const u of users) {
      const memberId = require('crypto').randomUUID();
      try {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO room_members (id, userId, roomId, joinedAt)
          VALUES ('${memberId}', '${u.id}', '${roomId}', '${vnTime.toISOString()}')
        `);
      } catch (e) {
        // bỏ qua nếu đã tồn tại
      }
    }

    // Tạo tin nhắn hệ thống đầu tiên
    const sysMsgId = require('crypto').randomUUID();
    const creatorDisplay = creator.displayName || creator.username;
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
      VALUES ('${sysMsgId}', N'🎉 ${creatorDisplay} đã tạo nhóm "${cleanName.replace(/'/g, "''")}"', '${creator.id}', '${roomId}', '${vnTime.toISOString()}', 0, 0)
    `);

    return {
      id: roomId,
      name: cleanName,
      isGroup: true,
      memberCount: users.length,
      members: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
      })),
      createdAt: vnTime.toISOString().replace('Z', '+07:00'),
    };
  }

  /**
   * 2. LẤY DANH SÁCH CÁC NHÓM CHAT MÀ USER LÀ THÀNH VIÊN:
   */
  async getUserGroups(username: string) {
    if (!username) return [];
    const clean = username.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: clean }, { displayName: username.trim() }],
      },
    });
    if (!user) return [];

    const rawGroups: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT r.id, r.name, r.isGroup, r.avatarUrl, r.creatorId, r.createdAt,
             COUNT(rm.id) as memberCount
      FROM rooms r
      JOIN room_members rm_user ON rm_user.roomId = r.id AND rm_user.userId = '${user.id}'
      JOIN room_members rm ON rm.roomId = r.id
      WHERE r.isGroup = 1
      GROUP BY r.id, r.name, r.isGroup, r.avatarUrl, r.creatorId, r.createdAt
      ORDER BY r.createdAt DESC
    `);

    return rawGroups.map((g) => ({
      id: g.id,
      name: g.name,
      isGroup: true,
      avatarUrl: g.avatarUrl || null,
      creatorId: g.creatorId || null,
      memberCount: Number(g.memberCount) || 1,
      createdAt: new Date(g.createdAt).toISOString().replace('Z', '+07:00'),
    }));
  }

  /**
   * 3. LẤY DANH SÁCH THÀNH VIÊN TRONG MỘT NHÓM:
   * - Trả về đầy đủ thông tin thành viên
   * - Xác định rõ ai là Trưởng nhóm (isLeader: true) dựa trên creatorId của room
   * - Tự động sắp xếp Trưởng nhóm lên đầu danh sách
   */
  async getGroupMembers(roomId: string) {
    const rawMembers: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT u.id, u.username, u.displayName, u.avatarUrl, u.phone, rm.joinedAt,
             CASE WHEN r.creatorId = u.id THEN 1 ELSE 0 END AS isLeader
      FROM room_members rm
      JOIN users u ON rm.userId = u.id
      LEFT JOIN rooms r ON rm.roomId = r.id
      WHERE rm.roomId = '${roomId.replace(/'/g, "''")}'
      ORDER BY isLeader DESC, rm.joinedAt ASC
    `);

    const hasLeader = rawMembers.some((m) => Boolean(m.isLeader));
    return rawMembers.map((m, idx) => ({
      id: m.id,
      username: m.username,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      phone: m.phone,
      isLeader: hasLeader ? Boolean(m.isLeader) : idx === 0,
      joinedAt: new Date(m.joinedAt).toISOString().replace('Z', '+07:00'),
    }));
  }

  /**
   * CẬP NHẬT TÊN VÀ ẢNH ĐẠI DIỆN CỦA NHÓM:
   */
  async updateGroup(roomId: string, name?: string, avatarUrl?: string, updatedByUsername?: string) {
    const cleanRoomId = roomId.replace(/'/g, "''");
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error('Nhóm không tồn tại!');

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const systemMessages: any[] = [];
    let updaterDisplay = updatedByUsername || 'Một thành viên';
    let updaterUser: any = null;
    if (updatedByUsername) {
      updaterUser = await this.getOrCreateUser(updatedByUsername);
      updaterDisplay = updaterUser.displayName || updaterUser.username;
    }

    const updates: string[] = [];
    const cleanName = (name || '').trim();

    if (cleanName && cleanName !== room.name) {
      updates.push(`name = N'${cleanName.replace(/'/g, "''")}'`);
      const sysMsgId = require('crypto').randomUUID();
      const content = `✏️ ${updaterDisplay} đã đổi tên nhóm thành "${cleanName.replace(/'/g, "''")}"`;
      if (updaterUser) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
          VALUES ('${sysMsgId}', N'${content.replace(/'/g, "''")}', '${updaterUser.id}', '${cleanRoomId}', '${vnTime.toISOString()}', 0, 0)
        `);
        systemMessages.push({
          id: sysMsgId,
          content,
          sender: 'System',
          isSystem: true,
          roomId: cleanRoomId,
          createdAt: vnTime.toISOString().replace('Z', '+07:00'),
        });
      }
    }

    if (avatarUrl !== undefined && avatarUrl !== (room as any).avatarUrl) {
      updates.push(`avatarUrl = ${avatarUrl ? `'${avatarUrl.replace(/'/g, "''")}'` : 'NULL'}`);
      const sysMsgId = require('crypto').randomUUID();
      const content = `🖼️ ${updaterDisplay} đã cập nhật ảnh đại diện của nhóm`;
      if (updaterUser) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
          VALUES ('${sysMsgId}', N'${content.replace(/'/g, "''")}', '${updaterUser.id}', '${cleanRoomId}', '${vnTime.toISOString()}', 0, 0)
        `);
        systemMessages.push({
          id: sysMsgId,
          content,
          sender: 'System',
          isSystem: true,
          roomId: cleanRoomId,
          createdAt: vnTime.toISOString().replace('Z', '+07:00'),
        });
      }
    }

    if (updates.length > 0) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE rooms
        SET ${updates.join(', ')}
        WHERE id = '${cleanRoomId}'
      `);
    }

    const members = await this.getGroupMembers(roomId);
    const updatedRoom: any = await this.prisma.room.findUnique({ where: { id: roomId } });

    return {
      group: {
        id: updatedRoom.id,
        name: updatedRoom.name,
        avatarUrl: updatedRoom.avatarUrl || null,
        isGroup: true,
        memberCount: members.length,
        members,
      },
      systemMessages,
    };
  }

  /**
   * 4. THÊM THÀNH VIÊN MỚI VÀO NHÓM:
   */
  async addGroupMembers(roomId: string, memberUsernames: string[], addedByUsername: string) {
    if (!memberUsernames || memberUsernames.length === 0) return { success: true, addedCount: 0 };

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error('Nhóm không tồn tại!');

    const addedByUser = await this.getOrCreateUser(addedByUsername);
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);

    const cleanUsernames = memberUsernames.map((u) => u.trim()).filter(Boolean);
    if (cleanUsernames.length === 0) return { success: true, addedCount: 0 };

    const users: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT id, username, displayName FROM users
      WHERE username IN (${cleanUsernames.map((u) => `'${u.replace(/'/g, "''")}'`).join(',')})
         OR displayName IN (${cleanUsernames.map((u) => `N'${u.replace(/'/g, "''")}'`).join(',')})
    `);

    let addedCount = 0;
    const addedNames: string[] = [];

    for (const u of users) {
      const existing: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT id FROM room_members WHERE roomId = '${roomId.replace(/'/g, "''")}' AND userId = '${u.id}'
      `);
      if (existing.length === 0) {
        const memberId = require('crypto').randomUUID();
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO room_members (id, userId, roomId, joinedAt)
          VALUES ('${memberId}', '${u.id}', '${roomId}', '${vnTime.toISOString()}')
        `);
        addedCount++;
        addedNames.push(u.displayName || u.username);
      }
    }

    let systemMessage: any = null;
    if (addedNames.length > 0) {
      const sysMsgId = require('crypto').randomUUID();
      const addedByDisplay = addedByUser.displayName || addedByUser.username;
      const content = `👋 ${addedByDisplay} đã thêm ${addedNames.join(', ')} vào nhóm`;
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
        VALUES ('${sysMsgId}', N'${content.replace(/'/g, "''")}', '${addedByUser.id}', '${roomId}', '${vnTime.toISOString()}', 0, 0)
      `);
      systemMessage = {
        id: sysMsgId,
        content,
        sender: addedByDisplay,
        roomId,
        createdAt: vnTime.toISOString().replace('Z', '+07:00'),
        isRevoked: false,
        isPinned: false,
        isSystem: true,
      };
    }

    const allMembers = await this.getGroupMembers(roomId);
    return {
      success: true,
      addedCount,
      members: allMembers,
      addedUsernames: users.map((u) => u.username).filter(Boolean),
      addedDisplayNames: users.map((u) => u.displayName).filter(Boolean),
      systemMessage,
    };
  }

  /**
   * 5. XÓA NHÓM CHAT:
   * - Xóa các file vật lý đã upload trong nhóm (ảnh/file)
   * - Xóa toàn bộ tin nhắn thuộc nhóm trong bảng messages
   * - Xóa toàn bộ thành viên thuộc nhóm trong bảng room_members
   * - Xóa phòng nhóm trong bảng rooms
   */
  async deleteGroup(roomId: string) {
    const cleanRoomId = roomId.replace(/'/g, "''");

    // Xóa các file đính kèm trên ổ cứng
    try {
      const files: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT fileUrl FROM messages WHERE roomId = '${cleanRoomId}' AND fileUrl IS NOT NULL
      `);
      for (const f of files) {
        if (f.fileUrl && f.fileUrl.includes('/uploads/chat/')) {
          const fileName = f.fileUrl.split('/uploads/chat/')[1];
          if (fileName) {
            const filePath = path.join(process.cwd(), 'uploads', 'chat', fileName);
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.error('Lỗi khi xóa file đính kèm nhóm:', e);
    }

    // Xóa tin nhắn
    await this.prisma.$executeRawUnsafe(`DELETE FROM messages WHERE roomId = '${cleanRoomId}'`);

    // Xóa thành viên
    await this.prisma.$executeRawUnsafe(`DELETE FROM room_members WHERE roomId = '${cleanRoomId}'`);

    // Xóa phòng
    await this.prisma.$executeRawUnsafe(`DELETE FROM rooms WHERE id = '${cleanRoomId}'`);

    return { success: true, roomId };
  }

  /**
   * 6. RỜI KHỎI NHÓM CHAT:
   * - Xóa user khỏi bảng room_members
   * - Nếu nhóm không còn ai: tự động xóa nhóm
   * - Nếu còn người: gửi tin nhắn hệ thống thông báo người dùng đã rời nhóm
   */
  async leaveGroup(roomId: string, username: string) {
    const user = await this.getOrCreateUser(username);
    const cleanRoomId = roomId.replace(/'/g, "''");

    // Kiểm tra xem người rời nhóm có đang là trưởng nhóm (creatorId) không
    const roomInfo: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT creatorId FROM rooms WHERE id = '${cleanRoomId}'
    `);
    const isLeaderLeaving = roomInfo.length > 0 && roomInfo[0]?.creatorId === user.id;

    // Xóa thành viên khỏi room_members
    await this.prisma.$executeRawUnsafe(`
      DELETE FROM room_members WHERE roomId = '${cleanRoomId}' AND userId = '${user.id}'
    `);

    // Kiểm tra số lượng thành viên còn lại
    const countResult: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM room_members WHERE roomId = '${cleanRoomId}'
    `);
    const remainingCount = Number(countResult[0]?.count) || 0;

    if (remainingCount === 0) {
      await this.deleteGroup(roomId);
      return { success: true, groupDeleted: true, roomId, remainingCount: 0 };
    }

    // Tạo thông báo hệ thống khi rời nhóm
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const sysMsgId = require('crypto').randomUUID();
    const displayName = user.displayName || user.username;
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
      VALUES ('${sysMsgId}', N'🚪 ${displayName} đã rời khỏi nhóm chat', '${user.id}', '${cleanRoomId}', '${vnTime.toISOString()}', 0, 0)
    `);

    // Nếu trưởng nhóm rời đi, chuyển quyền trưởng nhóm cho thành viên còn lại có thời gian vào nhóm sớm nhất
    let transferSystemMessage: any = null;
    if (isLeaderLeaving) {
      const nextLeaderResult: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT TOP 1 rm.userId, u.displayName, u.username
        FROM room_members rm
        JOIN users u ON rm.userId = u.id
        WHERE rm.roomId = '${cleanRoomId}'
        ORDER BY rm.joinedAt ASC
      `);
      if (nextLeaderResult.length > 0) {
        const nextLeader = nextLeaderResult[0];
        await this.prisma.$executeRawUnsafe(`
          UPDATE rooms SET creatorId = '${nextLeader.userId}' WHERE id = '${cleanRoomId}'
        `);
        const nextLeaderDisplay = nextLeader.displayName || nextLeader.username;
        const transferMsgId = require('crypto').randomUUID();
        const transferContent = `👑 ${nextLeaderDisplay} đã trở thành trưởng nhóm mới`;
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
          VALUES ('${transferMsgId}', N'${transferContent.replace(/'/g, "''")}', '${nextLeader.userId}', '${cleanRoomId}', '${vnTime.toISOString()}', 0, 0)
        `);
        transferSystemMessage = {
          id: transferMsgId,
          content: transferContent,
          sender: 'System',
          roomId: cleanRoomId,
          createdAt: vnTime.toISOString().replace('Z', '+07:00'),
          isRevoked: false,
          isPinned: false,
          isSystem: true,
        };
      }
    }

    const remainingMembers = await this.getGroupMembers(roomId);
    return {
      success: true,
      groupDeleted: false,
      roomId,
      userLeft: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      systemMessage: {
        id: sysMsgId,
        content: `🚪 ${displayName} đã rời khỏi nhóm chat`,
        sender: displayName,
        roomId: cleanRoomId,
        createdAt: vnTime.toISOString().replace('Z', '+07:00'),
        isRevoked: false,
        isPinned: false,
        isSystem: true,
      },
      transferSystemMessage,
      remainingCount,
      members: remainingMembers,
    };
  }

  /**
   * CHUYỂN QUYỀN TRƯỞNG NHÓM:
   * - Chỉ trưởng nhóm hiện tại mới có quyền chuyển giao
   * - Cập nhật creatorId trong bảng rooms
   * - Tạo tin nhắn hệ thống thông báo chuyển quyền
   */
  async transferGroupLeader(roomId: string, targetUserId: string, currentUsername: string) {
    const cleanRoomId = roomId.replace(/'/g, "''");
    const currentUser = await this.getOrCreateUser(currentUsername);

    const roomInfo: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT id, name, creatorId FROM rooms WHERE id = '${cleanRoomId}' AND isGroup = 1
    `);
    if (!roomInfo.length) {
      throw new Error('Nhóm chat không tồn tại!');
    }

    if (roomInfo[0].creatorId !== currentUser.id) {
      throw new Error('Chỉ trưởng nhóm mới có quyền chuyển giao quyền trưởng nhóm!');
    }

    // Kiểm tra targetUser có trong room_members không
    const targetMember: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT rm.id, u.id as userId, u.username, u.displayName
      FROM room_members rm
      JOIN users u ON rm.userId = u.id
      WHERE rm.roomId = '${cleanRoomId}' AND (u.id = '${targetUserId.replace(/'/g, "''")}' OR u.username = '${targetUserId.replace(/'/g, "''")}')
    `);
    if (!targetMember.length) {
      throw new Error('Thành viên này không có trong nhóm!');
    }

    const newLeader = targetMember[0];
    if (newLeader.userId === currentUser.id) {
      throw new Error('Thành viên này đã là trưởng nhóm rồi!');
    }

    // Cập nhật rooms.creatorId
    await this.prisma.$executeRawUnsafe(`
      UPDATE rooms SET creatorId = '${newLeader.userId}' WHERE id = '${cleanRoomId}'
    `);

    // Tạo tin nhắn hệ thống
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const sysMsgId = require('crypto').randomUUID();
    const currentDisplay = currentUser.displayName || currentUser.username;
    const newLeaderDisplay = newLeader.displayName || newLeader.username;
    const content = `👑 ${currentDisplay} đã chuyển quyền trưởng nhóm cho ${newLeaderDisplay}`;

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, content, senderId, roomId, createdAt, isRevoked, isPinned)
      VALUES ('${sysMsgId}', N'${content.replace(/'/g, "''")}', '${newLeader.userId}', '${cleanRoomId}', '${vnTime.toISOString()}', 0, 0)
    `);

    const systemMessage = {
      id: sysMsgId,
      content,
      sender: 'System',
      roomId: cleanRoomId,
      createdAt: vnTime.toISOString().replace('Z', '+07:00'),
      isRevoked: false,
      isPinned: false,
      isSystem: true,
    };

    const members = await this.getGroupMembers(roomId);
    return {
      success: true,
      roomId,
      newLeader: {
        id: newLeader.userId,
        username: newLeader.username,
        displayName: newLeader.displayName,
      },
      systemMessage,
      members,
    };
  }

  /**
   * 7. XÓA CUỘC TRÒ CHUYỆN RIÊNG 1-1:
   * - Xóa file đính kèm trên đĩa
   * - Xóa toàn bộ tin nhắn thuộc phòng dm_...
   * - Xóa phòng dm_... trong bảng rooms nếu có
   */
  async deleteConversation(roomId: string) {
    const cleanRoomId = roomId.replace(/'/g, "''");

    try {
      const files: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT fileUrl FROM messages WHERE roomId = '${cleanRoomId}' AND fileUrl IS NOT NULL
      `);
      for (const f of files) {
        if (f.fileUrl && f.fileUrl.includes('/uploads/chat/')) {
          const fileName = f.fileUrl.split('/uploads/chat/')[1];
          if (fileName) {
            const filePath = path.join(process.cwd(), 'uploads', 'chat', fileName);
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.error('Lỗi khi xóa file đính kèm cuộc trò chuyện:', e);
    }

    // Xóa tin nhắn
    await this.prisma.$executeRawUnsafe(`DELETE FROM messages WHERE roomId = '${cleanRoomId}'`);

    // Xóa room nếu tồn tại
    await this.prisma.$executeRawUnsafe(`DELETE FROM rooms WHERE id = '${cleanRoomId}'`);

    return { success: true, roomId };
  }
}

