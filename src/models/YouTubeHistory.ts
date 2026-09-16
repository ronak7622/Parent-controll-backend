import mongoose, { Schema, Document } from 'mongoose';

export interface IYouTubeHistory extends Document {
  deviceId: string;
  videoId?: string;
  videoUrl?: string;
  title: string;
  channelName?: string;
  duration?: string;
  description?: string;
  isShorts: boolean;
  isVideo: boolean;
  watchedDurationSeconds?: number;
  endedAt?: Date;
  source: string;
  thumbnailBase64?: string;
  blocked: boolean;
  blockReason?: string;
  timestamp: Date;
}

const YouTubeHistorySchema = new Schema<IYouTubeHistory>(
  {
    deviceId: { type: String, required: true, index: true },
    videoId: { type: String },
    videoUrl: { type: String },
    title: { type: String, required: true },
    channelName: { type: String },
    duration: { type: String },
    description: { type: String },
    isShorts: { type: Boolean, default: false },
    isVideo: { type: Boolean, default: true },
    watchedDurationSeconds: { type: Number, default: 0 },
    endedAt: { type: Date },
    source: { type: String, default: 'YouTube App' },
    thumbnailBase64: { type: String },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL index to automatically delete records older than 90 days
YouTubeHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const YouTubeHistory = mongoose.model<IYouTubeHistory>('YouTubeHistory', YouTubeHistorySchema);
