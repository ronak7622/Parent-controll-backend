import { Config } from '../models/Config';

export const DEFAULT_OPTIONS = {
  recordVideoQualityOptions: [
    { key: 'lowest', label: 'Lowest (120p)', resolution: '160x120' },
    { key: 'low', label: 'Low (240p)', resolution: '320x240' },
    { key: 'medium', label: 'Medium (480p)', resolution: '640x480' },
    { key: 'high', label: 'High (720p HD)', resolution: '1280x720' },
    { key: 'ultra', label: 'Ultra (1080p Full HD)', resolution: '1920x1080' },
  ],
  recordVideoDefaultQuality: 'high',

  recordVideoIntervalOptions: [
    { seconds: 10, label: '10 sec' },
    { seconds: 15, label: '15 sec' },
    { seconds: 30, label: '30 sec' },
    { seconds: 60, label: '1 min' },
    { seconds: 120, label: '2 min' },
    { seconds: 300, label: '5 min' },
    { seconds: 600, label: '10 min' },
  ],
  recordVideoDefaultInterval: 120,

  recordScreenQualityOptions: [
    { key: 'lowest', label: 'Lowest (120p)', resolution: '160x120' },
    { key: 'low', label: 'Low (240p)', resolution: '320x240' },
    { key: 'medium', label: 'Medium (480p)', resolution: '640x480' },
    { key: 'high', label: 'High (720p HD)', resolution: '1280x720' },
    { key: 'ultra', label: 'Ultra (1080p Full HD)', resolution: '1920x1080' },
  ],
  recordScreenDefaultQuality: 'high',

  recordScreenIntervalOptions: [
    { seconds: 10, label: '10 sec' },
    { seconds: 15, label: '15 sec' },
    { seconds: 30, label: '30 sec' },
    { seconds: 60, label: '1 min' },
    { seconds: 120, label: '2 min' },
    { seconds: 300, label: '5 min' },
    { seconds: 600, label: '10 min' },
  ],
  recordScreenDefaultInterval: 60,

  recordAudioIntervalOptions: [
    { seconds: 10, label: '10 sec' },
    { seconds: 15, label: '15 sec' },
    { seconds: 30, label: '30 sec' },
    { seconds: 60, label: '1 min' },
    { seconds: 120, label: '2 min' },
    { seconds: 300, label: '5 min' },
    { seconds: 600, label: '10 min' },
  ],
  recordAudioDefaultInterval: 60,

  manualScreenshotQuality: 80,
  keywordTrackerScreenshotQuality: 80,

  scheduleScreenshotOptions: [
    { seconds: 150, label: '2.5 min', quality: 'lowest', qualityLabel: 'Lowest (120p)', approxSize: '15 KB' },
    { seconds: 300, label: '5 min', quality: 'low', qualityLabel: 'Low (240p)', approxSize: '25 KB' },
    { seconds: 600, label: '10 min', quality: 'medium', qualityLabel: 'Medium (480p)', approxSize: '35 KB' },
    { seconds: 900, label: '15 min', quality: 'good', qualityLabel: 'Good (720p)', approxSize: '45 KB' },
    { seconds: 1800, label: '30 min', quality: 'high', qualityLabel: 'High (720p HD)', approxSize: '60 KB' },
    { seconds: 3600, label: '1 hour', quality: 'ultra', qualityLabel: 'Ultra (1080p)', approxSize: '80 KB' },
  ],
  scheduleScreenshotDefaultInterval: 600,

  locTrackerIntervalOptions: [
    { seconds: 30, label: '30 sec' },
    { seconds: 60, label: '1 min' },
    { seconds: 120, label: '2 min' },
    { seconds: 300, label: '5 min' },
    { seconds: 600, label: '10 min' },
    { seconds: 900, label: '15 min' },
    { seconds: 1800, label: '30 min' },
    { seconds: 3600, label: '1 hour' },
  ],
  locTrackerDefaultInterval: 300,

  autoDeleteDayOptions: [
    { minutes: 5, label: '5 Minutes' },
    { minutes: 15, label: '15 Minutes' },
    { minutes: 30, label: '30 Minutes' },
    { minutes: 60, label: '1 Hour (60 min)' },
    { minutes: 180, label: '3 Hours (180 min)' },
    { minutes: 720, label: '12 Hours (720 min)' },
    { minutes: 1440, label: '24 Hours (1 Day)' },
    { minutes: 4320, label: '3 Days (4320 min)' },
    { minutes: 10080, label: '7 Days (10080 min)' },
    { minutes: 43200, label: '30 Days (43200 min)' },
  ],
  defaultAutoDeleteMinutes: 10080,

  autoDeleteCategories: [
    { key: 'all', label: 'All Media & Logs' },
    { key: 'photos', label: 'Photos & Screenshots' },
    { key: 'videos', label: 'Videos & Screen Captures' },
    { key: 'audio', label: 'Call & Mic Audio' },
    { key: 'text', label: 'Text & Database Logs' },
  ],
  defaultAutoDeleteCategory: 'all',

  syncIntervalMs: 300000,
  jitterWindowMs: 15000,
  storageWarnPercent: 80,
  storageWarnNotificationIntervalMin: 120,

  graceHoursOptions: [
    { hours: 24, days: 1, label: '24 Hours (1 Day)' },
    { hours: 48, days: 2, label: '48 Hours (2 Days)' },
    { hours: 72, days: 3, label: '72 Hours (3 Days)' },
    { hours: 120, days: 5, label: '120 Hours (5 Days)' },
    { hours: 168, days: 7, label: '168 Hours (7 Days)' },
  ],
  defaultGraceHours: 72,
  graceDays: 3,

  planValidityExpireNotificationIntervalMin: 120,
  liveSessionMaxMin: 5,
  liveVideoPerSessionLimitMin: 5,
  liveAudioPerSessionLimitMin: 5,
  liveScreenMirrorPerSessionLimitMin: 5,
  showStorageAddonPlanForFirst: true,
  showLiveLimitAddonPlanForFirst: true,
  showStorageAddonPlanForRenew: true,
  showLiveLimitAddonPlanForRenew: true,

  trialPlanConfig: {
    name: '3-Day Free Trial',
    durationUnit: 'days', // 'days' | 'hours'
    durationValue: 3,     // e.g. 3 days or 72 hours
    storageBytes: 2147483648, // 2 GB
    liveMinutes: 15,
    deviceLimit: 1,
  },

  regionTierMap: {
    IN: 'IN_INR',
    PK: 'LOW_USD',
    BD: 'LOW_USD',
    LK: 'LOW_USD',
    NP: 'LOW_USD',
    US: 'HIGH_USD',
    GB: 'HIGH_USD',
    CA: 'HIGH_USD',
    AU: 'HIGH_USD',
    AE: 'HIGH_USD',
    RU: 'HIGH_USD',
    DEFAULT: 'HIGH_USD',
  },
};

