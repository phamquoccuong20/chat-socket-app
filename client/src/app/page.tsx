"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import {
  Send,
  MessageSquare,
  User,
  Hash,
  Wifi,
  WifiOff,
  Smile,
  Paperclip,
  Search,
  Users,
  LogOut,
  Phone,
  Video,
  Sparkles,
  Plus,
  ShieldCheck,
  MessageCircle,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  UserPlus,
  X,
  Loader2,
  Settings,
  Key,
  Camera,
  Check,
  RotateCcw,
  Ban,
  Pin,
  PinOff,
  Copy,
  MoreHorizontal,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  Trash2,
  Download,
  FileText,
  Bell,
  BellOff,
  FolderOpen,
  Image as ImageIcon,
  Reply,
  Crown,
  UserMinus,
  Sun,
  Moon,
  Calendar,
} from "lucide-react";

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000").replace(/\/$/, "");

interface Message {
  id: string;
  roomId: string;
  sender: string;
  recipient?: string;
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  replyToId?: string | null;
  replyToSender?: string | null;
  replyToContent?: string | null;
  createdAt: string;
  isSystem?: boolean;
  isRevoked?: boolean;
  isPinned?: boolean;
  reactions?: Record<string, string[]>;
}

const DEFAULT_ROOMS = [
  { id: "general", name: "Kênh chung", desc: "Thảo luận tự do & giao lưu", icon: "💬" },
  { id: "cong-viec", name: "Dự án Socket Chat", desc: "Báo cáo tiến độ & task", icon: "🚀" },
  { id: "cong-nghe", name: "Góc Công nghệ", desc: "Next.js, NestJS, Prisma, SQL", icon: "⚡" },
  { id: "giai-tri", name: "Chém gió & Meme", desc: "Thư giãn sau giờ code", icon: "☕" },
];

