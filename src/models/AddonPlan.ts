import mongoose, { Schema, Document } from 'mongoose';

export interface IAddonPlan extends Document {
  addonId: string;
  name: string;
  /** Per-language addon name stored in DB */
  nameI18n?: { en?: string; hi?: string; gu?: string; es?: string; fr?: string };
  type: 'storage' | 'live_minutes';
  webPriceByRegion: {
    IN_INR: number;
    OTHER_USD: number;
  };
  appPriceByRegion: {
    IN_INR: number;
    OTHER_USD: number;
  };
  discountCompareToApp: number; // integer % shown on web only
  priceByRegion?: {
    IN_INR: number;
    LOW_USD?: number;
    HIGH_USD?: number;
    OTHER_USD?: number;
  };
  storageBytes: number;
  liveMinutes: number;
  isActive: boolean;
}

const AddonPlanSchema: Schema = new Schema(
  {
    addonId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    nameI18n: {
      en: { type: String },
      hi: { type: String },
      gu: { type: String },
      es: { type: String },
      fr: { type: String },
    },
    type: { type: String, enum: ['storage', 'live_minutes'], default: 'storage' },
    webPriceByRegion: {
      IN_INR: { type: Number, required: true, default: 99 },
      OTHER_USD: { type: Number, required: true, default: 3.99 },
    },
    appPriceByRegion: {
      IN_INR: { type: Number, required: true, default: 99 },
      OTHER_USD: { type: Number, required: true, default: 3.99 },
    },
    discountCompareToApp: { type: Number, default: 0 },
    priceByRegion: {
      IN_INR: { type: Number },
      LOW_USD: { type: Number },
      HIGH_USD: { type: Number },
      OTHER_USD: { type: Number },
    },
    storageBytes: { type: Number, default: 0 },
    liveMinutes: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const AddonPlan = mongoose.model<IAddonPlan>('AddonPlan', AddonPlanSchema);
