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
  isSetupComplete: boolean;
  batteryLevel: number;
  isCharging: boolean;
  isOnline: boolean;
  lastSeenAt: Date;
  fcmToken?: string;

  // Settings & Restrictions
  youtubeBlocked: boolean;
  youtubeShortsBlocked: boolean;
  youtubeBlockSchedule?: any;
  youtubeShortsBlockSchedule?: any;
  youtubeRestrictedMode: boolean;
  youtubeBlockedKeywords: string[];
  monitoredKeywords?: string[];
  
  preventNotificationDisable: boolean;
  preventLocationDisable: boolean;
  isLocationEnabled?: boolean;
  locationEnabled?: boolean;
  notifyOnBlockedUrlAttempt: boolean;

  browserRestrictionMode: 'unrestricted' | 'blacklist' | 'whitelist';
  browserRestrictionsMode?: 'unrestricted' | 'blacklist' | 'whitelist';
  browserBlacklist: string[];
  browserWhitelist: string[];
  browserBlockedCategories: string[];
  
  blockedApps: string[];
  blockedPhoneNumbers: string[];
  blockedOutgoingPhoneNumbers: string[];
  lastCallHistoryClearedAt?: Date;

  // Call Recording Rules
  callRecordingMode?: 'all' | 'unknown' | 'contacts' | 'selected';
  callRecordingRecordUnknown?: boolean;
  callRecordingSelectedNumbers?: string[];
  
  // Captures & Timer Rules
  screenshotTimerMinutes: number; // 0 = disabled, 1, 2, 5...
  frontPhotoTimerMinutes: number;
  backPhotoTimerMinutes: number;
  locationIntervalSeconds?: number;
  locationInterval?: string;

  // 30-Day Usage Sync Tracking
  isSyncingPastUsage?: boolean;
  pastUsageSynced?: boolean;
  lastUsageSyncTime?: Date;
  lastNotificationSyncTime?: Date;
  lastYoutubeSyncTime?: Date;
  lastMessageSyncTime?: Date;
  lastLocationSyncTime?: Date;
  lastKeyboardSyncTime?: Date;
  lastLocation?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    address?: string;
    activityType?: string;
    isMoving?: boolean;
    batteryLevel?: number;
    updatedAt: Date;
  };

  // Installed User-Facing Apps on Child Device
  installedApps?: {
    packageName: string;
    appName: string;
    appIcon?: string;
    versionName?: string;
    versionCode?: number;
    firstInstallTime?: number;
    lastUpdateTime?: number;
    permissions?: string[];
    grantedPermissions?: string[];
    isSystemApp?: boolean;
    category?: string;
    targetSdkVersion?: number;
    minSdkVersion?: number;
    installerPackage?: string;
    apkSizeBytes?: number; // actual on-disk installed size (can be larger than Play Store's download size)
    apkDownloadSizeBytes?: number; // approx. compressed transfer size (closer to what Play Store shows)
    isEnabled?: boolean;
  }[];

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
    isSetupComplete: { type: Boolean, default: false },
    batteryLevel: { type: Number, default: 100 },
    isCharging: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    fcmToken: { type: String },

    youtubeBlocked: { type: Boolean, default: false },
    youtubeShortsBlocked: { type: Boolean, default: false },
    youtubeBlockSchedule: { type: Schema.Types.Mixed, default: null },
    youtubeShortsBlockSchedule: { type: Schema.Types.Mixed, default: null },
    youtubeRestrictedMode: { type: Boolean, default: false },
    youtubeBlockedKeywords: [{ type: String }],
    monitoredKeywords: [{ type: String }],
    
    preventNotificationDisable: { type: Boolean, default: false },
    preventLocationDisable: { type: Boolean, default: true },
    isLocationEnabled: { type: Boolean, default: true },
    locationEnabled: { type: Boolean, default: true },
    notifyOnBlockedUrlAttempt: { type: Boolean, default: true },

    browserRestrictionMode: { type: String, enum: ['unrestricted', 'blacklist', 'whitelist'], default: 'unrestricted' },
    browserRestrictionsMode: { type: String, enum: ['unrestricted', 'blacklist', 'whitelist'], default: 'unrestricted' },
    browserBlacklist: [{ type: String }],
    browserWhitelist: [{ type: String }],
    browserBlockedCategories: [{ type: String }],
    
    blockedApps: [{ type: String }],
    blockedPhoneNumbers: [{ type: String }],
    blockedOutgoingPhoneNumbers: [{ type: String }],
    lastCallHistoryClearedAt: { type: Date },

    callRecordingMode: { type: String, enum: ['all', 'unknown', 'contacts', 'selected'], default: 'all' },
    callRecordingRecordUnknown: { type: Boolean, default: false },
    callRecordingSelectedNumbers: [{ type: String }],
    
    screenshotTimerMinutes: { type: Number, default: 0 },
    frontPhotoTimerMinutes: { type: Number, default: 0 },
    backPhotoTimerMinutes: { type: Number, default: 0 },
    locationIntervalSeconds: { type: Number, default: 1800 },
    locationInterval: { type: String, default: '30m' },

    isSyncingPastUsage: { type: Boolean, default: false },
    pastUsageSynced: { type: Boolean, default: false },
    lastUsageSyncTime: { type: Date },
    lastNotificationSyncTime: { type: Date },
    lastYoutubeSyncTime: { type: Date },
    lastMessageSyncTime: { type: Date },
    lastLocationSyncTime: { type: Date },
    lastKeyboardSyncTime: { type: Date },
    lastLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      altitude: { type: Number },
      speed: { type: Number },
      heading: { type: Number },
      accuracy: { type: Number },
      address: { type: String },
      activityType: { type: String },
      isMoving: { type: Boolean },
      batteryLevel: { type: Number },
      updatedAt: { type: Date, default: Date.now },
    },

    installedApps: [
      {
        packageName: { type: String, required: true },
        appName: { type: String, required: true },
        appIcon: { type: String },
        versionName: { type: String },
        versionCode: { type: Number },
        firstInstallTime: { type: Number },
        lastUpdateTime: { type: Number },
        permissions: [{ type: String }],
        grantedPermissions: [{ type: String }],
        isSystemApp: { type: Boolean },
        category: { type: String },
        targetSdkVersion: { type: Number },
        minSdkVersion: { type: Number },
        installerPackage: { type: String },
        apkSizeBytes: { type: Number },
        apkDownloadSizeBytes: { type: Number },
        isEnabled: { type: Boolean },
      },
    ],
  },
  { timestamps: true }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
