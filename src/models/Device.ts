import mongoose, { Schema, Document } from 'mongoose';
import { decryptDeterministic, encryptDeterministic } from '../utils/crypto.utils';

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
  grantedPermissions?: Record<string, boolean>;
  batteryLevel: number;
  isCharging: boolean;
  isOnline: boolean;
  lastSeenAt: Date;
  fcmToken?: string;
  appVersionCode?: number;
  appVersionName?: string;
  languageCode?: string;
  timeZone?: string;
  timezone?: string;

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

  secretCode?: string;
  secureOurChildApp?: boolean;
  isAppHidden?: boolean;
  failedSecretCodeAttempts?: number;
  secretCodeBlockedUntil?: Date;
  appRemoved?: boolean;
  appRemovedAt?: Date | null;
  appRemovedNotifiedAt?: Date | null;
  adminDisabledAt?: Date | null;
  adminDisabledPendingRemoval?: boolean;
  childAppUpdateNotifiedAt?: Date | null;
  criticalPermissionsOff?: boolean;
  criticalPermissionsOffAt?: Date | null;
  criticalPermissionsNotifiedAt?: Date | null;
  locationDisabledAt?: Date | null;
  locationDisabledNotifiedAt?: Date | null;

  browserRestrictionMode: 'unrestricted' | 'blacklist' | 'whitelist';
  browserRestrictionsMode?: 'unrestricted' | 'blacklist' | 'whitelist';
  browserBlacklist: string[];
  browserWhitelist: string[];
  browserBlockedCategories: string[];
  
  blockedApps: string[];
  blockedPhoneNumbers: string[];
  blockedOutgoingPhoneNumbers: string[];
  lastCallHistoryClearedAt?: Date;
  clearedCallLogDates?: string[];
  lastSmsClearedAt?: Date;
  clearedSmsDates?: string[];
  lastBrowserClearedAt?: Date;
  clearedBrowserDates?: string[];
  lastYoutubeClearedAt?: Date;
  clearedYoutubeDates?: string[];
  lastLocationClearedAt?: Date;
  clearedLocationDates?: string[];
  lastNotificationClearedAt?: Date;
  clearedNotificationDates?: string[];
  lastKeyboardClearedAt?: Date;
  clearedKeyboardDates?: string[];
  lastDrivingClearedAt?: Date;
  clearedDrivingDates?: string[];
  lastAppUsageClearedAt?: Date;
  clearedAppUsageDates?: string[];

  // Call Recording Rules
  callRecordingMode?: 'all' | 'unknown' | 'contacts' | 'selected';
  callRecordingRecordUnknown?: boolean;
  callRecordingSelectedNumbers?: string[];

  // Per-Device Auto-Delete Config
  autoDeleteIsEnabled?: boolean;
  autoDeleteMinutes?: number;
  autoDeleteDays?: number;
  autoDeleteCategories?: string[];
  
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
  lastChatSyncTime?: Date;
  lastLocation?: {
    latitude: number | string;
    longitude: number | string;
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
    isInstalled?: boolean;
    uninstalledAt?: number | null;
  }[];
  uninstalledAppNotifiedList?: string[];
  installedAppNotifiedList?: string[];
  installedAppsSynced?: boolean;

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
    grantedPermissions: { type: Schema.Types.Mixed, default: {} },
    batteryLevel: { type: Number, default: 100 },
    isCharging: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    fcmToken: { type: String },
    timeZone: { type: String, default: 'Asia/Kolkata' },
    timezone: { type: String, default: 'Asia/Kolkata' },

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
    appRemoved: { type: Boolean, default: false },
    appRemovedAt: { type: Date, default: null },
    appRemovedNotifiedAt: { type: Date, default: null },
    adminDisabledAt: { type: Date, default: null },
    adminDisabledPendingRemoval: { type: Boolean, default: false },
    childAppUpdateNotifiedAt: { type: Date, default: null },
    criticalPermissionsOff: { type: Boolean, default: false },
    criticalPermissionsOffAt: { type: Date, default: null },
    criticalPermissionsNotifiedAt: { type: Date, default: null },
    locationDisabledAt: { type: Date, default: null },
    locationDisabledNotifiedAt: { type: Date, default: null },

    secretCode: { type: String, default: '' },
    secureOurChildApp: { type: Boolean, default: true },
    isAppHidden: { type: Boolean, default: false },
    failedSecretCodeAttempts: { type: Number, default: 0 },
    secretCodeBlockedUntil: { type: Date, default: null },

    appVersionCode: { type: Number, default: 0 },
    appVersionName: { type: String, default: '' },
    languageCode: { type: String, default: 'en' },

    browserRestrictionMode: { type: String, enum: ['unrestricted', 'blacklist', 'whitelist'], default: 'unrestricted' },
    browserRestrictionsMode: { type: String, enum: ['unrestricted', 'blacklist', 'whitelist'], default: 'unrestricted' },
    browserBlacklist: [{ type: String }],
    browserWhitelist: [{ type: String }],
    browserBlockedCategories: [{ type: String }],
    
    blockedApps: [{ type: String }],
    blockedPhoneNumbers: [{ type: String }],
    blockedOutgoingPhoneNumbers: [{ type: String }],
    lastCallHistoryClearedAt: { type: Date },
    clearedCallLogDates: [{ type: String }],
    lastSmsClearedAt: { type: Date },
    clearedSmsDates: [{ type: String }],
    lastBrowserClearedAt: { type: Date },
    clearedBrowserDates: [{ type: String }],
    lastYoutubeClearedAt: { type: Date },
    clearedYoutubeDates: [{ type: String }],
    lastLocationClearedAt: { type: Date },
    clearedLocationDates: [{ type: String }],
    lastNotificationClearedAt: { type: Date },
    clearedNotificationDates: [{ type: String }],
    lastKeyboardClearedAt: { type: Date },
    clearedKeyboardDates: [{ type: String }],
    lastDrivingClearedAt: { type: Date },
    clearedDrivingDates: [{ type: String }],
    lastAppUsageClearedAt: { type: Date },
    clearedAppUsageDates: [{ type: String }],

    callRecordingMode: { type: String, enum: ['all', 'unknown', 'contacts', 'selected'], default: 'all' },
    callRecordingRecordUnknown: { type: Boolean, default: false },
    callRecordingSelectedNumbers: [{ type: String }],

    autoDeleteIsEnabled: { type: Boolean, default: false },
    autoDeleteMinutes: { type: Number, default: 10080 },
    autoDeleteDays: { type: Number, default: 7 },
    autoDeleteCategories: { type: [String], default: ['all'] },
    
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
    lastChatSyncTime: { type: Date },
    lastLocation: {
      latitude: { type: Schema.Types.Mixed },
      longitude: { type: Schema.Types.Mixed },
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
        isInstalled: { type: Boolean, default: true },
        uninstalledAt: { type: Number, default: null },
      },
    ],
    uninstalledAppNotifiedList: [{ type: String }],
    installedAppNotifiedList: [{ type: String }],
    installedAppsSynced: { type: Boolean },
  },
  { timestamps: true }
);

