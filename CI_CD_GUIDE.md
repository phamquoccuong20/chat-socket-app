# 🚀 Hướng Dẫn CI/CD & Triển Khai (Deployment Guide)

Dự án đã được tích hợp đầy đủ hệ thống **CI/CD tự động bằng GitHub Actions**, kèm cấu hình **Docker** và **Docker Compose** sẵn sàng cho việc kiểm thử, đóng gói và triển khai.

---

## 1. ⚙️ Quy trình CI Pipeline (`.github/workflows/ci.yml`)

Mỗi khi bạn tạo một **Pull Request** hoặc **Push** code lên các nhánh `main`, `master`, hoặc `develop`:

1. **Backend CI (NestJS + Prisma)**:
   - Tự động cài đặt dependencies (`npm ci`).
   - Tự động sinh mã Prisma Client (`npx prisma generate`).
   - Kiểm tra lỗi kiểu dữ liệu TypeScript (`npx tsc --noEmit`).
   - Chạy toàn bộ Unit Tests (`npm test`).
   - Biên dịch NestJS sang bản production (`npm run build`).
   - Lưu trữ bản build (`dist/`) thành artifact trên GitHub Actions.

2. **Frontend CI (Next.js 16)**:
   - Tự động khôi phục cache Next.js để tăng tốc độ build.
   - Cài đặt dependencies (`npm ci`).
   - Kiểm tra kiểu dữ liệu TypeScript (`npx tsc --noEmit`).
   - Biên dịch ứng dụng Next.js (`npm run build`).
   - Lưu trữ bản build (`.next/`) thành artifact.

3. **Docker Verification**:
   - Tự động kiểm tra tính hợp lệ của cả `server/Dockerfile` và `client/Dockerfile`.
   - Đảm bảo việc đóng gói Docker image luôn thành công trước khi merge code.

---

## 2. 🚢 Quy trình CD Pipeline (`.github/workflows/deploy.yml`)

Khi code được merge vào nhánh chính (`main` hoặc `master`):

1. Tự động build Docker Image cho cả **Server** và **Client**.
2. Đăng nhập và đẩy (Push) các Docker image lên **GitHub Container Registry (GHCR)**:
   - `ghcr.io/<tên-user-hoặc-tổ-chức>/<repo>-server:latest`
   - `ghcr.io/<tên-user-hoặc-tổ-chức>/<repo>-client:latest`
3. Sẵn sàng cấu hình Webhook hoặc SSH deploy tự động kéo image mới về server của bạn.

---

## 3. 🐳 Chạy Toàn Bộ Hệ Thống Với Docker Compose

Bạn có thể chạy toàn bộ hệ thống gồm **SQL Server Database + Backend Server + Frontend Client** chỉ với một lệnh duy nhất:

```bash
docker compose up -d --build
```

### Các cổng dịch vụ:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Socket.IO**: [http://localhost:8000](http://localhost:8000)
- **SQL Server Database**: `localhost:1433` (User: `sa`, Password: `Chat@123456`)

### Dừng hệ thống:
```bash
docker compose down
```

---

## 4. 📁 Danh Sách Các File Cấu Hình Đã Thêm

| File | Chức năng |
|---|---|
| [ci.yml](file:///d:/demo/socket/.github/workflows/ci.yml) | GitHub Actions CI: Test, Lint, Typecheck, Build Backend & Frontend |
| [deploy.yml](file:///d:/demo/socket/.github/workflows/deploy.yml) | GitHub Actions CD: Build & Push Docker Images lên GHCR / Server |
| [server/Dockerfile](file:///d:/demo/socket/server/Dockerfile) | Multi-stage Dockerfile tối ưu hóa dung lượng cho NestJS Backend |
| [client/Dockerfile](file:///d:/demo/socket/client/Dockerfile) | Multi-stage Dockerfile tối ưu hóa dung lượng cho Next.js Frontend |
| [docker-compose.yml](file:///d:/demo/socket/docker-compose.yml) | Khởi chạy cụm Database, Server, Client chỉ với 1 lệnh |
| [.gitignore](file:///d:/demo/socket/.gitignore) | Loại bỏ các thư mục rác, build files, môi trường bảo mật |
| [server/.dockerignore](file:///d:/demo/socket/server/.dockerignore) | Tối ưu hóa context khi build Docker Server |
| [client/.dockerignore](file:///d:/demo/socket/client/.dockerignore) | Tối ưu hóa context khi build Docker Client |
| [server/.env.example](file:///d:/demo/socket/server/.env.example) | Mẫu biến môi trường cho Backend |
| [client/.env.example](file:///d:/demo/socket/client/.env.example) | Mẫu biến môi trường cho Frontend |

