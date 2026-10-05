import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IKeyboardLog extends Document {
  deviceId: string;
  matchedKeyword: string;
  packageName: string;
  appName: string;
  appIcon?: string;
  capturedText?: string;
  screenshotBase64?: string;
  screenshotUrl?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KeyboardLogSchema = new Schema<IKeyboardLog>(
  {
    deviceId: { type: String, required: true, index: true },
    matchedKeyword: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, required: true },
    appIcon: { type: String },
    capturedText: { type: String },
    screenshotBase64: { type: String },
    screenshotUrl: { type: String },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// Compound index for fast date-filtered queries per device
KeyboardLogSchema.index({ deviceId: 1, timestamp: -1 });
KeyboardLogSchema.index({ deviceId: 1, timestamp: 1, matchedKeyword: 1, packageName: 1 }, { unique: true, sparse: true });
applyTtlIndex(KeyboardLogSchema, 'timestamp');

export const KeyboardLog = mongoose.model<IKeyboardLog>('KeyboardLog', KeyboardLogSchema);
