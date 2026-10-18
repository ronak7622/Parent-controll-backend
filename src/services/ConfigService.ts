import { Config } from '../models/Config';

export const DEFAULT_OPTIONS = {
  supportedLanguages: [
    { code: 'en', name: 'English', nativeName: 'English', isActive: true },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', isActive: true },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', isActive: true },
    { code: 'es', name: 'Spanish', nativeName: 'Español', isActive: true },
    { code: 'fr', name: 'French', nativeName: 'Français', isActive: true },
  ],
  recordVideoQualityOptions: [
    {
      key: '480',
      value: 480,
      label: 'Medium (480p)',
      label_i18n: { en: 'Medium (480p)', hi: 'मध्यम (480p)', gu: 'મધ્યમ (480p)', es: 'Media (480p)', fr: 'Moyenne (480p)' },
      resolution: '640x480',
    },
    {
      key: '720',
      value: 720,
      label: 'High (720p HD)',
      label_i18n: { en: 'High (720p HD)', hi: 'उच्च (720p HD)', gu: 'ઉચ્ચ (720p HD)', es: 'Alta (720p HD)', fr: 'Haute (720p HD)' },
      resolution: '1280x720',
    },
    {
      key: '1080',
      value: 1080,
      label: 'Ultra (1080p Full HD)',
      label_i18n: { en: 'Ultra (1080p Full HD)', hi: 'अल्ट्रा (1080p Full HD)', gu: 'અલ્ટ્રા (1080p Full HD)', es: 'Ultra (1080p Full HD)', fr: 'Ultra (1080p Full HD)' },
      resolution: '1920x1080',
    },
  ],
  recordVideoDefaultQuality: '720',

  recordVideoIntervalOptions: [
    { seconds: 10,  label: '10 sec', label_i18n: { en: '10 sec',  hi: '10 सेकंड', gu: '10 સેકન્ડ', es: '10 seg', fr: '10 sec' } },
    { seconds: 15,  label: '15 sec', label_i18n: { en: '15 sec',  hi: '15 सेकंड', gu: '15 સેકન્ડ', es: '15 seg', fr: '15 sec' } },
    { seconds: 30,  label: '30 sec', label_i18n: { en: '30 sec',  hi: '30 सेकंड', gu: '30 સેકન્ડ', es: '30 seg', fr: '30 sec' } },
    { seconds: 60,  label: '1 min',  label_i18n: { en: '1 min',   hi: '1 मिनट',  gu: '1 મિનિટ', es: '1 min', fr: '1 min' } },
    { seconds: 120, label: '2 min',  label_i18n: { en: '2 min',   hi: '2 मिनट',  gu: '2 મિનિટ', es: '2 min', fr: '2 min' } },
    { seconds: 300, label: '5 min',  label_i18n: { en: '5 min',   hi: '5 मिनट',  gu: '5 મિનિટ', es: '5 min', fr: '5 min' } },
    { seconds: 600, label: '10 min', label_i18n: { en: '10 min',  hi: '10 मिनट', gu: '10 મિનિટ', es: '10 min', fr: '10 min' } },
  ],
  recordVideoDefaultInterval: 60,

  recordScreenQualityOptions: [
    {
      key: '360',
      value: 360,
      label: 'Low (360p)',
      label_i18n: { en: 'Low (360p)', hi: 'कम (360p)', gu: 'ઓછી (360p)', es: 'Baja (360p)', fr: 'Basse (360p)' },
      resolution: '640x360',
    },
    {
      key: '480',
      value: 480,
      label: 'Medium (480p)',
      label_i18n: { en: 'Medium (480p)', hi: 'मध्यम (480p)', gu: 'મધ્યમ (480p)', es: 'Media (480p)', fr: 'Moyenne (480p)' },
      resolution: '640x480',
    },
    {
      key: '720',
      value: 720,
      label: 'High (720p HD)',
      label_i18n: { en: 'High (720p HD)', hi: 'उच्च (720p HD)', gu: 'ઉચ્ચ (720p HD)', es: 'Alta (720p HD)', fr: 'Haute (720p HD)' },
      resolution: '1280x720',
    },
    {
      key: '1080',
      value: 1080,
      label: 'Ultra (1080p Full HD)',
      label_i18n: { en: 'Ultra (1080p Full HD)', hi: 'अल्ट्रा (1080p Full HD)', gu: 'અલ્ટ્રા (1080p Full HD)', es: 'Ultra (1080p Full HD)', fr: 'Ultra (1080p Full HD)' },
      resolution: '1920x1080',
    },
  ],
  recordScreenDefaultQuality: '720',

  recordScreenIntervalOptions: [
    { seconds: 10,  label: '10 sec', label_i18n: { en: '10 sec',  hi: '10 सेकंड', gu: '10 સેકન્ડ', es: '10 seg', fr: '10 sec' } },
    { seconds: 15,  label: '15 sec', label_i18n: { en: '15 sec',  hi: '15 सेकंड', gu: '15 સેકન્ડ', es: '15 seg', fr: '15 sec' } },
    { seconds: 30,  label: '30 sec', label_i18n: { en: '30 sec',  hi: '30 सेकंड', gu: '30 સેકન્ડ', es: '30 seg', fr: '30 sec' } },
    { seconds: 60,  label: '1 min',  label_i18n: { en: '1 min',   hi: '1 मिनट',  gu: '1 મિનિટ', es: '1 min', fr: '1 min' } },
    { seconds: 120, label: '2 min',  label_i18n: { en: '2 min',   hi: '2 मिनट',  gu: '2 મિનિટ', es: '2 min', fr: '2 min' } },
    { seconds: 300, label: '5 min',  label_i18n: { en: '5 min',   hi: '5 मिनट',  gu: '5 મિનિટ', es: '5 min', fr: '5 min' } },
    { seconds: 600, label: '10 min', label_i18n: { en: '10 min',  hi: '10 मिनट', gu: '10 મિનિટ', es: '10 min', fr: '10 min' } },
  ],
  recordScreenDefaultInterval: 60,

  recordAudioIntervalOptions: [
    { seconds: 10, label: '10 sec', label_i18n: { en: '10 sec', hi: '10 सेकंड', gu: '10 સેકન્ડ', es: '10 seg', fr: '10 sec' } },
    { seconds: 15, label: '15 sec', label_i18n: { en: '15 sec', hi: '15 सेकंड', gu: '15 સેકન્ડ', es: '15 seg', fr: '15 sec' } },
    { seconds: 30, label: '30 sec', label_i18n: { en: '30 sec', hi: '30 सेकंड', gu: '30 સેકન્ડ', es: '30 seg', fr: '30 sec' } },
    { seconds: 60, label: '1 min', label_i18n: { en: '1 min', hi: '1 मिनट', gu: '1 મિનિટ', es: '1 min', fr: '1 min' } },
    { seconds: 120, label: '2 min', label_i18n: { en: '2 min', hi: '2 मिनट', gu: '2 મિનિટ', es: '2 min', fr: '2 min' } },
    { seconds: 300, label: '5 min', label_i18n: { en: '5 min', hi: '5 मिनट', gu: '5 મિનિટ', es: '5 min', fr: '5 min' } },
    { seconds: 600, label: '10 min', label_i18n: { en: '10 min', hi: '10 मिनट', gu: '10 મિનિટ', es: '10 min', fr: '10 min' } },
  ],
  recordAudioDefaultInterval: 60,

  manualScreenshotQuality: 80,
  keywordTrackerScreenshotQuality: 80,
  scheduleScreenshotOptions: [
    {
      seconds: 150,
      label: '2.5 min',
      label_i18n: { en: '2.5 min', hi: '2.5 मिनट', gu: '2.5 મિનિટ', es: '2.5 min', fr: '2,5 min' },
      quality: 120,
      qualityLabel: 'Lowest (120p)',
      qualityLabel_i18n: { en: 'Lowest (120p)', hi: 'सबसे कम (120p)', gu: 'સૌથી ઓછી (120p)', es: 'La más baja (120p)', fr: 'Très basse (120p)' },
      approxSize: '15 KB',
    },
    {
      seconds: 300,
      label: '5 min',
      label_i18n: { en: '5 min', hi: '5 मिनट', gu: '5 મિનિટ', es: '5 min', fr: '5 min' },
      quality: 240,
      qualityLabel: 'Low (240p)',
      qualityLabel_i18n: { en: 'Low (240p)', hi: 'कम (240p)', gu: 'ઓછી (240p)', es: 'Baja (240p)', fr: 'Basse (240p)' },
      approxSize: '25 KB',
    },
    {
      seconds: 600,
      label: '10 min',
      label_i18n: { en: '10 min', hi: '10 मिनट', gu: '10 મિનિટ', es: '10 min', fr: '10 min' },
      quality: 480,
      qualityLabel: 'Medium (480p)',
      qualityLabel_i18n: { en: 'Medium (480p)', hi: 'मध्यम (480p)', gu: 'મધ્યમ (480p)', es: 'Media (480p)', fr: 'Moyenne (480p)' },
      approxSize: '35 KB',
    },
    {
      seconds: 900,
      label: '15 min',
      label_i18n: { en: '15 min', hi: '15 मिनट', gu: '15 મિનિટ', es: '15 min', fr: '15 min' },
      quality: 720,
      qualityLabel: 'Good (720p)',
      qualityLabel_i18n: { en: 'Good (720p)', hi: 'अच्छा (720p)', gu: 'સારી (720p)', es: 'Buena (720p)', fr: 'Bonne (720p)' },
      approxSize: '45 KB',
    },
    {
      seconds: 1800,
      label: '30 min',
      label_i18n: { en: '30 min', hi: '30 मिनट', gu: '30 મિનિટ', es: '30 min', fr: '30 min' },
      quality: 720,
      qualityLabel: 'High (720p HD)',
      qualityLabel_i18n: { en: 'High (720p HD)', hi: 'उच्च (720p HD)', gu: 'ઉચ્ચ (720p HD)', es: 'Alta (720p HD)', fr: 'Haute (720p HD)' },
      approxSize: '60 KB',
    },
    {
      seconds: 3600,
      label: '1 hour',
      label_i18n: { en: '1 hour', hi: '1 घंटा', gu: '1 કલાક', es: '1 hora', fr: '1 heure' },
      quality: 1080,
      qualityLabel: 'Ultra (1080p)',
      qualityLabel_i18n: { en: 'Ultra (1080p)', hi: 'अल्ट्रा (1080p)', gu: 'અલ્ટ્રા (1080p)', es: 'Ultra (1080p)', fr: 'Ultra (1080p)' },
      approxSize: '80 KB',
    },
  ],
  scheduleScreenshotDefaultInterval: 600,



  locTrackerIntervalOptions: [
    { seconds: 300, label: '5 min', label_i18n: { hi: '5 मिनट', gu: '5 મિનિટ', es: '5 min', fr: '5 min' } },
    { seconds: 600, label: '10 min', label_i18n: { hi: '10 मिनट', gu: '10 મિનિટ', es: '10 min', fr: '10 min' } },
    { seconds: 900, label: '15 min', label_i18n: { hi: '15 मिनट', gu: '15 મિનિટ', es: '15 min', fr: '15 min' } },
    { seconds: 1800, label: '30 min', label_i18n: { hi: '30 मिनट', gu: '30 મિનિટ', es: '30 min', fr: '30 min' } },
    { seconds: 3600, label: '1 hour', label_i18n: { hi: '1 घंटा', gu: '1 કલાક', es: '1 hora', fr: '1 heure' } },
  ],
  locTrackerDefaultInterval: 1800,

  autoDeleteDayOptions: [
    {
      minutes: 1440,
      label: '24 Hours (1 Day)',
      label_i18n: { hi: '24 घंटे (1 दिन)', gu: '24 કલાક (1 દિવસ)', es: '24 horas (1 día)', fr: '24 heures (1 jour)' },
    },
    {
      minutes: 4320,
      label: '3 Days (4320 min)',
      label_i18n: { hi: '3 दिन (4320 मिनट)', gu: '3 દિવસ (4320 મિનિટ)', es: '3 días (4320 min)', fr: '3 jours (4320 min)' },
    },
    {
      minutes: 10080,
      label: '7 Days (10080 min)',
      label_i18n: { hi: '7 दिन (10080 मिनट)', gu: '7 દિવસ (10080 મિનિટ)', es: '7 días (10080 min)', fr: '7 jours (10080 min)' },
    },
    {
      minutes: 43200,
      label: '30 Days (43200 min)',
      label_i18n: { hi: '30 दिन (43200 मिनट)', gu: '30 દિવસ (43200 મિનિટ)', es: '30 días (43200 min)', fr: '30 jours (43200 min)' },
    },
  ],
  defaultAutoDeleteMinutes: 10080,

  autoDeleteCategories: [
    {
      key: 'all',
      label: 'All Media & Logs',
      label_i18n: { hi: 'सभी मीडिया और लॉग', gu: 'બધા મીડિયા અને લૉગ્સ', es: 'Todos los medios y registros', fr: 'Tous les médias et journaux' },
    },
    {
      key: 'photos',
      label: 'Photos & Screenshots',
      label_i18n: { hi: 'तस्वीरें और स्क्रीनशॉट', gu: 'ફોટા અને સ્ક્રીનશૉટ્સ', es: 'Fotos y capturas de pantalla', fr: 'Photos et captures d\'écran' },
    },
    {
      key: 'videos',
      label: 'Videos & Screen Captures',
      label_i18n: { hi: 'वीडियो और स्क्रीन रिकॉर्डिंग', gu: 'વિડિઓ અને સ્ક્રીન કૅપ્ચર', es: 'Videos y grabaciones de pantalla', fr: 'Vidéos et captures d\'écran' },
    },
    {
      key: 'audio',
      label: 'Call & Mic Audio',
      label_i18n: { hi: 'कॉल और माइक ऑडियो', gu: 'કૉલ અને માઇક ઑડિઓ', es: 'Audio de llamada y micrófono', fr: 'Audio d\'appel et microphone' },
    },
    {
      key: 'text',
      label: 'Text & Database Logs',
      label_i18n: { hi: 'टेक्स्ट और डेटाबेस लॉग', gu: 'ટેક્સ્ટ અને ડેટાબેઝ લૉગ્સ', es: 'Registros de texto y base de datos', fr: 'Journaux texte et base de données' },
    },
    {
      key: 'chat',
      label: 'Chat History',
      label_i18n: { hi: 'चैट इतिहास', gu: 'ચેટ ઇતિહાસ', es: 'Historial de chat', fr: 'Historique des discussions' },
    },
  ],
  defaultAutoDeleteCategory: 'all',

  syncIntervalMs: 300000,
  jitterWindowMs: 15000,

  statusGoodUntilStorage: 50,
  statusAverageUntilStorage: 80,
  statusBadAboveStorage: 80,

  // Real plan subscription lifecycle & warnings config (in minutes)
  expringSoonWarDialogIntervalInMinute: 1440, // minutes (default 1 day)
  expringSoonWarDialogBeforeTimeInMinute: 4320, // minutes (default 3 days)
  expringSoonWarNotificationIntervalInMinute: 1440, // minutes (default 24 hours / 1 day)
  expringSoonWarNotificationBeforeTimeInMinute: 4320, // minutes (default 3 days)
  expiredWarNotificationAfterTimeInMinute: 4320, // minutes (default 3 days)
  expiredWarNotificationIntervalInMinute: 1440, // minutes (default 24 hours / 1 day)
  expiredWarDialogAfterTimeInMinute: 4320, // minutes (default 3 days)
  expiredWarDialogIntervalInMinute: 1440, // minutes (default 1 day)

  // Trial plan subscription lifecycle & warnings config (in minutes)
  trialExpringSoonWarDialogIntervalInMinute: 1440, // minutes (default 1 day)
  trialExpringSoonWarDialogBeforeTimeInMinute: 1440, // minutes (default 1 day)
  trialExpringSoonWarNotificationIntervalInMinute: 1440, // minutes (default 24 hours / 1 day)
  trialExpringSoonWarNotificationBeforeTimeInMinute: 1440, // minutes (default 1 day)
  trialExpiredWarNotificationAfterTimeInMinute: 1440, // minutes (default 1 day)
  trialExpiredWarNotificationIntervalInMinute: 1440, // minutes (default 24 hours / 1 day)
  trialExpiredWarDialogAfterTimeInMinute: 1440, // minutes (default 1 day)
  trialExpiredWarDialogIntervalInMinute: 1440, // minutes (default 1 day)

  // Storage warnings config
  storageWarnNotificationPercent: 80, // %
  storageWarnNotificationIntervalInMinute: 1440, // minutes (default 24 hours / 1 day)
  storageWarnDialogPercent: 80, // %
  storageWarnDialogIntervalInMinute: 1440, // minutes (default 1 day)

  liveSessionMaxMin: 60,
  showStorageAddonPlanForFirst: true,
  showLiveLimitAddonPlanForFirst: true,
  showStorageAddonPlanForRenew: true,
  showLiveLimitAddonPlanForRenew: true,

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

  // Dynamic Profile & App Configs
  childAppName: 'Child Companion',
  childAppUrl: 'https://parentprotect.app/download-child.apk',
  childDeviceSecretCodeMaxAttempt: 5,
  privacyPolicyUrl: 'https://parentprotect.app/privacy',
  supportEmail: 'support@parentprotect.app',
  supportEmailSubject: 'Parent Protect Support Request',
  supportEmailBody: 'Hello Support Team,\n\nI need help with my Parent Protect account.\n\nAccount: {phone}\nDevice: {device}\n\nDetails:\n',
  appShareText: 'Protect your child online with Parent Protect. Download now: https://parentprotect.app',
  appShareUrl: 'https://parentprotect.app',
  playStoreUrl: 'market://details?id=com.parentprotect.parent_app',

  // Version Control & Updates
  parentAppVersion: 100,
  parentAppNeedToUpdate: false,
  parentAppNeedToUpdateInterval: 1440,
  childAppVersion: 100,
  childAppNeedToUpdate: false,
  childAppNeedToUpdateInterval: 1440,

  // Developer Mode Restrictions
  allowDeveloperModeOnParentApp: false,
  allowDeveloperModeOnChildApp: false,

  // Permanent Demo Media Assets (CDN backed by GitHub, 100% independent of local server)
  demoLiveVideoUrl: 'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/livevideo1.mp4',
  demoLiveAudioUrl: 'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/call_recording1.mp3',
  demoLiveMirrorUrl: 'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenmirror1.mp4',
  demoVideos: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/livevideo1.mp4',
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/recordvid1.mp4',
  ],
  demoAudios: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/call_recording1.mp3',
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/call_recording2.mp3',
  ],
  demoScreenVideos: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenmirror1.mp4',
  ],
  demoPictures: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenshot1.png',
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenshot2.png',
  ],
  demoScreenshots: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenshot1.png',
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenshot2.png',
  ],
  demoKeywordScreenshots: [
    'https://cdn.jsdelivr.net/gh/ronak7622/Parent-controll-backend@main/public/demo-media/screenshot1.png',
  ],
};

