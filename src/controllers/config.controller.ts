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
        privacyPolicyUrl: 'https://www.youtube.com',
        supportEmail: 'support@parentprotect.app',
        supportEmailSubject: 'Parent Protect Support Request',
        supportEmailBody: 'Hello Support Team,\n\nI need help with my Parent Protect account.\n\nAccount: {phone}\nDevice: {device}\n\nDetails:\n',
        appShareText: 'Protect your child online with Parent Protect. Download now: https://parentprotect.app',
        appShareUrl: 'https://parentprotect.app',
        serverTimestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