// Pairing lookups do findOne({ pairingCode }) / $or:[{pairingCode},{deviceId}] on every
// pair/reconnect. Sparse because most devices have no pairingCode once paired -> smaller index.
DeviceSchema.index({ pairingCode: 1 }, { sparse: true });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);

/**
 * Returns true if the device's lastSeenAt is within the specified threshold (default 150 seconds).
 * Online/Offline status is derived dynamically with zero background cron costs.
 */
export function isDeviceFresh(
  dev: { lastSeenAt?: Date | string | null; lastSeen?: Date | string | null; appRemoved?: boolean; isOnline?: boolean } | null | undefined,
  thresholdSeconds: number = 150
): boolean {
  if (!dev) return false;
  if (dev.appRemoved === true) return false;
  if (dev.isOnline === false) return false;
  const rawDate = dev.lastSeenAt || dev.lastSeen;
  if (!rawDate) return false;
  const time = new Date(rawDate).getTime();
  if (isNaN(time)) return false;
  return (Date.now() - time) < (thresholdSeconds * 1000);
}

/**
 * Enriches a device object with dynamic derived isOnline and normalized lastSeen fields.
 */
export function enrichDeviceWithOnlineStatus<T extends Record<string, any>>(
  dev: T,
  thresholdSeconds: number = 150
): T & {
  isOnline: boolean;
  appRemoved: boolean;
  lastSeen?: any;
  lastSeenAt?: any;
  isCriticalPermissionsOff: boolean;
  disabledPermissionsCount: number;
  disabledPermissionsList: string[];
} {
  const isRemoved = dev.appRemoved === true;
  const isOnline = (isRemoved || dev.isOnline === false) ? false : isDeviceFresh(dev, thresholdSeconds);
  const rawDate = dev.lastSeenAt || dev.lastSeen;

  const perms = (dev as any).grantedPermissions || {};
  // Tier 2: Critical Permissions: ACCESSIBILITY, DEVICE_ADMIN
  // If either of these is explicitly false, critical permissions are OFF.
  const isAccessibilityOff = perms.ACCESSIBILITY === false;
  const isDeviceAdminOff = perms.DEVICE_ADMIN === false;
  const isSetupComplete = dev.isSetupComplete === true;
  const isCriticalPermissionsOff = !isRemoved && isSetupComplete && (isAccessibilityOff || isDeviceAdminOff);

  // Total disabled permissions (including critical & feature permissions)
  // Only evaluate for devices that have finished initial setup
  const disabledPermissionsList: string[] = [];
  if (!isRemoved && isSetupComplete) {
    const nonMinorKeys = new Set([


      'isAppHidden',
      'HIDE_APP',
      'secureOurChildApp',
      'SECURE_OUR_APP',
      'STORAGE',
      'LOCK_APP',
    ]);
    for (const [key, val] of Object.entries(perms)) {
      if (val === false && !nonMinorKeys.has(key)) {
        disabledPermissionsList.push(key);
      }
    }
  }

  const rawPairing = dev.pairingCode ? (decryptDeterministic(dev.pairingCode, 'system_pairing') || dev.pairingCode) : dev.pairingCode;
  
  // Auto-fallback for secretCode: decrypt if encrypted; if legacy scrypt hash or missing, fallback to pairingCode
  let secCode = '';
  if (dev.secretCode && String(dev.secretCode).trim().length > 0) {
    const rawSec = String(dev.secretCode).trim();
    if (rawSec.startsWith('scrypt:')) {
      // Legacy one-way hash cannot be reversed; fallback to plain pairing code so UI does not overflow
      secCode = (rawPairing && String(rawPairing).trim().length > 0) ? String(rawPairing).trim() : '';
    } else {
      secCode = decryptDeterministic(rawSec, dev.deviceId) || rawSec;
    }
  } else {
    secCode = (rawPairing && String(rawPairing).trim().length > 0) ? String(rawPairing).trim() : '';
  }

  // Self-heal database: if secretCode was empty or had legacy scrypt hash, store deterministic encrypted PIN
  if (secCode.length > 0 && dev._id && (!dev.secretCode || dev.secretCode.startsWith('scrypt:'))) {
    const encSecret = encryptDeterministic(secCode, dev.deviceId);
    Device.updateOne({ _id: dev._id }, { $set: { secretCode: encSecret } }).catch(() => {});
  }

  return {
    ...dev,
    pairingCode: rawPairing,
    browserBlacklist: Array.isArray(dev.browserBlacklist) ? dev.browserBlacklist.map((b: string) => decryptDeterministic(b, dev.deviceId) || b) : dev.browserBlacklist,
    browserWhitelist: Array.isArray(dev.browserWhitelist) ? dev.browserWhitelist.map((w: string) => decryptDeterministic(w, dev.deviceId) || w) : dev.browserWhitelist,
    youtubeBlockedKeywords: Array.isArray(dev.youtubeBlockedKeywords) ? dev.youtubeBlockedKeywords.map((k: string) => decryptDeterministic(k, dev.deviceId) || k) : dev.youtubeBlockedKeywords,
    blockedPhoneNumbers: Array.isArray(dev.blockedPhoneNumbers) ? dev.blockedPhoneNumbers.map((p: string) => decryptDeterministic(p, dev.deviceId) || p) : dev.blockedPhoneNumbers,
    blockedOutgoingPhoneNumbers: Array.isArray(dev.blockedOutgoingPhoneNumbers) ? dev.blockedOutgoingPhoneNumbers.map((p: string) => decryptDeterministic(p, dev.deviceId) || p) : dev.blockedOutgoingPhoneNumbers,
    monitoredKeywords: Array.isArray(dev.monitoredKeywords) ? dev.monitoredKeywords.map((m: string) => decryptDeterministic(m, dev.deviceId) || m) : dev.monitoredKeywords,
    secretCode: secCode,
    isOnline: (isRemoved || dev.isOnline === false) ? false : isOnline,
    appRemoved: isRemoved,
    appRemovedAt: dev.appRemovedAt || null,
    isCriticalPermissionsOff,
    criticalPermissionsOffAt: dev.criticalPermissionsOffAt || null,
    disabledPermissionsCount: disabledPermissionsList.length,
    disabledPermissionsList,
    lastSeen: rawDate,
    lastSeenAt: rawDate,
  };
}

