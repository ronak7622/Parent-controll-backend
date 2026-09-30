import mongoose, { Schema, Document } from 'mongoose';

export interface IScheduleConfig extends Document {
  deviceId: string;
  enabled: boolean;
  daysType: 'all' | 'weekdays' | 'weekend' | 'custom' | 'date';
  selectedDays: number[]; // 1=Mon .. 7=Sun
  specificDate?: string; // "YYYY-MM-DD"
  timeShortcut?: 'daytime' | 'midday' | 'nighttime' | 'midnight' | 'custom';
  startTimeMinutes: number; // 0 to 1439
  endTimeMinutes: number; // 0 to 1439
  appsType: 'all' | 'selected';
  selectedApps: string[]; // Package names
  intervalSeconds: number; // 30, 120, 300, 600, 900, 1800, 3600, 18000
}

const ScheduleConfigSchema = new Schema<IScheduleConfig>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    daysType: { type: String, enum: ['all', 'weekdays', 'weekend', 'custom', 'date'], default: 'all' },
    selectedDays: { type: [Number], default: [] },
    specificDate: { type: String, default: '' },
    timeShortcut: { type: String, enum: ['daytime', 'midday', 'nighttime', 'midnight', 'custom'], default: 'daytime' },
    startTimeMinutes: { type: Number, default: 480 },
    endTimeMinutes: { type: Number, default: 1200 },
    appsType: { type: String, enum: ['all', 'selected'], default: 'all' },
    selectedApps: { type: [String], default: [] },
    intervalSeconds: { type: Number, default: 300 },
  },
  { timestamps: true }
);

export const ScheduleConfig = mongoose.model<IScheduleConfig>('ScheduleConfig', ScheduleConfigSchema);
