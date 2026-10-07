import mongoose, { Schema, Document } from 'mongoose';

export interface IPerDeviceUsage {
  deviceId: string;
  videoBytes: number;
  audioBytes: number;
  photoBytes: number;
  textBytes: number;
  totalBytes: number;
}

export interface IStorageUsage extends Document {
  parentUserId: string;
  totalBytes: number;
  videoBytes: number;
  audioBytes: number;
  photoBytes: number;
  textBytes: number;
  perDevice: IPerDeviceUsage[];
  updatedAt: Date;
}

const PerDeviceUsageSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true },
    videoBytes: { type: Number, default: 0 },
    audioBytes: { type: Number, default: 0 },
    photoBytes: { type: Number, default: 0 },
    textBytes: { type: Number, default: 0 },
    totalBytes: { type: Number, default: 0 },
  },
  { _id: false }
);

const StorageUsageSchema: Schema = new Schema(
  {
    parentUserId: { type: String, required: true, unique: true, index: true },
    totalBytes: { type: Number, default: 0, index: true },
    videoBytes: { type: Number, default: 0 },
    audioBytes: { type: Number, default: 0 },
    photoBytes: { type: Number, default: 0 },
    textBytes: { type: Number, default: 0 },
    perDevice: [PerDeviceUsageSchema],
  },
  { timestamps: true }
);

export const StorageUsage = mongoose.model<IStorageUsage>('StorageUsage', StorageUsageSchema);
