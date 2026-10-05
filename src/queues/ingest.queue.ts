import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { Contact } from '../models/Contact';
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { KeyboardLog } from '../models/KeyboardLog';
import { WifiLog } from '../models/wifi-log.model';
import { InternetLog } from '../models/internet-log.model';

let ingestQueue: Queue | null = null;
let ingestWorker: Worker | null = null;

const connection = {
  url: config.redisUri,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};

const processJobPayload = async (jobType: string, payload: any) => {
  if (!payload || !Array.isArray(payload.docs) || payload.docs.length === 0) {
    return;
  }
  const docs = payload.docs;

  try {
    switch (jobType) {
      case 'browser_history': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, timestamp: d.timestamp, url: d.url },
            update: { $set: d },
            upsert: true,
          },
        }));
        await BrowserHistory.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'youtube_history': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, timestamp: d.timestamp, title: d.title },
            update: { $set: d },
            upsert: true,
          },
        }));
        await YouTubeHistory.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'youtube_session': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, startTime: d.startTime },
            update: { $set: d },
            upsert: true,
          },
        }));
        await YouTubeSession.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'call_logs': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: d.callId
              ? { deviceId: d.deviceId, callId: d.callId }
              : { deviceId: d.deviceId, timestamp: d.timestamp, phoneNumber: d.phoneNumber },
            update: { $set: d },
            upsert: true,
          },
        }));
        await CallLog.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'contacts': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, phoneNumber: d.phoneNumber },
            update: { $set: d },
            upsert: true,
          },
        }));
        await Contact.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'notifications': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: {
              deviceId: d.deviceId,
              packageName: d.packageName,
              timestamp: d.timestamp,
              title: d.title,
              body: d.body,
            },
            update: { $set: d },
            upsert: true,
          },
        }));
        await ChildNotification.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'location_history': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, timestamp: d.timestamp },
            update: { $set: d },
            upsert: true,
          },
        }));
        await LocationLog.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'driving_trips': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, startTime: d.startTime },
            update: { $set: d },
            upsert: true,
          },
        }));
        await DrivingTrip.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'keyboard_logs': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: {
              deviceId: d.deviceId,
              timestamp: d.timestamp,
              matchedKeyword: d.matchedKeyword,
              packageName: d.packageName,
            },
            update: { $set: d },
            upsert: true,
          },
        }));
        await KeyboardLog.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'wifi_logs': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, timestamp: d.timestamp, ssid: d.ssid },
            update: { $set: d },
            upsert: true,
          },
        }));
        await WifiLog.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'internet_logs': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, timestamp: d.timestamp, networkType: d.networkType },
            update: { $set: d },
            upsert: true,
          },
        }));
        await InternetLog.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'app_usage': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, packageName: d.packageName, date: d.date },
            update: { $set: d },
            upsert: true,
          },
        }));
        await AppUsage.bulkWrite(ops, { ordered: false });
        break;
      }
      case 'app_sessions': {
        const ops = docs.map((d: any) => ({
          updateOne: {
            filter: { deviceId: d.deviceId, packageName: d.packageName, startTime: d.startTime },
            update: { $set: d },
            upsert: true,
          },
        }));
        await AppSession.bulkWrite(ops, { ordered: false });
        break;
      }
      default:
        console.warn(`[BULLMQ-WORKER] Unknown jobType: ${jobType}`);
    }
  } catch (err: any) {
    console.error(`[BULLMQ-WORKER-ERR] Error executing bulkWrite for ${jobType}:`, err.message);
    throw err;
  }
};

export const initIngestQueue = () => {
  if (!config.flags.enableBullmqIngest) {
    console.log('[BULLMQ-QUEUE] Async queue ingestion disabled (ENABLE_BULLMQ_INGEST=false). Processing inline.');
    return;
  }

  try {
    ingestQueue = new Queue('child-ingest-queue', { connection });
    ingestQueue.on('error', (err) => {
      console.warn('[BULLMQ-QUEUE-WARN] Redis error:', err.message);
    });
    console.log('[BULLMQ-QUEUE] Ingest Queue initialized successfully on Redis:', config.redisUri);

    ingestWorker = new Worker(
      'child-ingest-queue',
      async (job: Job) => {
        const { jobType, payload } = job.data;
        console.log(`[BULLMQ-WORKER] Processing background job ${job.id} of type ${jobType}`);
        await processJobPayload(jobType, payload);
      },
      { connection }
    );

    ingestWorker.on('error', (err) => {
      console.warn('[BULLMQ-WORKER-WARN] Redis error:', err.message);
    });

    ingestWorker.on('failed', (job, err) => {
      console.error(`[BULLMQ-WORKER-FAIL] Job ${job?.id} failed:`, err.message);
    });
  } catch (error: any) {
    console.warn('[BULLMQ-INIT-WARN] Failed to start BullMQ Queue:', error.message);
    ingestQueue = null;
    ingestWorker = null;
  }
};

export const enqueueIngestJob = async (jobType: string, payload: any): Promise<boolean> => {
  if (!config.flags.enableBullmqIngest || !ingestQueue) {
    return false; // Fallback to inline processing
  }

  try {
    await ingestQueue.add(jobType, { jobType, payload }, { removeOnComplete: true, attempts: 3 });
    return true;
  } catch (err: any) {
    console.warn('[BULLMQ-ENQUEUE-WARN] Enqueue failed, falling back to inline:', err.message);
    return false;
  }
};
