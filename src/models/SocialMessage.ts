import mongoose, { Schema, Document } from 'mongoose';

export interface ISocialMessage extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  contactName: string;
  sender: string;
  messageText: string;
  isOutgoing: boolean;
  timestamp: Date;
}

const SocialMessageSchema = new Schema<ISocialMessage>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, default: 'Social App' },
    contactName: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    messageText: { type: String, required: true },
    isOutgoing: { type: Boolean, default: false },
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

SocialMessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const SocialMessage = mongoose.model<ISocialMessage>('SocialMessage', SocialMessageSchema);
