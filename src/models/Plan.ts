import mongoose, { Schema, Document } from 'mongoose';

export type I18nLangMap = {
  en?: string;
  hi?: string;
  gu?: string;
  es?: string;
  fr?: string;
};

export interface IPlan extends Document {
  planId: string;
  name: string;
  /** Per-language name stored in DB – single source of truth for translations */
  nameI18n?: I18nLangMap;
  type: string; // 'monthly' | 'yearly' | '6_months' | '3_months' | 'quarterly' | 'trial' etc.
  priceByRegion: {
    IN_INR: number;
    LOW_USD: number;
    HIGH_USD: number;
  };
  storageBytes: number;
  planDurationValueInMinute: number;
  planDurationUnit: 'minutes' | 'hours' | 'days';
  graceTimeInMinute: number;
  planPriceDiscountPercen: number;
  isTestPlan?: boolean;
  liveLimitTotalInMinute: number;
  liveLimitPerDayInMinutes: number;
  deviceLimit: number;
  features: string[];
  /** Per-language feature lists stored in DB – same order as features[] */
  featuresI18n?: {
    en?: string[];
    hi?: string[];
    gu?: string[];
    es?: string[];
    fr?: string[];
  };
  isActive: boolean;
  isRecommended: boolean;
  sortOrder: number;
  isAllowSocialAppChatHistory?: boolean;
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
    planDurationValueInMinute: { type: Number, required: true, default: 43200 }, // 30 days in minutes
    planDurationUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'minutes' },
    graceTimeInMinute: { type: Number, default: 4320 }, // 3 days in minutes
    planPriceDiscountPercen: { type: Number, default: 0 },
    isTestPlan: { type: Boolean, default: false, index: true },
    liveLimitTotalInMinute: { type: Number, default: 60 },
    liveLimitPerDayInMinutes: { type: Number, default: 15 },
    deviceLimit: { type: Number, default: 3 },
    features: [{ type: String }],
    featuresI18n: {
      en: [{ type: String }],
      hi: [{ type: String }],
      gu: [{ type: String }],
      es: [{ type: String }],
      fr: [{ type: String }],
    },
    nameI18n: {
      en: { type: String },
      hi: { type: String },
      gu: { type: String },
      es: { type: String },
      fr: { type: String },
    },
    isActive: { type: Boolean, default: true, index: true },
    isRecommended: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    isAllowSocialAppChatHistory: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);
