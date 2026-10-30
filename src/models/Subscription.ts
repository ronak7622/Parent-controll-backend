import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanSnapshot {
  planId: string;
  name: string;
  type: string;
  price: number;
  storageBytes: number;
  liveMinutesTotal?: number;
  liveLimitPerDay?: number; // daily plan limit (resets local midnight)
  liveLimitTotalInMinute?: number;
  liveLimitPerDayInMinutes?: number;
  liveSessionMaxMin?: number;
  deviceLimit: number;
  dayLimit?: number;
  planDurationValueInMinute?: number;
  planDurationUnit?: string;
  graceTimeInMinute?: number;
  planPriceDiscountPercen?: number;
  durationMs?: number;
  graceDays?: number;
  storageWarnPercent: number;
  features: string[];
  isAllowSocialAppChatHistory?: boolean;
}

export interface IQueuedPlan {
  planSnapshot: IPlanSnapshot;
  durationDays?: number;
  durationMs?: number;
  txnId: string;
  region: string;
  purchasedAt: Date;
  storageAddon?: {
    addonId: string;
    name: string;
    storageBytes: number;
    price: number;
  };
  liveAddon?: {
    addonId: string;
    name: string;
    liveMinutes: number;
    price: number;
  };
  allowStorageTrim?: boolean;
}

export interface ISubscription extends Document {
  parentUserId: string;
  status: 'trial' | 'active' | 'grace' | 'expired';
  planSnapshot: IPlanSnapshot;
  addonStorageBytes: number;
  addonLiveMinutesPool: number; // one-time live pool for validity duration
  lastPurchasedStorageAddonId?: string;
  lastPurchasedLiveAddonId?: string;
  queuedPlan?: IQueuedPlan;
  startAt: Date;
  expireAt: Date;
  graceEndsAt: Date;
  txnId?: string;
  idempotencyKey?: string;
  region: string;
  isTrial: boolean;
  lastStorageWarnNotificationAt?: Date;
  lastExpireWarnNotificationAt?: Date;
  addonLiveExhaustedNotified?: boolean;
  liveTotalLimitNotified?: boolean;
  planLiveMinutesUsed?: number; // cumulative live minutes used from base plan
}

const PlanSnapshotSchema: Schema = new Schema(
  {
    planId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, default: 'monthly' },
    price: { type: Number, default: 0 },
    storageBytes: { type: Number, required: true },
    liveMinutesTotal: { type: Number, default: 60 },
    liveLimitPerDay: { type: Number, default: 15 },
    liveLimitTotalInMinute: { type: Number },
    liveLimitPerDayInMinutes: { type: Number },
    liveSessionMaxMin: { type: Number },
    deviceLimit: { type: Number, default: 3 },
    dayLimit: { type: Number, default: 30 },
    planDurationValueInMinute: { type: Number },
    planDurationUnit: { type: String, default: 'minutes' },
    graceTimeInMinute: { type: Number, default: 4320 },
    planPriceDiscountPercen: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    graceDays: { type: Number, default: 3 },
    storageWarnPercent: { type: Number, default: 80 },
    features: [{ type: String }],
    isAllowSocialAppChatHistory: { type: Boolean, default: false },
  },
  { _id: false }
);

const QueuedPlanSchema: Schema = new Schema(
  {
    planSnapshot: { type: PlanSnapshotSchema, required: true },
    durationDays: { type: Number, default: 30 },
    durationMs: { type: Number, default: 0 },
    txnId: { type: String, required: true },
    region: { type: String, default: 'HIGH_USD' },
    purchasedAt: { type: Date, default: Date.now },
    storageAddon: {
      addonId: String,
      name: String,
      storageBytes: Number,
      price: Number,
    },
    liveAddon: {
      addonId: String,
      name: String,
      liveMinutes: Number,
      price: Number,
    },
    allowStorageTrim: { type: Boolean, default: false },
  },
  { _id: false }
);

const SubscriptionSchema: Schema = new Schema(
  {
    parentUserId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['trial', 'active', 'grace', 'expired'],
      default: 'trial',
      index: true,
    },
    planSnapshot: { type: PlanSnapshotSchema, required: true },
    addonStorageBytes: { type: Number, default: 0 },
    addonLiveMinutesPool: { type: Number, default: 0 },
    lastPurchasedStorageAddonId: { type: String },
    lastPurchasedLiveAddonId: { type: String },
    queuedPlan: { type: QueuedPlanSchema, default: null },
    startAt: { type: Date, default: Date.now },
    expireAt: { type: Date, required: true, index: true },
    graceEndsAt: { type: Date, required: true },
    txnId: { type: String },
    idempotencyKey: { type: String, index: true },
    region: { type: String, default: 'HIGH_USD' },
    isTrial: { type: Boolean, default: false },
    lastStorageWarnNotificationAt: { type: Date },
    lastExpireWarnNotificationAt: { type: Date },
    addonLiveExhaustedNotified: { type: Boolean, default: false },
    liveTotalLimitNotified: { type: Boolean, default: false },
    planLiveMinutesUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Background SubscriptionJob scans by (status + expireAt) and (status + graceEndsAt) over
// the whole collection on a timer -> compound indexes keep these O(matches) not O(total) at 10M+.
SubscriptionSchema.index({ status: 1, expireAt: 1 });
SubscriptionSchema.index({ status: 1, graceEndsAt: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
