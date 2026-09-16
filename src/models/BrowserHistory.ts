import mongoose, { Schema, Document } from 'mongoose';

export interface IBrowserHistory extends Document {
  deviceId: string;
  url: string;
  domain: string;
  title?: string;
  browserPackage: string;
  browserName: string;
  blocked: boolean;
  blockReason?: string;
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
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL index to automatically delete records older than 90 days
BrowserHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const BrowserHistory = mongoose.model<IBrowserHistory>('BrowserHistory', BrowserHistorySchema);
