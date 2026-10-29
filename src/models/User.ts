import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phoneNumber?: string;
  firebaseUid?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerified?: boolean;
  password?: string;
  primaryProvider?: string;
  linkedProviders?: string[];
  otp?: string;
  otpExpiresAt?: Date;
  otpAttemptsCount?: number;
  lastOtpRequestedAt?: Date;
  isVerified: boolean;
  name?: string;
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
  languageCode?: string;
  fcmToken?: string;
  currentSessionId?: string;
  currentDeviceName?: string;
  lastActivePlatform?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phoneNumber: { type: String, required: false, sparse: true, index: true },
    firebaseUid: { type: String, required: false, sparse: true, unique: true, index: true },
    email: { type: String, required: false, sparse: true, unique: true, index: true, lowercase: true, trim: true },
    normalizedEmail: { type: String, required: false, sparse: true, index: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    primaryProvider: { type: String },
    linkedProviders: [{ type: String }],
    otp: { type: String },
    otpExpiresAt: { type: Date },
    otpAttemptsCount: { type: Number, default: 0 },
    lastOtpRequestedAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    name: { type: String },
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
    languageCode: { type: String, default: 'en' },
    fcmToken: { type: String },
    currentSessionId: { type: String },
    currentDeviceName: { type: String },
    lastActivePlatform: { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
