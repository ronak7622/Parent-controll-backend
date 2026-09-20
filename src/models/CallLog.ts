import mongoose, { Schema, Document } from 'mongoose';

export interface ICallLog extends Document {
  deviceId: string;
  callId?: string;
  phoneNumber: string;
  contactName?: string;
  callType: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked';
  startTime: Date;
  endTime?: Date;
  durationSeconds: number;
  isBlocked: boolean;
  isOutgoingBlocked?: boolean;
  isVideo?: boolean;
  simDisplayName?: string;
  timestamp: Date;
}

const CallLogSchema = new Schema<ICallLog>(
  {
    deviceId: { type: String, required: true, index: true },
    callId: { type: String },
    phoneNumber: { type: String, required: true, index: true },
    contactName: { type: String },
    callType: {
      type: String,
      enum: ['incoming', 'outgoing', 'missed', 'rejected', 'blocked'],
      required: true,
    },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    isOutgoingBlocked: { type: Boolean, default: false },
    isVideo: { type: Boolean, default: false },
    simDisplayName: { type: String },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true }
);

CallLogSchema.index({ deviceId: 1, callId: 1 }, { unique: true, sparse: true });
CallLogSchema.index({ deviceId: 1, timestamp: -1 });
CallLogSchema.index({ deviceId: 1, phoneNumber: 1 });

export const CallLog = mongoose.model<ICallLog>('CallLog', CallLogSchema);
