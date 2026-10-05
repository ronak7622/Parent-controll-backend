import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
