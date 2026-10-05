import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IBrowserHistory extends Document {
  deviceId: string;
  url: string;
  domain: string;
  title?: string;
  browserPackage: string;
  browserName: string;
  blocked: boolean;
  blockReason?: string;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  isCurrentlyActive?: boolean;
  timestamp: Date;
}

const BrowserHistorySchema = new Schema<IBrowserHistory>(
  {
    deviceId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    domain: { type: String, required: true, index: true },
    title: { type: String },
    browserPackage: { type: String, default: 'browser' },
    browserName: { type: String, default: 'Browser' },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String },
    sessionId: { type: String, default: '', index: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    isCurrentlyActive: { type: Boolean, default: false },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true }
);

// Compound index for fast time-series queries at scale
BrowserHistorySchema.index({ deviceId: 1, timestamp: -1 });
BrowserHistorySchema.index({ deviceId: 1, sessionId: 1 });
applyTtlIndex(BrowserHistorySchema, 'timestamp');

export const BrowserHistory = mongoose.model<IBrowserHistory>('BrowserHistory', BrowserHistorySchema);
