import { Schema } from 'mongoose';

/**
 * Attaches dynamic Mongoose TTL Auto-Delete Index when enabled.
 * NOTE: For Storage & Monetization 10M+ users, paid parent data must NOT vanish
 * without parent permission. Automatic database TTL auto-delete is disabled.
 * Retention is governed by parent auto-delete settings, manual delete, or post-grace cleanup.
 */
export const applyTtlIndex = (
  schema: Schema,
  fieldName: string = 'timestamp',
  defaultTtlSeconds: number = 7776000
) => {
  // No-op: TTL indexes disabled to protect parent data
  return;
};
