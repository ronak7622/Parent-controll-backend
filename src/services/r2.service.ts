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

export const uploadMediaToR2 = async (
  buffer: Buffer,
  folder: string,
  extension: string = 'webp',
  mimeType: string = 'image/webp'
): Promise<string> => {
  if (!config.r2.accessKeyId || !config.r2.secretAccessKey) {
    console.warn('[R2-WARNING] R2 Credentials missing. Returning mock data URI.');
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  const filename = `${folder}/${uuidv4()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: filename,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  if (config.r2.publicDomain) {
    return `${config.r2.publicDomain}/${filename}`;
  }
  return `https://${config.r2.bucketName}.${config.r2.accountId}.r2.cloudflarestorage.com/${filename}`;
};
