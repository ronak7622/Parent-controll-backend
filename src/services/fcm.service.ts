import admin from 'firebase-admin';
import { config } from '../config/env';

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
  payload: Record<string, string> = {}
): Promise<boolean> => {
  if (!isFirebaseInitialized || !fcmToken) {
    console.log(`[FCM-MOCK] Command '${commandType}' triggered for token: ${fcmToken?.substring(0, 10)}...`);
    return false;
  }

  // Fire-and-forget with 2.5s timeout so HTTP API endpoints return in 0.1s instantly
  Promise.race([
    admin.messaging().send({
      token: fcmToken,
      data: {
        command: commandType,
        timestamp: Date.now().toString(),
        ...payload,
      },
      android: {
        priority: 'high',
      },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('FCM Timeout')), 2500))
  ]).then(() => {
    console.log(`[FCM-SENT] High-priority command '${commandType}' sent via FCM.`);
  }).catch((error: any) => {
    console.warn(`[FCM-NOTICE] FCM command '${commandType}' background result: ${error?.message}`);
  });

  return true;
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

  Promise.race([
    admin.messaging().send({
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
          channelId: 'child_protect_alerts',
        },
      },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('FCM Timeout')), 2500))
  ]).then(() => {
    console.log(`[FCM-SENT] Notification sent to topic '${topic}': ${title}`);
  }).catch((error: any) => {
    console.warn(`[FCM-NOTICE] FCM topic '${topic}' background result: ${error?.message}`);
  });

  return true;
};
