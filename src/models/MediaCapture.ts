import mongoose, { Schema, Document } from 'mongoose';

export interface IMediaCapture extends Document {
  deviceId: string;
  type: 'screenshot' | 'front_photo' | 'back_photo';
  captureType: 'manual' | 'schedule';
  mediaUrl: string; // Cloudflare R2 / Server Storage URL
  thumbnailUrl?: string;
  packageName?: string;
  appName?: string;
  fileSizeBytes?: number;
  mimeType: string; // e.g. image/webp
  timestamp: Date;
}

const MediaCaptureSchema = new Schema<IMediaCapture>(
  {
    deviceId: { type: String, required: true, index: true },
    type: { type: String, enum: ['screenshot', 'front_photo', 'back_photo'], required: true, index: true },
    captureType: { type: String, enum: ['manual', 'schedule'], default: 'manual', index: true },
    mediaUrl: { type: String, required: true },
    thumbnailUrl: { type: String },
    packageName: { type: String },
    appName: { type: String },
    fileSizeBytes: { type: Number },
    mimeType: { type: String, default: 'image/webp' },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true }
);

// Compound index for fast screenshot/photo queries at scale
MediaCaptureSchema.index({ deviceId: 1, type: 1, captureType: 1, timestamp: -1 });

export const MediaCapture = mongoose.model<IMediaCapture>('MediaCapture', MediaCaptureSchema);
