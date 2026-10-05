import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_child_protect_2026',
  
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'child-protect-media',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
  },
  
  redisUri: process.env.REDIS_URI || process.env.REDIS_URL || '',
  cdnPublicDomain: process.env.CDN_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || '',

  // Scalability Feature Flags
  flags: {
    enablePresignedUploads: process.env.ENABLE_PRESIGNED_UPLOADS !== 'false', // Default enabled
    enableBullmqIngest: process.env.ENABLE_BULLMQ_INGEST === 'true', // Opt-in async queue ingestion
    enableRedisCache: process.env.ENABLE_REDIS_CACHE === 'true', // Opt-in Redis caching
    enableTtlIndexes: process.env.ENABLE_TTL_INDEXES === 'true', // Opt-in Mongo TTL index auto-delete
    enableReadReplicas: process.env.ENABLE_READ_REPLICAS === 'true', // Opt-in replica set secondary reads
  },
  
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
};
