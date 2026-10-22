import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveUsage extends Document {
  parentUserId: string;
  dayKey: string;   // e.g. "2026-10-11" for daily plan limit consumption
  monthKey: string; // e.g. "2026-10"
  dailyMinutesUsed: number;
  addonMinutesUsed: number;
  minutesUsed: number; // legacy / cumulative
  resetAt: Date;
  dailyLimitNotified?: boolean;
  sessionCutoffNotified?: boolean;
}

const LiveUsageSchema: Schema = new Schema(
  {
    parentUserId: { type: String, required: true, index: true },
    dayKey: { type: String, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    dailyMinutesUsed: { type: Number, default: 0 },
    addonMinutesUsed: { type: Number, default: 0 },
    minutesUsed: { type: Number, default: 0 },
    resetAt: { type: Date, required: true },
    dailyLimitNotified: { type: Boolean, default: false },
    sessionCutoffNotified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

LiveUsageSchema.index({ parentUserId: 1, dayKey: 1 }, { unique: true });
LiveUsageSchema.index({ parentUserId: 1, monthKey: 1 });

export const LiveUsage = mongoose.model<ILiveUsage>('LiveUsage', LiveUsageSchema);
