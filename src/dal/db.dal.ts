import { Model, Document, FilterQuery, Query } from 'mongoose';
import { config } from '../config/env';

/**
 * Data Access Layer (DAL) Helper for MongoDB Sharding Readiness & Read/Write Splitting
 */

/**
 * Returns a Mongoose query with readPreference set to 'secondaryPreferred' when ENABLE_READ_REPLICAS=true.
 * Usage:
 * const docs = await getReadQuery(LocationLog).find({ deviceId, timestamp: { $gte: startDate } }).exec();
 */
export function getReadQuery<T extends Document>(model: Model<T>) {
  if (config.flags.enableReadReplicas) {
    return model.find().read('secondaryPreferred');
  }
  return model.find();
}

/**
 * Ensures query options target specific deviceId shard key explicitly
 */
export function buildShardFilter<T>(deviceId: string, extraFilter: FilterQuery<T> = {}): FilterQuery<T> {
  return {
    deviceId,
    ...extraFilter,
  };
}

/**
 * Safely clamps query pagination limit to prevent memory spikes on 10M scale reads
 */
export function clampPaginationLimit(rawLimit: any, maxLimit = 200, defaultLimit = 50): number {
  const parsed = parseInt(rawLimit, 10);
  if (isNaN(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

