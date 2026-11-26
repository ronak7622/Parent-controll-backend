
const handleUnregisteredFcmToken = async (fcmToken: string, deviceId?: string) => {
  try {
    const { Device } = require('../models/Device');
    const { confirmDeviceAppRemoved } = require('../controllers/device.controller');
    const matchedDevice = deviceId
      ? await Device.findOne({ deviceId })
      : await Device.findOne({ $or: [{ fcmToken }, { fcmToken: { $regex: fcmToken.slice(-20) } }] });
    if (matchedDevice && matchedDevice.appRemoved !== true) {
      console.log(`[FCM-UNREGISTERED] Token for device ${matchedDevice.deviceId} is unregistered on FCM. Confirming app removal.`);
      await confirmDeviceAppRemoved(matchedDevice.deviceId, 'FCM_UNREGISTERED');
    }
  } catch (err: any) {
    console.warn('[FCM-UNREGISTERED-CHECK-WARN]', err?.message);
  }
};

import admin from 'firebase-admin';
import { config } from '../config/env';
import { getLocalizedNotification } from '../config/notificationTemplates';
import { User } from '../models/User';
import { decryptText } from '../utils/crypto.utils';

let isFirebaseInitialized = false;

try {
  if (config.firebaseServiceAccountJson) {
    const serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
    if (serviceAccount && serviceAccount.private_key) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isFirebaseInitialized = true;
      console.log('[FCM] Firebase Admin SDK initialized successfully.');
    } else {
      console.log('[FCM-INFO] No valid private_key in Firebase Service Account. Running in mock FCM mode.');
    }
  }
} catch (error: any) {
  console.warn('[FCM-WARNING] FCM Service Account JSON not configured or invalid:', error.message);
}

export const sendFcmDataCommand = async (
  fcmToken: string,
  commandType: string,
  payload: Record<string, string> = {},
  deviceId?: string
): Promise<boolean> => {
  let effectiveToken = fcmToken;
  if (effectiveToken && effectiveToken.startsWith('enc_text:')) {
    effectiveToken = decryptText(effectiveToken, deviceId) || effectiveToken;
  }
  if (!isFirebaseInitialized || !effectiveToken) {
    console.log(`[FCM-MOCK] Command '${commandType}' triggered for token: ${effectiveToken?.substring(0, 10)}...`);
    return false;
  }

  try {
    const message: admin.messaging.Message = {
      token: effectiveToken,
      data: {
        command: commandType,
        timestamp: Date.now().toString(),
        ...payload,
      },
      android: {
        priority: 'high',
      },
    };

    await admin.messaging().send(message);
    console.log(`[FCM-SENT] High-priority command '${commandType}' sent via FCM.`);
    return true;
  } catch (error: any) {
    console.error(`[FCM-ERROR] Failed to send FCM command '${commandType}':`, error);
    if (error?.code === 'messaging/registration-token-not-registered' || error?.code === 'messaging/invalid-registration-token') {
      handleUnregisteredFcmToken(fcmToken).catch(() => {});
    }
    return false;
  }
};

/**
 * Proactively check if a device's FCM token is still valid or unregistered (uninstalled).
 * Uses dryRun = true: validates recipient token against Google FCM registry with zero data/battery on child phone!
 * Returns true IF the token is confirmed UNREGISTERED (app uninstalled).
 * Returns false IF the token is valid or cannot be determined.
 */
export const validateFcmTokenUnregistered = async (fcmToken: string): Promise<boolean> => {
  if (!isFirebaseInitialized || !fcmToken) return false;
  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      data: {
        command: 'VALIDATE_PRESENCE',
        timestamp: Date.now().toString(),
      },
    };
    await admin.messaging().send(message, true); // dryRun = true
    return false;
  } catch (error: any) {
    const isUnregistered =
      error?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/invalid-registration-token' ||
      error?.errorInfo?.code === 'messaging/registration-token-not-registered';
    if (isUnregistered) {
      console.log(`[FCM-VALIDATE] Token ${fcmToken.substring(0, 10)}... confirmed UNREGISTERED by Google FCM.`);
      await handleUnregisteredFcmToken(fcmToken).catch(() => {});
      return true;
    }
    return false;
  }
};

export const sendFcmDirectNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> => {
  if (!isFirebaseInitialized || !fcmToken) {
    console.log(`[FCM-MOCK] Direct notification to token ${fcmToken?.substring(0, 10)}...: "${title}" - "${body}"`);
    return false;
  }
  if (!title?.trim() || !body?.trim()) {
    console.warn(`[FCM-SKIP] Refusing to send direct notification with empty title or body: title="${title}", body="${body}"`);
    return false;
  }
  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: { title, body },
      data: {
        title,
        body,
        timestamp: Date.now().toString(),
        ...data,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };
    await admin.messaging().send(message);
    console.log(`[FCM-SENT] Direct notification sent to token ${fcmToken.substring(0, 10)}...: ${title}`);
    return true;
  } catch (error: any) {
    console.error(`[FCM-ERROR] Failed to send direct notification to token:`, error);
    if (error?.code === 'messaging/registration-token-not-registered' || error?.code === 'messaging/invalid-registration-token') {
      handleUnregisteredFcmToken(fcmToken).catch(() => {});
    }
    return false;
  }
};

export const sendFcmTopicNotification = async (
  topic: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> => {
  if (!isFirebaseInitialized) {
    console.log(`[FCM-MOCK] Topic '${topic}' notification: "${title}" - "${body}"`);
    return false;
  }
  if (!title?.trim() || !body?.trim()) {
    console.warn(`[FCM-SKIP] Refusing to send topic notification with empty title or body: title="${title}", body="${body}"`);
    return false;
  }
  try {
    const message: admin.messaging.Message = {
      topic,
      notification: { title, body },
      data: {
        title,
        body,
        timestamp: Date.now().toString(),
        ...data,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };
    await admin.messaging().send(message);
    console.log(`[FCM-SENT] Notification sent to topic '${topic}': ${title}`);
    return true;
  } catch (error) {
    console.error(`[FCM-ERROR] Failed to send notification to topic '${topic}':`, error);
    return false;
  }
};

export const sendLocalizedFcmTopicNotification = async (
  topic: string,
  templateKey: string,
  params: Record<string, string | number> = {},
  languageCode?: string,
  extraData: Record<string, string> = {}
): Promise<boolean> => {
  // Suppress per-session limit notification (only daily limit, total plan limit, and booster exhausted notifications are allowed)
  if (templateKey === 'LIVE_SESSION_CUTOFF') {
    return false;
  }
  let lang = languageCode;
  if (!lang || lang === 'en') {
    if (topic.startsWith('parent_')) {
      const parentUserId = topic.replace('parent_', '');
      try {
        const u = await User.findById(parentUserId).select('languageCode fcmToken').lean();
        if (u?.languageCode) {
          lang = u.languageCode;
        }
      } catch {
        // Fallback to en
      }
    }
  }

  const { title, body } = getLocalizedNotification(templateKey, lang || 'en', params);
  return sendFcmTopicNotification(topic, title, body, {
    templateKey,
    ...extraData,
  });
};
