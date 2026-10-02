import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Recording } from '../models/Recording';
import { Device } from '../models/Device';
import { sendFcmDataCommand, sendFcmTopicNotification } from '../services/fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { getISTDateString } from './parent.controller';

// Format duration helper
const formatDuration = (seconds: number): string => {
  const sec = Math.max(0, Math.round(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/**
 * Default Global Dynamic Configs (Part 8)
 * Can be overridden remotely in future without calling-code changes
 */
export const RECORDING_CONFIGS = {
  AUDIO_RECORDING_CONFIG: {
    durationsSeconds: [10, 15, 30, 60, 120, 300, 600], // 10s, 15s, 30s, 1m, 2m, 5m, 10m
    defaultDurationSeconds: 30,
    audioBitrateKbps: 64,
    sampleRateHz: 44100,
    format: 'aac',
  },
  VIDEO_RECORDING_CONFIG: {
    durationsSeconds: [10, 15, 30, 60, 120, 300, 600],
    defaultDurationSeconds: 30,
    defaultCamera: 'back', // 'front' | 'back'
    resolution: '720p',
    videoBitrateKbps: 1500,
    audioBitrateKbps: 64,
    format: 'mp4',
    qualityOptions: ['low', 'medium', 'high', 'ultra'],
    defaultQuality: 'medium',
  },
  SCREEN_RECORDING_CONFIG: {
    durationsSeconds: [10, 15, 30, 60, 120, 300, 600],
    defaultDurationSeconds: 30,
    resolution: '720p',
    videoBitrateKbps: 1500,
    fps: 24,
    format: 'mp4',
    qualityOptions: ['low', 'medium', 'high', 'ultra'],
    defaultQuality: 'medium',
  },
};

/**
 * GET /api/parent/recording/config
 * Returns global recording dynamic configuration
 */
export const getRecordingConfig = async (req: Request, res: Response) => {
  return res.json({
    success: true,
    configs: RECORDING_CONFIGS,
  });
};

/**
 * POST /api/parent/recording/start
 * Initiate a recording session (audio, video, or screen)
 */
export const startRecording = async (req: Request, res: Response) => {
  try {
    const { deviceId, recordingType, durationSeconds = 60, cameraPosition = 'back', triggerSource = 'schedule', quality = 'medium' } = req.body;

    if (!deviceId || !recordingType || !['audio', 'video', 'screen'].includes(recordingType)) {
      return res.status(400).json({ success: false, message: 'Invalid deviceId or recordingType' });
    }

    // 1. Mutual Exclusivity Lock Check (Part 3 & Part 10)
    // Only ONE recording session per device can be active at a time
    const activeSession = await Recording.findOne({
      deviceId,
      status: { $in: ['in_progress', 'saving'] },
    });

    if (activeSession) {
      return res.status(409).json({
        success: false,
        code: 'RECORDING_IN_PROGRESS',
        message: 'A recording is already in progress on this device',
        activeSession: {
          sessionId: activeSession.sessionId,
          recordingType: activeSession.recordingType,
          startedAt: activeSession.startedAt,
          durationSeconds: activeSession.durationSeconds,
        },
      });
    }

    // 2. Device Connectivity Check
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const roomSockets = getSignalingIo()?.adapter?.rooms?.get(deviceId);
    let hasChildInRoom = false;
    if (roomSockets) {
      for (const sId of roomSockets) {
        const s = getSignalingIo()?.sockets?.get(sId);
        if (s && s.data?.role === 'child') {
          hasChildInRoom = true;
          break;
        }
      }
    }

    const isReachable = hasChildInRoom;

    if (!isReachable) {
      return res.status(400).json({
        success: false,
        code: 'DEVICE_OFFLINE',
        message: 'Child device is offline or turned off.',
      });
    }

    // 3. Create Recording Session
    const sessionId = uuidv4();
    const mimeType = recordingType === 'audio' ? 'audio/aac' : 'video/mp4';

    const recording = new Recording({
      deviceId,
      recordingType,
      triggerSource: triggerSource === 'live_inline' ? 'live_inline' : 'schedule',
      status: 'in_progress',
      sessionId,
      durationSeconds: Number(durationSeconds) || 30,
      mimeType,
      cameraPosition: recordingType === 'video' ? cameraPosition : 'none',
      quality: quality || 'medium',
      startedAt: new Date(),
      timestamp: new Date(),
    });

    await recording.save();

    // 4. Send FCM command & Socket signal to child device
    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'START_RECORDING', {
        sessionId,
        recordingType,
        durationSeconds: String(durationSeconds),
        cameraPosition: String(cameraPosition),
        triggerSource,
        quality: String(quality),
      });
    }

    try {
      getSignalingIo()?.to(deviceId).emit('remote-command', {
        command: 'START_RECORDING',
        deviceId,
        sessionId,
        recordingType,
        durationSeconds: String(durationSeconds),
        cameraPosition: String(cameraPosition),
        triggerSource,
        quality: String(quality),
      });
    } catch (socketErr) {
      console.error('[START-RECORDING-SOCKET-EMIT-ERROR]', socketErr);
    }

    return res.json({
      success: true,
      message: 'Recording started successfully',
      recording: {
        sessionId: recording.sessionId,
        recordingType: recording.recordingType,
        status: recording.status,
        durationSeconds: recording.durationSeconds,
        startedAt: recording.startedAt,
      },
    });
  } catch (error: any) {
    console.error('[RECORDING-START-ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/parent/recording/stop
 * Stop an active recording session early
 */
export const stopRecording = async (req: Request, res: Response) => {
  try {
    const { deviceId, sessionId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const query: any = { deviceId, status: { $in: ['in_progress', 'saving'] } };
    if (sessionId) query.sessionId = sessionId;

    let recording = await Recording.findOne(query);
    if (!recording && sessionId) {
      // Fallback search for any active session on the device
      recording = await Recording.findOne({ deviceId, status: { $in: ['in_progress', 'saving'] } });
    }

    if (recording) {
      recording.status = 'saving';
      recording.endedAt = new Date();
      await recording.save();
    }

    const device = await Device.findOne({ deviceId });

    // 1. Send FCM STOP command
    if (device?.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'STOP_RECORDING', {
        sessionId: recording?.sessionId || sessionId || '',
      });
    }

    // 2. ALWAYS emit Socket.IO remote-command to child device room!
    try {
      getSignalingIo()?.to(deviceId).emit('remote-command', {
        command: 'STOP_RECORDING',
        deviceId,
        sessionId: recording?.sessionId || sessionId || '',
      });
    } catch (socketErr) {
      console.error('[STOP-RECORDING-SOCKET-EMIT-ERROR]', socketErr);
    }

    return res.json({
      success: true,
      message: 'Stop recording command sent to device',
      sessionId: recording?.sessionId || sessionId || null,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/parent/recording/active-status
 * Query current active recording session for a device (State Persistence Part 7 & 9)
 */
export const getActiveRecordingStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, message: 'deviceId parameter is required' });
    }

    const activeSession = await Recording.findOne({
      deviceId,
      status: { $in: ['in_progress', 'saving'] },
    });

    const roomSockets = getSignalingIo()?.adapter?.rooms?.get(deviceId as string);
    let hasChildInRoom = false;
    if (roomSockets) {
      for (const sId of roomSockets) {
        const s = getSignalingIo()?.sockets?.get(sId);
        if (s && s.data?.role === 'child') {
          hasChildInRoom = true;
          break;
        }
      }
    }

    if (activeSession) {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - activeSession.startedAt.getTime()) / 1000));
      const isSavingStale = activeSession.status === 'saving' && activeSession.endedAt && (Date.now() - activeSession.endedAt.getTime()) > 8000;
      // Auto-expire session if child device is not in room, or if it exceeded expected duration + 20 seconds buffer, or if saving > 8 seconds
      if (!hasChildInRoom || elapsedSeconds > activeSession.durationSeconds + 20 || isSavingStale) {
        console.log(`[RECORDING-STALE-EXPIRE] Auto-expiring stale session ${activeSession.sessionId} (hasChildInRoom=${hasChildInRoom}) for device ${deviceId}`);
        activeSession.status = 'failed';
        await activeSession.save();
      }
    }

    // Re-query active session after stale cleanup
    const currentActive = await Recording.findOne({
      deviceId,
      status: { $in: ['in_progress', 'saving'] },
    });

    if (!currentActive) {
      // Check for recently completed recording highlight (completed within last 30s)
      const recentCompleted = await Recording.findOne({
        deviceId,
        status: 'completed',
        fileSizeBytes: { $gt: 0 },
        endedAt: { $gte: new Date(Date.now() - 30 * 1000) },
      }).sort({ endedAt: -1 });

      return res.json({
        success: true,
        hasActiveRecording: false,
        recentlyCompleted: recentCompleted
          ? {
              sessionId: recentCompleted.sessionId,
              recordingType: recentCompleted.recordingType,
              durationSeconds: recentCompleted.durationSeconds,
              mediaUrl: recentCompleted.mediaUrl,
              completedAt: recentCompleted.endedAt,
            }
          : null,
      });
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - currentActive.startedAt.getTime()) / 1000));
    const remainingSeconds = Math.max(0, currentActive.durationSeconds - elapsedSeconds);

    return res.json({
      success: true,
      hasActiveRecording: true,
      session: {
        sessionId: currentActive.sessionId,
        recordingType: currentActive.recordingType,
        cameraPosition: currentActive.cameraPosition,
        quality: currentActive.quality,
        triggerSource: currentActive.triggerSource,
        status: currentActive.status,
        durationSeconds: currentActive.durationSeconds,
        elapsedSeconds,
        remainingSeconds,
        startedAt: currentActive.startedAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/parent/recording/list
 * Fetch list of recordings filtered by type and date
 */
export const getRecordings = async (req: Request, res: Response) => {
  try {
    const { deviceId, type, date, limit = 100 } = req.query;

    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, message: 'deviceId parameter is required' });
    }
    if (!type || !['audio', 'video', 'screen'].includes(type as string)) {
      return res.status(400).json({ success: false, message: 'valid type parameter (audio, video, screen) is required' });
    }

    const query: any = {
      deviceId,
      recordingType: type,
      status: 'completed',
      fileSizeBytes: { $gt: 0 },
      mediaUrl: { $ne: '', $exists: true },
    };

    if (date && typeof date === 'string' && date.trim().length > 0) {
      // Parse YYYY-MM-DD in local IST (+05:30) timezone
      const targetDateStr = date.trim();
      const startOfDay = new Date(`${targetDateStr}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${targetDateStr}T23:59:59.999+05:30`);
      query.timestamp = { $gte: startOfDay, $lte: endOfDay };
    }

    const list = await Recording.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit) || 100);

    return res.json({
      success: true,
      count: list.length,
      recordings: list.map((item) => ({
        id: item._id,
        sessionId: item.sessionId,
        recordingType: item.recordingType,
        triggerSource: item.triggerSource,
        mediaUrl: item.mediaUrl,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: item.durationSeconds,
        fileSizeBytes: item.fileSizeBytes,
        formattedDuration: formatDuration(item.durationSeconds),
        mimeType: item.mimeType,
        cameraPosition: item.cameraPosition,
        quality: item.quality || 'medium',
        timestamp: item.timestamp,
        formattedDate: getISTDateString(item.timestamp),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/parent/recording/delete
 * Delete single recording, selected date history, or all history
 */
export const deleteRecordings = async (req: Request, res: Response) => {
  try {
    const { deviceId, recordingId, date, deleteAll = false, type } = req.body;

    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    if (recordingId) {
      await Recording.deleteOne({ _id: recordingId, deviceId });
      return res.json({ success: true, message: 'Recording deleted successfully' });
    }

    if (deleteAll) {
      const deleteQuery: any = { deviceId };
      if (type) deleteQuery.recordingType = type;
      const result = await Recording.deleteMany(deleteQuery);
      return res.json({ success: true, count: result.deletedCount, message: 'All history deleted successfully' });
    }

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      const deleteQuery: any = {
        deviceId,
        timestamp: { $gte: startOfDay, $lte: endOfDay },
      };
      if (type) deleteQuery.recordingType = type;

      const result = await Recording.deleteMany(deleteQuery);
      return res.json({ success: true, count: result.deletedCount, message: `History for ${date} deleted successfully` });
    }

    return res.status(400).json({ success: false, message: 'Invalid deletion parameters' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/ingest/recording/presigned-url
 * Child app requests pre-signed direct upload storage endpoint
 */
export const getRecordingPresignedUrl = async (req: Request, res: Response) => {
  try {
    const { deviceId, recordingType = 'audio', extension = 'aac' } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const key = `recordings/${recordingType}/${deviceId}/${uuidv4()}.${extension}`;
    return res.json({
      success: true,
      uploadUrl: `/ingest/recording/direct?key=${encodeURIComponent(key)}`,
      key,
      expiresInSeconds: 900,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/ingest/recording/direct?key=...
 * Direct stream upload endpoint for child recording files & webp thumbnails
 */
export const uploadRecordingDirect = async (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    if (!key) {
      return res.status(400).json({ success: false, message: 'key parameter is required' });
    }

    const uploadsDir = path.join(__dirname, '../../public/uploads');
    const targetPath = path.join(uploadsDir, key);

    // Ensure target folder structure exists
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(targetPath);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log(`[RECORDING-DIRECT-UPLOAD-SUCCESS] File saved to ${targetPath}`);
      return res.json({
        success: true,
        message: 'File uploaded successfully',
        key,
        url: `/uploads/${key}`,
      });
    });

    writeStream.on('error', (err) => {
      console.error('[RECORDING-DIRECT-UPLOAD-ERROR]', err);
      return res.status(500).json({ success: false, message: err.message });
    });
  } catch (error: any) {
    console.error('[RECORDING-DIRECT-UPLOAD-EXCEPTION]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/ingest/recording/complete
 * Child app completes direct upload and notifies backend to finalize record and trigger FCM push notification
 */
export const completeRecording = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      sessionId,
      recordingType,
      mediaUrl,
      thumbnailUrl,
      durationSeconds = 0,
      fileSizeBytes = 0,
      triggerSource = 'schedule',
    } = req.body;

    if (!deviceId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Missing required completion parameters' });
    }

    const numSize = Number(fileSizeBytes) || 0;
    const isCompleted = Boolean(mediaUrl && mediaUrl.trim().length > 0 && numSize > 0);
    const finalStatus = isCompleted ? 'completed' : 'failed';

    // Upsert recording document with idempotency on sessionId
    const recording = await Recording.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          deviceId,
          recordingType: recordingType || 'audio',
          triggerSource: triggerSource || 'schedule',
          status: finalStatus,
          mediaUrl: mediaUrl || '',
          thumbnailUrl: thumbnailUrl || mediaUrl || '',
          durationSeconds: Number(durationSeconds) || 0,
          fileSizeBytes: numSize,
          ...(req.body.quality ? { quality: req.body.quality } : {}),
          endedAt: new Date(),
          timestamp: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[RECORDING-COMPLETE] Recording (${recording.recordingType}) status=${finalStatus} for device ${deviceId}: ${mediaUrl}`);

    // Emit real-time socket signal to parent room so parent live views update immediately
    try {
      getSignalingIo()?.to(deviceId).emit('recording-completed', {
        deviceId,
        sessionId: recording.sessionId,
        recordingType: recording.recordingType,
        status: finalStatus,
        mediaUrl: recording.mediaUrl,
      });
    } catch (sErr) {
      console.warn('[RECORDING-COMPLETE-SOCKET-EMIT-ERROR]', sErr);
    }

    // Trigger server-side Firebase push notification to Parent (Part 7 & Part 10)
    const device = await Device.findOne({ deviceId });
    if (device && device.parentUserId) {
      const typeLabel =
        recording.recordingType === 'audio'
          ? 'Audio Recording'
          : recording.recordingType === 'video'
          ? 'Video Recording'
          : 'Screen Recording';

      const childName = device.deviceName || 'Child Device';
      const durationStr = formatDuration(recording.durationSeconds);
      const title = `${typeLabel} Saved`;
      const body = `${childName} completed ${typeLabel.toLowerCase()} (${durationStr})`;

      sendFcmTopicNotification(`parent_${device.parentUserId}`, title, body, {
        type: 'RECORDING_COMPLETED',
        deviceId,
        recordingType: recording.recordingType,
        sessionId: recording.sessionId,
        durationSeconds: String(recording.durationSeconds),
      }).catch((err) => console.warn('[FCM] Recording completion push error:', err?.message));
    }

    return res.json({
      success: true,
      message: 'Recording completion registered',
      recordingId: recording._id,
    });
  } catch (error: any) {
    console.error('[RECORDING-COMPLETE-ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
