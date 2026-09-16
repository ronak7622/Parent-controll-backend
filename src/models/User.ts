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
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
