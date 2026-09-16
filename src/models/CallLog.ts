import mongoose, { Schema, Document } from 'mongoose';

export interface ICallLog extends Document {
  deviceId: string;
  phoneNumber: string;
  contactName?: string;
  callType: 'incoming' | 'outgoing' | 'missed' | 'rejected';
  durationSeconds: number;
  timestamp: Date;
}

const CallLogSchema = new Schema<ICallLog>(
  {
    deviceId: { type: String, required: true, index: true },
    phoneNumber: { type: String, required: true },
    contactName: { type: String },
    callType: { type: String, enum: ['incoming', 'outgoing', 'missed', 'rejected'], required: true },
    durationSeconds: { type: Number, default: 0 },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

CallLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const CallLog = mongoose.model<ICallLog>('CallLog', CallLogSchema);
