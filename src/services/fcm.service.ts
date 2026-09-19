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

  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
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
  } catch (error) {
    console.error(`[FCM-ERROR] Failed to send FCM command '${commandType}':`, error);
    return false;
  }
};
