import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadBase64(base64Str: string): Promise<string> {
    try {
      const res = await cloudinary.uploader.upload(base64Str, {
        resource_type: 'auto',
        folder: 'dotalk_chat_attachments',
      });
      return res.secure_url;
    } catch (error) {
      console.error('Cloudinary upload failed:', error);
      throw error;
    }
  }
}
