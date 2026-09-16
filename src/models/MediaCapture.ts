import mongoose, { Schema, Document } from 'mongoose';

export interface IMediaCapture extends Document {
  deviceId: string;
  type: 'screenshot' | 'front_photo' | 'back_photo';
  mediaUrl: string; // Cloudflare R2 Storage URL
  fileSizeBytes?: number;
  mimeType: string; // e.g. image/webp
  timestamp: Date;
}

const MediaCaptureSchema = new Schema<IMediaCapture>(
  {
    deviceId: { type: String, required: true, index: true },
    type: { type: String, enum: ['screenshot', 'front_photo', 'back_photo'], required: true, index: true },
    mediaUrl: { type: String, required: true },
    fileSizeBytes: { type: Number },
    mimeType: { type: String, default: 'image/webp' },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL index to automatically delete records older than 90 days
MediaCaptureSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const MediaCapture = mongoose.model<IMediaCapture>('MediaCapture', MediaCaptureSchema);
