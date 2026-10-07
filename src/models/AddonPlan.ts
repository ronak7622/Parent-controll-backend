import mongoose, { Schema, Document } from 'mongoose';

export interface IAddonPlan extends Document {
  addonId: string;
  name: string;
  type: 'storage' | 'live_minutes';
  priceByRegion: {
    IN_INR: number;
    LOW_USD: number;
    HIGH_USD: number;
  };
  storageBytes: number;
  liveMinutes: number;
  isActive: boolean;
}

const AddonPlanSchema: Schema = new Schema(
  {
    addonId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['storage', 'live_minutes'], default: 'storage' },
    priceByRegion: {
      IN_INR: { type: Number, required: true, default: 99 },
      LOW_USD: { type: Number, required: true, default: 1.99 },
      HIGH_USD: { type: Number, required: true, default: 3.99 },
    },
    storageBytes: { type: Number, default: 0 },
    liveMinutes: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const AddonPlan = mongoose.model<IAddonPlan>('AddonPlan', AddonPlanSchema);
