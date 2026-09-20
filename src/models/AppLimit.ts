import mongoose, { Schema, Document } from 'mongoose';

export interface IAppLimit extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  isEnabled: boolean;
  limitDurationMinutes: number; // e.g. 240 for 4 hours
  scheduleType: 'all_days' | 'weekends' | 'weekdays' | 'once' | 'selected_days';
  selectedDays: number[]; // 1 = Mon, 7 = Sun
  selectedDate?: string; // YYYY-MM-DD (for 'once')
  notifyOnLimitReached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AppLimitSchema = new Schema<IAppLimit>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
    limitDurationMinutes: { type: Number, required: true, default: 240 },
    scheduleType: {
      type: String,
      enum: ['all_days', 'weekends', 'weekdays', 'once', 'selected_days'],
      default: 'all_days',
    },
    selectedDays: [{ type: Number }],
    selectedDate: { type: String },
    notifyOnLimitReached: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound index so each device can only have one limit per package
AppLimitSchema.index({ deviceId: 1, packageName: 1 }, { unique: true });

export const AppLimit = mongoose.model<IAppLimit>('AppLimit', AppLimitSchema);
