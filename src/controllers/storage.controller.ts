import { Request, Response } from 'express';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { MediaCapture } from '../models/MediaCapture';
import { CallRecording } from '../models/CallRecording';

/**
 * Get Parent Storage Status & Plan Expiry Warnings
 */
export const getStorageStatus = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || req.query.parentUserId || req.body.parentUserId;
    if (!parentUserId) {
      return res.status(400).json({ success: false, message: 'parentUserId is required' });
    }

    const user = await User.findById(parentUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Parent user not found' });
    }

    const devices = await Device.find({ parentUserId: user._id });
    const deviceIds = devices.map((d) => d.deviceId);

    // Sum storage bytes across MediaCaptures and CallRecordings
    const [mediaRes, recordingRes] = await Promise.all([
      MediaCapture.aggregate([
        { $match: { deviceId: { $in: deviceIds } } },
        { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' } } },
      ]),
      CallRecording.aggregate([
        { $match: { deviceId: { $in: deviceIds } } },
        { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' } } },
      ]),
    ]);

    const mediaBytes = mediaRes[0]?.totalBytes || 0;
    const recordingBytes = recordingRes[0]?.totalBytes || 0;
    const usedStorageBytes = mediaBytes + recordingBytes;

    const baseQuotaBytes = user.storageQuotaBytes || 21474836480; // 20GB default
    const addonQuotaBytes = user.addonStorageBytes || 0;
    const totalQuotaBytes = baseQuotaBytes + addonQuotaBytes;

    const usedPercentage = totalQuotaBytes > 0 ? (usedStorageBytes / totalQuotaBytes) * 100 : 0;
    const highlightWarning = usedPercentage >= 70;

    const now = new Date();
    const isPlanExpired = user.planExpiresAt ? now > user.planExpiresAt : false;
    const isInGracePeriod = user.planGracePeriodEndsAt ? isPlanExpired && now <= user.planGracePeriodEndsAt : false;

    return res.json({
      success: true,
      plan: {
        planType: user.planType || 'monthly',
        planExpiresAt: user.planExpiresAt,
        planGracePeriodEndsAt: user.planGracePeriodEndsAt,
        isPlanExpired,
        isInGracePeriod,
        gracePeriodDaysRemaining: user.planGracePeriodEndsAt
          ? Math.max(0, Math.ceil((user.planGracePeriodEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0,
      },
      storage: {
        usedStorageBytes,
        usedStorageGb: Number((usedStorageBytes / (1024 * 1024 * 1024)).toFixed(2)),
        totalQuotaBytes,
        totalQuotaGb: Number((totalQuotaBytes / (1024 * 1024 * 1024)).toFixed(2)),
        usedPercentage: Number(usedPercentage.toFixed(1)),
        highlightWarning,
        warningMessage: highlightWarning
          ? `Warning: You have used ${usedPercentage.toFixed(1)}% of your storage quota. Please delete older media or purchase extra storage.`
          : null,
      },
      settings: {
        autoDeleteMode: user.autoDeleteMode ?? true,
        autoDeleteDays: user.autoDeleteDays || 30,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Purchase or Renew Plan (Monthly / Yearly)
 */
export const purchasePlan = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || req.body.parentUserId;
    const { planType = 'monthly' } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ success: false, message: 'parentUserId is required' });
    }

    const now = new Date();
    const durationDays = planType === 'yearly' ? 365 : 30;
    const planExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const planGracePeriodEndsAt = new Date(planExpiresAt.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days grace period

    const user = await User.findByIdAndUpdate(
      parentUserId,
      {
        $set: {
          planType,
          planExpiresAt,
          planGracePeriodEndsAt,
          storageQuotaBytes: 21474836480, // 20GB free per month/year
        },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: `${planType.toUpperCase()} plan activated successfully.`,
      plan: {
        planType: user?.planType,
        planExpiresAt: user?.planExpiresAt,
        planGracePeriodEndsAt: user?.planGracePeriodEndsAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Purchase Extra Storage Add-on (5GB, 10GB, etc.)
 */
export const purchaseStorageAddon = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || req.body.parentUserId;
    const { addonGb = 5 } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ success: false, message: 'parentUserId is required' });
    }

    const addedBytes = addonGb * 1024 * 1024 * 1024;
    const user = await User.findByIdAndUpdate(
      parentUserId,
      {
        $inc: { addonStorageBytes: addedBytes },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: `Added ${addonGb}GB extra storage add-on successfully.`,
      addonStorageBytes: user?.addonStorageBytes,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Auto-Delete Mode & Retention Days
 */
export const updateAutoDeleteSettings = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || req.body.parentUserId;
    const { autoDeleteMode, autoDeleteDays } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ success: false, message: 'parentUserId is required' });
    }

    const update: any = {};
    if (typeof autoDeleteMode !== 'undefined') update.autoDeleteMode = Boolean(autoDeleteMode);
    if (typeof autoDeleteDays === 'number') update.autoDeleteDays = autoDeleteDays;

    const user = await User.findByIdAndUpdate(parentUserId, { $set: update }, { new: true });

    return res.json({
      success: true,
      message: 'Auto-delete settings updated.',
      settings: {
        autoDeleteMode: user?.autoDeleteMode,
        autoDeleteDays: user?.autoDeleteDays,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
