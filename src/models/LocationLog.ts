import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface ILocationLog extends Document {
  deviceId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number; // km/h
  heading?: number; // degrees 0-360
  accuracy?: number; // meters
  locationName?: string;
  locationAddress?: string;
  activityType?: string; // STILL, WALKING, RUNNING, IN_VEHICLE, ON_BICYCLE
  isMoving?: boolean;
  isLive?: boolean;
  date: string; // YYYY-MM-DD
  timestamp: Date;
}

const LocationLogSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    altitude: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    locationName: { type: String, default: '' },
    locationAddress: { type: String, default: '' },
    activityType: { type: String, default: 'STILL' },
    isMoving: { type: Boolean, default: false },
    isLive: { type: Boolean, default: false },
    date: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Compound index for fast queries by device, date, and timestamp sorting
LocationLogSchema.index({ deviceId: 1, date: 1, timestamp: -1 });
LocationLogSchema.index({ deviceId: 1, timestamp: -1 });
applyTtlIndex(LocationLogSchema, 'timestamp');

export const LocationLog = mongoose.model<ILocationLog>('LocationLog', LocationLogSchema);
