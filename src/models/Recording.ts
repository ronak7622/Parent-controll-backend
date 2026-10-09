import mongoose, { Schema, Document } from 'mongoose';

export interface IRecording extends Document {
  deviceId: string;
  recordingType: 'audio' | 'video' | 'screen';
  triggerSource: 'schedule' | 'live_inline';
  status: 'in_progress' | 'saving' | 'completed' | 'failed';
  sessionId: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  cameraPosition?: 'front' | 'back' | 'none';
  quality?: string;
  childStarted?: boolean;
  startedAt: Date;
  endedAt?: Date;
  timestamp: Date;
}

const RecordingSchema = new Schema<IRecording>(
  {
    deviceId: { type: String, required: true, index: true },
    recordingType: { type: String, enum: ['audio', 'video', 'screen'], required: true, index: true },
    triggerSource: { type: String, enum: ['schedule', 'live_inline'], default: 'schedule' },
    status: { type: String, enum: ['in_progress', 'saving', 'completed', 'failed'], default: 'in_progress', index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    mediaUrl: { type: String },
    thumbnailUrl: { type: String },
    durationSeconds: { type: Number, default: 0 },
    fileSizeBytes: { type: Number, default: 0 },
    mimeType: { type: String, default: 'audio/aac' },
    cameraPosition: { type: String, enum: ['front', 'back', 'none'], default: 'none' },
    quality: { type: String, default: 'medium' },
    childStarted: { type: Boolean, default: false },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Index for fast query by device, type, status, and date
RecordingSchema.index({ deviceId: 1, recordingType: 1, timestamp: -1 });
RecordingSchema.index({ deviceId: 1, status: 1 });

export const Recording = mongoose.model<IRecording>('Recording', RecordingSchema);
