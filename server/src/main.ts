import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const avatarDir = join(process.cwd(), 'uploads', 'avatars');
  const chatDir = join(process.cwd(), 'uploads', 'chat');
  if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
  }
  if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files từ thư mục uploads để client có thể truy cập ảnh qua URL http://localhost:8000/uploads/...
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Cho phép kết nối từ Next.js frontend
  app.enableCors({
    origin: '*', // Trong production nên cấu hình cụ thể domain frontend, ví dụ: 'http://localhost:3000'
    credentials: true,
  });

  const port = process.env.PORT || 8000;
  await app.listen(port);
  console.log(`🚀 NestJS Chat Server is running on: http://localhost:${port}`);
}
bootstrap();
