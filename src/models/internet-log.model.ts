import mongoose, { Schema, Document } from 'mongoose';

export interface IInternetLog extends Document {
  deviceId: string;
  eventType: 'DATA_CONNECTED' | 'DATA_DISCONNECTED' | 'DATA_USAGE_UPDATE' | 'DATA_ON' | 'DATA_OFF';
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  bytesUsed?: number;
  dataUsageText?: string;
  isCurrentlyConnected?: boolean;
  simCarrier?: string;
  simCount?: number;
  locationAddress?: string;
  statusReason?: string;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
}

const InternetLogSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: ['DATA_CONNECTED', 'DATA_DISCONNECTED', 'DATA_USAGE_UPDATE', 'DATA_ON', 'DATA_OFF'],
      required: true,
    },
    sessionId: { type: String, default: '', index: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    bytesUsed: { type: Number, default: 0 },
    dataUsageText: { type: String, default: '0 KB' },
    isCurrentlyConnected: { type: Boolean, default: false },
    simCarrier: { type: String, default: 'Cellular Data' },
    simCount: { type: Number, default: 1 },
    locationAddress: { type: String, default: '' },
    statusReason: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export const InternetLog = mongoose.model<IInternetLog>('InternetLog', InternetLogSchema);
