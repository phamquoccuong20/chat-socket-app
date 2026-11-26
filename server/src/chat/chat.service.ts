import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChatService implements OnModuleInit {
  private messageReactions = new Map<string, Record<string, string[]>>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    console.log('[DB] ChatService initialized with Prisma ORM');
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reactions" TEXT DEFAULT '{}'`,
      );
    } catch (err: any) {
      console.log('[DB] Note: Could not auto-alter reactions column (using in-memory fallback):', err.message);
    }
  }

  // Thả / gỡ biểu cảm cảm xúc (Reactions) cho tin nhắn
  async reactToMessage(messageId: string, emoji: string, username: string): Promise<Record<string, string[]>> {
    let current = this.messageReactions.get(messageId) || {};
    let users = current[emoji] || [];

    if (users.includes(username)) {
      // Hủy cảm xúc nếu đã thả rồi (toggle unlike)
      users = users.filter((u) => u !== username);
      if (users.length === 0) {
        delete current[emoji];
      } else {
        current[emoji] = users;
      }
    } else {
      // Thêm cảm xúc mới
      current[emoji] = [...users, username];
    }

    this.messageReactions.set(messageId, current);

    // Lưu vào Database nếu bảng có cột reactions
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "messages" SET "reactions" = $1 WHERE "id" = $2`,
        JSON.stringify(current),
        messageId,
      );
    } catch {
      // Bỏ qua nếu cột chưa được hỗ trợ
    }

    return current;
  }

  getReactions(messageId: string): Record<string, string[]> {
    return this.messageReactions.get(messageId) || {};
  }

  // Tạo hoặc lấy User từ database
  async getOrCreateUser(username: string) {
    const clean = (username || '').trim();
    // 1. Tìm user theo username hoặc displayName
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: clean }, { displayName: clean }],
      },
    });

    if (existing) return existing;

    // 2. Nếu chưa có thì tạo mới
    try {
      return await this.prisma.user.create({
        data: {
          username: clean,
          displayName: clean,
        },
      });
    } catch {
      return this.prisma.user.findFirst({
        where: {
          OR: [{ username: clean }, { displayName: clean }],
        },
      });
    }
  }

  /**
   * Chuẩn hóa Room ID cho Chat 1-1 (Direct Message):
   * Đảm bảo giữa 2 người bất kỳ (ví dụ: cuongpq và lhq1808) CHỈ CÓ DUY NHẤT 1 roomId chuẩn:
   * "dm_cuongpq_lhq1808" (sắp xếp theo username chữ thường).
   * Đồng thời tìm tất cả các roomId biến thể trước đây (như dm_cuongpq_lê hồng quang, dm_lhq1808_phạm quốc cường)
   * để gộp lại toàn bộ tin nhắn lịch sử và đồng bộ socket.
   */
  async canonicalizeDmRoomId(rawRoomId: string): Promise<{
    canonicalRoomId: string;
    variantRoomIds: string[];
    user1?: any;
    user2?: any;
  }> {
    if (!rawRoomId || !rawRoomId.startsWith('dm_')) {
      return { canonicalRoomId: rawRoomId, variantRoomIds: [rawRoomId] };
    }

    const raw = rawRoomId.trim();
    const withoutPrefix = raw.replace(/^dm_/, '');
    const parts = withoutPrefix.split('_');

    if (parts.length < 2) {
      return { canonicalRoomId: raw, variantRoomIds: [raw] };
    }

    let user1: any = null;
    let user2: any = null;

    for (let i = 1; i < parts.length; i++) {
      const p1 = parts.slice(0, i).join('_').trim();
      const p2 = parts.slice(i).join('_').trim();

      const u1 = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: p1.toLowerCase() },
            { displayName: p1 },
            { id: p1 },
          ],
        },
      });

      const u2 = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: p2.toLowerCase() },
            { displayName: p2 },
            { id: p2 },
          ],
        },
      });

      if (u1 && u2 && u1.id !== u2.id) {
        user1 = u1;
        user2 = u2;
        break;
      }
    }

    if (!user1 || !user2) {
      return { canonicalRoomId: raw, variantRoomIds: [raw] };
    }

    const u1Name = (user1.username || user1.displayName || '').toLowerCase();
    const u2Name = (user2.username || user2.displayName || '').toLowerCase();
    const d1Name = (user1.displayName || user1.username || '').toLowerCase();
    const d2Name = (user2.displayName || user2.username || '').toLowerCase();

    const canonicalRoomId = `dm_${[u1Name, u2Name].sort().join('_')}`;

    const variants = new Set<string>();
    variants.add(canonicalRoomId);
    variants.add(raw);
    variants.add(`dm_${[u1Name, d2Name].sort().join('_')}`);
    variants.add(`dm_${[u2Name, d1Name].sort().join('_')}`);
    variants.add(`dm_${[d1Name, d2Name].sort().join('_')}`);

    return {
      canonicalRoomId,
      variantRoomIds: Array.from(variants),
      user1,
      user2,
    };
  }

  // Tạo hoặc lấy Room từ database
  async getOrCreateRoom(roomId: string, name?: string, isGroup = true) {
    let targetRoomId = roomId;
    if (roomId && roomId.startsWith('dm_')) {
      const { canonicalRoomId } = await this.canonicalizeDmRoomId(roomId);
      targetRoomId = canonicalRoomId;
    }

    const existing = await this.prisma.room.findUnique({
      where: { id: targetRoomId },
    });

    if (existing) return existing;

    return this.prisma.room.create({
      data: {
        id: targetRoomId,
        name: name || targetRoomId,
        isGroup,
      },
    });
  }

  /**
   * LƯU TIN NHẮN MỚI VÀO CƠ SỞ DỮ LIỆU (Bảng messages):
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
    let targetRoomId = roomId;
    if (roomId && roomId.startsWith('dm_')) {
      const { canonicalRoomId } = await this.canonicalizeDmRoomId(roomId);
      targetRoomId = canonicalRoomId;
    }

    const user = await this.getOrCreateUser(username);
    const room = await this.getOrCreateRoom(targetRoomId, undefined, false);

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

    await this.prisma.message.create({
      data: {
        id,
        content: cleanContent,
        senderId: user.id,
        roomId: room.id,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        replyToId,
        replyToSender,
        replyToContent,
        createdAt: vnTime,
        isRevoked: false,
        isPinned: false,
      },
    });

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
   * TẢI LỊCH SỬ TIN NHẮN CỦA MỘT PHÒNG:
   * Lấy các tin nhắn mới nhất (desc) rồi đảo ngược lại (asc) để hiển thị theo đúng thứ tự thời gian
   */
  async getRoomMessages(roomId: string, limit = 100) {
    let targetRoomId = roomId;
    let searchRoomIds = [roomId];

    if (roomId && roomId.startsWith('dm_')) {
      const { canonicalRoomId, variantRoomIds } = await this.canonicalizeDmRoomId(roomId);
      targetRoomId = canonicalRoomId;
      searchRoomIds = variantRoomIds;

      // Tự động di dời các tin nhắn cũ từ các phòng biến thể về canonicalRoomId trong DB
      if (variantRoomIds.length > 1) {
        try {
          await this.getOrCreateRoom(canonicalRoomId, undefined, false);
          await this.prisma.message.updateMany({
            where: {
              roomId: { in: variantRoomIds.filter((v) => v !== canonicalRoomId) },
            },
            data: { roomId: canonicalRoomId },
          });
        } catch {
          // Bỏ qua nếu có lỗi
        }
      }
    }

    const raw = await this.prisma.message.findMany({
      where: {
        OR: [
          { roomId: targetRoomId },
          { roomId: { in: searchRoomIds } },
        ],
      },
      include: {
        sender: {
          select: { displayName: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    const rawMessages = raw.reverse();

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
        roomId: targetRoomId,
        sender: isSystem ? 'System' : (m.sender?.displayName || m.sender?.username || 'Unknown'),
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
        reactions: this.getReactions(m.id),
        createdAt: new Date(m.createdAt).toISOString().replace('Z', '+07:00'),
      };
    });
  }

  /**
   * LẤY TOÀN BỘ FILE VÀ HÌNH ẢNH ĐÃ CHIA SẺ TRONG PHÒNG:
   */
  async getRoomMedia(roomId: string) {
    let targetRoomId = roomId;
    let searchRoomIds = [roomId];

    if (roomId && roomId.startsWith('dm_')) {
      const { canonicalRoomId, variantRoomIds } = await this.canonicalizeDmRoomId(roomId);
      targetRoomId = canonicalRoomId;
      searchRoomIds = variantRoomIds;
    }

    const raw = await this.prisma.message.findMany({
      where: {
        OR: [
          { roomId: targetRoomId },
          { roomId: { in: searchRoomIds } },
        ],
        fileUrl: { not: null },
        isRevoked: false,
      },
      include: {
        sender: {
          select: { displayName: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return raw.map((m) => ({
      id: m.id,
      roomId: targetRoomId,
      sender: m.sender?.displayName || m.sender?.username || 'Unknown',
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
   */
  async revokeMessage(messageId: string, username: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { displayName: true, username: true } },
      },
    });

    if (!message) {
      throw new Error('Tin nhắn không tồn tại!');
    }

    const senderName = message.sender?.displayName || message.sender?.username;
    if (senderName !== username && message.sender?.username !== username) {
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

    // Cập nhật đánh dấu isRevoked = true
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isRevoked: true,
        content: 'Tin nhắn đã được thu hồi',
        fileUrl: null,
        fileName: null,
        fileSize: null,
      },
    });

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
   * GHIM / BỎ GHIM TIN NHẮN TRONG PHÒNG
   */
  async togglePinMessage(messageId: string, roomId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { displayName: true, username: true } },
      },
    });

    if (!message) {
      throw new Error('Tin nhắn không tồn tại!');
    }

    const currentPinned = Boolean(message.isPinned);
    const newPinned = !currentPinned;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: newPinned },
    });

    return {
      messageId: message.id,
      roomId,
      isPinned: newPinned,
      sender: message.sender?.displayName || message.sender?.username,
      content: message.content,
    };
  }

  /**
   * 1. TẠO NHÓM CHAT MỚI:
   */
  async createGroup(name: string, creatorUsername: string, memberUsernames: string[]) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Tên nhóm không được để trống!');

    const creator = await this.getOrCreateUser(creatorUsername);
    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const roomId = 'group_' + Date.now() + '_' + Math.round(Math.random() * 1e6);

    // Tạo room trong database
    await this.prisma.room.create({
      data: {
        id: roomId,
        name: cleanName,
        isGroup: true,
        creatorId: creator.id,
        createdAt: vnTime,
      },
    });

    // Danh sách tất cả thành viên (bao gồm người tạo)
    const allUsernames = Array.from(
      new Set([creator.username, ...(creator.displayName ? [creator.displayName] : []), ...memberUsernames]),
    ).filter(Boolean);

    // Tìm thông tin tất cả users
    const users = await this.prisma.user.findMany({
      where: {
        OR: [{ username: { in: allUsernames } }, { displayName: { in: allUsernames } }],
      },
    });

    if (!users.some((u) => u.id === creator.id)) {
      users.push(creator);
    }

    // Thêm từng thành viên vào bảng room_members
    for (const u of users) {
      try {
        await this.prisma.roomMember.create({
          data: {
            userId: u.id,
            roomId,
            joinedAt: vnTime,
          },
        });
      } catch {
        // bỏ qua nếu đã tồn tại
      }
    }

    // Tạo tin nhắn hệ thống đầu tiên
    const sysMsgId = require('crypto').randomUUID();
    const creatorDisplay = creator.displayName || creator.username;
    await this.prisma.message.create({
      data: {
        id: sysMsgId,
        content: `🎉 ${creatorDisplay} đã tạo nhóm "${cleanName}"`,
        senderId: creator.id,
        roomId,
        createdAt: vnTime,
        isRevoked: false,
        isPinned: false,
      },
    });

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

    const rooms = await this.prisma.room.findMany({
      where: {
        isGroup: true,
        members: {
          some: { userId: user.id },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((g) => ({
      id: g.id,
      name: g.name,
      isGroup: true,
      avatarUrl: null,
      creatorId: g.creatorId || null,
      memberCount: g._count?.members || 1,
      createdAt: new Date(g.createdAt).toISOString().replace('Z', '+07:00'),
    }));
  }

  /**
   * 3. LẤY DANH SÁCH THÀNH VIÊN TRONG MỘT NHÓM:
   */
  async getGroupMembers(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: true,
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) return [];

    const creatorId = room.creatorId;
    const members = room.members.map((m, idx) => {
      const isLeader = creatorId ? m.user.id === creatorId : idx === 0;
      return {
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        phone: m.user.phone,
        isLeader,
        joinedAt: new Date(m.joinedAt).toISOString().replace('Z', '+07:00'),
      };
    });

    // Trưởng nhóm lên đầu
    return members.sort((a, b) => (b.isLeader ? 1 : 0) - (a.isLeader ? 1 : 0));
  }

  /**
   * CẬP NHẬT TÊN CỦA NHÓM:
   */
  async updateGroup(roomId: string, name?: string, avatarUrl?: string, updatedByUsername?: string) {
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

    const cleanName = (name || '').trim();
    if (cleanName && cleanName !== room.name) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { name: cleanName },
      });

      const sysMsgId = require('crypto').randomUUID();
      const content = `✏️ ${updaterDisplay} đã đổi tên nhóm thành "${cleanName}"`;
      if (updaterUser) {
        await this.prisma.message.create({
          data: {
            id: sysMsgId,
            content,
            senderId: updaterUser.id,
            roomId,
            createdAt: vnTime,
            isRevoked: false,
            isPinned: false,
          },
        });
        systemMessages.push({
          id: sysMsgId,
          content,
          sender: 'System',
          isSystem: true,
          roomId,
          createdAt: vnTime.toISOString().replace('Z', '+07:00'),
        });
      }
    }

    const members = await this.getGroupMembers(roomId);
    const updatedRoom = await this.prisma.room.findUnique({ where: { id: roomId } });

    return {
      group: {
        id: updatedRoom?.id || roomId,
        name: updatedRoom?.name || cleanName,
        avatarUrl: null,
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

    const users = await this.prisma.user.findMany({
      where: {
        OR: [{ username: { in: cleanUsernames } }, { displayName: { in: cleanUsernames } }],
      },
    });

    let addedCount = 0;
    const addedNames: string[] = [];

    for (const u of users) {
      const existing = await this.prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: u.id,
            roomId,
          },
        },
      });

      if (!existing) {
        await this.prisma.roomMember.create({
          data: {
            userId: u.id,
            roomId,
            joinedAt: vnTime,
          },
        });
        addedCount++;
        addedNames.push(u.displayName || u.username);
      }
    }

    let systemMessage: any = null;
    if (addedNames.length > 0) {
      const sysMsgId = require('crypto').randomUUID();
      const addedByDisplay = addedByUser.displayName || addedByUser.username;
      const content = `👋 ${addedByDisplay} đã thêm ${addedNames.join(', ')} vào nhóm`;
      await this.prisma.message.create({
        data: {
          id: sysMsgId,
          content,
          senderId: addedByUser.id,
          roomId,
          createdAt: vnTime,
          isRevoked: false,
          isPinned: false,
        },
      });
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
   */
  async deleteGroup(roomId: string) {
    try {
      const files = await this.prisma.message.findMany({
        where: { roomId, fileUrl: { not: null } },
        select: { fileUrl: true },
      });
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

    await this.prisma.message.deleteMany({ where: { roomId } });
    await this.prisma.roomMember.deleteMany({ where: { roomId } });
    await this.prisma.room.deleteMany({ where: { id: roomId } });

    return { success: true, roomId };
  }

  /**
   * 6. RỜI KHỎI NHÓM CHAT:
   */
  async leaveGroup(roomId: string, username: string) {
    const user = await this.getOrCreateUser(username);

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    });
    const isLeaderLeaving = Boolean(room && room.creatorId === user.id);

    await this.prisma.roomMember.deleteMany({
      where: { roomId, userId: user.id },
    });

    const remainingCount = await this.prisma.roomMember.count({
      where: { roomId },
    });

    if (remainingCount === 0) {
      await this.deleteGroup(roomId);
      return { success: true, groupDeleted: true, roomId, remainingCount: 0 };
    }

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const sysMsgId = require('crypto').randomUUID();
    const displayName = user.displayName || user.username;

    await this.prisma.message.create({
      data: {
        id: sysMsgId,
        content: `🚪 ${displayName} đã rời khỏi nhóm chat`,
        senderId: user.id,
        roomId,
        createdAt: vnTime,
        isRevoked: false,
        isPinned: false,
      },
    });

    let transferSystemMessage: any = null;
    if (isLeaderLeaving) {
      const nextLeaderMember = await this.prisma.roomMember.findFirst({
        where: { roomId },
        orderBy: { joinedAt: 'asc' },
        include: { user: true },
      });

      if (nextLeaderMember) {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { creatorId: nextLeaderMember.userId },
        });

        const nextLeaderDisplay = nextLeaderMember.user.displayName || nextLeaderMember.user.username;
        const transferMsgId = require('crypto').randomUUID();
        const transferContent = `👑 ${nextLeaderDisplay} đã trở thành trưởng nhóm mới`;

        await this.prisma.message.create({
          data: {
            id: transferMsgId,
            content: transferContent,
            senderId: nextLeaderMember.userId,
            roomId,
            createdAt: vnTime,
            isRevoked: false,
            isPinned: false,
          },
        });

        transferSystemMessage = {
          id: transferMsgId,
          content: transferContent,
          sender: 'System',
          roomId,
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
        roomId,
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
   */
  async transferGroupLeader(roomId: string, targetUserId: string, currentUsername: string) {
    const currentUser = await this.getOrCreateUser(currentUsername);

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });
    if (!room || !room.isGroup) {
      throw new Error('Nhóm chat không tồn tại!');
    }

    if (room.creatorId !== currentUser.id) {
      throw new Error('Chỉ trưởng nhóm mới có quyền chuyển giao quyền trưởng nhóm!');
    }

    const targetMember = await this.prisma.roomMember.findFirst({
      where: {
        roomId,
        OR: [{ userId: targetUserId }, { user: { username: targetUserId } }],
      },
      include: { user: true },
    });

    if (!targetMember) {
      throw new Error('Thành viên này không có trong nhóm!');
    }

    const newLeader = targetMember.user;
    if (newLeader.id === currentUser.id) {
      throw new Error('Thành viên này đã là trưởng nhóm rồi!');
    }

    await this.prisma.room.update({
      where: { id: roomId },
      data: { creatorId: newLeader.id },
    });

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const sysMsgId = require('crypto').randomUUID();
    const currentDisplay = currentUser.displayName || currentUser.username;
    const newLeaderDisplay = newLeader.displayName || newLeader.username;
    const content = `👑 ${currentDisplay} đã chuyển quyền trưởng nhóm cho ${newLeaderDisplay}`;

    await this.prisma.message.create({
      data: {
        id: sysMsgId,
        content,
        senderId: newLeader.id,
        roomId,
        createdAt: vnTime,
        isRevoked: false,
        isPinned: false,
      },
    });

    const systemMessage = {
      id: sysMsgId,
      content,
      sender: 'System',
      roomId,
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
        id: newLeader.id,
        username: newLeader.username,
        displayName: newLeader.displayName,
      },
      systemMessage,
      members,
    };
  }

  /**
   * 8. XÓA/ĐUỔI THÀNH VIÊN KHỎI NHÓM CHAT (DÀNH CHO TRƯỞNG NHÓM):
   */
  async removeGroupMember(roomId: string, targetUserId: string, requesterUsername: string) {
    const requester = await this.getOrCreateUser(requesterUsername);

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });
    if (!room || !room.isGroup) {
      throw new Error('Nhóm chat không tồn tại!');
    }

    if (room.creatorId !== requester.id) {
      throw new Error('Chỉ trưởng nhóm mới có quyền xóa thành viên khỏi nhóm!');
    }

    const targetMember = await this.prisma.roomMember.findFirst({
      where: {
        roomId,
        OR: [{ userId: targetUserId }, { user: { username: targetUserId } }],
      },
      include: { user: true },
    });

    if (!targetMember) {
      throw new Error('Thành viên này không có trong nhóm!');
    }

    if (targetMember.userId === requester.id) {
      throw new Error('Bạn là trưởng nhóm, không thể tự xóa mình khỏi nhóm!');
    }

    await this.prisma.roomMember.deleteMany({
      where: { roomId, userId: targetMember.userId },
    });

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const sysMsgId = require('crypto').randomUUID();
    const requesterDisplay = requester.displayName || requester.username;
    const targetDisplay = targetMember.user.displayName || targetMember.user.username;
    const content = `🚪 ${requesterDisplay} đã xóa ${targetDisplay} khỏi nhóm`;

    await this.prisma.message.create({
      data: {
        id: sysMsgId,
        content,
        senderId: requester.id,
        roomId,
        createdAt: vnTime,
        isRevoked: false,
        isPinned: false,
      },
    });

    const systemMessage = {
      id: sysMsgId,
      content,
      sender: requesterDisplay,
      roomId,
      createdAt: vnTime.toISOString().replace('Z', '+07:00'),
      isRevoked: false,
      isPinned: false,
      isSystem: true,
    };

    const members = await this.getGroupMembers(roomId);
    return {
      success: true,
      roomId,
      kickedUser: {
        id: targetMember.user.id,
        username: targetMember.user.username,
        displayName: targetMember.user.displayName,
      },
      systemMessage,
      remainingCount: members.length,
      members,
    };
  }

  /**
   * 7. XÓA CUỘC TRÒ CHUYỆN RIÊNG 1-1:
   */
  async deleteConversation(roomId: string) {
    let targetRoomIds = [roomId];
    if (roomId && roomId.startsWith('dm_')) {
      const { canonicalRoomId, variantRoomIds } = await this.canonicalizeDmRoomId(roomId);
      targetRoomIds = Array.from(new Set([roomId, canonicalRoomId, ...variantRoomIds]));
    }

    try {
      const files = await this.prisma.message.findMany({
        where: { roomId: { in: targetRoomIds }, fileUrl: { not: null } },
        select: { fileUrl: true },
      });
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

    await this.prisma.message.deleteMany({ where: { roomId: { in: targetRoomIds } } });
    await this.prisma.room.deleteMany({ where: { id: { in: targetRoomIds } } });

    return { success: true, roomId };
  }
}
