import { Device } from '../models/Device';
import { AppBlockRule } from '../models/AppBlockRule';

const YOUTUBE_PACKAGE = 'com.google.android.youtube';

/**
 * "Block YouTube App" used to live on the device (device.youtubeBlockSchedule) while every other
 * app's block lived in AppBlockRule, so a YouTube block never showed up in App Usage / App
 * Management. It is now an ordinary AppBlockRule for the YouTube package. This converts any old
 * device-level setting once (idempotent: already-converted devices have no schedule left).
 */
export async function migrateYoutubeAppBlockToAppRule(): Promise<void> {
  try {
    const devices = await Device.find({ youtubeBlockSchedule: { $ne: null } }).select('deviceId youtubeBlockSchedule');
    for (const device of devices) {
      const schedule: any = device.youtubeBlockSchedule;
      if (schedule?.isEnabled) {
        const existing = await AppBlockRule.findOne({ deviceId: device.deviceId, packageName: YOUTUBE_PACKAGE });
        if (!existing) {
          await AppBlockRule.create({
            deviceId: device.deviceId,
            packageName: YOUTUBE_PACKAGE,
            appName: 'YouTube',
            isBlocked: true,
            ...scheduleToRule(schedule),
          });
        }
      }
      await Device.updateOne(
        { deviceId: device.deviceId },
        { $set: { youtubeBlockSchedule: null, youtubeBlocked: false } }
      );
    }
    if (devices.length > 0) {
      console.log(`[MIGRATION] Moved YouTube app block of ${devices.length} device(s) into App Management rules.`);
    }
  } catch (err) {
    console.warn('[MIGRATION] YouTube app block migration failed:', err);
  }
}

function scheduleToRule(schedule: any) {
  const hasTimes = !!(schedule.startTime && schedule.endTime) && schedule.mode !== 'permanent';
  const base = {
    isFullDay: !hasTimes,
    scheduleStartTime: hasTimes ? schedule.startTime : '00:00',
    scheduleEndTime: hasTimes ? schedule.endTime : '23:59',
    notifyParentOnAccess: !!schedule.notifyOnAttempt,
    notifyChildOnBlock: schedule.showDialogToChild !== false,
    selectedDays: [] as number[],
  };
  switch (schedule.mode) {
    case 'weekdays':
      return { ...base, scheduleType: 'weekdays' };
    case 'weekends':
      return { ...base, scheduleType: 'weekends' };
    case 'specificDate':
      return { ...base, scheduleType: 'once', selectedDate: schedule.specificDate };
    case 'customDays':
      return { ...base, scheduleType: 'selected_days', selectedDays: schedule.customDays || [] };
    default: // permanent, daily
      return { ...base, scheduleType: 'all_days' };
  }
}
