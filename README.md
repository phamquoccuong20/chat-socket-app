# Real-time Chat App (NestJS + Next.js + Socket.IO + Prisma)

Hệ thống ứng dụng Chat thời gian thực với:
- **Backend**: NestJS, WebSockets, Socket.IO, Prisma ORM.
- **Frontend**: Next.js 16 (App Router), Tailwind CSS v4, Lucide Icons, Socket.IO Client.
- **Database Tool**: DBeaver (kết nối PostgreSQL/MySQL thông qua Prisma).

---

## 1. Khởi động Backend (NestJS - Port 8000)

```bash
cd server
npm run start:dev
```
Backend sẽ khởi chạy tại: `http://localhost:8000`

---

## 2. Khởi động Frontend (Next.js - Port 3000)

Mở một cửa sổ Terminal mới:
```bash
cd client
npm run dev
```
Frontend sẽ khởi chạy tại: `http://localhost:3000`

---

## 3. Kết nối Cơ sở dữ liệu với DBeaver & Prisma

Trong thư mục `server/`, bạn có file `prisma/schema.prisma` đã định nghĩa sẵn các bảng:
- `users`: Thông tin người dùng
- `rooms`: Các phòng chat / nhóm chat
- `room_members`: Thành viên trong phòng
- `messages`: Lịch sử tin nhắn

### Các bước kết nối:
1. Mở file [server/.env](file:///d:/demo/socket/server/.env), cập nhật chuỗi kết nối phù hợp với database bạn tạo trên DBeaver:
   ```env
   # Ví dụ PostgreSQL:
   DATABASE_URL="postgresql://postgres:password@localhost:5432/chat_db?schema=public"

   # Hoặc MySQL (cần đổi provider trong schema.prisma sang mysql):
   # DATABASE_URL="mysql://root:password@localhost:3306/chat_db"
   ```
2. Đẩy schema vào Database:
   ```bash
   cd server
   npx prisma db push
   ```
3. Mở **DBeaver**, nhấn **F5 (Refresh)** cơ sở dữ liệu `chat_db`, bạn sẽ thấy toàn bộ các bảng `users`, `rooms`, `room_members`, `messages` xuất hiện đầy đủ!

