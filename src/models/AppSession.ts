import mongoose, { Schema, Document } from 'mongoose';

export interface IAppSession extends Document {
  deviceId: string;
  packageName: string;
  appName: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  date: string; // YYYY-MM-DD
  sessionType?: 'normal' | 'limit_exceeded_attempt' | 'blocked_attempt';
  createdAt: Date;
  updatedAt: Date;
}

const AppSessionSchema = new Schema<IAppSession>(
  {
    deviceId: { type: String, required: true, index: true },
    packageName: { type: String, required: true, index: true },
    appName: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationSeconds: { type: Number, required: true, default: 0 },
    date: { type: String, required: true, index: true },
    sessionType: {
      type: String,
      enum: ['normal', 'limit_exceeded_attempt', 'blocked_attempt'],
      default: 'normal',
    },
  },
  { timestamps: true }
);

// Unique compound index to prevent duplicate sessions on repeated syncs
AppSessionSchema.index({ deviceId: 1, packageName: 1, startTime: 1 }, { unique: true });
AppSessionSchema.index({ deviceId: 1, date: 1, packageName: 1 });
AppSessionSchema.index({ deviceId: 1, date: 1, startTime: -1 });

export const AppSession = mongoose.model<IAppSession>('AppSession', AppSessionSchema);
