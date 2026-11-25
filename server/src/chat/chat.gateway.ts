import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface SendMessagePayload {
  roomId: string;
  sender: string;
  content: string;
  recipient?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  replyToId?: string;
  replyToSender?: string;
  replyToContent?: string;
}

interface TypingPayload {
  roomId: string;
  username: string;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Lưu danh sách người dùng online: socketId -> username
  private activeUsers = new Map<string, string>();

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`[Socket Connected]: ${client.id}`);
    // Gửi danh sách online hiện tại cho client mới kết nối
    client.emit('onlineUsersList', Array.from(new Set(this.activeUsers.values())));
  }

  handleDisconnect(client: Socket) {
    const username = this.activeUsers.get(client.id);
    if (username) {
      this.activeUsers.delete(client.id);
      this.broadcastOnlineUsers();
      console.log(`[User Offline]: ${username} (${client.id})`);
    }
  }

  private broadcastOnlineUsers() {
    const users = Array.from(new Set(this.activeUsers.values()));
    this.server.emit('onlineUsersList', users);
  }

  @SubscribeMessage('logoutUser')
  handleLogoutUser(@ConnectedSocket() client: Socket) {
    const username = this.activeUsers.get(client.id);
    if (username) {
      this.activeUsers.delete(client.id);
      client.leave(`user:${username}`);
      this.broadcastOnlineUsers();
      console.log(`[User Logged Out]: ${username} (${client.id})`);
    }
    return { status: 'logged_out' };
  }

  @SubscribeMessage('registerUser')
  async handleRegisterUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { username: string; displayName?: string },
  ) {
    this.activeUsers.set(client.id, data.username);
    if (data.username) {
      client.join(`user:${data.username}`);
      client.join(`user:${data.username.toLowerCase()}`);
    }
    if (data.displayName) {
      client.join(`user:${data.displayName}`);
      client.join(`user:${data.displayName.toLowerCase()}`);
    }

    // Lưu / đảm bảo user tồn tại trong database
    const user = await this.chatService.getOrCreateUser(data.username);
    if (user) {
      if (user.username) {
        client.join(`user:${user.username}`);
        client.join(`user:${user.username.toLowerCase()}`);
      }
      if (user.displayName) {
        client.join(`user:${user.displayName}`);
        client.join(`user:${user.displayName.toLowerCase()}`);
      }
      if (user.id) {
        client.join(`user:${user.id}`);
      }
    }
    this.broadcastOnlineUsers();

    // Tự động gia nhập vào tất cả các nhóm mà user này là thành viên để nhận tin nhắn thời gian thực
    try {
      const userGroups = await this.chatService.getUserGroups(data.username);
      for (const g of userGroups) {
        client.join(g.id);
      }
    } catch (e) {
      console.error('Lỗi khi nạp danh sách nhóm của user vào socket:', e);
    }

    console.log(`[User Registered]: ${data.username}`);
    return { status: 'registered', username: data.username };
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; username: string },
  ) {
    client.join(data.roomId);
    this.activeUsers.set(client.id, data.username);
    this.broadcastOnlineUsers();

    // Lưu user & room vào database nếu chưa có
    await this.chatService.getOrCreateUser(data.username);
    await this.chatService.getOrCreateRoom(data.roomId);

    // Lấy lịch sử tin nhắn từ SQL Server và gửi về cho client vừa vào phòng
    const history = await this.chatService.getRoomMessages(data.roomId);
    client.emit('roomHistory', { roomId: data.roomId, messages: history });

    return { status: 'joined', roomId: data.roomId };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ) {
    // 1. Lưu tin nhắn vào Database (SQL Server)!
    const savedMessage = await this.chatService.saveMessage(
      payload.roomId,
      payload.sender,
      payload.content,
      {
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        fileType: payload.fileType,
        fileSize: payload.fileSize,
      },
      {
        replyToId: payload.replyToId,
        replyToSender: payload.replyToSender,
        replyToContent: payload.replyToContent,
      },
    );

    const logText = payload.fileUrl ? `[File: ${payload.fileName}] ${payload.content}` : payload.content;
    console.log(`[Saved to DB] In ${payload.roomId} from ${payload.sender}: ${logText}`);

    // 2. Gửi tin nhắn đến tất cả thành viên trong room
    this.server.to(payload.roomId).emit('newMessage', savedMessage);

    // 3. Nếu là tin nhắn riêng 1-1, đồng thời báo cho recipient trong room cá nhân
    if (payload.recipient) {
      this.server.to(`user:${payload.recipient}`).emit('directMessageNotification', {
        sender: payload.sender,
        content:
          payload.content ||
          (payload.fileType?.startsWith('image/')
            ? '[Hình ảnh]'
            : `[Tệp] ${payload.fileName || ''}`),
        roomId: payload.roomId,
        fileUrl: payload.fileUrl,
      });
    }

    return savedMessage;
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    client.to(payload.roomId).emit('userTyping', {
      username: payload.username,
      isTyping: payload.isTyping,
    });
  }

  @SubscribeMessage('revokeMessage')
  async handleRevokeMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: string; roomId: string; username: string },
  ) {
    try {
      const revoked = await this.chatService.revokeMessage(payload.messageId, payload.username);

      // Thông báo cho tất cả người dùng trong phòng chat biết tin nhắn đã bị thu hồi
      this.server.to(payload.roomId).emit('messageRevoked', {
        messageId: payload.messageId,
        roomId: payload.roomId,
      });

      console.log(`[Message Revoked] ID ${payload.messageId} by ${payload.username} in ${payload.roomId}`);
      return { success: true, revoked };
    } catch (err: any) {
      console.error(`[Revoke Error]: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('togglePinMessage')
  async handleTogglePinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: string; roomId: string },
  ) {
    try {
      const result = await this.chatService.togglePinMessage(payload.messageId, payload.roomId);

      // Thông báo trạng thái ghim tới toàn bộ thành viên trong phòng chat
      this.server.to(payload.roomId).emit('messagePinned', result);

      console.log(`[Message Pin Toggled] ID ${payload.messageId} in ${payload.roomId}: ${result.isPinned}`);
      return { success: true, result };
    } catch (err: any) {
      console.error(`[Pin Error]: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('reactMessage')
  async handleReactMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: string; roomId: string; emoji: string; username: string },
  ) {
    try {
      const reactions = await this.chatService.reactToMessage(
        payload.messageId,
        payload.emoji,
        payload.username,
      );

      // Thông báo cập nhật cảm xúc tin nhắn tới toàn bộ thành viên trong phòng chat
      this.server.to(payload.roomId).emit('messageReactionUpdated', {
        messageId: payload.messageId,
        roomId: payload.roomId,
        reactions,
      });

      console.log(`[Reaction] ${payload.username} thả ${payload.emoji} vào tin nhắn ${payload.messageId}`);
      return { success: true, reactions };
    } catch (err: any) {
      console.error(`[Reaction Error]: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // Thông báo tới các thành viên khi nhóm mới được tạo
  notifyGroupCreated(group: any, memberUsernames: string[]) {
    for (const u of memberUsernames) {
      if (!u) continue;
      this.server.to(`user:${u}`).emit('groupCreated', group);
      this.server.to(`user:${u.toLowerCase()}`).emit('groupCreated', group);
      try {
        this.server.in(`user:${u}`).socketsJoin(group.id);
        this.server.in(`user:${u.toLowerCase()}`).socketsJoin(group.id);
      } catch (e) {}
    }
    this.server.emit('groupUpdated', group);
  }

  // Thông báo tới nhóm khi có thành viên mới được thêm vào
  notifyGroupUpdated(roomId: string, newMemberUsernames: string[], updatedGroup: any, systemMessage?: any) {
    for (const u of newMemberUsernames) {
      if (!u) continue;
      this.server.to(`user:${u}`).emit('groupCreated', updatedGroup);
      this.server.to(`user:${u.toLowerCase()}`).emit('groupCreated', updatedGroup);
      try {
        this.server.in(`user:${u}`).socketsJoin(roomId);
        this.server.in(`user:${u.toLowerCase()}`).socketsJoin(roomId);
      } catch (e) {}
    }
    this.server.to(roomId).emit('groupUpdated', updatedGroup);
    this.server.emit('groupUpdated', updatedGroup);

    if (systemMessage) {
      this.server.to(roomId).emit('newMessage', systemMessage);
    }
  }

  @SubscribeMessage('createGroup')
  async handleCreateGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { name: string; creatorUsername: string; memberUsernames: string[] },
  ) {
    try {
      const group = await this.chatService.createGroup(
        payload.name,
        payload.creatorUsername,
        payload.memberUsernames,
      );
      client.join(group.id);
      this.notifyGroupCreated(group, [payload.creatorUsername, ...payload.memberUsernames]);
      return { success: true, group };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('addGroupMembers')
  async handleAddGroupMembers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; memberUsernames: string[]; addedBy: string },
  ) {
    try {
      const result = await this.chatService.addGroupMembers(
        payload.roomId,
        payload.memberUsernames,
        payload.addedBy,
      );
      const room = await this.chatService.getOrCreateRoom(payload.roomId);
      const updatedGroup = {
        id: payload.roomId,
        name: room.name,
        isGroup: true,
        memberCount: result.members.length,
        members: result.members,
      };
      const allTargetUsernames = [
        ...payload.memberUsernames,
        ...(result.addedUsernames || []),
        ...(result.addedDisplayNames || []),
      ];
      this.notifyGroupUpdated(payload.roomId, allTargetUsernames, updatedGroup, result.systemMessage);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Thông báo tới các thành viên khi nhóm bị xóa
  notifyGroupDeleted(roomId: string) {
    this.server.to(roomId).emit('groupDeleted', { roomId });
    this.server.emit('groupDeleted', { roomId });
  }

  // Thông báo tới thành viên khi bị đuổi khỏi nhóm
  notifyMemberKicked(roomId: string, kickedUser: any, groupName: string) {
    const uName = kickedUser?.username;
    const payload = {
      roomId,
      groupName,
      kickedUserId: kickedUser?.id,
      kickedUsername: uName,
      kickedDisplayName: kickedUser?.displayName,
    };

    if (uName) {
      this.server.to(`user:${uName}`).emit('kickedFromGroup', payload);
      this.server.to(`user:${uName.toLowerCase()}`).emit('kickedFromGroup', payload);
      try {
        this.server.in(`user:${uName}`).socketsLeave(roomId);
        this.server.in(`user:${uName.toLowerCase()}`).socketsLeave(roomId);
      } catch (e) {}
    }
    this.server.to(roomId).emit('memberKicked', payload);
  }

  @SubscribeMessage('kickGroupMember')
  async handleKickGroupMember(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; targetUserId: string; requesterUsername: string },
  ) {
    try {
      const result = await this.chatService.removeGroupMember(
        payload.roomId,
        payload.targetUserId,
        payload.requesterUsername,
      );
      const room = await this.chatService.getOrCreateRoom(payload.roomId);
      const updatedGroup = {
        id: payload.roomId,
        name: room.name,
        avatarUrl: (room as any).avatarUrl || null,
        isGroup: true,
        memberCount: result.remainingCount,
        members: result.members,
      };

      this.server.to(payload.roomId).emit('groupUpdated', updatedGroup);
      if (result.systemMessage) {
        this.server.to(payload.roomId).emit('newMessage', result.systemMessage);
      }
      this.notifyMemberKicked(payload.roomId, result.kickedUser, room.name);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Thông báo khi cuộc trò chuyện 1-1 bị xóa
  notifyConversationDeleted(roomId: string) {
    this.server.to(roomId).emit('conversationDeleted', { roomId });
    this.server.emit('conversationDeleted', { roomId });
  }

  @SubscribeMessage('deleteGroup')
  async handleDeleteGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    try {
      const result = await this.chatService.deleteGroup(payload.roomId);
      this.notifyGroupDeleted(payload.roomId);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('leaveGroup')
  async handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; username: string },
  ) {
    try {
      const result = await this.chatService.leaveGroup(payload.roomId, payload.username);
      client.leave(payload.roomId);

      if (result.groupDeleted) {
        this.notifyGroupDeleted(payload.roomId);
      } else {
        const room = await this.chatService.getOrCreateRoom(payload.roomId);
        const updatedGroup = {
          id: payload.roomId,
          name: room.name,
          isGroup: true,
          memberCount: result.remainingCount,
          members: result.members,
        };
        this.server.to(payload.roomId).emit('groupUpdated', updatedGroup);
        if (result.systemMessage) {
          this.server.to(payload.roomId).emit('newMessage', result.systemMessage);
        }
        if (result.transferSystemMessage) {
          this.server.to(payload.roomId).emit('newMessage', result.transferSystemMessage);
        }
      }

      client.emit('leftGroupSuccess', { roomId: payload.roomId });
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('transferGroupLeader')
  async handleTransferLeader(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; targetUserId: string; currentUsername: string },
  ) {
    try {
      const result = await this.chatService.transferGroupLeader(
        payload.roomId,
        payload.targetUserId,
        payload.currentUsername,
      );
      const room = await this.chatService.getOrCreateRoom(payload.roomId);
      const updatedGroup = {
        id: payload.roomId,
        name: room.name,
        avatarUrl: (room as any).avatarUrl || null,
        isGroup: true,
        memberCount: result.members.length,
        members: result.members,
      };
      this.server.to(payload.roomId).emit('groupUpdated', updatedGroup);
      if (result.systemMessage) {
        this.server.to(payload.roomId).emit('newMessage', result.systemMessage);
      }
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('deleteConversation')
  async handleDeleteConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    try {
      const result = await this.chatService.deleteConversation(payload.roomId);
      this.notifyConversationDeleted(payload.roomId);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
