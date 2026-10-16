import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanSnapshot {
  planId: string;
  name: string;
  type: string;
  price: number;
  storageBytes: number;
  liveMinutesTotal: number;
  liveLimitPerDay: number; // daily plan limit (resets local midnight)
  liveSessionMaxMin?: number;
  deviceLimit: number;
  dayLimit: number;
  durationMs?: number;
  graceDays: number;
  storageWarnPercent: number;
  features: string[];
  isAllowSocialAppChatHistory?: boolean;
}

export interface IQueuedPlan {
  planSnapshot: IPlanSnapshot;
  durationDays: number;
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
    liveSessionMaxMin: { type: Number },
    deviceLimit: { type: Number, default: 3 },
    dayLimit: { type: Number, default: 30 },
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
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
