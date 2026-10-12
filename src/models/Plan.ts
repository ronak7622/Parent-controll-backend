import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  planId: string;
  name: string;
  type: string; // 'monthly' | 'yearly' | '6_months' | '3_months' | 'quarterly' etc.
  priceByRegion: {
    IN_INR: number;
    LOW_USD: number;
    HIGH_USD: number;
  };
  storageBytes: number;
  dayLimit: number;
  durationUnit?: 'minutes' | 'hours' | 'days';
  durationValue?: number; // 0 => fallback to dayLimit
  isTestPlan?: boolean;
  liveMinutesTotal: number;
  liveLimitPerDay: number;
  liveSessionMaxMin: number;
  deviceLimit: number;
  features: string[];
  isActive: boolean;
  isRecommended: boolean;
  sortOrder: number;
}

const PlanSchema: Schema = new Schema(
  {
    planId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: { type: String, default: 'monthly', index: true },
    priceByRegion: {
      IN_INR: { type: Number, required: true, default: 299 },
      LOW_USD: { type: Number, required: true, default: 4.99 },
      HIGH_USD: { type: Number, required: true, default: 9.99 },
    },
    storageBytes: { type: Number, required: true, default: 10737418240 }, // 10 GB
    dayLimit: { type: Number, default: 30 },
    // Effective validity value = durationValue > 0 ? durationValue : dayLimit, unit = durationUnit || 'days'.
    // Real plans with only dayLimit and no durationUnit behave identically to today (defaulting to 'days').
    durationUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'days' },
    durationValue: { type: Number, default: 0 },
    isTestPlan: { type: Boolean, default: false, index: true },
    liveMinutesTotal: { type: Number, default: 60 },
    liveLimitPerDay: { type: Number, default: 15 },
    liveSessionMaxMin: { type: Number, default: 5 },
    deviceLimit: { type: Number, default: 3 },
    features: [{ type: String }],
    isActive: { type: Boolean, default: true, index: true },
    isRecommended: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);
