import mongoose, { Schema, Document } from 'mongoose';
import { applyTtlIndex } from '../utils/ttl.utils';

export interface IDrivingTrip extends Document {
  deviceId: string;
  tripId: string;
  status: string; // 'Driving' | 'Completed' | 'Running'
  activityMode: string; // 'DRIVING' | 'RUNNING'
  distanceKm: number;
  durationSeconds: number;
  durationText: string;
  avgSpeedKmH: number;
  maxSpeedKmH: number;
  startTime: Date;
  endTime: Date;
  startAddress: string;
  endAddress: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  routePoints: Array<{
    latitude: number;
    longitude: number;
    speed: number;
    timestamp: Date;
    address?: string;
  }>;
  stops?: Array<{
    latitude: number;
    longitude: number;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    durationText: string;
    address?: string;
    hasWalking?: boolean;
    startWalkTime?: Date;
    endWalkTime?: Date;
    walkDurationSeconds?: number;
    walkDurationText?: string;
    walkDistanceMeters?: number;
    walkRadiusMeters?: number;
  }>;
  date: string; // YYYY-MM-DD
}

const DrivingTripSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    tripId: { type: String, required: true, index: true },
    status: { type: String, default: 'Completed' },
    activityMode: { type: String, default: 'DRIVING' },
    distanceKm: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    durationText: { type: String, default: '0m00s' },
    avgSpeedKmH: { type: Number, default: 0 },
    maxSpeedKmH: { type: Number, default: 0 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    startAddress: { type: String, default: '' },
    endAddress: { type: String, default: '' },
    startLat: { type: Number, required: true },
    startLng: { type: Number, required: true },
    endLat: { type: Number, required: true },
    endLng: { type: Number, required: true },
    routePoints: [
      {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        speed: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now },
        address: { type: String, default: '' },
      },
    ],
    stops: [
      {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        durationSeconds: { type: Number, default: 0 },
        durationText: { type: String, default: '0m00s' },
        address: { type: String, default: '' },
        hasWalking: { type: Boolean, default: false },
        startWalkTime: { type: Date },
        endWalkTime: { type: Date },
        walkDurationSeconds: { type: Number, default: 0 },
        walkDurationText: { type: String, default: '0m00s' },
        walkDistanceMeters: { type: Number, default: 0 },
        walkRadiusMeters: { type: Number, default: 0 },
      },
    ],
    date: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

DrivingTripSchema.index({ deviceId: 1, tripId: 1 }, { unique: true });
DrivingTripSchema.index({ deviceId: 1, date: 1, status: 1 });
DrivingTripSchema.index({ deviceId: 1, date: 1, startTime: -1 });
applyTtlIndex(DrivingTripSchema, 'startTime');

export const DrivingTrip = mongoose.model<IDrivingTrip>('DrivingTrip', DrivingTripSchema);
