import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveUsage extends Document {
  parentUserId: string;
  monthKey: string; // e.g. "2026-10"
  minutesUsed: number;
  resetAt: Date;
}

const LiveUsageSchema: Schema = new Schema(
  {
    parentUserId: { type: String, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    minutesUsed: { type: Number, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { timestamps: true }
);

LiveUsageSchema.index({ parentUserId: 1, monthKey: 1 }, { unique: true });

export const LiveUsage = mongoose.model<ILiveUsage>('LiveUsage', LiveUsageSchema);
