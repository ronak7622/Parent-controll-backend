import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
  parentUserId: string;
  type: 'plan' | 'storage_addon' | 'live_addon';
  planId?: string;
  addonId?: string;
  planLabel: string;
  amount: number;
  currency: string;
  validityStart: Date;
  validityEnd: Date;
  txnId: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'completed' | 'queued' | 'refunded';
  paymentProvider?: 'razorpay' | 'google_play' | 'trial' | 'none';
  providerOrderId?: string;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  providerPurchaseToken?: string;
  failureReason?: string;
  paymentStatus?: 'processing' | 'paid' | 'failed' | 'refunded';
  planStatus?: 'in_active' | 'active' | 'processing' | 'pending_to_active';
  activatesOn?: Date;
  refundInfo?: { refundId?: string; amount?: number; at?: Date; startedAt?: Date; completedAt?: Date; reason?: string; status?: 'created' | 'processed' | 'failed' | 'pending'; expectedBy?: Date };
  paymentMethod?: string;
  activatedAt?: Date;
  failedAt?: Date;
  reconcileBy?: Date;
  autoRenew: boolean;
  baseAmount?: number;
  gstAmount?: number;
  gstRatePercent?: number;
  gstin?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema(
  {
    parentUserId: { type: String, required: true, index: true },
    type: { type: String, enum: ['plan', 'storage_addon', 'live_addon'], required: true, index: true },
    planId: { type: String },
    addonId: { type: String },
    planLabel: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: '₹' },
    validityStart: { type: Date, required: true },
    validityEnd: { type: Date, required: true },
    txnId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'completed', 'queued', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentProvider: {
      type: String,
      enum: ['razorpay', 'google_play', 'trial', 'none'],
      default: 'none',
      index: true,
    },
    providerOrderId: { type: String },
    providerPaymentId: { type: String },
    providerSubscriptionId: { type: String },
    providerPurchaseToken: { type: String },
    failureReason: { type: String },
    paymentStatus: {
      type: String,
      enum: ['processing', 'paid', 'failed', 'refunded'],
      index: true,
    },
    planStatus: {
      type: String,
      enum: ['in_active', 'active', 'processing', 'pending_to_active'],
      index: true,
    },
    activatesOn: { type: Date },
    refundInfo: {
      refundId: { type: String },
      amount: { type: Number },
      at: { type: Date },
      startedAt: { type: Date },
      completedAt: { type: Date },
      reason: { type: String },
      status: { type: String },
      expectedBy: { type: Date },
    },
    paymentMethod: { type: String },
    activatedAt: { type: Date },
    failedAt: { type: Date },
    reconcileBy: { type: Date },
    autoRenew: { type: Boolean, default: false },
    baseAmount: { type: Number },
    gstAmount: { type: Number },
    gstRatePercent: { type: Number },
    gstin: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

OrderSchema.index({ parentUserId: 1, createdAt: -1 });
OrderSchema.index({ parentUserId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, reconcileBy: 1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
