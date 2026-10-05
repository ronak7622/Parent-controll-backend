import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IAppUsage extends Document {
  deviceId: string;
  appName: string;
  packageName: string;
  appIcon?: string;
  category?: string;
  usageDurationSeconds: number;
  date: string; // YYYY-MM-DD
  timestamp: Date;
}

const AppUsageSchema = new Schema<IAppUsage>(
  {
    deviceId: { type: String, required: true, index: true },
    appName: { type: String, required: true },
    packageName: { type: String, required: true },
    appIcon: { type: String },
    category: { type: String },
    usageDurationSeconds: { type: Number, default: 0 },
    date: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

AppUsageSchema.index({ deviceId: 1, packageName: 1, date: 1 }, { unique: true });
AppUsageSchema.index({ deviceId: 1, date: 1 });
AppUsageSchema.index({ deviceId: 1, date: 1, timestamp: -1 });
applyTtlIndex(AppUsageSchema, 'timestamp');

export const AppUsage = mongoose.model<IAppUsage>('AppUsage', AppUsageSchema);
