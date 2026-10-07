import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  otp?: string;
  otpExpiresAt?: Date;
  otpAttemptsCount?: number;
  lastOtpRequestedAt?: Date;
  isVerified: boolean;
  name?: string;
  email?: string;
  planType?: 'free' | 'monthly' | 'yearly';
  planExpiresAt?: Date;
  planGracePeriodEndsAt?: Date;
  storageQuotaBytes?: number; // 20GB default
  addonStorageBytes?: number;
  autoDeleteMode?: boolean;
  autoDeleteDays?: number;
  autoDeleteIsEnabled?: boolean;
  autoDeleteMinutes?: number;
  autoDeleteCategories?: string[];
  autoDeleteDeviceIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phoneNumber: { type: String, required: true, unique: true, index: true },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    otpAttemptsCount: { type: Number, default: 0 },
    lastOtpRequestedAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    name: { type: String },
    email: { type: String },
    planType: { type: String, enum: ['free', 'monthly', 'yearly'], default: 'monthly' },
    planExpiresAt: { type: Date },
    planGracePeriodEndsAt: { type: Date },
    storageQuotaBytes: { type: Number, default: 21474836480 }, // 20 GB
    addonStorageBytes: { type: Number, default: 0 },
    autoDeleteMode: { type: Boolean, default: true },
    autoDeleteDays: { type: Number, default: 30 },
    autoDeleteIsEnabled: { type: Boolean, default: false },
    autoDeleteMinutes: { type: Number, default: 10080 },
    autoDeleteCategories: [{ type: String, default: ['all'] }],
    autoDeleteDeviceIds: [{ type: String }],
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
