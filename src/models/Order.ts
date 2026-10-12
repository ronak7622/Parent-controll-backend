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
  status: 'completed' | 'queued' | 'refunded';
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
    status: { type: String, enum: ['completed', 'queued', 'refunded'], default: 'completed', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

OrderSchema.index({ parentUserId: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
