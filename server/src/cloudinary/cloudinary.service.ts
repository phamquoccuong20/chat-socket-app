import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { extname, join } from 'path';
import * as fs from 'fs';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`[Cloudinary] Configured successfully for cloud: ${cloudName}`);
    } else if (process.env.CLOUDINARY_URL) {
      cloudinary.config({
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`[Cloudinary] Configured successfully via CLOUDINARY_URL`);
    } else {
      this.logger.warn(
        `[Cloudinary] Credentials not found. Uploads will fall back to local disk storage.`,
      );
    }
  }

  get configured(): boolean {
    return this.isConfigured;
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: 'chat' | 'avatars' = 'chat',
  ): Promise<{ fileUrl: string; publicId?: string }> {
    if (this.isConfigured) {
      try {
        return await this.uploadToCloudinary(file, folder);
      } catch (err) {
        this.logger.error('[Cloudinary] Upload failed, falling back to local storage:', err);
        return this.uploadToLocalDisk(file, folder);
      }
    }
    return this.uploadToLocalDisk(file, folder);
  }

  private uploadToCloudinary(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ fileUrl: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';
      if (file.mimetype?.startsWith('image/')) {
        resourceType = 'image';
      } else if (file.mimetype?.startsWith('video/')) {
        resourceType = 'video';
      } else {
        resourceType = 'raw';
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `antigravity-chat/${folder}`,
          resource_type: resourceType,
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            return reject(error || new Error('Upload to Cloudinary failed'));
          }
          resolve({
            fileUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      if (file.buffer) {
        uploadStream.end(file.buffer);
      } else if (file.path && fs.existsSync(file.path)) {
        const readStream = fs.createReadStream(file.path);
        readStream.pipe(uploadStream);
      } else {
        reject(new Error('File buffer or path not found for upload'));
      }
    });
  }

  private uploadToLocalDisk(
    file: Express.Multer.File,
    folder: string,
  ): { fileUrl: string } {
    const baseUrl =
      process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:8000';

    if (file.filename) {
      return { fileUrl: `${baseUrl}/uploads/${folder}/${file.filename}` };
    }

    const uploadPath = join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname).toLowerCase();
    const filename = `${folder}_${uniqueSuffix}${ext}`;
    const targetPath = join(uploadPath, filename);

    if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    }
    return { fileUrl: `${baseUrl}/uploads/${folder}/${filename}` };
  }
}
