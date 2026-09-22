import mongoose, { Schema, Document } from 'mongoose';

export interface IAppBlockRule extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  isBlocked: boolean;
  blockMode: 'all_day' | 'weekdays' | 'weekends' | 'schedule';
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  notifyParent: boolean;
  notifyChild: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AppBlockRuleSchema = new Schema<IAppBlockRule>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    appName: { type: String, required: true },
    isBlocked: { type: Boolean, default: true },
    blockMode: {
      type: String,
      enum: ['all_day', 'weekdays', 'weekends', 'schedule'],
      default: 'all_day',
    },
    startTime: { type: String, default: '00:00' },
    endTime: { type: String, default: '23:59' },
    notifyParent: { type: Boolean, default: true },
    notifyChild: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AppBlockRuleSchema.index({ deviceId: 1, packageName: 1 }, { unique: true });

export const AppBlockRule = mongoose.model<IAppBlockRule>('AppBlockRule', AppBlockRuleSchema);
