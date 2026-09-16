import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Device } from '../models/Device';
import { sendFcmDataCommand } from '../services/fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';

/**
 * Generate/Register 6-digit Pairing Code for Child device
 */
export const generatePairingCode = async (req: any, res: Response) => {
  try {
    const { deviceId, deviceName, deviceModel, deviceBrand } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await Device.findOneAndUpdate(
      { deviceId },
      {
        deviceId,
        deviceName: deviceName || 'Child Device',
        deviceModel: deviceModel || '',
        deviceBrand: deviceBrand || '',
        pairingCode: code,
        isPaired: false,
        parentUserId: null,
        isOnline: true,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`[PAIRING] Child device ${deviceId} generated code: ${code}`);

    return res.json({
      success: true,
      code,
      pairingCode: code,
      expiresInMinutes: 15,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Check Pairing Status (Called by Child App polling)
 */
export const checkPairingStatus = async (req: any, res: Response) => {
  try {
    const { code } = req.params;
    const device = await Device.findOne({
      $or: [{ pairingCode: code }, { deviceId: code }],
    });

    if (device && device.isPaired) {
      return res.json({
        success: true,
        isPaired: true,
        parentUid: device.parentUserId ? device.parentUserId.toString() : 'parent',
      });
    }

    return res.json({
      success: true,
      isPaired: false,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Pair Device using 6-Digit Code (Called by Parent App)
 */
export const pairDeviceWithCode = async (req: AuthRequest, res: Response) => {
  try {
    const parentUserId = req.user?.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Pairing code is required' });
    }

    const device = await Device.findOne({
      $or: [{ pairingCode: code }, { deviceId: code }],
    });

    if (!device) {
      return res.status(400).json({ success: false, message: 'Invalid or expired pairing code.' });
    }

    device.parentUserId = parentUserId as any;
    device.isPaired = true;
    device.isOnline = true;
    device.lastSeenAt = new Date();
    await device.save();

    console.log(`[PAIRING-SUCCESS] Parent ${parentUserId} paired with device ${device.deviceId} (code: ${code})`);

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child Device registers or verifies Pairing Code directly
 */
export const pairChildDevice = async (req: any, res: Response) => {
  try {
    const { deviceId, deviceName, deviceModel, deviceBrand, osType, fcmToken, parentUserId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required.' });
    }

    let device = await Device.findOne({ deviceId });
    if (!device) {
      device = new Device({
        deviceId,
        parentUserId,
        deviceName: deviceName || 'Child Device',
        deviceModel: deviceModel || '',
        deviceBrand: deviceBrand || '',
        osType: osType || 'android',
        isPaired: true,
        fcmToken: fcmToken || '',
      });
    } else {
      if (parentUserId) device.parentUserId = parentUserId;
      if (fcmToken) device.fcmToken = fcmToken;
      device.isPaired = true;
      device.isOnline = true;
      device.lastSeenAt = new Date();
    }

    await device.save();

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all paired devices for logged-in Parent
 */
export const getParentDevices = async (req: AuthRequest, res: Response) => {
  try {
    const parentUserId = req.user?.userId;
    const devices = await Device.find({ parentUserId }).sort({ updatedAt: -1 });

    return res.json({
      success: true,
      devices,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Device Settings & Restrictions (YouTube, Browser, App Block, Timers)
 */
export const updateDeviceSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const updates = req.body;

    const device = await Device.findOneAndUpdate({ deviceId }, { $set: updates }, { new: true });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {});
    }

    return res.json({
      success: true,
      message: 'Device restrictions updated successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send Instant Remote Command (Live Screen, Live Camera, Live Audio, Capture Photo)
 */
export const sendRemoteCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { command, actionType } = req.body;
    const targetCommand = command || actionType || 'TAKE_SCREENSHOT';

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    // Emit via Socket.io signaling
    getSignalingIo()?.to(deviceId).emit('remote-command', { command: targetCommand, deviceId });

    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, targetCommand, { action: targetCommand });
    }

    return res.json({
      success: true,
      message: `Remote command '${targetCommand}' dispatched to child device.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Disconnect / Unpair Device
 */
export const disconnectDevice = async (req: any, res: Response) => {
  try {
    const deviceId = req.params.deviceId || req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { isPaired: false, parentUserId: null, pairingCode: null } },
      { new: true }
    );

    // Emit UNPAIR signal to child device socket room
    getSignalingIo()?.to(deviceId).emit('remote-command', { command: 'UNPAIR', deviceId });

    console.log(`[DISCONNECT] Device ${deviceId} disconnected by parent.`);

    return res.json({
      success: true,
      message: 'Device unpaired successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
