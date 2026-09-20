import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const saveToLocalDisk = (buffer: Buffer, folder: string, extension: string): string => {
  const targetDir = path.join(__dirname, '../../public/uploads', folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filename = `${uuidv4()}.${extension}`;
  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${folder}/${filename}`;
};

export const uploadMediaToR2 = async (
  buffer: Buffer,
  folder: string,
  extension: string = 'webp',
  mimeType: string = 'image/webp'
): Promise<string> => {
  const isDummyKey = !config.r2.accessKeyId || 
                     !config.r2.secretAccessKey || 
                     config.r2.accessKeyId.startsWith('your_') ||
                     config.r2.secretAccessKey.startsWith('your_');

  if (isDummyKey) {
    console.log(`[MEDIA-STORAGE] Storing media file locally on server disk (${buffer.length} bytes): ${folder}`);
    return saveToLocalDisk(buffer, folder, extension);
  }

  try {
    const filename = `${folder}/${uuidv4()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);

    if (config.r2.publicDomain && !config.r2.publicDomain.startsWith('http://your_') && !config.r2.publicDomain.startsWith('https://media.childprotect')) {
      return `${config.r2.publicDomain}/${filename}`;
    }
    return `https://${config.r2.bucketName}.${config.r2.accountId}.r2.cloudflarestorage.com/${filename}`;
  } catch (error: any) {
    console.warn('[R2-ERROR] R2 Upload failed, falling back to local server disk:', error.message);
    return saveToLocalDisk(buffer, folder, extension);
  }
};
