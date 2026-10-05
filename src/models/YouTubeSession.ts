import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IYouTubeSession extends Document {
  deviceId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  date: string;
  packageName: string;
  source: string;
  blocked: boolean;
  blockReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const YouTubeSessionSchema = new Schema<IYouTubeSession>(
  {
    deviceId: { type: String, required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationSeconds: { type: Number, default: 0 },
    date: { type: String, required: true, index: true },
    packageName: { type: String, default: 'com.google.android.youtube' },
    source: { type: String, default: 'YouTube App' },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String },
  },
  { timestamps: true }
);

YouTubeSessionSchema.index({ deviceId: 1, date: -1, startTime: -1 });
applyTtlIndex(YouTubeSessionSchema, 'startTime');

export const YouTubeSession = mongoose.model<IYouTubeSession>('YouTubeSession', YouTubeSessionSchema);
