import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanSnapshot {
  planId: string;
  name: string;
  type: string;
  price: number;
  storageBytes: number;
  liveMinutesTotal: number;
  liveSessionMaxMin: number;
  deviceLimit: number;
  graceDays: number;
  storageWarnPercent: number;
  features: string[];
}

export interface ISubscription extends Document {
  parentUserId: string;
  status: 'trial' | 'active' | 'grace' | 'expired';
  planSnapshot: IPlanSnapshot;
  addonStorageBytes: number;
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
    liveSessionMaxMin: { type: Number, default: 5 },
    deviceLimit: { type: Number, default: 3 },
    graceDays: { type: Number, default: 3 },
    storageWarnPercent: { type: Number, default: 80 },
    features: [{ type: String }],
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
