import mongoose from 'mongoose';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Device } from '../models/Device';

/**
 * Ownership Middleware Guard
 * Ensures the authenticated parent (req.user.userId) actually owns the target deviceId.
 * Supports both string deviceId (e.g. "xiaomi_redmi_1234") and Mongo ObjectId (_id).
 */
export const verifyDeviceOwnership = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parentUserId = req.user?.userId;
    if (!parentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const deviceId = req.params.deviceId || req.query.deviceId || req.body?.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId parameter is required' });
    }

    const isObjId = mongoose.isValidObjectId(deviceId);
    const owned = await Device.exists({
      $or: [
        { deviceId },
        ...(isObjId ? [{ _id: deviceId }] : [])
      ],
      parentUserId
    });

    if (!owned) {
      return res.status(403).json({ success: false, message: 'Not authorized for this device' });
    }

    next();
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