export default function ChatApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Authentication State
  const [hasJoined, setHasJoined] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active User session
  const [username, setUsername] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"channel" | "dm">("channel");
  const [currentRoom, setCurrentRoom] = useState("general");
  const [dmTargetUser, setDmTargetUser] = useState<string | null>(null);

  // Profile & Password Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [revokeTargetMessageId, setRevokeTargetMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [showPinnedDropdown, setShowPinnedDropdown] = useState(false);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [profileTab, setProfileTab] = useState<"info" | "password">("info");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editAvatarEmoji, setEditAvatarEmoji] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmNewPwd, setConfirmNewPwd] = useState("");
  const [profileAlert, setProfileAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const profileBackdropMouseDownRef = useRef(false);
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Set<string>>(new Set());
  const [brokenChatImageIds, setBrokenChatImageIds] = useState<Set<string>>(new Set());

  // Rooms & Online users
  const [roomList, setRoomList] = useState(DEFAULT_ROOMS);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);

  // Message & Typing state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isUploadingChatFile, setIsUploadingChatFile] = useState(false);
  const [pastedImageFile, setPastedImageFile] = useState<File | null>(null);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; name: string } | null>(null);
  // Xem thông tin hồ sơ người khác (Profile Card Modal)
  const [viewingUser, setViewingUser] = useState<{
    id?: string;
    username: string;
    displayName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    createdAt?: string;
  } | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadDMs, setUnreadDMs] = useState<Record<string, number>>({});

  // Trả lời tin nhắn (Reply)
  const [replyingMessage, setReplyingMessage] = useState<Message | null>(null);

  // Tìm kiếm nhanh trên Sidebar & Menu thao tác (+)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [showSidebarQuickMenu, setShowSidebarQuickMenu] = useState(false);

  // Kho lưu trữ File & Ảnh (Media Drawer tương tự Zalo)
  const [showMediaDrawer, setShowMediaDrawer] = useState(false);
  const [mediaDrawerTab, setMediaDrawerTab] = useState<"photos" | "files">("photos");
  const [roomMedia, setRoomMedia] = useState<any[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaSearchQuery, setMediaSearchQuery] = useState("");

  // Tìm kiếm bạn bè qua SĐT / Username
  const [showSearchFriendModal, setShowSearchFriendModal] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<any[]>([]);
  const [isSearchingFriends, setIsSearchingFriends] = useState(false);
  const [savedContacts, setSavedContacts] = useState<any[]>([]);
  // Danh sách các cuộc trò chuyện đã nhắn từ SQL Server (kể cả khi đối phương đang offline)
  const [conversations, setConversations] = useState<any[]>([]);

  // Danh sách Nhóm chat (Group Chat) từ SQL Server
  const [groupList, setGroupList] = useState<any[]>([]);
  const [mobileActiveView, setMobileActiveView] = useState<"sidebar" | "chat">("sidebar");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("chat_theme") as "dark" | "light";
      if (savedTheme) {
        setTheme(savedTheme);
        if (savedTheme === "light") {
          document.documentElement.classList.add("light");
          document.documentElement.classList.remove("dark");
        } else {
          document.documentElement.classList.add("dark");
          document.documentElement.classList.remove("light");
        }
      }
    } catch {}
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("chat_theme", nextTheme);
      if (nextTheme === "light") {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      }
    } catch {}
  };
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [currentGroupMembers, setCurrentGroupMembers] = useState<any[]>([]);
  const [isLoadingGroupMembers, setIsLoadingGroupMembers] = useState(false);

  // Đổi tên nhóm và ảnh đại diện nhóm
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupAvatarUrl, setEditGroupAvatarUrl] = useState<string | null>(null);
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const editGroupAvatarInputRef = useRef<HTMLInputElement | null>(null);

  // Modal xác nhận thao tác (Xóa nhóm, Rời nhóm, Xóa cuộc trò chuyện, Chuyển quyền trưởng nhóm, Xóa thành viên)
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: "deleteGroup" | "leaveGroup" | "deleteConversation" | "transferLeader" | "kickMember";
    targetId: string;
    targetName?: string;
  } | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Tính năng Gắn thẻ / Tag tên thành viên (@mentions)
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // Tính năng Thả cảm xúc / Like tin nhắn (Reactions)
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [expandedReactionMsgs, setExpandedReactionMsgs] = useState<Record<string, boolean>>({});

  // Tải danh sách nhóm chat của user từ SQL Server
  const loadUserGroups = async (targetUser: string) => {
    if (!targetUser) return;
    try {
      const res = await fetch(`${BACKEND_URL}/chat/groups?user=${encodeURIComponent(targetUser)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setGroupList(data);
      }
    } catch {
      // Bỏ qua nếu server đang khởi động lại
    }
  };

  // Tải danh sách gợi ý người dùng để thêm vào nhóm
  const loadAvailableUsers = async (query = "") => {
    try {
      const current = userProfile?.username || username;
      const res = await fetch(
        `${BACKEND_URL}/auth/search?q=${encodeURIComponent(query)}&current=${encodeURIComponent(current)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableUsers(data);
      }
    } catch {
      // Bỏ qua nếu server đang khởi động lại
    }
  };

  // HÀM GỌI API: Tự động tải danh sách bạn chat & tin nhắn gần nhất từ Database
  // Được kích hoạt: (1) Ngay khi người dùng đăng nhập thành công, và (2) Khi có tin nhắn mới gửi đến
  const loadUserConversations = async (targetUser: string) => {
    if (!targetUser) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/auth/conversations?user=${encodeURIComponent(targetUser)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data); // Cập nhật state để hiển thị ở mục CHAT RIÊNG 1-1 bên cột trái
      }
    } catch {
      // Bỏ qua nếu server đang khởi động lại
    }
  };

  // Tải danh sách toàn bộ file và ảnh đã gửi trong phòng chat
  const loadRoomMedia = async (roomId: string) => {
    if (!roomId) return;
    setIsLoadingMedia(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat/rooms/${encodeURIComponent(roomId)}/media`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRoomMedia(data);
        }
      }
    } catch {
      // Bỏ qua lỗi kết nối tạm thời
    } finally {
      setIsLoadingMedia(false);
    }
  };

  useEffect(() => {
    if (showMediaDrawer && currentRoom) {
      loadRoomMedia(currentRoom);
    }
  }, [showMediaDrawer, currentRoom]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentRoomRef = useRef(currentRoom);
  currentRoomRef.current = currentRoom;
  const usernameRef = useRef(username);
  usernameRef.current = username;
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const dmTargetUserRef = useRef(dmTargetUser);
  dmTargetUserRef.current = dmTargetUser;

  // Quản lý tắt/bật thông báo cho từng phòng/cuộc trò chuyện
  const [mutedRooms, setMutedRooms] = useState<string[]>([]);
  const mutedRoomsRef = useRef<string[]>([]);
  mutedRoomsRef.current = mutedRooms;
  const [muteToast, setMuteToast] = useState<{ show: boolean; message: string; isMuted: boolean } | null>(null);

  // Load danh sách phòng tắt thông báo từ localStorage theo tài khoản
  useEffect(() => {
    if (!username) return;
    try {
      const saved = localStorage.getItem(`antigravity_muted_rooms_${username.toLowerCase()}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMutedRooms(parsed);
        }
      }
    } catch {}
  }, [username]);

  // Tự tắt Toast sau 2.5s
  useEffect(() => {
    if (!muteToast) return;
    const timer = setTimeout(() => {
      setMuteToast(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [muteToast]);

  // Âm thanh chuông thông báo (Web Audio API)
  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  // Bật/tắt thông báo cho phòng/cuộc trò chuyện
  const handleToggleMuteRoom = (roomIdToToggle: string, roomDisplayName?: string) => {
    setMutedRooms((prev) => {
      const isAlreadyMuted = prev.includes(roomIdToToggle);
      const next = isAlreadyMuted
        ? prev.filter((id) => id !== roomIdToToggle)
        : [...prev, roomIdToToggle];

      if (username) {
        try {
          localStorage.setItem(
            `antigravity_muted_rooms_${username.toLowerCase()}`,
            JSON.stringify(next)
          );
        } catch {}
      }

      const name = roomDisplayName || roomIdToToggle;
      setMuteToast({
        show: true,
        message: isAlreadyMuted
          ? `Đã bật thông báo cho "${name}"`
          : `Đã tắt thông báo cho "${name}"`,
        isMuted: !isAlreadyMuted,
      });

      if (isAlreadyMuted && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          Notification.requestPermission();
        }
      }

      return next;
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUser]);

  const getDmRoomId = (userA: string, userB: string) => {
    const a = (userA || "").trim().toLowerCase();
    const b = (userB || "").trim().toLowerCase();
    return `dm_${[a, b].sort().join("_")}`;
  };

  // Khởi tạo Socket.IO (chỉ tạo 1 lần duy nhất)
  useEffect(() => {
    const socketInstance = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      if (usernameRef.current) {
        socketInstance.emit("registerUser", {
          username: userProfileRef.current?.username || usernameRef.current,
          displayName: userProfileRef.current?.displayName || usernameRef.current,
        });
        socketInstance.emit("joinRoom", { roomId: currentRoomRef.current, username: usernameRef.current });
      }
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    socketInstance.on("onlineUsersList", (users: string[]) => {
      setOnlineUsers(users);
    });

    socketInstance.on("roomHistory", (data: { roomId: string; messages: Message[] }) => {
      // Chỉ nạp tin nhắn nếu lịch sử trả về đúng phòng đang mở hiện tại hoặc cùng là phòng DM tương ứng
      const isMatch =
        data.roomId === currentRoomRef.current ||
        (data.roomId.startsWith("dm_") && currentRoomRef.current.startsWith("dm_"));

      if (isMatch) {
        // Đồng bộ currentRoom sang roomId chuẩn từ server nếu có sự khác biệt
        if (data.roomId.startsWith("dm_") && data.roomId !== currentRoomRef.current) {
          setCurrentRoom(data.roomId);
          currentRoomRef.current = data.roomId;
        }
        setMessages((prev) => {
          if (prev.length === 0) return data.messages;
          // Merge lịch sử với tin nhắn hiện có theo ID để không bao giờ bị mất tin nhắn vừa nhận
          const existingIds = new Set(data.messages.map((m) => m.id));
          const unsynced = prev.filter((m) => !existingIds.has(m.id));
          const combined = [...data.messages, ...unsynced];
          combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return combined;
        });
      }
    });

    socketInstance.on("newMessage", (msg: Message) => {
      // Khi có tin nhắn mới đến, tự động refresh lại danh sách trò chuyện
      // để cập nhật đoạn tin nhắn xem trước (preview) ở cột bên trái
      if (usernameRef.current) {
        loadUserConversations(usernameRef.current);
      }
      setMessages((prev) => {
        const isCurrent =
          msg.roomId === currentRoomRef.current ||
          (msg.roomId.startsWith("dm_") &&
            currentRoomRef.current.startsWith("dm_") &&
            activeTabRef.current === "dm");

        if (isCurrent) {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        }
        return prev;
      });

      // Tự động cập nhật file/ảnh vào kho lưu trữ nếu tin nhắn có đính kèm file
      if (msg.fileUrl && !msg.isRevoked) {
        setRoomMedia((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const isCurrent =
            msg.roomId === currentRoomRef.current ||
            (msg.roomId.startsWith("dm_") &&
              currentRoomRef.current.startsWith("dm_") &&
              activeTabRef.current === "dm");

          if (isCurrent) {
            return [msg, ...prev];
          }
          return prev;
        });
      }

      // Phát âm báo và notification trình duyệt nếu tin nhắn từ người khác và phòng không bị tắt thông báo
      if (msg.sender && msg.sender !== usernameRef.current) {
        const isMuted = mutedRoomsRef.current.includes(msg.roomId);
        if (!isMuted) {
          playNotificationSound();
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.hidden
          ) {
            new Notification(`Tin nhắn mới từ ${msg.sender}`, {
              body: msg.content.length > 50 ? msg.content.substring(0, 50) + "..." : msg.content,
              icon: "/favicon.ico",
            });
          }
        }
      }
    });

    socketInstance.on(
      "directMessageNotification",
      (data: { sender: string; content: string; roomId: string }) => {
        const isCurrentlyViewing =
          activeTabRef.current === "dm" &&
          (currentRoomRef.current === data.roomId ||
            (currentRoomRef.current.startsWith("dm_") && data.roomId.startsWith("dm_")) ||
            dmTargetUserRef.current === data.sender);

        if (!isCurrentlyViewing) {
          setUnreadDMs((prev) => ({
            ...prev,
            [data.sender]: (prev[data.sender] || 0) + 1,
          }));

          const isMuted = mutedRoomsRef.current.includes(data.roomId);
          if (!isMuted) {
            playNotificationSound();
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted" &&
              document.hidden
            ) {
              new Notification(`Tin nhắn riêng từ ${data.sender}`, {
                body: data.content.length > 50 ? data.content.substring(0, 50) + "..." : data.content,
                icon: "/favicon.ico",
              });
            }
          }
        }
      }
    );

    socketInstance.on("userTyping", (data: { username: string; isTyping: boolean }) => {
      if (data.isTyping) {
        setTypingUser(data.username);
      } else {
        setTypingUser(null);
      }
    });

    socketInstance.on("messageRevoked", (data: { messageId: string; roomId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, isRevoked: true, content: "Tin nhắn đã được thu hồi" }
            : m
        )
      );
      setRoomMedia((prev) => prev.filter((m) => m.id !== data.messageId));
      if (usernameRef.current) {
        loadUserConversations(usernameRef.current);
      }
    });

    socketInstance.on(
      "messagePinned",
      (data: { messageId: string; roomId: string; isPinned: boolean }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, isPinned: data.isPinned }
              : m
          )
        );
      }
    );

    socketInstance.on(
      "messageReactionUpdated",
      (data: { messageId: string; roomId: string; reactions: Record<string, string[]> }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, reactions: data.reactions }
              : m
          )
        );
      }
    );

    socketInstance.on("groupCreated", (group: any) => {
      setGroupList((prev) => {
        if (prev.some((g) => g.id === group.id)) return prev;
        return [group, ...prev];
      });
      if (usernameRef.current) {
        socketInstance.emit("joinRoom", { roomId: group.id, username: usernameRef.current });
      }
    });

    socketInstance.on("groupUpdated", (updatedGroup: any) => {
      setGroupList((prev) => {
        const exists = prev.some((g) => g.id === updatedGroup.id);
        if (exists) {
          return prev.map((g) => (g.id === updatedGroup.id ? { ...g, ...updatedGroup } : g));
        }
        // Nếu user hiện tại là thành viên trong nhóm này nhưng chưa có ở sidebar -> tự động thêm ngay vào danh sách
        const currentUname = (userProfile?.username || usernameRef.current || "").toLowerCase();
        const currentDname = (userProfile?.displayName || usernameRef.current || "").toLowerCase();
        const isMember = updatedGroup.members?.some(
          (m: any) =>
            (m.username && m.username.toLowerCase() === currentUname) ||
            (m.displayName && m.displayName.toLowerCase() === currentDname)
        );
        if (isMember) {
          if (usernameRef.current) {
            socketInstance.emit("joinRoom", { roomId: updatedGroup.id, username: usernameRef.current });
          }
          return [updatedGroup, ...prev];
        }
        return prev;
      });
    });

    socketInstance.on("groupDeleted", (data: { roomId: string }) => {
      setGroupList((prev) => prev.filter((g) => g.id !== data.roomId));
      if (currentRoomRef.current === data.roomId) {
        setCurrentRoom("general");
        setActiveTab("channel");
        setMessages([]);
        if (usernameRef.current) {
          socketInstance.emit("joinRoom", { roomId: "general", username: usernameRef.current });
        }
      }
    });

    socketInstance.on("leftGroupSuccess", (data: { roomId: string }) => {
      setGroupList((prev) => prev.filter((g) => g.id !== data.roomId));
      if (currentRoomRef.current === data.roomId) {
        setCurrentRoom("general");
        setActiveTab("channel");
        setMessages([]);
        if (usernameRef.current) {
          socketInstance.emit("joinRoom", { roomId: "general", username: usernameRef.current });
        }
      }
    });

    socketInstance.on("kickedFromGroup", (data: { roomId: string; groupName?: string }) => {
      setGroupList((prev) => prev.filter((g) => g.id !== data.roomId));
      if (currentRoomRef.current === data.roomId) {
        setCurrentRoom("general");
        setActiveTab("channel");
        setMessages([]);
        if (usernameRef.current) {
          socketInstance.emit("joinRoom", { roomId: "general", username: usernameRef.current });
        }
        alert(`Bạn đã bị xóa khỏi nhóm "${data.groupName || 'nhóm chat'}"!`);
      }
    });

    socketInstance.on("conversationDeleted", (data: { roomId: string }) => {
      setConversations((prev) => prev.filter((c) => c.roomId !== data.roomId));
      setSavedContacts((prev) =>
        prev.filter((contact) => {
          const contactRoom = getDmRoomId(userProfile?.username || usernameRef.current, contact.username || contact.displayName);
          return contactRoom !== data.roomId;
        })
      );
      if (currentRoomRef.current === data.roomId) {
        setCurrentRoom("general");
        setActiveTab("channel");
        setDmTargetUser(null);
        setMessages([]);
        if (usernameRef.current) {
          socketInstance.emit("joinRoom", { roomId: "general", username: usernameRef.current });
        }
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Khôi phục phiên đăng nhập từ localStorage khi tải lại trang (F5)
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("chat_user");
      if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user && (user.username || user.displayName)) {
          const loggedInName = user.displayName || user.username;
          setUsername(loggedInName);
          setUserProfile(user);
          setEditDisplayName(user.displayName || "");
          setEditAvatarEmoji(user.avatarUrl || "");
          usernameRef.current = loggedInName;
          setHasJoined(true);
          loadUserConversations(loggedInName);
          loadUserGroups(loggedInName);
        }
      }
    } catch (err) {
      console.error("Lỗi khi khôi phục phiên đăng nhập:", err);
    } finally {
      setIsAuthChecking(false);
    }
  }, []);

  // Tự động đồng bộ Socket khi socket đã kết nối và username đã có (từ đăng nhập hoặc localStorage)
  useEffect(() => {
    if (socket && isConnected && username) {
      socket.emit("registerUser", {
        username: userProfile?.username || username,
        displayName: userProfile?.displayName || username,
      });
      socket.emit("joinRoom", { roomId: currentRoomRef.current, username });
    }
  }, [socket, isConnected, username, userProfile]);

  // Đóng menu 3 chấm, reaction bar, danh sách ghim hoặc menu (+) khi bấm ra ngoài màn hình
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuMessageId(null);
      setActiveReactionMessageId(null);
      setShowPinnedDropdown(false);
      setShowRoomMenu(false);
      setShowSidebarQuickMenu(false);
      setShowMentionSuggestions(false);
    };
    if (activeMenuMessageId || activeReactionMessageId || showPinnedDropdown || showRoomMenu || showSidebarQuickMenu) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [activeMenuMessageId, activeReactionMessageId, showPinnedDropdown, showRoomMenu, showSidebarQuickMenu]);

  // Tự động tải danh sách thành viên khi vào phòng nhóm (phục vụ tính năng tag tên @mentions)
  useEffect(() => {
    if (!currentRoom) return;
    const isGrp = groupList.some((g) => g.id === currentRoom);
    if (isGrp) {
      fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(currentRoom)}/members`)
        .then((res) => (res.ok ? res.json() : []))
        .then((members) => {
          if (Array.isArray(members)) {
            setCurrentGroupMembers(members);
          }
        })
        .catch(() => {});
    }
  }, [currentRoom, groupList]);

  // Kiểm tra độ phức tạp của mật khẩu: ít nhất 6 ký tự, 1 chữ hoa, 1 chữ thường, 1 ký tự đặc biệt
  const validatePasswordComplexity = (password: string): string | null => {
    if (!password || password.length < 6) return "Mật khẩu phải có ít nhất 6 ký tự!";
    if (!/[a-z]/.test(password)) return "Mật khẩu phải chứa ít nhất 1 chữ thường (a-z)!";
    if (!/[A-Z]/.test(password)) return "Mật khẩu phải chứa ít nhất 1 chữ hoa (A-Z)!";
    if (!/[^a-zA-Z0-9]/.test(password)) return "Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (ví dụ: !@#$%^&*...)!";
    return null;
  };

  // Xử lý Đăng ký / Đăng nhập
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    if (!authUsername.trim()) {
      setAuthError(authMode === "register" ? "Vui lòng nhập tên đăng nhập!" : "Vui lòng nhập tên đăng nhập hoặc số điện thoại!");
      return;
    }

    if (!authPassword) {
      setAuthError("Vui lòng nhập mật khẩu!");
      return;
    }

    if (authMode === "register") {
      if (!authDisplayName.trim()) {
        setAuthError("Vui lòng nhập tên hiển thị của bạn!");
        return;
      }
      if (!authPhone.trim()) {
        setAuthError("Vui lòng nhập số điện thoại! Mỗi số điện thoại chỉ được đăng ký 1 tài khoản.");
        return;
      }
      const phoneRegex = /^(0|84|\+84)(3|5|7|8|9)[0-9]{8}$/;
      if (!phoneRegex.test(authPhone.trim().replace(/\s+/g, ""))) {
        setAuthError("Số điện thoại không hợp lệ! Vui lòng nhập đúng 10 số (ví dụ: 0912345678).");
        return;
      }
      const pwdError = validatePasswordComplexity(authPassword);
      if (pwdError) {
        setAuthError(pwdError);
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError("Mật khẩu xác nhận không trùng khớp!");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const payload =
        authMode === "register"
          ? {
              username: authUsername.trim(),
              displayName: authDisplayName.trim(),
              phone: authPhone.trim() || undefined,
              password: authPassword,
            }
          : {
              account: authUsername.trim(),
              password: authPassword,
            };

      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Có lỗi xảy ra, vui lòng thử lại!");
      }

      if (authMode === "register") {
        setAuthSuccess("Đăng ký thành công! Hãy đăng nhập để bắt đầu.");
        setAuthMode("login");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setIsSubmitting(false);
        return;
      }

      // Đăng nhập thành công -> Vào phòng chat
      const loggedInName = data.user.displayName || data.user.username;
      try {
        localStorage.setItem("chat_user", JSON.stringify(data.user));
      } catch (e) {
        console.error("Lỗi khi lưu phiên đăng nhập:", e);
      }
      setUsername(loggedInName);
      setUserProfile(data.user);
      setEditDisplayName(data.user.displayName || "");
      setEditAvatarEmoji(data.user.avatarUrl || "");

      if (socket) {
        socket.emit("registerUser", {
          username: data.user?.username || loggedInName,
          displayName: data.user?.displayName || loggedInName,
        });
        socket.emit("joinRoom", { roomId: currentRoom, username: loggedInName });
      }

      // Đăng nhập thành công -> Vào phòng chat
      setHasJoined(true);
      // Tải ngay danh sách các cuộc trò chuyện cũ và nhóm chat từ SQL Server
      loadUserConversations(loggedInName);
      loadUserGroups(loggedInName);
    } catch (err: any) {
      setAuthError(err.message || "Không thể kết nối đến máy chủ!");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Đăng xuất
  const handleLogout = () => {
    try {
      localStorage.removeItem("chat_user");
    } catch (e) {
      console.error("Lỗi khi xóa phiên đăng nhập:", e);
    }
    if (socket) {
      socket.emit("logoutUser");
    }
    usernameRef.current = "";
    setHasJoined(false);
    setUsername("");
    setUserProfile(null);
    setConversations([]);
    setGroupList([]);
    setMessages([]);
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthError("");
    setAuthSuccess("");
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket && usernameRef.current) {
        socket.emit("logoutUser");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket]);

  // Chuyển sang Kênh nhóm
  const handleSwitchChannel = (roomId: string) => {
    if (!socket || (activeTab === "channel" && roomId === currentRoom)) return;
    setActiveTab("channel");
    setCurrentRoom(roomId);
    setMobileActiveView("chat");
    setDmTargetUser(null);
    setMessages([]);
    socket.emit("joinRoom", { roomId, username });
  };

  // Chuyển sang Chat riêng 1-1
  const handleStartDM = (
    targetDisplayName: string,
    targetUsername?: string,
    specificRoomId?: string
  ) => {
    if (!socket || targetDisplayName === username) return;
    const myUsername = userProfile?.username || username;

    const foundContact =
      conversations.find(
        (c) =>
          (targetUsername && c.contactUser?.username === targetUsername) ||
          c.contactUser?.displayName === targetDisplayName ||
          c.contactName === targetDisplayName ||
          (targetUsername && c.contactName === targetUsername)
      ) ||
      savedContacts.find(
        (c: any) =>
          (targetUsername && c.username === targetUsername) ||
          c.displayName === targetDisplayName ||
          c.username === targetDisplayName
      );

    const otherUsername =
      targetUsername ||
      (foundContact as any)?.contactUser?.username ||
      (foundContact as any)?.username ||
      targetDisplayName;

    const existingConv = conversations.find(
      (c) =>
        c.contactName === targetDisplayName ||
        (targetUsername && c.contactName === targetUsername) ||
        c.contactUser?.displayName === targetDisplayName ||
        (targetUsername && c.contactUser?.username === targetUsername)
    );

    const dmRoom =
      specificRoomId ||
      existingConv?.roomId ||
      getDmRoomId(myUsername, otherUsername);

    setActiveTab("dm");
    setCurrentRoom(dmRoom);
    setMobileActiveView("chat");
    setDmTargetUser(targetDisplayName);
    setMessages([]);

    setUnreadDMs((prev) => {
      const updated = { ...prev };
      delete updated[targetDisplayName];
      return updated;
    });

    socket.emit("joinRoom", { roomId: dmRoom, username });
  };

  // Tìm kiếm bạn bè từ database theo SĐT hoặc Tên
  const handleSearchFriends = async (query: string) => {
    setFriendSearchQuery(query);
    if (!query.trim()) {
      setFriendSearchResults([]);
      return;
    }

    setIsSearchingFriends(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/auth/search?q=${encodeURIComponent(query.trim())}&current=${encodeURIComponent(username)}`
      );
      const data = await res.json();
      setFriendSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearchingFriends(false);
    }
  };

  const handleSelectFriend = (user: any) => {
    const targetDisplayName = user.displayName || user.username;
    setSavedContacts((prev) => {
      if (prev.some((c) => (c.displayName || c.username) === targetDisplayName)) return prev;
      return [...prev, user];
    });
    setShowSearchFriendModal(false);
    setFriendSearchQuery("");
    setFriendSearchResults([]);
    handleStartDM(targetDisplayName, user.username);
  };

  // Tạo thêm kênh nhóm mới
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const slug = newRoomName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const newRoom = {
      id: slug || `room-${Date.now()}`,
      name: newRoomName.trim(),
      desc: "Phòng chat mới tạo",
      icon: "📌",
    };
    setRoomList((prev) => [...prev, newRoom]);
    setNewRoomName("");
    setShowAddRoom(false);
    handleSwitchChannel(newRoom.id);
  };

  // Chuyển sang chat nhóm
  const handleSwitchToGroup = (group: any) => {
    if (activeTab === "channel" && currentRoom === group.id) return;
    setActiveTab("channel");
    setCurrentRoom(group.id);
    setDmTargetUser(null);
    setShowEmojiPicker(false);
    setMessages([]);
    if (socket) {
      socket.emit("joinRoom", {
        roomId: group.id,
        username,
      });
    }
  };

  // Mở modal tạo nhóm chat mới
  const handleOpenCreateGroup = () => {
    setNewGroupName("");
    setSelectedGroupMembers([]);
    setGroupSearchQuery("");
    setShowCreateGroupModal(true);
    loadAvailableUsers("");
  };

  // Chọn / bỏ chọn thành viên khi tạo nhóm
  const handleToggleSelectGroupMember = (targetUsername: string) => {
    setSelectedGroupMembers((prev) =>
      prev.includes(targetUsername)
        ? prev.filter((u) => u !== targetUsername)
        : [...prev, targetUsername]
    );
  };

  // Gửi yêu cầu tạo nhóm chat mới
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      alert("Vui lòng nhập tên nhóm chat!");
      return;
    }
    if (selectedGroupMembers.length === 0) {
      alert("Vui lòng chọn ít nhất 1 thành viên để tạo nhóm!");
      return;
    }

    setIsCreatingGroup(true);
    try {
      const creatorName = userProfile?.username || username;
      const res = await fetch(`${BACKEND_URL}/chat/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          creatorUsername: creatorName,
          memberUsernames: selectedGroupMembers,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Tạo nhóm thất bại!");

      setShowCreateGroupModal(false);
      setNewGroupName("");
      setSelectedGroupMembers([]);

      await loadUserGroups(creatorName);
      handleSwitchToGroup(data.group);
    } catch (err: any) {
      alert(err.message || "Lỗi tạo nhóm!");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Mở modal thêm người vào nhóm hiện tại
  const handleOpenAddMemberModal = async () => {
    if (!currentRoom) return;
    setSelectedNewMembers([]);
    setShowAddMemberModal(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(currentRoom)}/members`);
      if (res.ok) {
        const members = await res.json();
        if (Array.isArray(members)) {
          setCurrentGroupMembers(members);
        }
      }
    } catch {
      // Bỏ qua lỗi kết nối tạm thời
    }
    loadAvailableUsers("");
  };

  // Chọn / bỏ chọn thành viên mới để mời vào nhóm
  const handleToggleSelectNewMember = (targetUsername: string) => {
    setSelectedNewMembers((prev) =>
      prev.includes(targetUsername)
        ? prev.filter((u) => u !== targetUsername)
        : [...prev, targetUsername]
    );
  };

  // Gửi yêu cầu thêm thành viên vào nhóm
  const handleAddMembersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNewMembers.length === 0) return;

    setIsAddingMembers(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat/groups/${currentRoom}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUsernames: selectedNewMembers,
          addedBy: userProfile?.displayName || username,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Thêm thành viên thất bại!");

      setShowAddMemberModal(false);
      setSelectedNewMembers([]);
      await loadUserGroups(userProfile?.username || username);
    } catch (err: any) {
      alert(err.message || "Lỗi khi thêm thành viên!");
    } finally {
      setIsAddingMembers(false);
    }
  };

  // Mở modal xem danh sách thành viên nhóm
  const handleViewGroupMembers = async () => {
    if (!currentRoom) return;
    setIsLoadingGroupMembers(true);
    setShowGroupMembersModal(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(currentRoom)}/members`);
      if (res.ok) {
        const members = await res.json();
        if (Array.isArray(members)) {
          setCurrentGroupMembers(members);
        }
      }
    } catch {
      // Bỏ qua lỗi kết nối tạm thời
    } finally {
      setIsLoadingGroupMembers(false);
    }
  };

  // Mở modal đổi thông tin nhóm (Tên & Ảnh đại diện)
  const handleOpenEditGroupModal = () => {
    if (!currentGroupObj) return;
    setEditGroupName(currentGroupObj.name);
    setEditGroupAvatarUrl(currentGroupObj.avatarUrl || null);
    setShowEditGroupModal(true);
  };

  // Nén và chuyển đổi ảnh avatar thành Base64 Data URL (tối đa 200x200) để lưu trực tiếp vào CSDL PostgreSQL,
  // vĩnh viễn không bao giờ bị mất khi redeploy server lên Render
  const compressImageToBase64 = (
    file: File,
    maxWidth = 200,
    maxHeight = 200,
    quality = 0.85
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Lỗi khi đọc file ảnh!"));
      };
      reader.onerror = () => reject(new Error("Lỗi khi đọc file!"));
    });
  };

  // Upload ảnh đại diện nhóm mới
  const handleGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Dung lượng ảnh tối đa là 10MB!");
      return;
    }
    setIsUploadingGroupAvatar(true);
    try {
      // Nén ảnh sang base64 data URL để lưu vĩnh viễn trong CSDL
      const base64Data = await compressImageToBase64(file, 200, 200, 0.85);
      setEditGroupAvatarUrl(base64Data);
    } catch (err: any) {
      alert(err.message || "Lỗi tải ảnh đại diện nhóm!");
    } finally {
      setIsUploadingGroupAvatar(false);
      if (editGroupAvatarInputRef.current) {
        editGroupAvatarInputRef.current.value = "";
      }
    }
  };

  // Lưu thông tin nhóm sau khi đổi tên / ảnh
  const handleSaveGroupInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGroupObj || !editGroupName.trim()) return;
    setIsUpdatingGroup(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat/groups/${currentGroupObj.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editGroupName.trim(),
          avatarUrl: editGroupAvatarUrl,
          updatedBy: username,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cập nhật nhóm thất bại!");

      setGroupList((prev) =>
        prev.map((g) =>
          g.id === currentGroupObj.id
            ? { ...g, name: editGroupName.trim(), avatarUrl: editGroupAvatarUrl }
            : g
        )
      );
      setShowEditGroupModal(false);
    } catch (err: any) {
      alert(err.message || "Lỗi khi cập nhật thông tin nhóm!");
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  // Mở modal xác nhận xóa nhóm chat
  const handleConfirmDeleteGroup = (groupId: string, groupName: string) => {
    setActionModal({
      isOpen: true,
      type: "deleteGroup",
      targetId: groupId,
      targetName: groupName,
    });
  };

  // Mở modal xác nhận rời khỏi nhóm chat
  const handleConfirmLeaveGroup = (groupId: string, groupName: string) => {
    setActionModal({
      isOpen: true,
      type: "leaveGroup",
      targetId: groupId,
      targetName: groupName,
    });
  };

  // Mở modal xác nhận xóa cuộc trò chuyện 1-1
  const handleConfirmDeleteConversation = (roomId: string, contactName: string) => {
    setActionModal({
      isOpen: true,
      type: "deleteConversation",
      targetId: roomId,
      targetName: contactName,
    });
  };

  // Thực hiện hành động xác nhận từ Action Modal
  const handleExecuteModalAction = async () => {
    if (!actionModal) return;
    setIsProcessingAction(true);

    try {
      if (actionModal.type === "deleteGroup") {
        const res = await fetch(`${BACKEND_URL}/chat/groups/${actionModal.targetId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Xóa nhóm thất bại!");
        setGroupList((prev) => prev.filter((g) => g.id !== actionModal.targetId));
        if (currentRoom === actionModal.targetId) {
          handleSwitchChannel("general");
        }
      } else if (actionModal.type === "leaveGroup") {
        const current = userProfile?.username || username;
        const res = await fetch(`${BACKEND_URL}/chat/groups/${actionModal.targetId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: current }),
        });
        if (!res.ok) throw new Error("Rời nhóm thất bại!");
        setGroupList((prev) => prev.filter((g) => g.id !== actionModal.targetId));
        if (currentRoom === actionModal.targetId) {
          handleSwitchChannel("general");
        }
      } else if (actionModal.type === "deleteConversation") {
        const res = await fetch(`${BACKEND_URL}/chat/conversations/${actionModal.targetId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Xóa cuộc trò chuyện thất bại!");
        setConversations((prev) => prev.filter((c) => c.roomId !== actionModal.targetId));
        setSavedContacts((prev) =>
          prev.filter((contact) => {
            const contactRoom = getDmRoomId(userProfile?.username || username, contact.username || contact.displayName);
            return contactRoom !== actionModal.targetId;
          })
        );
        if (currentRoom === actionModal.targetId) {
          handleSwitchChannel("general");
        }
      } else if (actionModal.type === "transferLeader") {
        if (!currentRoom) return;
        const current = userProfile?.username || username;
        const res = await fetch(`${BACKEND_URL}/chat/groups/${currentRoom}/transfer-leader`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: actionModal.targetId,
            currentUsername: current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Chuyển quyền trưởng nhóm thất bại!");
        if (data.result?.members) {
          setCurrentGroupMembers(data.result.members);
        }
      } else if (actionModal.type === "kickMember") {
        if (!currentRoom) return;
        const current = userProfile?.username || username;
        const res = await fetch(`${BACKEND_URL}/chat/groups/${currentRoom}/kick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: actionModal.targetId,
            requesterUsername: current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Xóa thành viên khỏi nhóm thất bại!");
        if (data.result?.members) {
          setCurrentGroupMembers(data.result.members);
        }
      }
      setActionModal(null);
    } catch (err: any) {
      alert(err.message || "Đã xảy ra lỗi!");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Xử lý upload ảnh đại diện từ máy tính lên server
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp|gif)$/i)) {
      setProfileAlert({
        type: "error",
        text: "Chỉ chấp nhận các file ảnh (JPG, PNG, WEBP, GIF)!",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileAlert({
        type: "error",
        text: "Dung lượng ảnh tối đa là 5MB!",
      });
      return;
    }

    setIsUploadingAvatar(true);
    setProfileAlert(null);

    try {
      // Nén ảnh sang base64 data URL (tối đa 200x200, dung lượng nhỏ ~15-25KB) để lưu trực tiếp vào CSDL PostgreSQL,
      // vĩnh viễn không bao giờ bị mất hoặc bị 404 khi redeploy lên Render
      const base64Data = await compressImageToBase64(file, 200, 200, 0.85);
      setEditAvatarEmoji(base64Data);
      setProfileAlert({
        type: "success",
        text: "Đã chọn ảnh đại diện! Bấm 'Lưu thay đổi hồ sơ' bên dưới để lưu vĩnh viễn.",
      });
    } catch (err: any) {
      setProfileAlert({
        type: "error",
        text: err.message || "Lỗi xử lý ảnh đại diện!",
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Cập nhật Profile (Tên hiển thị & Avatar)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setProfileAlert(null);
    setIsUpdatingProfile(true);

    try {
      const res = await fetch(`${BACKEND_URL}/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userProfile.username,
          displayName: editDisplayName.trim() || userProfile.username,
          avatarUrl: editAvatarEmoji,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cập nhật thất bại!");

      setUserProfile(data.user);
      setUsername(data.user.displayName || data.user.username);
      setEditDisplayName(data.user.displayName || data.user.username);
      setEditAvatarEmoji(data.user.avatarUrl || "");
      try {
        localStorage.setItem("chat_user", JSON.stringify(data.user));
      } catch (e) {
        console.error("Lỗi khi cập nhật phiên đăng nhập:", e);
      }
      setProfileAlert({ type: "success", text: "Cập nhật hồ sơ thành công!" });
    } catch (err: any) {
      setProfileAlert({ type: "error", text: err.message || "Lỗi khi cập nhật!" });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Mở modal xem thông tin người dùng (Profile Card)
  const handleViewUserProfile = async (targetUser: string) => {
    if (!targetUser) return;
    const cleanTarget = targetUser.trim();

    // Tìm trong cache danh bạ / conversations để hiển thị tức thì
    const foundConv = conversations.find(
      (c: any) =>
        (c.contactUser?.username && c.contactUser.username.toLowerCase() === cleanTarget.toLowerCase()) ||
        (c.contactUser?.displayName && c.contactUser.displayName.toLowerCase() === cleanTarget.toLowerCase()) ||
        (c.contactName && c.contactName.toLowerCase() === cleanTarget.toLowerCase())
    );

    const isSelf =
      cleanTarget.toLowerCase() === (userProfile?.username || "").toLowerCase() ||
      cleanTarget.toLowerCase() === (userProfile?.displayName || "").toLowerCase() ||
      cleanTarget.toLowerCase() === (username || "").toLowerCase();

    if (isSelf) {
      setViewingUser({
        id: userProfile?.id,
        username: userProfile?.username || username,
        displayName: userProfile?.displayName || username,
        phone: userProfile?.phone,
        avatarUrl: userProfile?.avatarUrl,
        createdAt: userProfile?.createdAt,
      });
      return;
    }

    setViewingUser({
      id: foundConv?.contactUser?.id,
      username: foundConv?.contactUser?.username || cleanTarget,
      displayName: foundConv?.contactUser?.displayName || cleanTarget,
      phone: foundConv?.contactUser?.phone,
      avatarUrl: foundConv?.contactUser?.avatarUrl || getSenderAvatar(cleanTarget),
      createdAt: foundConv?.contactUser?.createdAt,
    });

    try {
      const res = await fetch(`${BACKEND_URL}/auth/user-info?user=${encodeURIComponent(cleanTarget)}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setViewingUser(data);
        }
      }
    } catch {
      // Dùng dữ liệu tạm nếu đang offline
    }
  };

  // Mở modal cài đặt hồ sơ: luôn đồng bộ dữ liệu đang lưu trong database
  const handleOpenProfileModal = () => {
    setEditDisplayName(userProfile?.displayName || username);
    setEditAvatarEmoji(userProfile?.avatarUrl || "");
    setCurrentPwd("");
    setNewPwd("");
    setConfirmNewPwd("");
    setProfileAlert(null);
    setShowProfileModal(true);
  };

  // Đóng modal: khôi phục lại dữ liệu gốc đã lưu nếu người dùng chưa bấm Lưu thay đổi
  const handleCloseProfileModal = () => {
    setEditDisplayName(userProfile?.displayName || username);
    setEditAvatarEmoji(userProfile?.avatarUrl || "");
    setCurrentPwd("");
    setNewPwd("");
    setConfirmNewPwd("");
    setProfileAlert(null);
    setShowProfileModal(false);
  };

  // Đổi mật khẩu
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setProfileAlert(null);

    if (!currentPwd || !newPwd) {
      setProfileAlert({ type: "error", text: "Vui lòng nhập đầy đủ mật khẩu!" });
      return;
    }

    const pwdError = validatePasswordComplexity(newPwd);
    if (pwdError) {
      setProfileAlert({ type: "error", text: pwdError });
      return;
    }

    if (newPwd !== confirmNewPwd) {
      setProfileAlert({ type: "error", text: "Xác nhận mật khẩu mới không khớp!" });
      return;
    }

    setIsUpdatingProfile(true);

    try {
      const res = await fetch(`${BACKEND_URL}/auth/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userProfile.username,
          currentPassword: currentPwd,
          newPassword: newPwd,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Đổi mật khẩu thất bại!");

      setProfileAlert({ type: "success", text: "Đổi mật khẩu thành công!" });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmNewPwd("");
    } catch (err: any) {
      setProfileAlert({ type: "error", text: err.message || "Lỗi khi đổi mật khẩu!" });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Thả / Hủy cảm xúc (Like / Reaction) cho tin nhắn
  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (!socket || !currentRoom) return;

    // Cập nhật Optimistic trên giao diện ngay lập tức
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };
        let users: string[] = [...(currentReactions[emoji] || [])];

        if (users.includes(username)) {
          users = users.filter((u) => u !== username);
          if (users.length === 0) {
            delete currentReactions[emoji];
          } else {
            currentReactions[emoji] = users;
          }
        } else {
          currentReactions[emoji] = [...users, username];
        }

        return { ...m, reactions: currentReactions };
      })
    );

    // Gửi sự kiện qua socket
    socket.emit("reactMessage", {
      messageId,
      roomId: currentRoom,
      emoji,
      username,
    });
  };

  // Kiểm tra file có phải hình ảnh không
  const isImageFile = (fileType?: string | null, fileName?: string | null) => {
    if (fileType && fileType.startsWith("image/")) return true;
    if (fileName && fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) return true;
    return false;
  };

  // Định dạng dung lượng file
  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Tải file/ảnh lên server và gửi vào cuộc trò chuyện
  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("Dung lượng file tối đa là 25MB!");
      return;
    }

    setIsUploadingChatFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BACKEND_URL}/chat/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Tải tệp lên thất bại!");

      // Gửi tin nhắn qua socket
      if (socket) {
        socket.emit("sendMessage", {
          roomId: currentRoom,
          sender: username,
          recipient: activeTab === "dm" ? dmTargetUser : undefined,
          content: inputMessage.trim(),
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          replyToId: replyingMessage ? replyingMessage.id : undefined,
          replyToSender: replyingMessage ? replyingMessage.sender : undefined,
          replyToContent: replyingMessage
            ? replyingMessage.isRevoked
              ? "Tin nhắn đã được thu hồi"
              : replyingMessage.fileUrl
              ? isImageFile(replyingMessage.fileType, replyingMessage.fileName)
                ? "[Hình ảnh]"
                : `[Tệp tin] ${replyingMessage.fileName || ""}`
              : replyingMessage.content
            : undefined,
        });

        setInputMessage("");
        setReplyingMessage(null);
      }
    } catch (err: any) {
      alert(err.message || "Lỗi khi gửi tệp đính kèm!");
    } finally {
      setIsUploadingChatFile(false);
      if (chatFileInputRef.current) {
        chatFileInputRef.current.value = "";
      }
    }
  };

  // Bắt đầu trả lời tin nhắn
  const handleReplyMessage = (msg: Message) => {
    setReplyingMessage(msg);
    setActiveMenuMessageId(null);
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  };

  // Cuộn mượt đến tin nhắn được trả lời và tạo hiệu ứng nhấp nháy highlight
  const scrollToMessage = (targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-400", "bg-indigo-950/40");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-indigo-400", "bg-indigo-950/40");
      }, 2000);
    }
  };

  // Xóa ảnh clipboard đã dán
  const clearPastedImage = () => {
    if (pastedImagePreview) {
      URL.revokeObjectURL(pastedImagePreview);
    }
    setPastedImageFile(null);
    setPastedImagePreview(null);
  };

  // Xử lý dán ảnh từ clipboard (Ctrl+V)
  const processPastedFile = (file: File) => {
    const ext = file.type.split("/")[1] || "png";
    const namedFile =
      file.name && file.name !== "image.png"
        ? file
        : new File([file], `paste_${Date.now()}.${ext}`, { type: file.type || "image/png" });

    setPastedImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(namedFile);
    });
    setPastedImageFile(namedFile);
    messageInputRef.current?.focus();
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processPastedFile(file);
          break;
        }
      }
    }
  };

  // Lắng nghe sự kiện Paste toàn cục khi người dùng ấn Ctrl+V
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isOtherInput =
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        activeEl !== messageInputRef.current;

      if (isOtherInput) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processPastedFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, []);

  // Gửi tin nhắn
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputMessage.trim() && !pastedImageFile) || !socket) return;

    if (pastedImageFile) {
      if (pastedImageFile.size > 25 * 1024 * 1024) {
        alert("Dung lượng ảnh tối đa là 25MB!");
        return;
      }

      setIsUploadingChatFile(true);
      try {
        const formData = new FormData();
        formData.append("file", pastedImageFile);

        const res = await fetch(`${BACKEND_URL}/chat/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Tải ảnh lên thất bại!");

        socket.emit("sendMessage", {
          roomId: currentRoom,
          sender: username,
          recipient: activeTab === "dm" ? dmTargetUser : undefined,
          content: inputMessage.trim(),
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          replyToId: replyingMessage ? replyingMessage.id : undefined,
          replyToSender: replyingMessage ? replyingMessage.sender : undefined,
          replyToContent: replyingMessage
            ? replyingMessage.isRevoked
              ? "Tin nhắn đã được thu hồi"
              : replyingMessage.fileUrl
              ? isImageFile(replyingMessage.fileType, replyingMessage.fileName)
                ? "[Hình ảnh]"
                : `[Tệp tin] ${replyingMessage.fileName || ""}`
              : replyingMessage.content
            : undefined,
        });

        socket.emit("typing", {
          roomId: currentRoom,
          username,
          isTyping: false,
        });

        clearPastedImage();
        setInputMessage("");
        setReplyingMessage(null);
        setShowEmojiPicker(false);
      } catch (err: any) {
        alert(err.message || "Lỗi khi gửi ảnh dán!");
      } finally {
        setIsUploadingChatFile(false);
      }
      return;
    }

    socket.emit("sendMessage", {
      roomId: currentRoom,
      sender: username,
      recipient: activeTab === "dm" ? dmTargetUser : undefined,
      content: inputMessage.trim(),
      replyToId: replyingMessage ? replyingMessage.id : undefined,
      replyToSender: replyingMessage ? replyingMessage.sender : undefined,
      replyToContent: replyingMessage
        ? replyingMessage.isRevoked
          ? "Tin nhắn đã được thu hồi"
          : replyingMessage.fileUrl
          ? isImageFile(replyingMessage.fileType, replyingMessage.fileName)
            ? "[Hình ảnh]"
            : `[Tệp tin] ${replyingMessage.fileName || ""}`
          : replyingMessage.content
        : undefined,
    });

    socket.emit("typing", {
      roomId: currentRoom,
      username,
      isTyping: false,
    });

    setInputMessage("");
    setReplyingMessage(null);
    setShowEmojiPicker(false);
  };

  // Xác nhận thu hồi tin nhắn
  const handleConfirmRevoke = () => {
    if (!socket || !revokeTargetMessageId) return;

    socket.emit("revokeMessage", {
      messageId: revokeTargetMessageId,
      roomId: currentRoom,
      username,
    });
    setRevokeTargetMessageId(null);
  };

  // Ghim / Bỏ ghim tin nhắn
  const handleTogglePin = (messageId: string) => {
    if (!socket || !messageId) return;
    socket.emit("togglePinMessage", {
      messageId,
      roomId: currentRoom,
    });
  };

  // Sao chép nội dung tin nhắn
  const handleCopyMessage = (messageId: string, content: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMessageId(messageId);
      setCopyToast(true);
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
      setTimeout(() => {
        setCopyToast(false);
      }, 2500);
    });
  };

  const addEmoji = (emoji: string) => {
    setInputMessage((prev) => prev + emoji);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputMessage(val);

    // Phát hiện ký tự @ để kích hoạt gợi ý tag tên thành viên
    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);

    if (match) {
      const query = match[1];
      setShowMentionSuggestions(true);
      setMentionQuery(query);
      setMentionStartIndex(textBeforeCursor.lastIndexOf("@"));
      setSelectedMentionIndex(0);
    } else {
      setShowMentionSuggestions(false);
    }

    if (!socket) return;

    socket.emit("typing", {
      roomId: currentRoom,
      username,
      isTyping: true,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        roomId: currentRoom,
        username,
        isTyping: false,
      });
    }, 1200);
  };

  // Danh sách gợi ý khi gõ @
  const mentionCandidates = useMemo(() => {
    if (!showMentionSuggestions) return [];
    const q = mentionQuery.toLowerCase().trim();

    const list: {
      id: string;
      name: string;
      username?: string;
      sub?: string;
      avatarUrl?: string | null;
      isAll?: boolean;
    }[] = [];

    // 1. Gợi ý @all (nhắc tất cả mọi người)
    if (!q || "all".includes(q) || "tat ca".includes(q) || "tất cả".includes(q) || "mọi người".includes(q)) {
      list.push({
        id: "mention-all",
        name: "all",
        sub: "Nhắc tất cả mọi người trong phòng",
        isAll: true,
      });
    }

    // 2. Thu thập danh sách thành viên trong nhóm / bạn bè / online
    const pool = new Map<string, { id: string; name: string; username?: string; sub?: string; avatarUrl?: string | null }>();

    if (currentGroupMembers && currentGroupMembers.length > 0) {
      currentGroupMembers.forEach((m) => {
        const dName = m.displayName || m.username;
        const uName = m.username;
        if (uName && uName !== username && uName !== userProfile?.username) {
          pool.set(uName, {
            id: m.id || uName,
            name: dName,
            username: uName,
            sub: `@${uName}`,
            avatarUrl: m.avatarUrl,
          });
        }
      });
    }

    savedContacts.forEach((c) => {
      const dName = c.displayName || c.username;
      const uName = c.username;
      if (uName && uName !== username && uName !== userProfile?.username && !pool.has(uName)) {
        pool.set(uName, {
          id: c.id || uName,
          name: dName,
          username: uName,
          sub: `@${uName}`,
          avatarUrl: c.avatarUrl,
        });
      }
    });

    onlineUsers.forEach((u) => {
      if (u && u !== username && u !== userProfile?.username && !pool.has(u)) {
        pool.set(u, {
          id: u,
          name: u,
          username: u,
          sub: "Đang online",
        });
      }
    });

    Array.from(pool.values()).forEach((item) => {
      const matchName = item.name.toLowerCase().includes(q);
      const matchUser = item.username ? item.username.toLowerCase().includes(q) : false;
      if (!q || matchName || matchUser) {
        list.push(item);
      }
    });

    return list.slice(0, 8);
  }, [showMentionSuggestions, mentionQuery, currentGroupMembers, savedContacts, onlineUsers, username, userProfile]);

  // Chọn thành viên được tag
  const handleSelectMention = (target: { name: string; username?: string; isAll?: boolean }) => {
    const cursor = messageInputRef.current?.selectionStart || inputMessage.length;
    const beforeAt = inputMessage.slice(0, mentionStartIndex);
    const afterCursor = inputMessage.slice(cursor);
    const tagText = target.isAll
      ? "@all "
      : `@${(target.username || target.name).replace(/\s+/g, "_")} `;
    const nextVal = `${beforeAt}${tagText}${afterCursor}`;
    setInputMessage(nextVal);
    setShowMentionSuggestions(false);

    setTimeout(() => {
      if (messageInputRef.current) {
        const newPos = beforeAt.length + tagText.length;
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  // Render nội dung tin nhắn có gắn thẻ @mention
  const renderMessageContentWithMentions = (content: string, isMeMsg: boolean) => {
    if (!content) return null;

    const mentionRegex = /(@all\b|@tatca\b|@[\p{L}\p{N}_-]+)/gu;
    const parts = content.split(mentionRegex);

    if (parts.length === 1) {
      return <span>{content}</span>;
    }

    const myUser = (username || "").toLowerCase();
    const myDisplay = (userProfile?.displayName || "").toLowerCase().replace(/\s+/g, "_");

    return (
      <span>
        {parts.map((part, idx) => {
          if (!part) return null;
          if (part.startsWith("@")) {
            const raw = part.slice(1).toLowerCase();
            const isMentioningMe =
              raw === "all" ||
              raw === "tatca" ||
              raw === myUser ||
              raw === myDisplay;

            return (
              <span
                key={idx}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md font-semibold text-xs transition select-none ${
                  isMentioningMe
                    ? isMeMsg
                      ? "bg-white/30 text-white underline decoration-amber-300 font-bold"
                      : "bg-amber-500/25 text-amber-500 dark:text-amber-300 border border-amber-500/30 font-bold"
                    : isMeMsg
                    ? "bg-black/25 text-indigo-100"
                    : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25"
                }`}
                title={isMentioningMe ? "Nhắc đến bạn" : "Thẻ nhắc tên"}
              >
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      "from-violet-500 to-indigo-600",
      "from-blue-500 to-cyan-500",
      "from-emerald-400 to-teal-600",
      "from-pink-500 to-rose-500",
      "from-amber-400 to-orange-500",
      "from-fuchsia-500 to-purple-600",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Helper hiển thị avatar (hỗ trợ cả ảnh URL từ server, base64 data URL và emoji icon)
  const renderAvatarContent = (
    avatarValue?: string | null,
    fallbackName: string = "",
    size: "sm" | "md" | "lg" = "md"
  ) => {
    const isUrl =
      avatarValue &&
      (avatarValue.startsWith("http://") ||
        avatarValue.startsWith("https://") ||
        avatarValue.startsWith("/") ||
        avatarValue.startsWith("data:image/"));

    const hasFailed = avatarValue ? failedAvatarUrls.has(avatarValue) : false;

    if (isUrl && !hasFailed) {
      return (
        <img
          src={avatarValue!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => {
            if (avatarValue) {
              setFailedAvatarUrls((prev) => {
                const next = new Set(prev);
                next.add(avatarValue);
                return next;
              });
            }
          }}
        />
      );
    }
    if (avatarValue && !isUrl) {
      return (
        <span
          className={
            size === "lg"
              ? "text-2xl"
              : size === "sm"
              ? "text-sm"
              : "text-base"
          }
        >
          {avatarValue}
        </span>
      );
    }
    return <span>{getInitials(fallbackName || "U")}</span>;
  };

  // Lấy avatar của người gửi tin nhắn (dựa trên tên hiển thị hoặc username)
  const getSenderAvatar = (senderName: string) => {
    if (
      senderName === (userProfile?.displayName || username) ||
      senderName === userProfile?.username
    ) {
      return userProfile?.avatarUrl || editAvatarEmoji;
    }
    const found = conversations.find(
      (c: any) =>
        (c.contactUser?.username &&
          c.contactUser.username.toLowerCase() === senderName.toLowerCase()) ||
        (c.contactUser?.displayName &&
          c.contactUser.displayName.toLowerCase() === senderName.toLowerCase()) ||
        (c.contactName &&
          c.contactName.toLowerCase() === senderName.toLowerCase())
    );
    return found?.contactUser?.avatarUrl || null;
  };

  // Đang kiểm tra phiên đăng nhập từ localStorage
  if (isAuthChecking) {
    return (
      <div className={`flex min-h-screen items-center justify-center transition-colors duration-200 ${
        theme === "light" ? "bg-[#f0f2f5] text-slate-600" : "bg-[#0a0d14] text-slate-400"
      }`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium tracking-wide">Đang khôi phục phiên làm việc...</span>
        </div>
      </div>
    );
  }

  // MÀN HÌNH ĐĂNG KÝ / ĐĂNG NHẬP BẢO MẬT BẰNG MẬT KHẨU
  if (!hasJoined) {
    const isLight = theme === "light";
    return (
      <div className={`relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden selection:bg-indigo-500 selection:text-white transition-colors duration-300 ${
        isLight ? "bg-[#f0f2f5] text-slate-800" : "bg-[#0a0d14] text-slate-100"
      }`}>
        {/* Vệt sáng trang trí background (Ambient Glow) */}
        <div className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-opacity ${
          isLight ? "bg-indigo-300/40" : "bg-indigo-600/20"
        }`}></div>
        <div className={`absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-opacity ${
          isLight ? "bg-purple-300/40" : "bg-purple-600/20"
        }`}></div>

        {/* Nút chuyển đổi Theme sáng/tối góc trên bên phải */}
        <div className="absolute top-4 right-4 z-20">
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 shadow-sm border cursor-pointer hover:scale-105 active:scale-95 ${
              isLight
                ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-slate-200"
                : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
            }`}
            title={isLight ? "Chuyển sang giao diện Tối" : "Chuyển sang giao diện Sáng"}
          >
            <div className="relative w-3.5 h-3.5">
              <Sun
                className={`w-3.5 h-3.5 text-amber-400 absolute inset-0 transition-all duration-500 ease-out ${
                  !isLight ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                }`}
              />
              <Moon
                className={`w-3.5 h-3.5 text-indigo-600 absolute inset-0 transition-all duration-500 ease-out ${
                  isLight ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
                }`}
              />
            </div>
            <span>{isLight ? "Giao diện Sáng" : "Giao diện Tối"}</span>
          </button>
        </div>

        {/* Khung Card chính (Glassmorphic Card) */}
        <div className={`relative w-full max-w-md rounded-3xl p-7 sm:p-9 shadow-2xl backdrop-blur-2xl border transition-all duration-300 ${
          isLight
            ? "bg-white/95 border-slate-200/90 shadow-slate-300/40"
            : "bg-slate-900/80 border-slate-800/90 shadow-indigo-950/40"
        }`}>
          {/* Header Card: Logo & Tiêu đề */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3.5 ring-4 ring-indigo-500/10 transform hover:scale-105 transition duration-200">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${
              isLight ? "text-slate-900" : "text-white"
            }`}>
              Antigravity Chat
            </h1>
            <p className={`text-xs mt-1 max-w-xs ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}>
              Kết nối và trò chuyện thời gian thực mọi lúc, mọi nơi
            </p>
          </div>

          {/* Tab chuyển đổi Đăng nhập / Đăng ký */}
          <div className={`flex p-1 rounded-2xl mb-6 border transition-colors ${
            isLight
              ? "bg-slate-100/90 border-slate-200/80"
              : "bg-slate-950/80 border-slate-800"
          }`}>
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
                setAuthSuccess("");
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer ${
                authMode === "login"
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/25"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
                setAuthSuccess("");
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer ${
                authMode === "register"
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/25"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Đăng ký tài khoản
            </button>
          </div>

          {/* Thông báo lỗi / thành công */}
          {authError && (
            <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {/* Tên đăng nhập / Số điện thoại */}
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                isLight ? "text-slate-700" : "text-slate-300"
              }`}>
                {authMode === "login" ? "Tên đăng nhập hoặc Số điện thoại" : "Tên đăng nhập"}
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-3.5 w-4 h-4 ${
                  isLight ? "text-slate-400" : "text-slate-500"
                }`} />
                <input
                  type="text"
                  placeholder={authMode === "login" ? "Nhập tên đăng nhập hoặc số điện thoại..." : "Tên đăng nhập..."}
                  value={authUsername}
                  onChange={(e) => {
                    setAuthUsername(e.target.value);
                    if (authError) setAuthError("");
                  }}
                  className={`w-full rounded-xl py-3 pl-10 pr-4 text-sm transition duration-200 outline-none border ${
                    isLight
                      ? "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                      : "bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  }`}
                />
              </div>
            </div>

            {/* Tên hiển thị (chỉ hiện khi Đăng ký) */}
            {authMode === "register" && (
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  Tên hiển thị đầy đủ
                </label>
                <div className="relative">
                  <User className={`absolute left-3.5 top-3.5 w-4 h-4 ${
                    isLight ? "text-slate-400" : "text-slate-500"
                  }`} />
                  <input
                    type="text"
                    placeholder="Ví dụ: Phạm Quốc Cường..."
                    value={authDisplayName}
                    onChange={(e) => {
                      setAuthDisplayName(e.target.value);
                      if (authError) setAuthError("");
                    }}
                    className={`w-full rounded-xl py-3 pl-10 pr-4 text-sm transition duration-200 outline-none border ${
                      isLight
                        ? "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                        : "bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Số điện thoại (chỉ hiện khi Đăng ký) */}
            {authMode === "register" && (
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center justify-between ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <span>Số điện thoại <span className="text-rose-500">*</span></span>
                  <span className={`text-[10px] font-normal lowercase ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}>(mỗi SĐT chỉ tạo 1 tài khoản)</span>
                </label>
                <div className="relative">
                  <Phone className={`absolute left-3.5 top-3.5 w-4 h-4 ${
                    isLight ? "text-slate-400" : "text-slate-500"
                  }`} />
                  <input
                    type="tel"
                    required
                    placeholder="Ví dụ: 0912345678 (bắt buộc)..."
                    value={authPhone}
                    onChange={(e) => {
                      setAuthPhone(e.target.value);
                      if (authError) setAuthError("");
                    }}
                    className={`w-full rounded-xl py-3 pl-10 pr-4 text-sm transition duration-200 outline-none border ${
                      isLight
                        ? "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                        : "bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Mật khẩu */}
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                isLight ? "text-slate-700" : "text-slate-300"
              }`}>
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-3.5 w-4 h-4 ${
                  isLight ? "text-slate-400" : "text-slate-500"
                }`} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={authMode === "register" ? "Tối thiểu 6 ký tự (Hoa, thường, ký tự đặc biệt)..." : "Nhập mật khẩu..."}
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    if (authError) setAuthError("");
                  }}
                  className={`w-full rounded-xl py-3 pl-10 pr-10 text-sm transition duration-200 outline-none border ${
                    isLight
                      ? "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                      : "bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-3.5 transition cursor-pointer ${
                    isLight ? "text-slate-400 hover:text-slate-700" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {authMode === "register" && (
                <p className={`text-[11px] mt-1.5 leading-normal ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}>
                  * Gồm tối thiểu 6 ký tự, có chữ hoa, chữ thường và ít nhất 1 ký tự đặc biệt (!@#$%...).
                </p>
              )}
            </div>

            {/* Xác nhận mật khẩu (khi Đăng ký) */}
            {authMode === "register" && (
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  Xác nhận lại mật khẩu
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-3.5 w-4 h-4 ${
                    isLight ? "text-slate-400" : "text-slate-500"
                  }`} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập lại mật khẩu trên..."
                    value={authConfirmPassword}
                    onChange={(e) => {
                      setAuthConfirmPassword(e.target.value);
                      if (authError) setAuthError("");
                    }}
                    className={`w-full rounded-xl py-3 pl-10 pr-4 text-sm transition duration-200 outline-none border ${
                      isLight
                        ? "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                        : "bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Trạng thái kết nối Socket */}
            <div className={`flex items-center justify-between pt-1 px-1 text-xs ${
              isLight ? "text-slate-600" : "text-slate-400"
            }`}>
              <span>Máy chủ Socket:</span>
              {isConnected ? (
                <span className="flex items-center text-emerald-500 gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Đã kết nối
                </span>
              ) : (
                <span className="flex items-center text-amber-500 gap-1.5 font-medium">
                  <WifiOff className="w-3.5 h-3.5" />
                  Đang đợi Server...
                </span>
              )}
            </div>

            {/* Nút bấm Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !isConnected}
              className="w-full mt-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.99] py-3.5 font-bold text-white text-sm transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <span>{authMode === "login" ? "Đăng nhập ngay" : "Tạo tài khoản"}</span>
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentGroupObj = groupList.find((g) => g.id === currentRoom);
  const foundRoom = roomList.find((r) => r.id === currentRoom);
  const activeChannelObj = currentGroupObj
    ? {
        id: currentGroupObj.id,
        name: currentGroupObj.name,
        desc: `Nhóm chat · ${currentGroupObj.memberCount || 1} thành viên`,
        icon: "👥",
        avatarUrl: currentGroupObj.avatarUrl || null,
        isGroup: true,
        memberCount: currentGroupObj.memberCount || 1,
      }
    : {
        id: foundRoom?.id || currentRoom,
        name: foundRoom?.name || currentRoom,
        desc: foundRoom?.desc || "Kênh trò chuyện",
        icon: foundRoom?.icon || "💬",
        avatarUrl: null,
        isGroup: false,
        memberCount: 0,
      };

  const normalizeKey = (str?: string | null) => (str || "").trim().toLowerCase();
  const currentMyUsername = normalizeKey(userProfile?.username || username);
  const currentMyDisplay = normalizeKey(userProfile?.displayName || username);

  const otherOnlineUsers = onlineUsers.filter((u) => {
    const norm = normalizeKey(u);
    return norm !== currentMyUsername && norm !== currentMyDisplay;
  });

  // Danh sách các cuộc trò chuyện riêng: kết hợp từ database + người online + tìm kiếm (Đã chống trùng lặp tuyệt đối)
  const dmMap = new Map<string, any>();

  const isSameUser = (existing: any, targetName: string) => {
    if (!targetName) return false;
    const t = normalizeKey(targetName);
    return (
      normalizeKey(existing.username) === t ||
      normalizeKey(existing.displayName) === t ||
      normalizeKey(existing.name) === t
    );
  };

  const findExistingKey = (targetName: string) => {
    for (const [key, item] of dmMap.entries()) {
      if (isSameUser(item, targetName)) return key;
    }
    return null;
  };

  // (A) Nạp các cuộc trò chuyện đã lưu trong Database (kể cả khi đối phương đang Offline vẫn hiện)
  for (const conv of conversations) {
    const contactDisplayName = conv.contactUser?.displayName || conv.contactName;
    const contactUsername = conv.contactUser?.username || conv.contactName;
    const normUser = normalizeKey(contactUsername);
    const normDisplay = normalizeKey(contactDisplayName);

    if (normUser === currentMyUsername || normDisplay === currentMyDisplay) {
      continue;
    }

    const existingKey = findExistingKey(contactUsername) || findExistingKey(contactDisplayName);
    if (!existingKey) {
      const primaryKey = normUser || normDisplay;
      dmMap.set(primaryKey, {
        name: contactDisplayName,
        displayName: contactDisplayName,
        username: contactUsername,
        avatarUrl: conv.contactUser?.avatarUrl,
        roomId: conv.roomId,
        lastMessage: conv.lastMessage,
        lastTime: conv.lastTime,
      });
    } else {
      const existing = dmMap.get(existingKey);
      if (conv.lastMessage) {
        existing.lastMessage = conv.lastMessage;
        existing.lastTime = conv.lastTime;
      }
      if (conv.contactUser?.displayName) {
        existing.displayName = conv.contactUser.displayName;
        existing.name = conv.contactUser.displayName;
      }
      if (conv.contactUser?.avatarUrl) {
        existing.avatarUrl = conv.contactUser.avatarUrl;
      }
    }
  }

  // (B) Nạp thêm những người đang online cùng thời điểm (nếu chưa từng chat trước đó)
  for (const onlineUser of otherOnlineUsers) {
    const existingKey = findExistingKey(onlineUser);
    if (!existingKey) {
      const normKey = normalizeKey(onlineUser);
      const matchedContact = savedContacts.find(
        (c: any) => normalizeKey(c.username) === normKey || normalizeKey(c.displayName) === normKey
      );
      const matchedConv = conversations.find(
        (c) =>
          normalizeKey(c.contactUser?.username) === normKey ||
          normalizeKey(c.contactUser?.displayName) === normKey ||
          normalizeKey(c.contactName) === normKey
      );
      const resolvedUsername = (matchedContact as any)?.username || matchedConv?.contactUser?.username || onlineUser;
      const resolvedDisplayName = (matchedContact as any)?.displayName || matchedConv?.contactUser?.displayName || onlineUser;

      dmMap.set(normKey, {
        name: resolvedDisplayName,
        displayName: resolvedDisplayName,
        username: resolvedUsername,
        avatarUrl: (matchedContact as any)?.avatarUrl || matchedConv?.contactUser?.avatarUrl || null,
        roomId: matchedConv?.roomId || getDmRoomId(userProfile?.username || username, resolvedUsername),
        lastMessage: null,
      });
    }
  }

  // (C) Nạp thêm những người vừa tìm kiếm qua thanh Search
  for (const contact of savedContacts) {
    const contactDisplayName = contact.displayName || contact.username;
    const contactUsername = contact.username || contactDisplayName;
    const existingKey = findExistingKey(contactUsername) || findExistingKey(contactDisplayName);
    if (!existingKey) {
      const normKey = normalizeKey(contactUsername || contactDisplayName);
      dmMap.set(normKey, {
        name: contactDisplayName,
        displayName: contactDisplayName,
        username: contactUsername,
        avatarUrl: contact.avatarUrl,
        roomId: getDmRoomId(userProfile?.username || username, contactUsername),
        lastMessage: null,
      });
    }
  }

  const allDmItems = Array.from(dmMap.values());

  const currentDmItem = allDmItems.find(
    (item) =>
      item.displayName === dmTargetUser ||
      item.username === dmTargetUser ||
      item.name === dmTargetUser
  );
  const isDmTargetOnline = Boolean(
    dmTargetUser &&
      (onlineUsers.includes(dmTargetUser) ||
        (currentDmItem &&
          (onlineUsers.includes(currentDmItem.name) ||
            onlineUsers.includes(currentDmItem.displayName) ||
            onlineUsers.includes(currentDmItem.username))))
  );

  const filteredMessages = searchTerm.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : messages;

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isRevoked);
  const safePinnedIndex =
    pinnedMessages.length > 0 ? Math.min(pinnedIndex, pinnedMessages.length - 1) : 0;
  const currentPinned = pinnedMessages[safePinnedIndex];

  // Kho lưu trữ File & Ảnh: Danh sách media đã lọc
  const mediaPhotos = roomMedia.filter((m) => {
    const isImg = isImageFile(m.fileType, m.fileName);
    if (!isImg) return false;
    if (!mediaSearchQuery.trim()) return true;
    const q = mediaSearchQuery.toLowerCase();
    return (
      (m.fileName && m.fileName.toLowerCase().includes(q)) ||
      (m.sender && m.sender.toLowerCase().includes(q)) ||
      (m.content && m.content.toLowerCase().includes(q))
    );
  });

  const mediaFiles = roomMedia.filter((m) => {
    const isImg = isImageFile(m.fileType, m.fileName);
    if (isImg) return false;
    if (!mediaSearchQuery.trim()) return true;
    const q = mediaSearchQuery.toLowerCase();
    return (
      (m.fileName && m.fileName.toLowerCase().includes(q)) ||
      (m.sender && m.sender.toLowerCase().includes(q)) ||
      (m.content && m.content.toLowerCase().includes(q))
    );
  });

  // Lọc danh sách Kênh, Nhóm và Bạn bè khi tìm kiếm trên Sidebar
  const filteredRoomList = sidebarSearchQuery.trim()
    ? roomList.filter(
        (r) =>
          r.name.toLowerCase().includes(sidebarSearchQuery.trim().toLowerCase()) ||
          (r.desc && r.desc.toLowerCase().includes(sidebarSearchQuery.trim().toLowerCase()))
      )
    : roomList;

  const filteredGroupList = sidebarSearchQuery.trim()
    ? groupList.filter((g) =>
        g.name.toLowerCase().includes(sidebarSearchQuery.trim().toLowerCase())
      )
    : groupList;

  const filteredDmItems = sidebarSearchQuery.trim()
    ? allDmItems.filter((item) => {
        const q = sidebarSearchQuery.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.displayName && item.displayName.toLowerCase().includes(q)) ||
          (item.username && item.username.toLowerCase().includes(q))
        );
      })
    : allDmItems;

  return (
    <div className={`flex h-screen overflow-hidden font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-300 ease-in-out ${theme === "light" ? "light-mode bg-slate-50 text-slate-800" : "dark bg-[#0d1117] text-slate-200"}`}>
      {/* 1. SIDEBAR TRÁI: KÊNH NHÓM + TIN NHẮN RIÊNG 1-1 */}
      <aside className={`w-full md:w-72 bg-[#161b22] border-r border-slate-800/80 flex flex-col justify-between shrink-0 transition-colors duration-300 ease-in-out ${mobileActiveView === "chat" ? "hidden md:flex" : "flex"}`}>
        <div className="overflow-y-auto flex-1">
          {/* Header Sidebar: Ô Tìm kiếm hội thoại & Nút Thao tác nhanh (Phong cách Zalo/Telegram) */}
          <div className="h-16 px-3.5 border-b border-slate-800/80 flex items-center gap-2 shrink-0">
            {/* Ô tìm kiếm nhanh */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm kiếm hội thoại..."
                value={sidebarSearchQuery}
                onChange={(e) => setSidebarSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8.5 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition duration-150"
              />
              {sidebarSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSidebarSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white transition cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Nút dấu cộng (+) Thao tác nhanh: Tạo nhóm / Tìm bạn */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSidebarQuickMenu((prev) => !prev);
                }}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition cursor-pointer shadow-sm ${
                  showSidebarQuickMenu
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30"
                    : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
                title="Tạo nhóm hoặc Thêm bạn bè"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Menu xổ xuống của nút (+) */}
              {showSidebarQuickMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-48 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/90 rounded-2xl p-1.5 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowSidebarQuickMenu(false);
                      handleOpenCreateGroup();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition cursor-pointer text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <span>Tạo nhóm chat mới</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSidebarQuickMenu(false);
                      setShowSearchFriendModal(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition cursor-pointer text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                    <span>Tìm & thêm bạn bè</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* PHẦN 1: KÊNH CỘNG ĐỒNG (CHANNELS) */}
          <div className="p-4 pb-2">
            <div className="flex items-center justify-between mb-2 px-2 gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                Kênh cộng đồng
              </span>
              <button
                onClick={() => setShowAddRoom(!showAddRoom)}
                className="w-5 h-5 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0"
                title="Tạo kênh mới"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {showAddRoom && (
              <form onSubmit={handleCreateRoom} className="mb-2 px-1">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Tên kênh..."
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white"
                  >
                    Tạo
                  </button>
            </div>
              </form>
            )}

            <div className="space-y-1">
              {filteredRoomList.map((room) => {
                const isActive = activeTab === "channel" && room.id === currentRoom;
                return (
                  <button
                    key={room.id}
                    onClick={() => handleSwitchChannel(room.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition duration-150 ${
                      isActive
                        ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-sm">{room.icon}</span>
                    <span className="text-xs truncate font-medium flex-1">{room.name}</span>
                    {mutedRooms.includes(room.id) && (
                      <span title="Đã tắt thông báo">
                        <BellOff className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-indigo-200" : "text-amber-400/70"}`} />
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

          {/* PHẦN 2: NHÓM CHAT (GROUP CHAT) */}
          <div className="p-4 py-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between mb-2 px-2 gap-2">
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Nhóm chat
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-normal whitespace-nowrap">
                  {groupList.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateGroup}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800 transition cursor-pointer shrink-0 whitespace-nowrap"
                title="Tạo nhóm chat mới"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Tạo nhóm</span>
              </button>
            </div>

            <div className="space-y-1">
              {filteredGroupList.length === 0 ? (
                <div className="py-2.5 px-3 text-center">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {sidebarSearchQuery ? "Không có nhóm phù hợp" : "Chưa có nhóm nào"}
                  </p>
                </div>
              ) : (
                filteredGroupList.map((group) => {
                  const isActive = activeTab === "channel" && currentRoom === group.id;
                  return (
                    <div
                      key={group.id}
                      onClick={() => handleSwitchToGroup(group)}
                      className={`w-full group/grp flex items-center gap-2 px-3 py-2 rounded-xl text-left transition duration-150 cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/30"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 text-xs overflow-hidden">
                        {group.avatarUrl ? (
                          <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>👥</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate font-medium flex items-center justify-between">
                          <span className={`truncate ${isActive ? "text-white" : "text-slate-200"}`}>{group.name}</span>
                          <div className="flex items-center gap-1.5 ml-1 shrink-0">
                            {mutedRooms.includes(group.id) && (
                              <span title="Đã tắt thông báo">
                                <BellOff className={`w-3 h-3 ${isActive ? "text-indigo-200" : "text-amber-400/80"}`} />
                              </span>
                            )}
                            <span className={`text-[10px] ${isActive ? "text-indigo-200" : "text-slate-500"}`}>
                              {group.memberCount || 1} tv
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PHẦN 3: TIN NHẮN TRỰC TIẾP 1-1 */}
          <div className="p-4 py-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between mb-2 px-2 gap-2">
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Chat riêng
                </span>
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-emerald-400 font-medium whitespace-nowrap"
                  title={`${otherOnlineUsers.length} người đang online`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {otherOnlineUsers.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSearchFriendModal(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800 transition cursor-pointer shrink-0 whitespace-nowrap"
                title="Tìm bạn bè qua Số điện thoại hoặc Tên"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Tìm bạn</span>
              </button>
            </div>

            <div className="space-y-1">
              {filteredDmItems.length === 0 ? (
                <div className="py-2.5 px-3 text-center">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {sidebarSearchQuery ? "Không tìm thấy người phù hợp" : "Chưa có cuộc trò chuyện"}
                  </p>
                </div>
              ) : (
                filteredDmItems.map((item) => {
                  const isActive =
                    activeTab === "dm" &&
                    (dmTargetUser === item.name || currentRoom === item.roomId);
                  const isUserOnline =
                    onlineUsers.some((u) => {
                      const nu = normalizeKey(u);
                      return (
                        nu === normalizeKey(item.username) ||
                        nu === normalizeKey(item.displayName) ||
                        nu === normalizeKey(item.name)
                      );
                    });
                  const unreadCount = unreadDMs[item.name] || 0;

                  return (
                    <div
                      key={item.roomId || item.name}
                      onClick={() => handleStartDM(item.displayName, item.username, item.roomId)}
                      className={`w-full group/dm flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition duration-150 relative cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/30"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div
                          className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${getAvatarGradient(
                            item.displayName
                          )} flex items-center justify-center font-bold text-white text-[11px] shadow-sm overflow-hidden`}
                        >
                          {renderAvatarContent(item.avatarUrl, item.displayName, "sm")}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161b22] ${
                            isUserOnline ? "bg-emerald-500" : "bg-slate-500"
                          }`}
                        ></span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate font-medium flex items-center justify-between">
                          <span className={isActive ? "text-white" : "text-slate-300"}>
                            {item.displayName}
                          </span>
                          <div className="flex items-center gap-1.5 ml-1 shrink-0">
                            {mutedRooms.includes(item.roomId) && (
                              <span title="Đã tắt thông báo">
                                <BellOff className={`w-3 h-3 ${isActive ? "text-indigo-200" : "text-amber-400/80"}`} />
                              </span>
                            )}
                            {unreadCount > 0 && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                mutedRooms.includes(item.roomId)
                                  ? "bg-slate-700 text-slate-300"
                                  : "bg-rose-500 text-white"
                              }`}>
                                {unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={`text-[10px] truncate ${
                            isActive
                              ? "text-indigo-200"
                              : "text-slate-500"
                          }`}
                        >
                          {item.lastMessage
                            ? item.lastMessage
                            : isUserOnline
                            ? "Đang trực tuyến"
                            : "Ngoại tuyến"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
        </div>
      </div>
    </div>

        {/* User Profile Bar ở đáy Sidebar */}
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleOpenProfileModal}
            className="flex items-center gap-2.5 min-w-0 p-1.5 -ml-1 rounded-xl hover:bg-slate-800/80 transition text-left cursor-pointer group flex-1"
            title="Bấm để Cài đặt hồ sơ & Đổi mật khẩu"
          >
            <div className="relative shrink-0">
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                  username
                )} flex items-center justify-center font-bold text-white text-xs shadow-md group-hover:ring-2 group-hover:ring-indigo-500/50 transition overflow-hidden`}
              >
                {renderAvatarContent(userProfile?.avatarUrl, username, "sm")}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#161b22]"></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition flex items-center gap-1">
                <span>{username}</span>
                <Settings className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition shrink-0" />
          </div>
              <div className="text-[10px] text-emerald-400">Đã đăng nhập</div>
        </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition-all duration-300 cursor-pointer border hover:scale-105 active:scale-95 ${
                theme === "light"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 shadow-sm"
                  : "text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 border-transparent hover:border-slate-800"
              }`}
              title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
            >
              <div className="relative w-4 h-4">
                <Sun
                  className={`w-4 h-4 text-amber-400 absolute inset-0 transition-all duration-500 ease-out ${
                    theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                  }`}
                />
                <Moon
                  className={`w-4 h-4 text-indigo-500 absolute inset-0 transition-all duration-500 ease-out ${
                    theme === "light" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
                  }`}
                />
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition shrink-0 cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
    </div>
      </aside>

      {/* 2. KHUNG CHAT CHÍNH */}
      <main className={`flex-1 flex flex-col bg-[#0d1117] min-w-0 transition-colors duration-300 ease-in-out ${mobileActiveView === "sidebar" ? "hidden md:flex" : "flex"}`}>
        <header className="h-16 px-4 md:px-6 border-b border-slate-800/80 bg-[#161b22]/90 backdrop-blur-md flex items-center justify-between shrink-0 relative z-30 transition-colors duration-300 ease-in-out">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileActiveView("sidebar")}
              className="md:hidden p-2 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
              title="Quay lại danh sách hội thoại"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {activeTab === "channel" ? (
              activeChannelObj.isGroup ? (
                <>
                  <div
                    onClick={handleOpenEditGroupModal}
                    className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-lg shadow-md shrink-0 cursor-pointer overflow-hidden group relative"
                    title="Bấm để đổi tên & ảnh nhóm"
                  >
                    {activeChannelObj.avatarUrl ? (
                      <img
                        src={activeChannelObj.avatarUrl}
                        alt={activeChannelObj.name}
                        className="w-full h-full object-cover group-hover:opacity-75 transition"
                      />
                    ) : (
                      <span>👥</span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white flex items-center gap-2">
                      <span className="truncate">{activeChannelObj.name}</span>
                      <button
                        type="button"
                        onClick={handleViewGroupMembers}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition cursor-pointer flex items-center gap-1 shrink-0"
                        title="Xem danh sách thành viên nhóm"
                      >
                        <Users className="w-3 h-3" />
                        <span>{activeChannelObj.memberCount || 1} thành viên</span>
                      </button>
                      {mutedRooms.includes(activeChannelObj.id) && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0" title="Đã tắt thông báo">
                          <BellOff className="w-3 h-3" />
                          <span>Đã tắt thông báo</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">Nhóm trò chuyện nhiều thành viên</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg shadow-inner">
                    {activeChannelObj.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white flex items-center gap-2">
                      <span>{activeChannelObj.name}</span>
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50">
                        #{activeChannelObj.id}
                      </span>
                      {mutedRooms.includes(activeChannelObj.id) && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0" title="Đã tắt thông báo">
                          <BellOff className="w-3 h-3" />
                          <span>Đã tắt thông báo</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{activeChannelObj.desc}</div>
                  </div>
                </>
              )
            ) : (
              <div
                onClick={() => handleViewUserProfile(dmTargetUser || "")}
                className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-85 transition group"
                title={`Xem hồ sơ của ${dmTargetUser}`}
              >
                <div className="relative">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                      dmTargetUser || ""
                    )} flex items-center justify-center font-bold text-white text-sm shadow-md overflow-hidden group-hover:ring-2 group-hover:ring-indigo-400 transition`}
                  >
                    {renderAvatarContent(
                      conversations.find(
                        (c: any) =>
                          (c.contactUser?.username &&
                            c.contactUser.username.toLowerCase() === (dmTargetUser || "").toLowerCase()) ||
                          (c.contactUser?.displayName &&
                            c.contactUser.displayName.toLowerCase() === (dmTargetUser || "").toLowerCase()) ||
                          (c.contactName &&
                            c.contactName.toLowerCase() === (dmTargetUser || "").toLowerCase())
                      )?.contactUser?.avatarUrl,
                      dmTargetUser || "",
                      "md"
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#161b22] ${
                      isDmTargetOnline ? "bg-emerald-500" : "bg-slate-500"
                    }`}
                  ></span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-white flex items-center gap-2 group-hover:text-indigo-300 transition">
                    <span>{dmTargetUser}</span>
                    {mutedRooms.includes(currentRoom) && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0" title="Đã tắt thông báo">
                        <BellOff className="w-3 h-3" />
                        <span>Đã tắt thông báo</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    {isDmTargetOnline ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                        <span>Đang hoạt động</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block"></span>
                        <span>Ngoại tuyến</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
      </div>

          <div className="flex items-center gap-2">
            {/* Kênh cộng đồng: Menu 3 chấm tùy chọn */}
            {activeTab === "channel" && !activeChannelObj.isGroup && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRoomMenu((prev) => !prev);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer border ${
                    showRoomMenu
                      ? "bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                  }`}
                  title="Tùy chọn kênh"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showRoomMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{activeChannelObj.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Kênh cộng đồng</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleToggleMuteRoom(activeChannelObj.id, activeChannelObj.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      {mutedRooms.includes(activeChannelObj.id) ? (
                        <>
                          <Bell className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                          <span>Bật thông báo</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>Tắt thông báo</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        setShowMediaDrawer(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <FolderOpen className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span>Kho lưu trữ ảnh & file</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Nếu đang ở Nhóm chat: Menu 3 chấm tùy chọn nhóm */}
            {activeTab === "channel" && activeChannelObj.isGroup && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRoomMenu((prev) => !prev);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer border ${
                    showRoomMenu
                      ? "bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                  }`}
                  title="Tùy chọn nhóm"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showRoomMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{activeChannelObj.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{activeChannelObj.memberCount || 1} thành viên</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleOpenEditGroupModal();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <Camera className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />
                      <span>Đổi tên & ảnh nhóm</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleViewGroupMembers();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <Users className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                      <span>Xem danh sách thành viên</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleOpenAddMemberModal();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <UserPlus className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span>Thêm thành viên mới</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleToggleMuteRoom(activeChannelObj.id, activeChannelObj.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      {mutedRooms.includes(activeChannelObj.id) ? (
                        <>
                          <Bell className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                          <span>Bật thông báo</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>Tắt thông báo</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        setShowMediaDrawer(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <FolderOpen className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span>Kho lưu trữ ảnh & file</span>
                    </button>

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleConfirmLeaveGroup(activeChannelObj.id, activeChannelObj.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition cursor-pointer text-left"
                    >
                      <LogOut className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span>Rời khỏi nhóm này</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleConfirmDeleteGroup(activeChannelObj.id, activeChannelObj.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer text-left"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                      <span>Xóa toàn bộ nhóm chat</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Nếu đang ở Chat riêng 1-1: Menu 3 chấm tùy chọn */}
            {activeTab === "dm" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRoomMenu((prev) => !prev);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer border ${
                    showRoomMenu
                      ? "bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                  }`}
                  title="Tùy chọn cuộc trò chuyện"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showRoomMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{dmTargetUser}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Trò chuyện riêng tư 1-1</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleToggleMuteRoom(currentRoom, dmTargetUser || "cuộc trò chuyện");
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      {mutedRooms.includes(currentRoom) ? (
                        <>
                          <Bell className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                          <span>Bật thông báo</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>Tắt thông báo</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        setShowMediaDrawer(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <FolderOpen className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span>Kho lưu trữ ảnh & file</span>
                    </button>

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoomMenu(false);
                        handleConfirmDeleteConversation(currentRoom, dmTargetUser || "");
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer text-left"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                      <span>Xóa cuộc trò chuyện</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tin nhắn..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48 bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:w-60 transition-all duration-200"
              />
            </div>

            <div className="flex items-center gap-1.5 text-slate-400 border-l border-slate-800 pl-3">
              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2 rounded-xl transition-all duration-300 cursor-pointer border hover:scale-105 active:scale-95 ${
                  theme === "light"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 hover:text-amber-400 hover:bg-slate-800 border-slate-800 hover:border-slate-700"
                }`}
                title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
              >
                <div className="relative w-4 h-4">
                  <Sun
                    className={`w-4 h-4 text-amber-400 absolute inset-0 transition-all duration-500 ease-out ${
                      theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                    }`}
                  />
                  <Moon
                    className={`w-4 h-4 text-indigo-500 absolute inset-0 transition-all duration-500 ease-out ${
                      theme === "light" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
                    }`}
                  />
                </div>
              </button>
              <button className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer" title="Cuộc gọi thoại (Demo)">
                <Phone className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer" title="Cuộc gọi video (Demo)">
                <Video className="w-4 h-4" />
              </button>
        </div>
      </div>
        </header>

        {/* Thanh hiển thị tin nhắn đã ghim (Xổ xuống danh sách đầy đủ) */}
        {pinnedMessages.length > 0 && (
          <div className="relative shrink-0 z-20">
            <div className="bg-slate-50 dark:bg-[#12161f]/98 border-b border-indigo-500/20 px-6 py-2.5 flex items-center justify-between backdrop-blur-md shadow-sm transition-all">
              {/* Bấm vào thanh để mở danh sách xổ xuống hoặc cuộn đến tin nhắn */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPinnedDropdown((prev) => !prev);
                }}
                className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition cursor-pointer flex-1 mr-4"
                title="Bấm để xem danh sách tất cả tin nhắn đã ghim"
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-sm">
                  <Pin className="w-4 h-4 fill-indigo-400/20" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <span>
                      {pinnedMessages.length === 1
                        ? "Tin nhắn đã ghim"
                        : `Tin nhắn đã ghim (${pinnedMessages.length})`}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">•</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {pinnedMessages[pinnedMessages.length - 1].sender}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                    {pinnedMessages[pinnedMessages.length - 1].content}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Nút bấm mở/đóng danh sách xổ xuống */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPinnedDropdown((prev) => !prev);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer shadow-sm ${
                    showPinnedDropdown
                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-700 dark:text-indigo-300"
                      : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title="Xem tất cả tin nhắn đã ghim"
                >
                  <span>{pinnedMessages.length} tin ghim</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showPinnedDropdown ? "rotate-180 text-indigo-600 dark:text-indigo-400" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* BẢNG XỔ XUỐNG DANH SÁCH TIN NHẮN ĐÃ GHIM */}
            {showPinnedDropdown && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-full left-0 right-0 bg-white/98 dark:bg-[#161b22]/98 border-b border-slate-200 dark:border-slate-700/80 shadow-2xl backdrop-blur-xl z-30 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500 dark:text-amber-400 dark:fill-amber-400" />
                    <span>Danh sách tin nhắn đã ghim ({pinnedMessages.length})</span>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">
                    Bấm vào tin nhắn để cuộn đến
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {pinnedMessages.map((msg, idx) => (
                    <div
                      key={msg.id}
                      onClick={() => {
                        const el = document.getElementById(`msg-${msg.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                          el.classList.add("ring-2", "ring-indigo-500", "bg-indigo-500/10");
                          setTimeout(() => {
                            el.classList.remove("ring-2", "ring-indigo-500", "bg-indigo-500/10");
                          }, 2000);
                        }
                        setShowPinnedDropdown(false);
                      }}
                      className="px-6 py-3 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition flex items-start justify-between gap-4 group cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold border border-amber-500/20">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">{msg.sender}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                            {msg.content}
                          </p>
                        </div>
                      </div>

                      {/* Nút bỏ ghim riêng cho từng tin nhắn trong danh sách */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(msg.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer shrink-0"
                        title="Bỏ ghim tin nhắn này"
                      >
                        <PinOff className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Danh sách tin nhắn */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className={`rounded-3xl p-6 sm:p-8 max-w-sm text-center transition-all duration-200 animate-in fade-in zoom-in-95 ${
                theme === "light"
                  ? "bg-white border border-slate-200/90 shadow-md shadow-slate-200/50"
                  : "bg-slate-900/60 border border-slate-800/80 shadow-inner"
              }`}>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-indigo-500/25">
                  {activeTab === "channel" ? (
                    <span className="text-3xl">{activeChannelObj.icon}</span>
                  ) : (
                    <MessageCircle className="w-8 h-8 text-white" />
                  )}
                </div>
                <h3 className={`font-bold text-base mb-1.5 ${theme === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  {activeTab === "channel"
                    ? `Chào mừng đến với ${activeChannelObj.name}!`
                    : `Đoạn chat riêng với ${dmTargetUser}`}
                </h3>
                <p className={`text-xs leading-relaxed ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                  {activeTab === "channel"
                    ? "Đây là khởi đầu của cuộc trò chuyện. Hãy gửi lời chào đầu tiên tới mọi người!"
                    : `Chỉ bạn và ${dmTargetUser} mới thấy được các tin nhắn trong cuộc trò chuyện riêng tư này.`}
                </p>
              </div>
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
              const isSystem =
                Boolean(msg.isSystem) ||
                msg.sender === "System" ||
                msg.sender === "system" ||
                Boolean(msg.content?.startsWith("🚪")) ||
                Boolean(msg.content?.includes("đã rời khỏi nhóm")) ||
                Boolean(msg.content?.startsWith("🎉")) ||
                Boolean(msg.content?.includes("đã tạo nhóm")) ||
                Boolean(msg.content?.startsWith("👋")) ||
                Boolean(msg.content?.includes("đã thêm")) ||
                Boolean(msg.content?.includes("đã tham gia")) ||
                Boolean(msg.content?.startsWith("🖼️")) ||
                Boolean(msg.content?.includes("ảnh đại diện")) ||
                Boolean(msg.content?.startsWith("✏️")) ||
                Boolean(msg.content?.includes("đổi tên nhóm")) ||
                Boolean(msg.content?.startsWith("👑")) ||
                Boolean(msg.content?.includes("trưởng nhóm"));

              if (isSystem) {
                const isLeaveGroup = msg.content?.includes("rời khỏi");
                const isCreateGroup = msg.content?.includes("tạo nhóm");
                const isAddMember = msg.content?.includes("đã thêm");
                const isAvatarUpdate = msg.content?.includes("ảnh đại diện") || msg.content?.startsWith("🖼️");
                const isNameUpdate = msg.content?.includes("đổi tên") || msg.content?.startsWith("✏️");
                const isLeaderUpdate = msg.content?.includes("trưởng nhóm") || msg.content?.startsWith("👑");
                return (
                  <div key={msg.id} className="flex justify-center my-3.5 w-full">
                    <span className="text-[11px] bg-slate-800/80 text-slate-300 hover:text-white px-4 py-1.5 rounded-full border border-slate-700/60 shadow-sm flex items-center gap-2 backdrop-blur-md transition-all">
                      {isLeaveGroup ? (
                        <LogOut className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : isCreateGroup ? (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      ) : isAddMember ? (
                        <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : isAvatarUpdate ? (
                        <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      ) : isNameUpdate ? (
                        <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      ) : isLeaderUpdate ? (
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                      <span>
                        {msg.content
                          ? msg.content.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D\u2600-\u27BF]+/u, "").trim()
                          : ""}
                      </span>
                    </span>
                  </div>
                );
              }

              const isMe = msg.sender === username;
              const prevMsg = filteredMessages[index - 1];
              const isPrevSystem =
                prevMsg &&
                (Boolean(prevMsg.isSystem) ||
                  prevMsg.sender === "System" ||
                  prevMsg.sender === "system" ||
                  Boolean(prevMsg.content?.startsWith("🚪")) ||
                  Boolean(prevMsg.content?.includes("đã rời khỏi nhóm")) ||
                  Boolean(prevMsg.content?.startsWith("🎉")) ||
                  Boolean(prevMsg.content?.includes("đã tạo nhóm")) ||
                  Boolean(prevMsg.content?.startsWith("👋")) ||
                  Boolean(prevMsg.content?.includes("đã thêm")) ||
                  Boolean(prevMsg.content?.includes("đã tham gia")) ||
                  Boolean(prevMsg.content?.startsWith("🖼️")) ||
                  Boolean(prevMsg.content?.includes("ảnh đại diện")) ||
                  Boolean(prevMsg.content?.startsWith("✏️")) ||
                  Boolean(prevMsg.content?.includes("đổi tên nhóm")) ||
                  Boolean(prevMsg.content?.startsWith("👑")) ||
                  Boolean(prevMsg.content?.includes("trưởng nhóm")));

              const isSameSenderAsPrev = prevMsg && !isPrevSystem && prevMsg.sender === msg.sender;

              const myUserLower = (username || "").toLowerCase();
              const myDisplayLower = (userProfile?.displayName || "").toLowerCase().replace(/\s+/g, "_");
              const isMentioningMe =
                !isMe &&
                Boolean(msg.content) &&
                (msg.content.includes("@all") ||
                  msg.content.includes("@tatca") ||
                  (Boolean(myUserLower) && msg.content.toLowerCase().includes(`@${myUserLower}`)) ||
                  (Boolean(myDisplayLower) && msg.content.toLowerCase().includes(`@${myDisplayLower}`)));

              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className={`flex items-start gap-3 group transition-all duration-300 p-1.5 rounded-2xl ${
                    isMe ? "flex-row-reverse" : "flex-row"
                  } ${isSameSenderAsPrev ? "mt-0.5" : "mt-3"} ${
                    isMentioningMe ? "bg-amber-500/10 border-l-4 border-amber-400 pl-2.5 rounded-r-2xl" : ""
                  }`}
                >
                  {!isSameSenderAsPrev ? (
                    <button
                      type="button"
                      onClick={() => handleViewUserProfile(msg.sender)}
                      className={`w-9 h-9 rounded-xl shrink-0 bg-gradient-to-tr ${getAvatarGradient(
                        msg.sender
                      )} flex items-center justify-center font-bold text-white text-xs shadow-md mt-0.5 overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:scale-105 transition`}
                      title={`Xem thông tin ${msg.sender}`}
                    >
                      {renderAvatarContent(getSenderAvatar(msg.sender), msg.sender, "sm")}
                    </button>
                  ) : (
                    <div className="w-9 shrink-0" />
                  )}

                  <div className={`flex flex-col max-w-lg ${isMe ? "items-end" : "items-start"}`}>
                    {!isSameSenderAsPrev && (
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <button
                          type="button"
                          onClick={() => handleViewUserProfile(msg.sender)}
                          className="text-xs font-semibold text-slate-300 hover:text-indigo-400 hover:underline transition cursor-pointer text-left"
                          title={`Xem thông tin ${msg.sender}`}
                        >
                          {isMe ? "Bạn" : msg.sender}
                        </button>
                        {isMentioningMe && (
                          <span className="text-[10px] font-bold text-amber-500 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-md flex items-center gap-1 shadow-2xs">
                            <span>🔔</span> Đã nhắc đến bạn
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                  </div>
                    )}

                    <div className={`flex items-center gap-1.5 ${isMe ? "flex-row" : "flex-row-reverse"}`}>
                      {/* Thao tác tin nhắn: Nút Thả cảm xúc, Trả lời nhanh & Menu 3 chấm */}
                      {!msg.isRevoked && (
                        <div className={`flex items-center gap-1 ${isMe ? "flex-row" : "flex-row-reverse"}`}>
                          {/* Nút Thả biểu cảm cảm xúc (Reactions) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMessageId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                              className={`p-1.5 rounded-lg border border-slate-800 bg-slate-900/90 text-slate-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer shadow-sm transition ${
                                activeReactionMessageId === msg.id
                                  ? "opacity-100 text-amber-400 bg-slate-800"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              title="Thả cảm xúc"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>

                            {/* Bảng icon cảm xúc thả nhanh */}
                            {activeReactionMessageId === msg.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute bottom-full mb-1.5 ${
                                  isMe ? "right-0" : "left-0"
                                } bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/80 rounded-2xl p-1 shadow-2xl flex items-center gap-1 z-30 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100`}
                              >
                                {["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"].map((emoji) => {
                                  const hasReacted = Boolean(msg.reactions?.[emoji]?.includes(username));
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => {
                                        handleToggleReaction(msg.id, emoji);
                                        setActiveReactionMessageId(null);
                                      }}
                                      className={`text-lg p-1.5 rounded-xl transition cursor-pointer hover:scale-125 ${
                                        hasReacted ? "bg-indigo-500/25 scale-110" : "hover:bg-slate-100 dark:hover:bg-slate-800/80"
                                      }`}
                                      title={`Thả ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Nút Trả lời nhanh */}
                          <button
                            type="button"
                            onClick={() => handleReplyMessage(msg)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-sm transition opacity-0 group-hover:opacity-100"
                            title="Trả lời tin nhắn này"
                          >
                            <Reply className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                          </button>

                          {/* Nút 3 chấm mở Menu Tùy chọn */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuMessageId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                              className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-sm transition ${
                                activeMenuMessageId === msg.id
                                  ? "opacity-100 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              title="Tùy chọn tin nhắn"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {/* Menu xổ xuống */}
                            {activeMenuMessageId === msg.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute bottom-full mb-1.5 ${
                                  isMe ? "right-0" : "left-0"
                                } w-44 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/80 rounded-2xl p-1.5 shadow-2xl z-30 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100`}
                              >
                                {/* 0. Trả lời tin nhắn */}
                                <button
                                  type="button"
                                  onClick={() => handleReplyMessage(msg)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition cursor-pointer text-left"
                                >
                                  <Reply className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                                  <span>Trả lời tin nhắn</span>
                                </button>

                                {/* 1. Sao chép tin nhắn */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleCopyMessage(msg.id, msg.content);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition cursor-pointer text-left"
                                >
                                  <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>Sao chép tin nhắn</span>
                                </button>

                                {/* 2. Ghim / Bỏ ghim */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleTogglePin(msg.id);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition cursor-pointer text-left"
                                >
                                  {msg.isPinned ? (
                                    <>
                                      <PinOff className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                                      <span className="text-amber-600 dark:text-amber-300">Bỏ ghim tin nhắn</span>
                                    </>
                                  ) : (
                                    <>
                                      <Pin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                      <span>Ghim tin nhắn</span>
                                    </>
                                  )}
                                </button>

                                {/* 3. Thu hồi (chỉ áp dụng cho người gửi) */}
                                {isMe && (
                                  <>
                                    <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRevokeTargetMessageId(msg.id);
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition cursor-pointer text-left"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                                      <span>Thu hồi tin nhắn</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Khung nội dung tin nhắn */}
                      {msg.isRevoked ? (
                        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs italic bg-slate-900/60 text-slate-400 border border-slate-800/80 shadow-sm">
                          <Ban className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Tin nhắn đã được thu hồi</span>
                        </div>
                      ) : (
                        <div
                          className={`relative rounded-2xl text-sm leading-relaxed break-words shadow-md transition duration-150 overflow-hidden ${
                            isMe
                              ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-sm"
                              : "bg-[#1f242c] text-slate-100 rounded-tl-sm border border-slate-700/50"
                          } ${
                            msg.fileUrl && isImageFile(msg.fileType, msg.fileName)
                              ? "p-1.5"
                              : "px-4 py-2.5"
                          }`}
                        >
                          {/* Trích dẫn tin nhắn đang trả lời */}
                          {msg.replyToId && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                scrollToMessage(msg.replyToId!);
                              }}
                              className={`mb-2 px-2.5 py-1.5 rounded-xl border-l-2 cursor-pointer text-xs transition duration-150 select-none ${
                                isMe
                                  ? "bg-black/25 hover:bg-black/40 border-white/60 text-white"
                                  : "bg-slate-950/50 hover:bg-slate-950/70 border-indigo-500 text-slate-200"
                              }`}
                              title="Bấm để cuộn đến tin nhắn gốc"
                            >
                              <div className="font-semibold text-[11px] flex items-center gap-1 opacity-90 text-indigo-300">
                                <Reply className="w-3 h-3" />
                                <span>{msg.replyToSender || "Người gửi"}</span>
                              </div>
                              <div className="text-[11px] opacity-80 truncate mt-0.5 max-w-[280px]">
                                {msg.replyToContent || "Nội dung tin nhắn"}
                              </div>
                            </div>
                          )}

                          {msg.isPinned && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-300 font-semibold mb-1 pb-1 border-b border-white/10 px-2 pt-0.5">
                              <Pin className="w-2.5 h-2.5 fill-amber-300" />
                              <span>Tin nhắn đã ghim</span>
                            </div>
                          )}

                          {/* 1. Hiển thị hình ảnh đính kèm */}
                          {msg.fileUrl && isImageFile(msg.fileType, msg.fileName) && (
                            brokenChatImageIds.has(msg.id) ? (
                              <div className="flex items-center gap-2.5 p-2.5 bg-black/25 rounded-xl border border-white/10 text-xs">
                                <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-300">{msg.fileName || "Ảnh đính kèm"}</div>
                                  <div className="text-[10px] text-slate-400">Ảnh không còn trên máy chủ (đã hết hạn)</div>
                                </div>
                              </div>
                            ) : (
                              <div className="relative group/img overflow-hidden rounded-xl">
                                <img
                                  src={msg.fileUrl}
                                  alt=""
                                  className="max-w-xs sm:max-w-sm max-h-72 object-cover rounded-xl cursor-pointer hover:opacity-95 transition"
                                  onError={() => {
                                    setBrokenChatImageIds((prev) => new Set(prev).add(msg.id));
                                  }}
                                  onClick={() =>
                                    setPreviewImageModal({
                                      url: msg.fileUrl!,
                                      name: msg.fileName || "Ảnh đính kèm",
                                    })
                                  }
                                />
                              </div>
                            )
                          )}

                          {/* 2. Hiển thị tệp tin tài liệu đính kèm (PDF, Word, Excel, ZIP...) */}
                          {msg.fileUrl && !isImageFile(msg.fileType, msg.fileName) && (
                            <div className="flex items-center gap-3 p-2.5 bg-black/25 rounded-xl border border-white/10 mb-1">
                              <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div
                                  className="text-xs font-semibold truncate"
                                  title={msg.fileName || "Tệp đính kèm"}
                                >
                                  {msg.fileName || "Tệp đính kèm"}
                                </div>
                                <div className="text-[10px] opacity-75 mt-0.5">
                                  {formatFileSize(msg.fileSize)}
                                </div>
                              </div>
                              <a
                                href={msg.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={msg.fileName || true}
                                className="p-2 hover:bg-white/15 rounded-lg transition shrink-0 text-white"
                                title="Tải xuống tệp tin"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}

                          {/* 3. Nội dung văn bản (nếu có) */}
                          {msg.content && (
                            <div className={msg.fileUrl ? "mt-1.5 px-2 pb-0.5" : ""}>
                              {renderMessageContentWithMentions(msg.content, isMe)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hiển thị các cảm xúc (Reactions) đã thả dưới chân tin nhắn */}
                    {msg.reactions && (
                      (() => {
                        const activeEntries = Object.entries(msg.reactions).filter(
                          ([_, users]) => Array.isArray(users) && users.length > 0
                        );
                        if (activeEntries.length === 0) return null;

                        const isExpanded = Boolean(expandedReactionMsgs[msg.id]);
                        const displayedEntries = isExpanded || activeEntries.length <= 3
                          ? activeEntries
                          : activeEntries.slice(0, 3);
                        const hiddenCount = activeEntries.length - 3;
                        const totalReactions = activeEntries.reduce((sum, [_, users]) => sum + users.length, 0);

                        return (
                          <div
                            className={`flex flex-wrap items-center gap-1 -mt-2 z-10 max-w-[280px] ${
                              isMe ? "justify-end mr-1" : "justify-start ml-1"
                            }`}
                          >
                            {displayedEntries.map(([emoji, users]) => {
                              const isMyReaction = users.includes(username);
                              const userListStr = users.join(", ");

                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleToggleReaction(msg.id, emoji)}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] transition-all duration-150 cursor-pointer border shadow-sm hover:scale-105 active:scale-95 ${
                                    isMyReaction
                                      ? "bg-indigo-500/25 border-indigo-500/50 text-indigo-300 font-semibold ring-1 ring-indigo-500/20"
                                      : "bg-[#161b22]/90 border-slate-700/70 text-slate-300 hover:bg-slate-800 hover:text-white"
                                  }`}
                                  title={`${userListStr} đã thả ${emoji}`}
                                >
                                  <span className="text-xs leading-none">{emoji}</span>
                                  <span className="text-[10px] font-semibold">{users.length}</span>
                                </button>
                              );
                            })}

                            {!isExpanded && hiddenCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReactionMsgs((prev) => ({ ...prev, [msg.id]: true }))
                                }
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#161b22]/90 border border-slate-700/70 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 transition cursor-pointer shadow-sm active:scale-95"
                                title={`Xem thêm ${hiddenCount} biểu tượng cảm xúc khác (${totalReactions} lượt thả)`}
                              >
                                +{hiddenCount}
                              </button>
                            )}

                            {isExpanded && activeEntries.length > 3 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReactionMsgs((prev) => ({ ...prev, [msg.id]: false }))
                                }
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#161b22]/80 border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer active:scale-95"
                                title="Thu gọn danh sách cảm xúc"
                              >
                                Thu gọn
                              </button>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              );
            })
          )}

          {typingUser && typingUser !== username && (
            <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1 px-2 animate-pulse">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span><strong className="text-slate-300 font-medium">{typingUser}</strong> đang soạn tin nhắn...</span>
        </div>
          )}

          <div ref={messagesEndRef} />
    </div>

        {/* Thanh nhập tin nhắn */}
        <div className="p-4 bg-[#161b22]/70 border-t border-slate-800/80 shrink-0 transition-colors duration-300 ease-in-out">
          <div className="relative max-w-5xl mx-auto">
            {showEmojiPicker && (
              <div className="absolute bottom-14 left-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-2xl flex gap-2 backdrop-blur-xl z-20">
                {["👍", "❤️", "😂", "🎉", "🔥", "🚀", "😍", "👏", "💯", "✨"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="text-lg hover:scale-125 transition p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
          </div>
            )}

            {/* Thanh hiển thị tin nhắn đang trả lời */}
            {replyingMessage && (
              <div className="flex items-center justify-between px-3.5 py-2 mb-2 bg-slate-100/90 dark:bg-[#161b22] border border-indigo-500/40 rounded-2xl shadow-lg animate-in slide-in-from-bottom-2 duration-150 backdrop-blur-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-1 h-8 bg-indigo-500 rounded-full shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      <Reply className="w-3.5 h-3.5" />
                      <span>
                        Đang trả lời{" "}
                        <strong className="text-slate-900 dark:text-white">
                          {replyingMessage.sender === username ? "chính bạn" : replyingMessage.sender}
                        </strong>
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {replyingMessage.isRevoked
                        ? "Tin nhắn đã được thu hồi"
                        : replyingMessage.fileUrl
                        ? isImageFile(replyingMessage.fileType, replyingMessage.fileName)
                          ? "[Hình ảnh]"
                          : `[Tệp tin] ${replyingMessage.fileName || ""}`
                        : replyingMessage.content}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingMessage(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                  title="Hủy trả lời (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Popup gợi ý tag tên khi gõ @ */}
            {showMentionSuggestions && mentionCandidates.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:w-80 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/90 rounded-2xl p-1.5 shadow-2xl z-30 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-64 overflow-y-auto">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span>Gợi ý nhắc tên (@)</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">Dùng ↑ ↓ và Enter</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {mentionCandidates.map((cand: any, idx: number) => {
                    const isSelected = idx === selectedMentionIndex;
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleSelectMention(cand)}
                        onMouseEnter={() => setSelectedMentionIndex(idx)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white font-medium"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {cand.isAll ? (
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                              isSelected ? "bg-white/20 text-white" : "bg-indigo-500/20 text-indigo-400"
                            }`}
                          >
                            📢
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-[10px] shadow-sm shrink-0 overflow-hidden">
                            {renderAvatarContent(cand.avatarUrl, cand.name, "sm")}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs truncate font-medium flex items-center gap-1.5">
                            <span className={isSelected ? "text-white" : "text-slate-900 dark:text-white"}>{cand.isAll ? "@all" : cand.name}</span>
                            {cand.isAll && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                                  isSelected ? "bg-white/20 text-white" : "bg-indigo-500/20 text-indigo-300"
                                }`}
                              >
                                Tất cả
                              </span>
                            )}
                          </div>
                          {cand.sub && (
                            <div
                              className={`text-[10px] truncate ${
                                isSelected ? "text-indigo-100" : "text-slate-500"
                              }`}
                            >
                              {cand.sub}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview ảnh dán từ clipboard (Ctrl+V) */}
            {pastedImagePreview && pastedImageFile && (
              <div className="flex items-center justify-between p-2.5 mb-2 bg-[#161b22] border border-indigo-500/50 rounded-2xl shadow-xl animate-in slide-in-from-bottom-2 duration-150 backdrop-blur-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative group shrink-0">
                    <img
                      src={pastedImagePreview}
                      alt="Pasted preview"
                      className="w-14 h-14 object-cover rounded-xl border border-slate-700/80 shadow-md bg-black/40"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Ảnh từ Clipboard</span>
                    </div>
                    <p className="text-xs text-white truncate font-medium mt-0.5">
                      {pastedImageFile.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatFileSize(pastedImageFile.size)} • Nhấn Gửi hoặc Enter để gửi
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearPastedImage}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                  title="Hủy ảnh đã dán (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-[#0d1117] border border-slate-800/90 rounded-2xl px-3 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition duration-200">
                <input
                  type="file"
                  ref={chatFileInputRef}
                  onChange={handleChatFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  disabled={isUploadingChatFile}
                  className="p-2 text-slate-400 hover:text-indigo-400 transition cursor-pointer disabled:opacity-50"
                  title="Đính kèm file hoặc hình ảnh (tối đa 25MB)"
                >
                  {isUploadingChatFile ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>

                <input
                  ref={messageInputRef}
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  onPaste={handlePasteImage}
                  onKeyDown={(e) => {
                    if (showMentionSuggestions && mentionCandidates.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        handleSelectMention(mentionCandidates[selectedMentionIndex]);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowMentionSuggestions(false);
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      if (pastedImageFile) {
                        e.preventDefault();
                        clearPastedImage();
                        return;
                      }
                      if (replyingMessage) {
                        setReplyingMessage(null);
                      }
                    }
                  }}
                  placeholder={
                    replyingMessage
                      ? `Trả lời ${replyingMessage.sender}...`
                      : pastedImageFile
                      ? "Thêm nội dung kèm ảnh (hoặc nhấn Enter để gửi ngay)..."
                      : activeTab === "channel"
                      ? `Nhắn tin trong #${activeChannelObj.name}... (Gõ @ để tag tên)`
                      : `Nhắn tin riêng cho ${dmTargetUser}...`
                  }
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 transition ${
                    showEmojiPicker ? "text-indigo-400" : "text-slate-400 hover:text-amber-400"
                  }`}
                  title="Biểu tượng cảm xúc"
                >
                  <Smile className="w-5 h-5" />
                </button>
          </div>

              <button
                type="submit"
                disabled={(!inputMessage.trim() && !pastedImageFile) || isUploadingChatFile}
                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/25 shrink-0 cursor-pointer active:scale-95"
              >
                {isUploadingChatFile ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
      </div>
    </div>
      </main>

      {/* 3. SIDEBAR PHẢI: KHO LƯU TRỮ FILE & ẢNH (Zalo-style Media Drawer) */}
      {showMediaDrawer && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 md:w-88 xl:w-96 bg-white dark:bg-[#161b22] border-l border-slate-200 dark:border-slate-800/80 flex flex-col shrink-0 shadow-2xl md:static md:shadow-none animate-in slide-in-from-right duration-200">
          {/* Header Drawer */}
          <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-500/20 shadow-sm">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">Kho lưu trữ</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {activeTab === "channel" ? activeChannelObj.name : `Với ${dmTargetUser}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMediaDrawer(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Đóng kho lưu trữ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs chuyển đổi giữa Ảnh và File */}
          <div className="px-4 pt-3 pb-2 shrink-0 border-b border-slate-200 dark:border-slate-800/60">
            <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMediaDrawerTab("photos")}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  mediaDrawerTab === "photos"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Ảnh / Video</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    mediaDrawerTab === "photos" ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                  }`}
                >
                  {mediaPhotos.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMediaDrawerTab("files")}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  mediaDrawerTab === "files"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Tài liệu</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    mediaDrawerTab === "files" ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                  }`}
                >
                  {mediaFiles.length}
                </span>
              </button>
            </div>

            {/* Thanh tìm kiếm nhanh trong Kho lưu trữ */}
            <div className="relative mt-2.5">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={
                  mediaDrawerTab === "photos" ? "Tìm theo tên ảnh, người gửi..." : "Tìm tên file, người gửi..."
                }
                value={mediaSearchQuery}
                onChange={(e) => setMediaSearchQuery(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-8.5 pr-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {mediaSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMediaSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Nội dung danh sách Media */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoadingMedia ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-xs">Đang tải danh sách lưu trữ...</span>
              </div>
            ) : mediaDrawerTab === "photos" ? (
              // TAB ẢNH & VIDEO
              mediaPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 px-6 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-3 text-slate-400">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-300">Chưa có ảnh hoặc video nào</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Hình ảnh được gửi trong cuộc trò chuyện này sẽ hiển thị ở đây
                  </p>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-3 gap-2">
                  {mediaPhotos.map((item) => (
                    <div
                      key={item.id}
                      onClick={() =>
                        setPreviewImageModal({
                          url: item.fileUrl,
                          name: item.fileName || "Hình ảnh",
                        })
                      }
                      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition cursor-pointer shadow-sm"
                      title={`${item.fileName || "Ảnh"} - Gửi bởi ${item.sender}`}
                    >
                      <img
                        src={item.fileUrl}
                        alt={item.fileName || "Media"}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                      {/* Overlay hiển thị khi hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col justify-between p-1.5">
                        <div className="flex justify-end">
                          <a
                            href={item.fileUrl}
                            download={item.fileName || "image"}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-md bg-black/60 text-white/90 hover:text-white hover:bg-indigo-600 transition"
                            title="Tải ảnh về máy"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-white font-medium truncate drop-shadow-sm">
                            {item.sender}
                          </p>
                          <p className="text-[9px] text-slate-300">
                            {new Date(item.createdAt).toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // TAB TÀI LIỆU & FILE
              mediaFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 px-6 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-3 text-slate-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-300">Chưa có tài liệu hay file nào</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Các tệp tin đính kèm như Word, PDF, Excel... sẽ được lưu lại ở đây
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {mediaFiles.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/70 hover:bg-slate-800/70 border border-slate-800/80 hover:border-indigo-500/40 transition shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300 transition"
                            title={item.fileName || "Tệp tin"}
                          >
                            {item.fileName || "Tệp tin đính kèm"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            {item.fileSize ? <span>{formatFileSize(item.fileSize)}</span> : null}
                            <span>•</span>
                            <span className="truncate">{item.sender}</span>
                            <span>•</span>
                            <span>
                              {new Date(item.createdAt).toLocaleDateString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <a
                        href={item.fileUrl}
                        download={item.fileName || "file"}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white transition cursor-pointer shrink-0 border border-slate-700/50 hover:border-indigo-500 shadow-sm"
                        title="Tải tệp tin về máy"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </aside>
      )}

      {/* MODAL TÌM BẠN QUA SỐ ĐIỆN THOẠI / TÊN */}
      {showSearchFriendModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
            </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Tìm bạn bè</h3>
                  <p className="text-xs text-slate-400">Tìm kiếm bằng Số điện thoại hoặc Tên</p>
            </div>
          </div>
              <button
                type="button"
                onClick={() => {
                  setShowSearchFriendModal(false);
                  setFriendSearchQuery("");
                  setFriendSearchResults([]);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
        </div>

            {/* Ô tìm kiếm */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                autoFocus
                placeholder="Nhập số điện thoại (ví dụ: 0912...) hoặc tên..."
                value={friendSearchQuery}
                onChange={(e) => handleSearchFriends(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
        </div>

            {/* Danh sách kết quả */}
            <div className="max-h-72 overflow-y-auto space-y-2">
              {isSearchingFriends ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Đang tìm kiếm trong cơ sở dữ liệu...</span>
            </div>
              ) : friendSearchResults.length > 0 ? (
                friendSearchResults.map((user) => {
                  const targetName = user.displayName || user.username;
                  const isOnline = onlineUsers.includes(targetName);

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:border-slate-700 transition"
                    >
                      <div
                        onClick={() => handleViewUserProfile(user.username || user.displayName)}
                        className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-85 transition group flex-1"
                        title={`Xem thông tin ${user.displayName}`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                              targetName
                            )} flex items-center justify-center font-bold text-white text-xs shadow-sm overflow-hidden group-hover:ring-2 group-hover:ring-indigo-400 transition`}
                          >
                            {renderAvatarContent(user.avatarUrl, targetName, "md")}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#161b22] ${
                              isOnline ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
                            }`}
                          ></span>
                    </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition">
                            <span>{user.displayName}</span>
                            <span className="text-[10px] text-slate-500 font-normal">@{user.username}</span>
                      </div>
                          {user.phone ? (
                            <div className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mt-0.5 font-medium">
                              <Phone className="w-3 h-3" />
                              <span>{user.phone}</span>
                        </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">Chưa có số điện thoại</div>
                          )}
                    </div>
                  </div>

                      <button
                        type="button"
                        onClick={() => handleSelectFriend(user)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition cursor-pointer shrink-0 active:scale-95"
                      >
                        Nhắn tin
                      </button>
                </div>
                  );
                })
              ) : friendSearchQuery.trim() ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Không tìm thấy người dùng nào với thông tin trên.
            </div>
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Nhập số điện thoại hoặc tên tài khoản để bắt đầu tìm kiếm.
            </div>
              )}
        </div>
      </div>
    </div>
      )}

      {/* MODAL CÀI ĐẶT HỒ SƠ & ĐỔI MẬT KHẨU */}
      {showProfileModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              profileBackdropMouseDownRef.current = true;
            }
          }}
          onMouseUp={(e) => {
            if (profileBackdropMouseDownRef.current && e.target === e.currentTarget) {
              handleCloseProfileModal();
            }
            profileBackdropMouseDownRef.current = false;
          }}
        >
          <div
            className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative my-auto max-h-[92vh] flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Cài đặt tài khoản</h3>
                  <p className="text-xs text-slate-400">Quản lý hồ sơ, Avatar & Mật khẩu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseProfileModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Đóng (Hủy thay đổi chưa lưu)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab chuyển đổi Hồ sơ / Đổi mật khẩu */}
            <div className="flex p-1 bg-slate-950/80 rounded-2xl border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => {
                  setProfileTab("info");
                  setProfileAlert(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  profileTab === "info"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Hồ sơ & Avatar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileTab("password");
                  setProfileAlert(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  profileTab === "password"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Đổi mật khẩu</span>
              </button>
        </div>

            {/* Thông báo kết quả */}
            {profileAlert && (
              <div
                className={`flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl border text-xs animate-in fade-in ${
                  profileAlert.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}
              >
                {profileAlert.type === "success" ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{profileAlert.text}</span>
          </div>
            )}

            {/* TAB 1: CẬP NHẬT HỒ SƠ & AVATAR */}
            {profileTab === "info" ? (
              <form onSubmit={handleSaveProfile} className="space-y-4 overflow-y-auto pr-1 flex-1">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Ảnh đại diện / Avatar
                  </label>
                  
                  {/* Khung xem trước & Tải ảnh từ máy tính */}
                  <div className="flex items-center gap-4 mb-4 p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl">
                    <div className="relative group shrink-0">
                      <div
                        className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${getAvatarGradient(
                          username
                        )} flex items-center justify-center font-bold text-white text-2xl shadow-lg ring-2 ring-indigo-500/40 overflow-hidden`}
                      >
                        {renderAvatarContent(editAvatarEmoji, username, "lg")}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition rounded-2xl flex flex-col items-center justify-center text-white text-[10px] font-medium cursor-pointer"
                        title="Bấm để tải ảnh mới"
                      >
                        <Camera className="w-5 h-5 mb-0.5" />
                        <span>Đổi ảnh</span>
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarFileChange}
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                      />
                      <div className="flex items-center gap-2 mb-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isUploadingAvatar ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang tải lên...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>Tải ảnh từ máy tính</span>
                            </>
                          )}
                        </button>

                        {editAvatarEmoji && (
                          <button
                            type="button"
                            onClick={() => setEditAvatarEmoji("")}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition text-xs cursor-pointer"
                            title="Xóa avatar hiện tại"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Hỗ trợ file PNG, JPG, WEBP tối đa 5MB. Ảnh được lưu trên máy chủ và cập nhật vào CSDL.
                      </p>
                    </div>
                  </div>

                  {/* Lựa chọn icon emoji nhanh */}
                  <div className="mb-2">
                    <span className="text-[11px] text-slate-400 block mb-1.5">
                      Hoặc chọn một biểu tượng cá tính nhanh:
                    </span>
                    <div className="grid grid-cols-8 gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-2xl">
                      {["🦊", "🐱", "🐶", "🚀", "🤖", "🦄", "👾", "👑", "⚡", "💎", "🐼", "🐯", "🔥", "✨", "🎯", "🎮"].map(
                        (emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditAvatarEmoji(emoji)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg hover:scale-110 transition cursor-pointer ${
                              editAvatarEmoji === emoji
                                ? "bg-indigo-600 ring-2 ring-indigo-400"
                                : "hover:bg-slate-800"
                            }`}
                          >
                            {emoji}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Tên hiển thị đầy đủ
                  </label>
                  <input
                    type="text"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Ví dụ: Phạm Quốc Cường..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
            </div>

                <div className="p-3 bg-slate-950/50 border border-slate-800/80 rounded-2xl text-xs space-y-1.5 text-slate-400">
                  <div className="flex justify-between">
                    <span>Tên đăng nhập:</span>
                    <span className="text-white font-medium">@{userProfile?.username || username}</span>
              </div>
                  {userProfile?.phone && (
                    <div className="flex justify-between">
                      <span>Số điện thoại:</span>
                      <span className="text-indigo-400 font-medium">{userProfile.phone}</span>
                </div>
                  )}
            </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseProfileModal}
                    className="flex-1 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingProfile ? "Đang lưu..." : "Lưu thay đổi hồ sơ"}
                  </button>
                </div>
              </form>
            ) : (
              /* TAB 2: ĐỔI MẬT KHẨU */
              <form onSubmit={handleChangePassword} className="space-y-4 overflow-y-auto pr-1 flex-1">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Nhập mật khẩu cũ..."
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
              </div>
            </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Mật khẩu mới
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Tối thiểu 6 ký tự (Hoa, thường, ký tự đặc biệt)..."
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    * Gồm tối thiểu 6 ký tự, có chữ hoa, chữ thường và ít nhất 1 ký tự đặc biệt (!@#$%...).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Xác nhận mật khẩu mới
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Nhập lại mật khẩu mới..."
                      value={confirmNewPwd}
                      onChange={(e) => setConfirmNewPwd(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
              </div>
            </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseProfileModal}
                    className="flex-1 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingProfile ? "Đang xử lý..." : "Cập nhật mật khẩu mới"}
                  </button>
                </div>
              </form>
            )}
      </div>
    </div>
      )}

      {/* MODAL XÁC NHẬN THU HỒI TIN NHẮN */}
      {revokeTargetMessageId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#161b22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-center">
            <button
              type="button"
              onClick={() => setRevokeTargetMessageId(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/10">
              <RotateCcw className="w-6 h-6" />
        </div>

            <h3 className="text-base font-bold text-white mb-2">Thu hồi tin nhắn?</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Tin nhắn này sẽ bị thu hồi và xóa nội dung đối với tất cả thành viên trong cuộc trò chuyện.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRevokeTargetMessageId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium text-xs transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-medium text-xs shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                Thu hồi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM ẢNH FULL MÀN HÌNH */}
      {previewImageModal && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-12 right-0 flex items-center gap-2 z-10">
              <a
                href={previewImageModal.url}
                target="_blank"
                rel="noreferrer"
                download={previewImageModal.name}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 transition shadow-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                title="Tải ảnh về máy"
              >
                <Download className="w-4 h-4" />
                <span>Tải ảnh</span>
              </a>
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 transition shadow-lg cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={previewImageModal.url}
              alt={previewImageModal.name}
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}

      {/* MODAL TẠO NHÓM CHAT MỚI */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
            <button
              type="button"
              onClick={() => setShowCreateGroupModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tạo nhóm chat mới</h3>
                <p className="text-xs text-slate-400">Chọn nhiều người để trò chuyện cùng lúc</p>
              </div>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="flex flex-col flex-1 min-h-0">
              {/* Tên nhóm */}
              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Tên nhóm chat <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Team Dự Án, Hội Bạn Thân..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Ô tìm kiếm người dùng */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Chọn thành viên
                  </label>
                  <span className="text-xs text-indigo-400 font-medium">
                    Đã chọn: {selectedGroupMembers.length} người
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên hoặc số điện thoại..."
                    value={groupSearchQuery}
                    onChange={(e) => {
                      setGroupSearchQuery(e.target.value);
                      loadAvailableUsers(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Danh sách người dùng có checkbox */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-56 mb-4 min-h-[140px] border border-slate-800/80 rounded-xl p-2 bg-slate-950/40">
                {availableUsers.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    Không tìm thấy người dùng nào.
                  </div>
                ) : (
                  availableUsers.map((user) => {
                    const isSelected = selectedGroupMembers.includes(user.username);
                    return (
                      <div
                        key={user.username}
                        onClick={() => handleToggleSelectGroupMember(user.username)}
                        className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600/20 border border-indigo-500/40"
                            : "hover:bg-slate-800/60 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${getAvatarGradient(
                              user.displayName || user.username
                            )} flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden`}
                          >
                            {renderAvatarContent(user.avatarUrl, user.displayName || user.username, "sm")}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {user.displayName || user.username}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              @{user.username} {user.phone ? `· ${user.phone}` : ""}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                            isSelected
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "border-slate-700 bg-slate-900"
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Nút hành động */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGroup || !newGroupName.trim() || selectedGroupMembers.length === 0}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isCreatingGroup ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang tạo nhóm...</span>
                    </>
                  ) : (
                    <span>Tạo nhóm ({selectedGroupMembers.length})</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL THÊM THÀNH VIÊN VÀO NHÓM */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
            <button
              type="button"
              onClick={() => setShowAddMemberModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Thêm thành viên</h3>
                <p className="text-xs text-slate-400">Mời thêm bạn bè vào nhóm chat này</p>
              </div>
            </div>

            <form onSubmit={handleAddMembersSubmit} className="flex flex-col flex-1 min-h-0">
              {/* Ô tìm kiếm người dùng */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Chọn người dùng để thêm
                  </label>
                  <span className="text-xs text-emerald-400 font-medium">
                    Đã chọn: {selectedNewMembers.length} người
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên hoặc số điện thoại..."
                    value={groupSearchQuery}
                    onChange={(e) => {
                      setGroupSearchQuery(e.target.value);
                      loadAvailableUsers(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Danh sách người dùng (chưa có trong nhóm) */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-60 mb-4 min-h-[160px] border border-slate-800/80 rounded-xl p-2 bg-slate-950/40">
                {availableUsers
                  .filter((u) => !currentGroupMembers.some((m) => m.username === u.username))
                  .length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Tất cả bạn bè đã tham gia nhóm này hoặc không tìm thấy ai.
                  </div>
                ) : (
                  availableUsers
                    .filter((u) => !currentGroupMembers.some((m) => m.username === u.username))
                    .map((user) => {
                      const isSelected = selectedNewMembers.includes(user.username);
                      return (
                        <div
                          key={user.username}
                          onClick={() => handleToggleSelectNewMember(user.username)}
                          className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                            isSelected
                              ? "bg-emerald-600/20 border border-emerald-500/40"
                              : "hover:bg-slate-800/60 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${getAvatarGradient(
                                user.displayName || user.username
                              )} flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden`}
                            >
                              {renderAvatarContent(user.avatarUrl, user.displayName || user.username, "sm")}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {user.displayName || user.username}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                @{user.username} {user.phone ? `· ${user.phone}` : ""}
                              </div>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                              isSelected
                                ? "bg-emerald-600 border-emerald-500 text-white"
                                : "border-slate-700 bg-slate-900"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Nút hành động */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="flex-1 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isAddingMembers || selectedNewMembers.length === 0}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/25 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isAddingMembers ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang thêm...</span>
                    </>
                  ) : (
                    <span>Thêm {selectedNewMembers.length} thành viên</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XEM DANH SÁCH THÀNH VIÊN NHÓM */}
      {showGroupMembersModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
            <button
              type="button"
              onClick={() => setShowGroupMembersModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Thành viên trong nhóm</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {currentGroupMembers.length} người đang tham gia
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-72 mb-4">
              {isLoadingGroupMembers ? (
                <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tải danh sách thành viên...</span>
                </div>
              ) : currentGroupMembers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Không có thành viên nào.
                </div>
              ) : (
                (() => {
                  const isCurrentUserLeader = Boolean(
                    currentGroupMembers.find(
                      (m) =>
                        (m.username === (userProfile?.username || username) ||
                          m.displayName === username) &&
                        m.isLeader
                    )
                  );

                  return currentGroupMembers.map((member) => {
                    const isMe =
                      member.username === (userProfile?.username || username) ||
                      member.displayName === username;
                    const isOnline = onlineUsers.includes(member.displayName || member.username);

                    return (
                      <div
                        key={member.id || member.username}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-100/90 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800/80 gap-2 hover:bg-slate-200/70 dark:hover:bg-slate-900/80 transition"
                      >
                        <div
                          onClick={() => handleViewUserProfile(member.username || member.displayName)}
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition group"
                          title={`Xem thông tin ${member.displayName || member.username}`}
                        >
                          <div className="relative shrink-0">
                            <div
                              className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                                member.displayName || member.username
                              )} flex items-center justify-center font-bold text-white text-xs overflow-hidden group-hover:ring-2 group-hover:ring-indigo-400 transition`}
                            >
                              {renderAvatarContent(member.avatarUrl, member.displayName || member.username, "sm")}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#161b22] ${
                                isOnline ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
                              }`}
                            ></span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                              <span className="truncate">{member.displayName || member.username}</span>
                              {member.isLeader && (
                                <span
                                  className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-medium border border-amber-300 dark:border-amber-500/30 flex items-center gap-1 shrink-0 shadow-sm"
                                  title="Trưởng nhóm"
                                >
                                  <Crown className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400 fill-amber-500/30" />
                                  <span>Trưởng nhóm</span>
                                </span>
                              )}
                              {isMe && (
                                <span className="px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 text-[10px] font-medium border border-indigo-300 dark:border-indigo-500/30 shrink-0">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              @{member.username} {member.phone ? `· ${member.phone}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-2">
                          {isCurrentUserLeader && !member.isLeader && !isMe && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionModal({
                                    isOpen: true,
                                    type: "transferLeader",
                                    targetId: member.id || member.username,
                                    targetName: member.displayName || member.username,
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title="Chuyển quyền trưởng nhóm cho thành viên này"
                              >
                                <Crown className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                                <span>Chuyển trưởng nhóm</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionModal({
                                    isOpen: true,
                                    type: "kickMember",
                                    targetId: member.id || member.username,
                                    targetName: member.displayName || member.username,
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title="Xóa thành viên khỏi nhóm chat"
                              >
                                <UserMinus className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                                <span>Xóa</span>
                              </button>
                            </>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              isOnline
                                ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {isOnline ? "Đang online" : "Ngoại tuyến"}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setShowGroupMembersModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer border border-slate-200 dark:border-transparent"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ĐỔI TÊN & ẢNH ĐẠI DIỆN NHÓM */}
      {showEditGroupModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] flex flex-col overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowEditGroupModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-base">Cài đặt nhóm chat</h3>
                <p className="text-xs text-slate-400">Đổi tên nhóm hoặc thay đổi ảnh đại diện</p>
              </div>
            </div>

            <form onSubmit={handleSaveGroupInfo} className="space-y-5">
              {/* Ảnh đại diện nhóm */}
              <div className="flex flex-col items-center justify-center">
                <input
                  type="file"
                  ref={editGroupAvatarInputRef}
                  onChange={handleGroupAvatarUpload}
                  accept="image/*"
                  className="hidden"
                />
                <div
                  onClick={() => editGroupAvatarInputRef.current?.click()}
                  className="w-24 h-24 rounded-3xl bg-slate-800/80 border-2 border-dashed border-slate-700 hover:border-indigo-500 flex items-center justify-center cursor-pointer group relative overflow-hidden transition shadow-lg"
                  title="Bấm để chọn ảnh mới"
                >
                  {isUploadingGroupAvatar ? (
                    <div className="flex flex-col items-center justify-center text-indigo-400 gap-1.5">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-[10px]">Đang tải...</span>
                    </div>
                  ) : editGroupAvatarUrl ? (
                    <>
                      <img
                        src={editGroupAvatarUrl}
                        alt="Group Avatar"
                        className="w-full h-full object-cover group-hover:opacity-75 transition"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-indigo-400 transition">
                      <Camera className="w-7 h-7 mb-1" />
                      <span className="text-[10px] font-medium">Tải ảnh lên</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => editGroupAvatarInputRef.current?.click()}
                    disabled={isUploadingGroupAvatar}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
                  >
                    {editGroupAvatarUrl ? "Đổi ảnh khác" : "Chọn ảnh từ máy"}
                  </button>
                  {editGroupAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setEditGroupAvatarUrl(null)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium transition cursor-pointer"
                    >
                      Gỡ ảnh
                    </button>
                  )}
                </div>
              </div>

              {/* Tên nhóm */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Tên nhóm</label>
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="Nhập tên nhóm mới..."
                  required
                  maxLength={50}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditGroupModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingGroup || isUploadingGroupAvatar || !editGroupName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isUpdatingGroup ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thay đổi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN THAO TÁC (XÓA NHÓM, RỜI NHÓM, XÓA CHAT 1-1) */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#161b22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-center">
            <button
              type="button"
              onClick={() => setActionModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${
                actionModal.type === "transferLeader"
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-amber-500/10"
                  : actionModal.type === "leaveGroup"
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-amber-500/10"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-rose-500/10"
              }`}
            >
              {actionModal.type === "transferLeader" ? (
                <Crown className="w-6 h-6 text-amber-400" />
              ) : actionModal.type === "leaveGroup" ? (
                <LogOut className="w-6 h-6" />
              ) : actionModal.type === "kickMember" ? (
                <UserMinus className="w-6 h-6 text-rose-400" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>

            <h3 className="text-base font-bold text-white mb-2">
              {actionModal.type === "deleteGroup" && "Xóa nhóm chat?"}
              {actionModal.type === "leaveGroup" && "Rời khỏi nhóm chat?"}
              {actionModal.type === "deleteConversation" && "Xóa cuộc trò chuyện?"}
              {actionModal.type === "transferLeader" && "Chuyển quyền trưởng nhóm?"}
              {actionModal.type === "kickMember" && "Xóa thành viên khỏi nhóm?"}
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              {actionModal.type === "deleteGroup" && (
                <>
                  Bạn có chắc muốn xóa nhóm <strong className="text-white">"{actionModal.targetName}"</strong>? Toàn bộ tin nhắn và thành viên sẽ bị xóa vĩnh viễn.
                </>
              )}
              {actionModal.type === "leaveGroup" && (
                <>
                  Bạn có chắc muốn rời khỏi nhóm <strong className="text-white">"{actionModal.targetName}"</strong>? Bạn sẽ không còn nhận được tin nhắn từ nhóm này nữa.
                </>
              )}
              {actionModal.type === "deleteConversation" && (
                <>
                  Bạn có chắc muốn xóa cuộc trò chuyện với <strong className="text-white">"{actionModal.targetName}"</strong>? Toàn bộ lịch sử tin nhắn sẽ bị xóa.
                </>
              )}
              {actionModal.type === "transferLeader" && (
                <>
                  Bạn có chắc muốn chuyển quyền Trưởng nhóm cho <strong className="text-white">"{actionModal.targetName}"</strong>? Sau khi chuyển, bạn sẽ trở thành thành viên thông thường.
                </>
              )}
              {actionModal.type === "kickMember" && (
                <>
                  Bạn có chắc muốn xóa thành viên <strong className="text-white">"{actionModal.targetName}"</strong> khỏi nhóm chat này không?
                </>
              )}
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium text-xs transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={handleExecuteModalAction}
                className={`flex-1 py-2.5 px-4 rounded-xl text-white font-medium text-xs shadow-lg transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  actionModal.type === "transferLeader"
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-600/30"
                    : actionModal.type === "leaveGroup"
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-600/30"
                    : "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-rose-600/30"
                }`}
              >
                {isProcessingAction ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <span>
                    {actionModal.type === "deleteGroup" && "Xác nhận xóa"}
                    {actionModal.type === "leaveGroup" && "Rời nhóm"}
                    {actionModal.type === "deleteConversation" && "Xóa cuộc trò chuyện"}
                    {actionModal.type === "transferLeader" && "Xác nhận chuyển"}
                    {actionModal.type === "kickMember" && "Xác nhận xóa"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM THÔNG TIN NGƯỜI DÙNG (PROFILE CARD) */}
      {viewingUser && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setViewingUser(null)}
        >
          <div
            className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-700/80 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Cover banner */}
            <div className="h-28 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 relative">
              <button
                type="button"
                onClick={() => setViewingUser(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar & User header */}
            <div className="px-5 pb-5 pt-0 relative">
              <div className="flex justify-between items-end -mt-12 mb-3">
                <div className="relative">
                  <div
                    className={`w-20 h-20 rounded-2xl bg-gradient-to-tr ${getAvatarGradient(
                      viewingUser.displayName || viewingUser.username
                    )} flex items-center justify-center font-bold text-white text-2xl shadow-xl ring-4 ring-white dark:ring-[#161b22] overflow-hidden`}
                  >
                    {renderAvatarContent(
                      viewingUser.avatarUrl || getSenderAvatar(viewingUser.displayName || viewingUser.username),
                      viewingUser.displayName || viewingUser.username,
                      "lg"
                    )}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-[#161b22] ${
                      onlineUsers.some(
                        (u) =>
                          u.toLowerCase() === viewingUser.username?.toLowerCase() ||
                          u.toLowerCase() === viewingUser.displayName?.toLowerCase()
                      )
                        ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                        : "bg-slate-400 dark:bg-slate-500"
                    }`}
                    title={
                      onlineUsers.some(
                        (u) =>
                          u.toLowerCase() === viewingUser.username?.toLowerCase() ||
                          u.toLowerCase() === viewingUser.displayName?.toLowerCase()
                      )
                        ? "Đang trực tuyến"
                        : "Ngoại tuyến"
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                      onlineUsers.some(
                        (u) =>
                          u.toLowerCase() === viewingUser.username?.toLowerCase() ||
                          u.toLowerCase() === viewingUser.displayName?.toLowerCase()
                      )
                        ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
                    }`}
                  >
                    {onlineUsers.some(
                      (u) =>
                        u.toLowerCase() === viewingUser.username?.toLowerCase() ||
                        u.toLowerCase() === viewingUser.displayName?.toLowerCase()
                    )
                      ? "🟢 Trực tuyến"
                      : "⚪ Ngoại tuyến"}
                  </span>
                </div>
              </div>

              {/* Tên & Username */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{viewingUser.displayName || viewingUser.username}</span>
                  {viewingUser.username?.toLowerCase() === (userProfile?.username || username).toLowerCase() && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                      Bạn
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">@{viewingUser.username}</p>
              </div>

              {/* Thông tin chi tiết */}
              <div className="space-y-2.5 bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-3.5 mb-4">
                {/* Số điện thoại */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Phone className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>Số điện thoại:</span>
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>{viewingUser.phone || "Chưa cập nhật"}</span>
                    {viewingUser.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(viewingUser.phone!);
                          setCopyToast(true);
                          setTimeout(() => setCopyToast(false), 2000);
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded transition cursor-pointer"
                        title="Sao chép số điện thoại"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Ngày tham gia */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                    <span>Ngày tham gia:</span>
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {viewingUser.createdAt
                      ? new Date(viewingUser.createdAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "Mới tham gia"}
                  </span>
                </div>
              </div>

              {/* Nút thao tác */}
              {viewingUser.username?.toLowerCase() !== (userProfile?.username || username).toLowerCase() ? (
                <button
                  type="button"
                  onClick={() => {
                    const targetName = viewingUser.displayName || viewingUser.username;
                    setViewingUser(null);
                    handleStartDM(targetName, viewingUser.username);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer active:scale-98"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Nhắn tin trực tiếp</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setViewingUser(null);
                    handleOpenProfileModal();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  <span>Cài đặt tài khoản của bạn</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* THÔNG BÁO COPY THÀNH CÔNG */}
      {copyToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700/80 text-white text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">Đã sao chép nội dung tin nhắn!</span>
        </div>
      )}

      {/* THÔNG BÁO TẮT / BẬT THÔNG BÁO */}
      {muteToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#161b22]/95 border border-slate-700/80 text-white text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md">
          {muteToast.isMuted ? (
            <BellOff className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="font-medium">{muteToast.message}</span>
        </div>
      )}
    </div>
  );
}
