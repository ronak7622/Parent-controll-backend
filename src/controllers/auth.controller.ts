import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User';
import { config } from '../config/env';
import { connectDatabase } from '../config/database';
import { verifyFirebaseToken, normalizeProvider } from '../services/firebaseAuth.service';
import { isDisposableEmail } from '../utils/disposableEmail';
import { normalizeEmail } from '../utils/normalizeEmail';
import { cacheService } from '../services/cache.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';

/**
 * IP-based Rate Limiter for Authentication Gateway (Protection against brute force & flooding)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
});

/**
 * Extracts the portion before '.', before digits (0-9), or before '@'
 * and capitalizes the first letter (e.g., "ronakpatel.delogico@gmail.com" -> "Ronakpatel").
 */
export function formatCleanNameFromEmail(email?: string, explicitName?: string): string {
  if (explicitName && explicitName.trim() && explicitName.trim().toLowerCase() !== 'parent user') {
    const trimmed = explicitName.trim();
    if (trimmed.includes(' ') && !trimmed.includes('@') && !trimmed.includes('.')) {
      return trimmed;
    }
    let clean = trimmed;
    if (clean.includes('@')) clean = clean.split('@')[0];
    if (clean.includes('.')) clean = clean.split('.')[0];
    if (clean.includes('_')) clean = clean.split('_')[0];
    const match = clean.match(/^[a-zA-Z]+/);
    if (match && match[0]) clean = match[0];
    if (clean) return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }
  let clean = (email || '').split('@')[0] || '';
  if (clean.includes('.')) clean = clean.split('.')[0];
  if (clean.includes('_')) clean = clean.split('_')[0];
  const match = clean.match(/^[a-zA-Z]+/);
  if (match && match[0]) clean = match[0];
  if (!clean) return 'Parent User';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * Unified Firebase Authentication Gateway (Google, Email/Password, Apple)
 *
 * Accepts Firebase ID Token, verifies via Firebase Admin SDK,
 * links account idempotently by email and firebaseUid,
 * enforces canonical email normalization (preventing alias trial abuse),
 * validates email verification status, and issues the system JWT.
 */
export const authenticateFirebase = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDatabase();
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is connecting to cloud server. Please try again in 5 seconds.',
      });
    }

    const {
      idToken,
      provider: clientProvider,
      platform: clientPlatform,
      deviceName: clientDeviceName,
      forceLogoutOthers,
    } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ success: false, message: 'Firebase authentication token is required.' });
    }

    let decoded;
    try {
      decoded = await verifyFirebaseToken(idToken);
    } catch (tokenErr: any) {
      console.error('[FIREBASE-VERIFY-ERROR]', tokenErr.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Firebase authentication token. Please sign in again.',
      });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ success: false, message: 'Invalid Firebase authentication token.' });
    }

    const firebaseUid = decoded.uid;
    const rawEmail = decoded.email ? decoded.email.trim() : undefined;
    const email = rawEmail ? rawEmail.toLowerCase() : undefined;
    const normEmail = email ? normalizeEmail(email) : undefined;
    const name = decoded.name || (email ? email.split('@')[0] : 'Parent User');
    const provider = normalizeProvider(decoded.firebase?.sign_in_provider || clientProvider);

    // Google accounts are auto-verified by Google; password accounts require email verification
    const emailVerified = provider === 'google' ? true : Boolean(decoded.email_verified);

    // Reject disposable emails on password auth (Google accounts exempt)
    if (normEmail && provider === 'password') {
      if (isDisposableEmail(normEmail) || isDisposableEmail(email || '')) {
        return res.status(400).json({
          success: false,
          message: 'Disposable or temporary email addresses are not allowed. Please use a valid personal email.',
        });
      }
    }

    // ACCOUNT LINKING & IDEMPOTENT FIND-OR-CREATE
    // 1. Search by firebaseUid
    let user = await User.findOne({ firebaseUid });

    // 2. If not found by firebaseUid, link by email (or normalizedEmail)
    if (!user && (email || normEmail)) {
      user = await User.findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(normEmail ? [{ normalizedEmail: normEmail }] : []),
        ],
      });
      if (user && !user.firebaseUid) {
        user.firebaseUid = firebaseUid;
      }
    }

    // SINGLE ACTIVE SESSION CHECK
    if (user && user.currentSessionId) {
      const activeCachedSession = await cacheService.get(`user_session_${user._id.toString()}`);
      const isOtherSessionActive = Boolean(activeCachedSession && activeCachedSession === user.currentSessionId);

      if (isOtherSessionActive && !forceLogoutOthers) {
        return res.status(200).json({
          success: false,
          requiresLogoutConfirm: true,
          message: 'This account is currently active on another device or browser.',
          activeSession: {
            deviceName: user.currentDeviceName || 'Another device/browser',
            platform: user.lastActivePlatform || 'device',
            lastActive: user.lastLoginAt,
          },
        });
      }
    }

    const newSessionId = new mongoose.Types.ObjectId().toString();

    // Revoke previous session if user already existed
    if (user && user.currentSessionId) {
      try {
        getSignalingIo()?.to(`parent_${user._id.toString()}`).emit('session-revoked', {
          reason: 'Your account was logged in from another device.',
          newDevice: clientDeviceName || (clientPlatform === 'flutter_app' ? 'Mobile App' : 'Web Browser'),
        });
      } catch (_) {}
    }

    if (user) {
      if (!user.linkedProviders) user.linkedProviders = [];
      if (provider && !user.linkedProviders.includes(provider)) user.linkedProviders.push(provider);
      if (!user.primaryProvider && provider) user.primaryProvider = provider;
      if (!user.email && email) user.email = email;
      if (normEmail) user.normalizedEmail = normEmail;
      if (!user.name && name) user.name = name;
      user.isVerified = true;
      user.emailVerified = emailVerified;
      user.currentSessionId = newSessionId;
      user.currentDeviceName = clientDeviceName || (clientPlatform === 'flutter_app' ? 'Mobile App' : 'Web Browser');
      user.lastActivePlatform = clientPlatform || 'web';
      user.lastLoginAt = new Date();

      const userLanguageCode = req.body.languageCode || (req.headers['accept-language'] as string)?.split(',')[0]?.split('-')[0]?.trim();
      if (userLanguageCode && typeof userLanguageCode === 'string') {
        user.languageCode = userLanguageCode.toLowerCase();
      }
      if (req.body.fcmToken && typeof req.body.fcmToken === 'string') {
        user.fcmToken = req.body.fcmToken.trim();
      }
      await user.save();
    } else {
      const userLanguageCode = (
        req.body.languageCode ||
        (req.headers['accept-language'] as string)?.split(',')[0]?.split('-')[0]?.trim() ||
        'en'
      ).toLowerCase();

      user = new User({
        firebaseUid,
        email,
        normalizedEmail: normEmail,
        emailVerified,
        name,
        primaryProvider: provider || 'google',
        linkedProviders: provider ? [provider] : ['google'],
        isVerified: true,
        languageCode: userLanguageCode,
        fcmToken: req.body.fcmToken && typeof req.body.fcmToken === 'string' ? req.body.fcmToken.trim() : undefined,
        currentSessionId: newSessionId,
        currentDeviceName: clientDeviceName || (clientPlatform === 'flutter_app' ? 'Mobile App' : 'Web Browser'),
        lastActivePlatform: clientPlatform || 'web',
        lastLoginAt: new Date(),
      });
      await user.save();
    }

    await cacheService.set(`user_session_${user._id.toString()}`, newSessionId, 365 * 86400);

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        sessionId: newSessionId,
        phoneNumber: user.phoneNumber || '',
        name: formatCleanNameFromEmail(user.email, user.name),
        email: user.email || '',
        normalizedEmail: user.normalizedEmail || '',
        emailVerified: user.emailVerified ?? false,
        firebaseUid: user.firebaseUid || '',
      },
      config.jwtSecret,
      { expiresIn: '365d' }
    );

    return res.json({
      success: true,
      token,
      emailVerified: user.emailVerified ?? false,
      requiresEmailVerification: provider === 'password' && !user.emailVerified,
      user: {
        id: user._id.toString(),
        uid: user._id.toString(),
        firebaseUid: user.firebaseUid,
        phoneNumber: user.phoneNumber || '',
        email: user.email || '',
        name: formatCleanNameFromEmail(user.email, user.name),
        emailVerified: user.emailVerified ?? false,
        languageCode: user.languageCode || 'en',
        primaryProvider: user.primaryProvider,
        linkedProviders: user.linkedProviders || [],
      },
    });
  } catch (error: any) {
    console.error('[FIREBASE-AUTH-ERROR]', error);
    return res.status(500).json({ success: false, message: error.message || 'Authentication failed.' });
  }
};

/**
 * Update Language Code for Logged-in Parent User
 */
export const updateUserLanguage = async (req: any, res: Response) => {
  try {
    const parentUserId = req.user?.userId;
    if (!parentUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const rawLang = req.body.languageCode || req.body.lang;
    if (!rawLang) {
      return res.status(400).json({ success: false, message: 'languageCode is required.' });
    }
    const cleanLang = String(rawLang).trim().toLowerCase();
    await User.findByIdAndUpdate(parentUserId, { languageCode: cleanLang });
    return res.json({ success: true, languageCode: cleanLang });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * Update FCM Token for Logged-in Parent User
 */
export const updateParentFcmToken = async (req: any, res: Response) => {
  try {
    const parentUserId = req.user?.userId;
    if (!parentUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ success: false, message: 'fcmToken is required.' });
    }
    const cleanToken = fcmToken.trim();
    await User.findByIdAndUpdate(parentUserId, { fcmToken: cleanToken });
    return res.json({ success: true, message: 'FCM token updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
