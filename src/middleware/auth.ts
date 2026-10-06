import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phoneNumber: string;
  };
}

export const authenticateJwt = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; phoneNumber: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
};

import mongoose from 'mongoose';
import { Device } from '../models/Device';

export interface DeviceAuthRequest extends Request {
  deviceId?: string;
  user?: {
    userId: string;
    phoneNumber: string;
  };
}

export const authenticateDevice = async (req: DeviceAuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Device authorization token missing' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { deviceId: string; kind: string };
    if (decoded.kind !== 'device' || !decoded.deviceId) {
      return res.status(401).json({ success: false, message: 'Invalid device authentication token' });
    }

    req.deviceId = decoded.deviceId;

    // Enforce that deviceId in body/params/query matches req.deviceId (device can only post for itself)
    const targetDeviceId = req.params.deviceId || req.query.deviceId || req.body?.deviceId;
    if (targetDeviceId && targetDeviceId !== req.deviceId) {
      if (mongoose.isValidObjectId(targetDeviceId)) {
        const dev = await Device.findById(targetDeviceId).select('deviceId');
        if (!dev || dev.deviceId !== req.deviceId) {
          return res.status(403).json({ success: false, message: 'Device ID mismatch: cannot access another device' });
        }
      } else {
        return res.status(403).json({ success: false, message: 'Device ID mismatch: cannot access another device' });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired device token' });
  }
};

export const optionalAuthenticateJwt = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; phoneNumber: string };
      req.user = decoded;
    } catch (_: any) {}
  }
  next();
};
