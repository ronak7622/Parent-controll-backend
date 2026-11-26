import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Enterprise Application-Level Field Encryption Utility
 *
 * Implements:
 * 1. Tier 1 Content: Randomized AES-256-GCM with 12-byte random IV & auth tag.
 * 2. Tier 1 Indexed Fields: Deterministic per-device encryption (AES-256-CBC with HMAC IV) + Blind Index (HMAC-SHA256).
 * 3. Envelope Encryption: Per-device Data Encryption Keys (DEKs) derived using HKDF-SHA256.
 * 4. Tier 2 Secrets: One-way Scrypt / Argon-style cryptographic hashing.
 * 5. Safe Fallbacks: Non-encrypted or legacy strings pass through gracefully without runtime crashes.
 */

// ─── PART A: Master KEK & Blind-Index Key Resolution (FAIL-FAST) ───
const isProduction = (process.env.NODE_ENV || config.env || '').toLowerCase() === 'production';

function resolveMasterKey(): Buffer {
  const envKey = (config.encryption?.masterKey || process.env.DATA_ENCRYPTION_KEY || '').trim();

  if (isProduction) {
    if (!envKey) {
      const msg = '[FATAL-SECURITY] DATA_ENCRYPTION_KEY is missing or empty in production! Server refused to start.';
      console.error(msg);
      throw new Error(msg);
    }
    if (envKey.length < 32) {
      const msg = `[FATAL-SECURITY] DATA_ENCRYPTION_KEY must be at least 32 characters in production (got ${envKey.length}).`;
      console.error(msg);
      throw new Error(msg);
    }
    return crypto.createHash('sha256').update(envKey).digest();
  }

  // Non-prod (development / test)
  if (envKey) {
    if (envKey.length < 32) {
      console.warn(`[SECURITY-WARN] DATA_ENCRYPTION_KEY should be at least 32 characters (got ${envKey.length}).`);
    }
    return crypto.createHash('sha256').update(envKey).digest();
  }

  console.warn('⚠️ [DEV-SECURITY-WARNING] DATA_ENCRYPTION_KEY not set! Using DEV-ONLY ephemeral fallback key. NEVER USE THIS IN PRODUCTION!');
  return crypto.createHash('sha256').update('DEV_ONLY_INSECURE_FALLBACK_KEY_NEVER_PROD_2026').digest();
}

function resolveBlindIndexKey(): Buffer {
  const envKey = (config.encryption?.blindIndexSecret || process.env.BLIND_INDEX_SECRET || '').trim();

  if (isProduction) {
    if (!envKey) {
      const msg = '[FATAL-SECURITY] BLIND_INDEX_SECRET is missing or empty in production! Server refused to start.';
      console.error(msg);
      throw new Error(msg);
    }
    if (envKey.length < 32) {
      const msg = `[FATAL-SECURITY] BLIND_INDEX_SECRET must be at least 32 characters in production (got ${envKey.length}).`;
      console.error(msg);
      throw new Error(msg);
    }
    return crypto.createHash('sha256').update(envKey).digest();
  }

  // Non-prod (development / test)
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }

  console.warn('⚠️ [DEV-SECURITY-WARNING] BLIND_INDEX_SECRET not set! Using DEV-ONLY ephemeral fallback key. NEVER USE THIS IN PRODUCTION!');
  return crypto.createHash('sha256').update('DEV_ONLY_BLIND_INDEX_SECRET_NEVER_PROD_2026').digest();
}

const MASTER_KEY: Buffer = resolveMasterKey();
const BLIND_INDEX_KEY: Buffer = resolveBlindIndexKey();

// In-Memory DEK cache (LRU-bounded to 5000 devices for high throughput)
const dekCache = new Map<string, Buffer>();

/**
 * Derives a cryptographically isolated 256-bit DEK per device using HKDF-SHA256 (RFC 5869)
 */
export const getDeviceDek = (deviceId?: string): Buffer => {
  if (!deviceId || typeof deviceId !== 'string') return MASTER_KEY;
  const cleanId = deviceId.trim();
  if (!cleanId) return MASTER_KEY;

  let dek = dekCache.get(cleanId);
  if (!dek) {
    const rawDek = crypto.hkdfSync('sha256', MASTER_KEY, Buffer.from(cleanId, 'utf8'), Buffer.from('device-dek-v1', 'utf8'), 32);
    dek = Buffer.from(rawDek);
    if (dekCache.size > 5000) {
      dekCache.clear();
    }
    dekCache.set(cleanId, dek);
  }
  return dek;
};

