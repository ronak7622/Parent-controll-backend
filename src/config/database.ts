import mongoose from 'mongoose';
import dns from 'dns';
import { config } from './env';

// Fallback to Google / Cloudflare public DNS for Mongo Atlas SRV record resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

export const connectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;

  try {
    const maskedUri = config.mongoUri.replace(/:([^@]+)@/, ':****@');
    console.log(`[DATABASE] Connecting to MongoDB (${maskedUri})...`);
    await mongoose.connect(config.mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('[DATABASE] Connected to MongoDB successfully.');
  } catch (error) {
    console.error('[DATABASE] CRITICAL: MongoDB Connection Failed:', error);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[DATABASE] MongoDB disconnected! Attempting reconnect...');
  setTimeout(() => connectDatabase(), 3000);
});

mongoose.connection.on('error', (err) => {
  console.error('[DATABASE] MongoDB connection error event:', err);
});