export class ConfigService {
  private static cachedConfig: Record<string, any> | null = null;
  private static localizedCache: Map<string, { data: Record<string, any>; timestamp: number }> = new Map();
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
            'permissionGuides',
            'manualScreenshotDefaultQuality',
            'keywordTrackerScreenshotDefaultQuality',
            'manualScreenshotQualityOptions',
            'keywordTrackerScreenshotQualityOptions',
            'defaultAutoDeleteDays',
            'defaultGraceHours',
            'graceHoursOptions',
            'graceDays',
            'storageBackupAfterExpirPlan',
            'planValidityExpireNotificationIntervalMin',
            'testPlanPhones',
            'testPlanEmails',
            'liveScreenMirrorPerSessionLimitMin',
            'liveAudioPerSessionLimitMin',
            'liveVideoPerSessionLimitMin',
            'expringSoonWarNotificationBeforeDay',
            'expringSoonWarNotificationInterval',
            'expringSoonWarDialogBeforeDay',
            'expringSoonWarDialogInterval',
            'expredWarNotificationAfterDay',
            'expredWarNotificationInterval',
            'expredWarDialogAfterDay',
            'expredWarDialogInterval',
            'storageWarnPercent',
            'storageWarnNotificationIntervalMin',
            'storageWarnPercentForDialog',
            'storageWarnIntervalForDialog',
          ],
        },
      });


      await Config.updateMany(
        { key: 'privacyPolicyUrl', value: 'https://www.youtube.com' },
        { value: 'https://parentprotect.app/privacy' }
      );

      const dbConfigs = await Config.find().lean();
      const existingKeys = new Set(dbConfigs.map((item) => item.key));

      const missingDocs: { key: string; value: any }[] = [];
      for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
        if (!existingKeys.has(key)) {
          missingDocs.push({ key, value });
        }
      }

      let activeDbConfigs = dbConfigs;
      if (missingDocs.length > 0) {
        await Config.insertMany(missingDocs);
        activeDbConfigs = await Config.find().lean();
      }

      const dbMap: Record<string, any> = {};
      for (const item of activeDbConfigs) {
        dbMap[item.key] = item.value;
      }

      // Ensure i18n maps from DEFAULT_OPTIONS overlay onto DB values for known option arrays
      for (const [k, defVal] of Object.entries(DEFAULT_OPTIONS)) {
        if (Array.isArray(defVal) && Array.isArray(dbMap[k])) {
          dbMap[k] = dbMap[k].map((item: any, idx: number) => {
            const defItem = (defVal as any[]).find((d: any) =>
              (d.key && item.key && d.key === item.key) ||
              (d.seconds !== undefined && item.seconds !== undefined && d.seconds === item.seconds) ||
              (d.minutes !== undefined && item.minutes !== undefined && d.minutes === item.minutes)
            ) || (defVal as any[])[idx];

            if (defItem) {
              const enriched = { ...item };
              if (defItem.label_i18n) {
                enriched.label_i18n = { ...defItem.label_i18n, ...(enriched.label_i18n || {}) };
              }
              if (defItem.qualityLabel_i18n) {
                enriched.qualityLabel_i18n = { ...defItem.qualityLabel_i18n, ...(enriched.qualityLabel_i18n || {}) };
              }
              return enriched;
            }
            return item;
          });
        }
      }

      // ── Persist i18n maps back into DB docs so DB is editable source of truth ──
      // Only runs for array-type option docs where the DB value is missing i18n.
      // Uses bulkWrite for efficiency (single round-trip).
      try {
        const arrayOptionKeys = Object.entries(DEFAULT_OPTIONS)
          .filter(([, v]) => Array.isArray(v))
          .map(([k]) => k);

        const bulkOps: any[] = [];
        for (const key of arrayOptionKeys) {
          const defArr = (DEFAULT_OPTIONS as any)[key] as any[];
          if (!Array.isArray(defArr)) continue;
          const dbDoc = activeDbConfigs.find(d => d.key === key);
          if (!dbDoc) continue;
          const dbArr: any[] = Array.isArray(dbDoc.value) ? dbDoc.value : [];

          // Build updated array with i18n maps merged in
          const updatedArr = dbArr.map((item: any, idx: number) => {
            const defItem = defArr.find((d: any) =>
              (d.key && item.key && d.key === item.key) ||
              (d.seconds !== undefined && item.seconds !== undefined && d.seconds === item.seconds) ||
              (d.minutes !== undefined && item.minutes !== undefined && d.minutes === item.minutes)
            ) || defArr[idx];
            if (!defItem) return item;
            const enriched = { ...item };
            if (defItem.label_i18n) {
              enriched.label_i18n = { ...defItem.label_i18n, ...(enriched.label_i18n || {}) };
            }
            if (defItem.qualityLabel_i18n) {
              enriched.qualityLabel_i18n = { ...defItem.qualityLabel_i18n, ...(enriched.qualityLabel_i18n || {}) };
            }
            return enriched;
          });

          // Only write if there is actually a change
          const hasChange = JSON.stringify(updatedArr) !== JSON.stringify(dbArr);
          if (hasChange) {
            bulkOps.push({
              updateOne: {
                filter: { key },
                update: { $set: { value: updatedArr } },
              },
            });
          }
        }

        if (bulkOps.length > 0) {
          const { Config } = require('../models/Config');
          await Config.bulkWrite(bulkOps);
          console.log(`[ConfigService] Persisted i18n maps into ${bulkOps.length} Config DB doc(s).`);
        }
      } catch (i18nPersistErr: any) {
        console.warn('[ConfigService] i18n persist skipped:', i18nPersistErr?.message);
      }

      this.cachedConfig = { ...DEFAULT_OPTIONS, ...dbMap };
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
    this.localizedCache.clear();
    this.lastFetch = 0;
  }

  /**
   * Localize a value recursively based on target language:
   * - plain string/number/boolean -> as is
   * - multi-language object ({ en: ..., hi: ..., ... }) -> resolves to single localized string (falls back to en)
   * - object with label_i18n -> overrides label with label_i18n[lang]
   * - object with qualityLabel_i18n -> overrides qualityLabel with qualityLabel_i18n[lang]
   * - strips label_i18n & qualityLabel_i18n from JSON output
   * Bandwidth is identical to today (single language returned).
   */
  static localize(value: any, lang: string = 'en'): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.localize(item, lang));
    }
    if (typeof value === 'object') {
      const knownLangs = ['en', 'hi', 'gu', 'es', 'fr'];
      const keys = Object.keys(value);

      // Check if this object is a multi-language map: all keys are language codes
      const isMultiLang = keys.length > 0 && keys.every((k) => knownLangs.includes(k));
      if (isMultiLang) {
        return value[lang] || value['en'] || Object.values(value).find((v) => typeof v === 'string' && v.trim().length > 0) || '';
      }

      // Recursively localize object properties
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        res[k] = this.localize(v, lang);
      }

      // If object has label_i18n, apply it to label and remove the dictionary
      if (res.label_i18n && typeof res.label_i18n === 'object') {
        if (res.label_i18n[lang]) {
          res.label = res.label_i18n[lang];
        } else if (res.label_i18n['en']) {
          res.label = res.label_i18n['en'];
        }
        delete res.label_i18n;
      }

      // If object has qualityLabel_i18n, apply it to qualityLabel and remove the dictionary
      if (res.qualityLabel_i18n && typeof res.qualityLabel_i18n === 'object') {
        if (res.qualityLabel_i18n[lang]) {
          res.qualityLabel = res.qualityLabel_i18n[lang];
        } else if (res.qualityLabel_i18n['en']) {
          res.qualityLabel = res.qualityLabel_i18n['en'];
        }
        delete res.qualityLabel_i18n;
      }

      return res;
    }
    return value;
  }

  /**
   * Returns merged server options localized to the user's selected language
   * Uses language-keyed in-memory cache to guarantee zero overhead.
   */
  static async getLocalizedOptions(lang: string = 'en'): Promise<Record<string, any>> {
    const safeLang = ['en', 'hi', 'gu', 'es', 'fr'].includes(lang) ? lang : 'en';
    const now = Date.now();
    const cached = this.localizedCache.get(safeLang);
    if (cached && now - cached.timestamp < this.TTL_MS) {
      return cached.data;
    }

    const rawOptions = await this.getMergedOptions();
    const localized = this.localize(rawOptions, safeLang);
    this.localizedCache.set(safeLang, { data: localized, timestamp: now });
    return localized;
  }
}
