import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IWifiLog extends Document {
  deviceId: string;
  eventType: 'WIFI_ON' | 'WIFI_OFF' | 'WIFI_CONNECTED' | 'WIFI_DISCONNECTED' | 'WIFI_BLOCKED_ATTEMPT';
  ssid?: string;
  bssid?: string;
  ipAddress?: string;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  isCurrentlyConnected?: boolean;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
  isBlockedAttempt?: boolean;
  statusReason?: string;
  bytesUsed?: number;
  timestamp: Date;
}

const WifiLogSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: ['WIFI_ON', 'WIFI_OFF', 'WIFI_CONNECTED', 'WIFI_DISCONNECTED', 'WIFI_BLOCKED_ATTEMPT'],
      required: true,
    },
    ssid: { type: String, default: '' },
    bssid: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    sessionId: { type: String, default: '', index: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    bytesUsed: { type: Number, default: 0 },
    isCurrentlyConnected: { type: Boolean, default: false },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    locationAddress: { type: String, default: '' },
    isBlockedAttempt: { type: Boolean, default: false },
    statusReason: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

WifiLogSchema.index({ deviceId: 1, timestamp: -1 });
applyTtlIndex(WifiLogSchema, 'timestamp');

export const WifiLog = mongoose.model<IWifiLog>('WifiLog', WifiLogSchema);
