import crypto from 'crypto';

/**
 * Creates an irreversible, deterministic short SHA-256 hash prefix of an identifier.
 * Used for logging userId, deviceId, etc. without leaking raw identifiers or PII.
 */
export function hashId(id?: string | null): string {
  if (!id) return 'none';
  const clean = String(id).trim();
  if (clean.length === 0) return 'none';
  return crypto.createHash('sha256').update(clean).digest('hex').substring(0, 8);
}

/**
 * Masks a phone number or email for safe diagnostics.
 * e.g. "+919876543210" -> "+91******3210"
 * e.g. "user@example.com" -> "u***@example.com"
 */
export function maskPII(val?: string | null): string {
  if (!val) return 'none';
  const str = String(val).trim();
  if (str.includes('@')) {
    const [local, domain] = str.split('@');
    const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }
  if (str.length > 4) {
    return `${str.slice(0, 3)}****${str.slice(-4)}`;
  }
  return '****';
}
