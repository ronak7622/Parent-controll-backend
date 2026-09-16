import mongoose, { Schema, Document } from 'mongoose';

export interface ICallRecording extends Document {
  deviceId: string;
  phoneNumber: string;
  contactName?: string;
  callType: 'incoming' | 'outgoing';
  durationSeconds: number;
  audioUrl: string; // Cloudflare R2 audio URL (.opus / .aac)
  fileSizeBytes?: number;
  timestamp: Date;
}

const CallRecordingSchema = new Schema<ICallRecording>(
  {
    deviceId: { type: String, required: true, index: true },
    phoneNumber: { type: String, required: true },
    contactName: { type: String },
    callType: { type: String, enum: ['incoming', 'outgoing'], required: true },
    durationSeconds: { type: Number, default: 0 },
    audioUrl: { type: String, required: true },
    fileSizeBytes: { type: Number },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

CallRecordingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const CallRecording = mongoose.model<ICallRecording>('CallRecording', CallRecordingSchema);
