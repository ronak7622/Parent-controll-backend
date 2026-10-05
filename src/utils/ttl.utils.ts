import { Schema } from 'mongoose';
import { config } from '../config/env';

/**
 * Attaches a dynamic Mongoose TTL Auto-Delete Index on timestamp field when ENABLE_TTL_INDEXES=true.
 * @param schema Mongoose Schema
 * @param fieldName Name of the timestamp field (default 'timestamp')
 * @param defaultTtlSeconds Default TTL in seconds (default 90 days = 7776000s)
 */
export const applyTtlIndex = (
  schema: Schema,
  fieldName: string = 'timestamp',
  defaultTtlSeconds: number = 7776000
) => {
  if (config.flags.enableTtlIndexes) {
    const ttlSeconds = parseInt(process.env.AUTO_DELETE_TTL_SECONDS || '', 10) || defaultTtlSeconds;
    schema.index({ [fieldName]: 1 }, { expireAfterSeconds: ttlSeconds, background: true });
    console.log(`[TTL-INDEX] Applied auto-delete TTL index on field '${fieldName}' (${ttlSeconds} seconds expiry)`);
  }
};
