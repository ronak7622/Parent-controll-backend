import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export type MessageDirection = 'received' | 'sent';
export type MessageCategory = 'personal' | 'otp' | 'transactions' | 'promotions' | 'subscription';

export interface IChildMessage extends Document {
  deviceId: string;
  nativeId: string; // the SMS/MMS provider's own row id on the child device - unique de-dupe key
  address: string; // phone number (conversation key, like the default Messages app)
  contactName?: string;
  contactPhotoBase64?: string;
  direction: MessageDirection;
  isMms: boolean;
  body: string;
  imageBase64?: string; // MMS picture attachment, if any
  category: MessageCategory;
  timestamp: Date;
  date: string; // yyyy-MM-dd, device-local day (matches AppUsage/ChildNotification convention)
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChildMessageSchema = new Schema<IChildMessage>(
  {
    deviceId: { type: String, required: true, index: true },
    nativeId: { type: String, required: true },
    address: { type: String, required: true },
    contactName: { type: String },
    contactPhotoBase64: { type: String },
    direction: { type: String, enum: ['received', 'sent'], required: true },
    isMms: { type: Boolean, default: false },
    body: { type: String, default: '' },
    imageBase64: { type: String },
    category: { type: String, enum: ['personal', 'otp', 'transactions', 'promotions', 'subscription'], default: 'personal' },
    timestamp: { type: Date, required: true },
    date: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChildMessageSchema.index({ deviceId: 1, timestamp: -1 });
ChildMessageSchema.index({ deviceId: 1, address: 1, date: 1, timestamp: 1 });
ChildMessageSchema.index({ deviceId: 1, address: 1, isRead: 1 });
ChildMessageSchema.index({ deviceId: 1, category: 1 });
// De-dupe key: a retried/overlapping upload upserts instead of duplicating the same native message.
ChildMessageSchema.index({ deviceId: 1, nativeId: 1, isMms: 1 }, { unique: true });
applyTtlIndex(ChildMessageSchema, 'timestamp');

export const ChildMessage = mongoose.model<IChildMessage>('ChildMessage', ChildMessageSchema);
