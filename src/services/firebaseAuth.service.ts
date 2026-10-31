import { hashId } from '../utils/privacy';
import admin from 'firebase-admin';
import { config } from '../config/env';

let isFirebaseInitialized = false;

export function ensureFirebaseAdminInitialized(): boolean {
  if (admin.apps.length > 0) {
    isFirebaseInitialized = true;
    return true;
  }

  try {
    if (config.firebaseServiceAccountJson) {
      const serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
      if (serviceAccount && serviceAccount.private_key) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        isFirebaseInitialized = true;
        console.log('[FirebaseAuth] Firebase Admin SDK initialized successfully.');
        return true;
      }
    }
  } catch (err: any) {
    console.warn('[FirebaseAuth] Firebase Admin initialization error:', err.message);
  }
  return false;
}

export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Normalizes provider strings across providers (Google, Email/Password, Apple, etc.)
 */
export function normalizeProvider(provider?: string): string {
  if (!provider) return 'password';
  const clean = provider.toLowerCase().trim();
  if (clean.includes('google')) return 'google';
  if (clean.includes('apple')) return 'apple';
  if (clean.includes('password')) return 'password';
  if (clean.includes('facebook')) return 'facebook';
  if (clean.includes('phone')) return 'phone';
  return clean.replace('.com', '');
}

/**
 * Verifies a Firebase ID token sent from Flutter or Web client
 */
export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseToken> {
  ensureFirebaseAdminInitialized();

  if (admin.apps.length === 0) {
    throw new Error('Firebase Admin SDK is not initialized with a valid service account.');
  }

  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded as DecodedFirebaseToken;
}

/**
 * Permanently deletes a Firebase Auth user so old credentials can no longer sign in
 * (prevents account resurrection after deleteAccount). Safe if the user is already gone.
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  if (!uid) { console.warn('[FirebaseAuth] deleteFirebaseUser: empty uid, skipping'); return; }
  ensureFirebaseAdminInitialized();
  if (admin.apps.length === 0) { console.warn('[FirebaseAuth] deleteFirebaseUser: Firebase Admin NOT initialized'); return; }
  try {
    await admin.auth().deleteUser(uid);
    console.log('[FirebaseAuth] Firebase user DELETED. Hash:', hashId(uid));
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') { console.warn('[FirebaseAuth] deleteFirebaseUser: user-not-found', uid); return; }
    console.warn('[FirebaseAuth] deleteFirebaseUser ERROR for', uid, ':', err?.code, err?.message || err);
  }
}

/** Deletes a Firebase Auth user by email (fallback when firebaseUid is not stored). */
export async function deleteFirebaseUserByEmail(email: string): Promise<void> {
  if (!email) return;
  ensureFirebaseAdminInitialized();
  if (admin.apps.length === 0) { console.warn('[FirebaseAuth] deleteByEmail: Firebase Admin NOT initialized'); return; }
  try {
    const u = await admin.auth().getUserByEmail(email);
    await admin.auth().deleteUser(u.uid);
    console.log('[FirebaseAuth] Firebase user DELETED by email. Hash:', hashId(u.uid));
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') { console.warn('[FirebaseAuth] deleteByEmail: user-not-found', email); return; }
    console.warn('[FirebaseAuth] deleteFirebaseUserByEmail ERROR:', err?.code, err?.message || err);
  }
}
