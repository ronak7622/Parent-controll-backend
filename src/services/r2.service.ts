import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.accountId ? `https://${config.r2.accountId}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId: config.r2.accessKeyId || 'dummy_key',
    secretAccessKey: config.r2.secretAccessKey || 'dummy_secret',
  },
});

const isDummyKey = (): boolean => {
  return (
    !config.r2.accessKeyId ||
    !config.r2.secretAccessKey ||
    config.r2.accessKeyId.startsWith('your_') ||
    config.r2.secretAccessKey.startsWith('your_')
  );
};

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
  if (isDummyKey()) {
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

/**
 * Generate Presigned PUT Upload URL for Direct Child Upload to R2 / S3
 */
export const generatePresignedPutUrl = async (
  objectKey: string,
  contentType: string = 'image/webp',
  expiresInSeconds: number = 900
): Promise<{ uploadUrl: string; objectKey: string; cdnUrl: string; isDirectS3: boolean }> => {
  if (isDummyKey()) {
    return {
      uploadUrl: `/ingest/media-captures/direct-upload?key=${encodeURIComponent(objectKey)}`,
      objectKey,
      cdnUrl: `/uploads/${objectKey}`,
      isDirectS3: false,
    };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    const cdnUrl = config.cdnPublicDomain
      ? `${config.cdnPublicDomain}/${objectKey}`
      : `https://${config.r2.bucketName}.${config.r2.accountId}.r2.cloudflarestorage.com/${objectKey}`;

    return {
      uploadUrl,
      objectKey,
      cdnUrl,
      isDirectS3: true,
    };
  } catch (error: any) {
    console.warn('[PRESIGNED-PUT-ERROR] Failed to generate signed PUT URL, falling back to local endpoint:', error.message);
    return {
      uploadUrl: `/ingest/media-captures/direct-upload?key=${encodeURIComponent(objectKey)}`,
      objectKey,
      cdnUrl: `/uploads/${objectKey}`,
      isDirectS3: false,
    };
  }
};

/**
 * Generate Presigned GET Download URL / CDN URL for Parent App
 */
export const generatePresignedGetUrl = async (
  objectKey: string,
  expiresInSeconds: number = 3600
): Promise<string> => {
  if (!objectKey) return '';
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://') || objectKey.startsWith('/uploads/')) {
    return objectKey;
  }

  if (config.cdnPublicDomain && !config.cdnPublicDomain.startsWith('http://your_')) {
    return `${config.cdnPublicDomain}/${objectKey}`;
  }

  if (isDummyKey()) {
    return `/uploads/${objectKey}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: objectKey,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (error: any) {
    return `https://${config.r2.bucketName}.${config.r2.accountId}.r2.cloudflarestorage.com/${objectKey}`;
  }
};

/**
 * Delete a single object from R2 or local disk
 */
export const deleteMediaFromR2 = async (mediaUrlOrKey: string): Promise<boolean> => {
  if (!mediaUrlOrKey) return false;

  // Extract key
  let key = mediaUrlOrKey;
  if (key.includes('/uploads/')) {
    key = key.substring(key.indexOf('/uploads/') + '/uploads/'.length);
  } else if (key.startsWith('http://') || key.startsWith('https://')) {
    try {
      const parsed = new URL(key);
      key = parsed.pathname.startsWith('/') ? parsed.pathname.substring(1) : parsed.pathname;
    } catch (_e) {}
  }

  // Handle local disk file
  const localDiskPath = path.join(__dirname, '../../public/uploads', key);
  if (fs.existsSync(localDiskPath)) {
    try {
      fs.unlinkSync(localDiskPath);
      console.log(`[STORAGE-DELETE] Deleted local file: ${localDiskPath}`);
      return true;
    } catch (err: any) {
      console.warn(`[STORAGE-DELETE-WARN] Local file delete error: ${err.message}`);
    }
  }

  if (isDummyKey()) return true;

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    await s3Client.send(command);
    console.log(`[R2-DELETE] Deleted R2 object: ${key}`);
    return true;
  } catch (err: any) {
    console.warn(`[R2-DELETE-WARN] Failed to delete object ${key} from R2: ${err.message}`);
    return false;
  }
};

/**
 * Bulk delete objects from R2 or local disk (10M scale bulk delete)
 */
export const bulkDeleteMediaFromR2 = async (mediaUrlsOrKeys: string[]): Promise<number> => {
  if (!mediaUrlsOrKeys || mediaUrlsOrKeys.length === 0) return 0;
  let deletedCount = 0;

  const keys: string[] = mediaUrlsOrKeys.map((item) => {
    let key = item;
    if (key.includes('/uploads/')) {
      key = key.substring(key.indexOf('/uploads/') + '/uploads/'.length);
    } else if (key.startsWith('http://') || key.startsWith('https://')) {
      try {
        const parsed = new URL(key);
        key = parsed.pathname.startsWith('/') ? parsed.pathname.substring(1) : parsed.pathname;
      } catch (_e) {}
    }
    return key;
  });

  // 1. Clear local disk files
  for (const key of keys) {
    const localDiskPath = path.join(__dirname, '../../public/uploads', key);
    if (fs.existsSync(localDiskPath)) {
      try {
        fs.unlinkSync(localDiskPath);
        deletedCount++;
      } catch (_e) {}
    }
  }

  if (isDummyKey()) return deletedCount || keys.length;

  // 2. Batch R2 bulk delete (up to 1000 keys per chunk)
  try {
    const chunkSize = 1000;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const command = new DeleteObjectsCommand({
        Bucket: config.r2.bucketName,
        Delete: {
          Objects: chunk.map((k: string) => ({ Key: k })),
          Quiet: true,
        },
      });
      await s3Client.send(command);
      deletedCount += chunk.length;
    }
  } catch (err: any) {
    console.warn(`[R2-BULK-DELETE-WARN] Error during R2 bulk delete: ${err.message}`);
  }

  return deletedCount;
};

