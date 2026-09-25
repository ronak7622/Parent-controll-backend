import mongoose, { Schema, Document } from 'mongoose';

export type BlockScheduleType = 'all_days' | 'weekdays' | 'weekends' | 'once' | 'selected_days';

export interface IAppBlockRule extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  isBlocked: boolean;
  // Which days the block applies (same options as App Limit)
  scheduleType: BlockScheduleType;
  selectedDays: number[]; // 1 = Mon, 7 = Sun (for 'selected_days')
  selectedDate?: string; // YYYY-MM-DD (for 'once')
  // Time window on those days; isFullDay = whole day
  isFullDay: boolean;
  scheduleStartTime: string; // HH:mm
  scheduleEndTime: string; // HH:mm
  notifyParentOnAccess: boolean;
  notifyChildOnBlock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AppBlockRuleSchema = new Schema<IAppBlockRule>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, required: true },
    isBlocked: { type: Boolean, default: true },
    scheduleType: {
      type: String,
      enum: ['all_days', 'weekdays', 'weekends', 'once', 'selected_days'],
      default: 'all_days',
    },
    selectedDays: [{ type: Number }],
    selectedDate: { type: String },
    isFullDay: { type: Boolean, default: true },
    scheduleStartTime: { type: String, default: '00:00' },
    scheduleEndTime: { type: String, default: '23:59' },
    notifyParentOnAccess: { type: Boolean, default: true },
    notifyChildOnBlock: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AppBlockRuleSchema.index({ deviceId: 1, packageName: 1 }, { unique: true });

export const AppBlockRule = mongoose.model<IAppBlockRule>('AppBlockRule', AppBlockRuleSchema);
