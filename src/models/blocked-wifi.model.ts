import mongoose, { Schema, Document } from 'mongoose';

export interface IBlockedWifi extends Document {
  deviceId: string;
  ssid: string;
  bssid?: string;
  isBlocked: boolean;
}

const BlockedWifiSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    ssid: { type: String, required: true },
    bssid: { type: String, default: '' },
    isBlocked: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BlockedWifiSchema.index({ deviceId: 1, ssid: 1 }, { unique: true });

export const BlockedWifi = mongoose.model<IBlockedWifi>('BlockedWifi', BlockedWifiSchema);
