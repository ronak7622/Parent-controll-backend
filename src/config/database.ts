import mongoose from 'mongoose';
import { config } from './env';

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[DATABASE] Connected to MongoDB successfully.');
  } catch (error) {
    console.warn('[DATABASE] MongoDB not connected locally/remote (starting server in fallback mode):', error);
  }
};
