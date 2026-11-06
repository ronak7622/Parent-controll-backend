import { Request, Response } from 'express';
import { config } from '../config/env';

/**
 * Dynamic Remote Config API Endpoint for Child and Parent Mobile Apps
 * Returns runtime server configurations, limits, and feature flags.
 */
export const getRemoteConfig = async (req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      config: {
        presignedUploadsEnabled: config.flags.enablePresignedUploads,
        cdnPublicDomain: config.cdnPublicDomain || null,
        syncIntervalSeconds: 3600, // 1 hour per-feature sync cycle
        historyFetchLimitDays: 15, // Local date filter baseline
        liveFeatureRules: {
          dailyMaxUsageMinutes: 60, // 1 hour daily total for live features
          perSessionMaxMinutes: 10, // 10 minutes per session limit
          autoStopAfterMinutes: 10,
        },
        storagePlans: {
          monthlyStorageGb: 20,
          yearlyStorageGb: 20, // 20GB per month
          warningThresholdPercent: 70, // Highlight warning when 70%+ storage used
          planGracePeriodDays: 3, // 3 days grace period after expiry before data deletion
        },
        featuresEnabled: {
          liveAudio: true,
          liveVideo: true,
          liveScreen: true,
          locationTracker: true,
          drivingDetection: true,
          youtubeTracker: true,
          appLimits: true,
          autoDeleteMode: true,
        },
        thunderingHerdProtection: {
          reconnectJitterMaxSeconds: 300, // 0-5 min random delay on connectivity restored
          fcmSyncJitterMaxSeconds: 30, // 0-30 sec random delay on FCM push sync
          gzipCompressionSupported: true, // Enable gzip request body compression
        },
        privacyPolicyUrl: 'https://parentprotect.app/privacy',
        supportEmail: 'support@parentprotect.app',
        supportEmailSubject: 'Parent Protect Support Request',
        supportEmailBody: 'Hello Support Team,\n\nI need help with my Parent Protect account.\n\nAccount: {phone}\nDevice: {device}\n\nDetails:\n',
        appShareText: 'Protect your child online with Parent Protect. Download now: https://parentprotect.app',
        appShareUrl: 'https://parentprotect.app',
        supportedLanguages: [
          { code: 'en', name: 'English', nativeName: 'English', isActive: true },
          { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', isActive: true },
          { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', isActive: true },
          { code: 'es', name: 'Spanish', nativeName: 'Español', isActive: true },
          { code: 'fr', name: 'French', nativeName: 'Français', isActive: true },
        ],
        serverTimestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export interface PermissionCatalogItem {
  key: string;
  label: string;
  description: string;
  emoji: string;
  critical: boolean;
  androidOnly?: boolean;
  isProtectionToggle?: boolean;
}

export const CANONICAL_PERMISSION_CATALOG: PermissionCatalogItem[] = [
  {
    key: 'MICROPHONE',
    label: 'Microphone Access',
    description: 'Real-time audio monitoring & environmental listening',
    emoji: '🎙️',
    critical: false,
    androidOnly: false,
  },
  {
    key: 'CAMERA',
    label: 'Camera Access',
    description: 'Live camera stream and remote snapshots',
    emoji: '📷',
    critical: false,
    androidOnly: false,
  },
  {
    key: 'CALL_LOG',
    label: 'Call Logs',
    description: 'Monitor incoming and outgoing call history',
    emoji: '📞',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'CONTACTS',
    label: 'Contacts Access',
    description: 'Monitor address book and caller identification',
    emoji: '👥',
    critical: false,
    androidOnly: false,
  },
  {
    key: 'SMS',
    label: 'SMS Messages',
    description: 'Monitor incoming and outgoing text messages',
    emoji: '💬',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'LOCATION',
    label: 'Background GPS Location',
    description: 'Always-on precise GPS child tracking',
    emoji: '📍',
    critical: false,
    androidOnly: false,
  },
  {
    key: 'DISPLAY_OVER_APPS',
    label: 'Display Over Other Apps',
    description: 'Lock screen and app blocking overlays',
    emoji: '🪟',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'USAGE_ACCESS',
    label: 'App Usage Access',
    description: 'Track screen time and app usage activity',
    emoji: '📊',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'NOTIFICATION_ACCESS',
    label: 'Notification Listener',
    description: 'Capture incoming notifications and chats',
    emoji: '🔔',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'ACCESSIBILITY',
    label: 'Accessibility Service',
    description: 'Core protection, keystroke logging, app lock',
    emoji: '♿',
    critical: true,
    androidOnly: true,
  },
  {
    key: 'SCREEN_CAPTURE',
    label: 'Screen Capture',
    description: 'Live screen monitoring and capture',
    emoji: '📸',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'DEVICE_ADMIN',
    label: 'Device Administrator',
    description: 'Anti-uninstall and anti-tamper security',
    emoji: '🔒',
    critical: true,
    androidOnly: true,
  },
  {
    key: 'BACKGROUND_RUNNING',
    label: 'Battery Optimization Disabled',
    description: 'Keep child protection running continuously in background',
    emoji: '🔋',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'BATTERY_UNRESTRICTED',
    label: 'Unrestricted Battery Usage',
    description: 'Prevent OEM task killers from stopping protection',
    emoji: '♾️',
    critical: false,
    androidOnly: true,
  },
  {
    key: 'SECURE_OUR_APP',
    label: 'Child App Tamper Protection',
    description: 'Prevent unauthorized app stoppage or data clearing',
    emoji: '🛡️',
    critical: false,
    androidOnly: true,
    isProtectionToggle: true,
  },
  {
    key: 'HIDE_APP',
    label: 'Discreet App Icon',
    description: 'Hide companion app icon from launcher',
    emoji: '🕶️',
    critical: false,
    androidOnly: true,
    isProtectionToggle: true,
  },
];

export const getPermissionCatalog = async (req: Request, res: Response) => {
  return res.json({
    success: true,
    permissions: CANONICAL_PERMISSION_CATALOG,
  });
};