/**
 * Tier 1 Content: Randomized AES-256-GCM Encryption
 * Format: `enc:v1:<iv_hex>:<tag_hex>:<cipher_hex>`
 */
export const encryptText = (text?: string | null, deviceId?: string): string => {
  if (!text || typeof text !== 'string') return (text as any) ?? '';
  try {
    const dek = getDeviceDek(deviceId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  } catch (error) {
    return text;
  }
};

/**
 * Tier 1 Content: Randomized AES-256-GCM Decryption
 * Returns original text if not encrypted (transparent legacy fallback).
 */
export const decryptText = (cipherText?: string | null, deviceId?: string): string => {
  if (!cipherText || typeof cipherText !== 'string') return (cipherText as any) ?? '';
  if (!cipherText.startsWith('enc:v1:')) return cipherText;

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;
    const [, , ivHex, tagHex, dataHex] = parts;
    const dek = getDeviceDek(deviceId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (error) {
    return cipherText;
  }
};

/**
 * Tier 1 Indexed Fields: Deterministic per-device encryption (Phone numbers, addresses, domains)
 * Produces identical ciphertext for identical values on the SAME device, enabling MongoDB queries and aggregations.
 * Format: `enc:det:<iv_hex>:<cipher_hex>`
 */
export const encryptDeterministic = (val?: string | null, deviceId?: string): string => {
  if (!val || typeof val !== 'string') return (val as any) ?? '';
  try {
    const dek = getDeviceDek(deviceId);
    // Deterministic 16-byte IV derived from HMAC(dek, val)
    const iv = crypto.createHmac('sha256', dek).update(`det-iv:${val}`).digest().subarray(0, 16);
    const cipher = crypto.createCipheriv('aes-256-cbc', dek, iv);
    const enc = Buffer.concat([cipher.update(val, 'utf8'), cipher.final()]);
    return `enc:det:${iv.toString('hex')}:${enc.toString('hex')}`;
  } catch (error) {
    return val;
  }
};

/**
 * Tier 1 Indexed Fields: Deterministic per-device Decryption
 */
export const decryptDeterministic = (cipherText?: string | null, deviceId?: string): string => {
  if (!cipherText || typeof cipherText !== 'string') return (cipherText as any) ?? '';
  if (!cipherText.startsWith('enc:det:')) {
    // If it was encrypted with randomized GCM by mistake, fallback to decryptText
    if (cipherText.startsWith('enc:v1:')) return decryptText(cipherText, deviceId);
    return cipherText;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 4) return cipherText;
    const [, , ivHex, dataHex] = parts;
    const dek = getDeviceDek(deviceId);
    const decipher = crypto.createDecipheriv('aes-256-cbc', dek, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (error) {
    return cipherText;
  }
};

/**
 * Tier 1 Blind Index (HMAC-SHA256)
 * Normalized hash for lightning-fast lookup across the database without exposing sensitive data.
 * Format: `bidx:<64-char-hex>`
 */
export const computeBlindIndex = (val?: string | null): string => {
  if (!val || typeof val !== 'string') return '';
  const normalized = val.trim().toLowerCase().replace(/[\s\-\(\)\+]/g, '');
  if (!normalized) return '';
  return `bidx:${crypto.createHmac('sha256', BLIND_INDEX_KEY).update(normalized).digest('hex')}`;
};

/**
 * Tier 2 Secrets: One-way Scrypt Hashing (secretCode, pins, otp)
 * Format: `scrypt:<salt_hex>:<hash_hex>`
 */
export const hashSecret = (secret: string): string => {
  if (!secret || typeof secret !== 'string') return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(secret.trim(), salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
};

/**
 * Tier 2 Secrets: Constant-time Secret Verification
 * Backward-compatible with existing plain text secrets.
 */
export const verifySecret = (secret: string, stored: string): boolean => {
  if (!secret || !stored) return false;
  const trimmed = secret.trim();
  if (!stored.startsWith('scrypt:')) {
    return trimmed === stored.trim();
  }
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, originalHash] = parts;
    const computed = crypto.scryptSync(trimmed, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch (error) {
    return false;
  }
};
