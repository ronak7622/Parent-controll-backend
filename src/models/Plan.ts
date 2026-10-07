import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  planId: string;
  name: string;
  type: 'monthly' | 'yearly';
  priceByRegion: {
    IN_INR: number;
    LOW_USD: number;
    HIGH_USD: number;
  };
  storageBytes: number;
  dayLimit: number;
  liveMinutesTotal: number;
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
    type: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    priceByRegion: {
      IN_INR: { type: Number, required: true, default: 299 },
      LOW_USD: { type: Number, required: true, default: 4.99 },
      HIGH_USD: { type: Number, required: true, default: 9.99 },
    },
    storageBytes: { type: Number, required: true, default: 10737418240 }, // 10 GB
    dayLimit: { type: Number, default: 30 },
    liveMinutesTotal: { type: Number, default: 60 },
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
