import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  parentUserId: mongoose.Types.ObjectId;
  deviceName: string;
  deviceModel: string;
  deviceBrand: string;
  osType: 'android' | 'ios';
  pairingCode?: string;
  isPaired: boolean;
  batteryLevel: number;
  isCharging: boolean;
  isOnline: boolean;
  lastSeenAt: Date;
  fcmToken?: string;
  
  // Settings & Restrictions
  youtubeBlocked: boolean;
  youtubeShortsBlocked: boolean;
  youtubeRestrictedMode: boolean;
  youtubeBlockedKeywords: string[];
  
  browserRestrictionMode: 'unrestricted' | 'blacklist' | 'whitelist';
  browserBlacklist: string[];
  browserWhitelist: string[];
  browserBlockedCategories: string[];
  
  blockedApps: string[];
  
  // Captures & Timer Rules
  screenshotTimerMinutes: number; // 0 = disabled, 1, 2, 5...
  frontPhotoTimerMinutes: number;
  backPhotoTimerMinutes: number;

  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    deviceName: { type: String, default: 'Child Device' },
    deviceModel: { type: String, default: '' },
    deviceBrand: { type: String, default: '' },
    osType: { type: String, enum: ['android', 'ios'], default: 'android' },
    pairingCode: { type: String },
    isPaired: { type: Boolean, default: false },
    batteryLevel: { type: Number, default: 100 },
    isCharging: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    fcmToken: { type: String },
    
    youtubeBlocked: { type: Boolean, default: false },
    youtubeShortsBlocked: { type: Boolean, default: false },
    youtubeRestrictedMode: { type: Boolean, default: false },
    youtubeBlockedKeywords: [{ type: String }],
    
    browserRestrictionMode: { type: String, enum: ['unrestricted', 'blacklist', 'whitelist'], default: 'unrestricted' },
    browserBlacklist: [{ type: String }],
    browserWhitelist: [{ type: String }],
    browserBlockedCategories: [{ type: String }],
    
    blockedApps: [{ type: String }],
    
    screenshotTimerMinutes: { type: Number, default: 0 },
    frontPhotoTimerMinutes: { type: Number, default: 0 },
    backPhotoTimerMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
