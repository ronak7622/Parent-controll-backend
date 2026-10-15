import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IChatMessage extends Document {
  deviceId: string;
  packageName: string;
  contactId: string;
  contactName: string;
  contactNumber?: string;
  direction: 'sent' | 'received';
  type: 'text' | 'image' | 'video' | 'audio' | 'reel' | 'snap' | 'call';
  text?: string;
  callType?: string;
  callDurationSec?: number;
  orderIndex?: number;
  capturedAt?: Date;
  textHash?: string;
  intraKey?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true, index: true },
    contactId: { type: String, required: true, index: true },
    contactName: { type: String, required: true },
    contactNumber: { type: String, default: '' },
    direction: { type: String, enum: ['sent', 'received'], required: true },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'reel', 'snap', 'call'],
      default: 'text',
    },
    text: { type: String, default: '' },
    callType: { type: String, default: null },
    callDurationSec: { type: Number, default: null },
    orderIndex: { type: Number, default: 0 },
    capturedAt: { type: Date, default: null },
    textHash: { type: String, index: true },
    intraKey: { type: String, default: null, index: true },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ deviceId: 1, packageName: 1, contactId: 1, timestamp: -1, orderIndex: -1 });
ChatMessageSchema.index({ deviceId: 1, packageName: 1, contactId: 1, direction: 1, type: 1, textHash: 1, timestamp: 1 });
ChatMessageSchema.index({ deviceId: 1, packageName: 1, contactId: 1, direction: 1, type: 1, textHash: 1, intraKey: 1 });
ChatMessageSchema.index({ deviceId: 1, timestamp: -1 });
applyTtlIndex(ChatMessageSchema, 'timestamp');

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
