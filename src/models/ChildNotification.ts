import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IChildNotification extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  title: string;
  body: string;
  // Extra fields captured from the Android notification when present, for a fuller detail view.
  subText?: string;
  bigText?: string;
  summaryText?: string;
  infoText?: string;
  category?: string;
  number?: number;
  messages?: string[]; // "Sender: message text" lines, for grouped/messaging-style notifications
  actionLabels?: string[]; // e.g. ["Reply", "Mark as read"]
  imageBase64?: string; // the notification's own picture/large icon (BigPictureStyle image, contact photo, etc.), if any
  timestamp: Date;
  date: string; // yyyy-MM-dd, device-local day (matches AppUsage/AppSession convention)
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChildNotificationSchema = new Schema<IChildNotification>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, required: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    subText: { type: String },
    bigText: { type: String },
    summaryText: { type: String },
    infoText: { type: String },
    category: { type: String },
    number: { type: Number },
    messages: [{ type: String }],
    actionLabels: [{ type: String }],
    imageBase64: { type: String },
    timestamp: { type: Date, required: true },
    date: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChildNotificationSchema.index({ deviceId: 1, packageName: 1, date: 1, timestamp: -1 });
ChildNotificationSchema.index({ deviceId: 1, packageName: 1, isRead: 1 });
// Best-effort de-dupe key: the same notification re-sent by a retried batch upserts instead of duplicating.
ChildNotificationSchema.index(
  { deviceId: 1, packageName: 1, timestamp: 1, title: 1, body: 1 },
  { unique: true }
);
applyTtlIndex(ChildNotificationSchema, 'timestamp');

export const ChildNotification = mongoose.model<IChildNotification>('ChildNotification', ChildNotificationSchema);