export class ConfigService {
  private static cachedConfig: Record<string, any> | null = null;
  private static lastFetch: number = 0;
  private static TTL_MS = 60000; // 1 min in-memory cache

  static async getMergedOptions(): Promise<Record<string, any>> {
    const now = Date.now();
    if (this.cachedConfig && now - this.lastFetch < this.TTL_MS) {
      return this.cachedConfig;
    }

    try {
      // Purge legacy key documents if present in Mongo
      await Config.deleteMany({
        key: {
          $in: [
            'manualScreenshotDefaultQuality',
            'keywordTrackerScreenshotDefaultQuality',
            'manualScreenshotQualityOptions',
            'keywordTrackerScreenshotQualityOptions',
            'defaultAutoDeleteDays',
          ],
        },
      });

      const dbConfigs = await Config.find().lean();
      const existingKeys = new Set(dbConfigs.map((item) => item.key));

      const missingDocs: { key: string; value: any }[] = [];
      for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
        if (!existingKeys.has(key)) {
          missingDocs.push({ key, value });
        }
      }

      if (missingDocs.length > 0) {
        await Config.insertMany(missingDocs);
        const updatedDbConfigs = await Config.find().lean();
        const dbMap: Record<string, any> = {};
        for (const item of updatedDbConfigs) {
          dbMap[item.key] = item.value;
        }
        this.cachedConfig = { ...DEFAULT_OPTIONS, ...dbMap };
      } else {
        const dbMap: Record<string, any> = {};
        for (const item of dbConfigs) {
          dbMap[item.key] = item.value;
        }
        this.cachedConfig = { ...DEFAULT_OPTIONS, ...dbMap };
      }

      this.lastFetch = now;
      return this.cachedConfig;
    } catch (err) {
      return DEFAULT_OPTIONS;
    }
  }

  static async setOption(key: string, value: any): Promise<void> {
    await Config.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true }
    );
    this.cachedConfig = null;
  }
}
