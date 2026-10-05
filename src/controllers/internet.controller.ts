import { Request, Response } from 'express';
import { InternetLog } from '../models/internet-log.model';
import { getReadQuery } from '../dal/db.dal';
import { Device } from '../models/Device';

// Helper function to format bytes to human readable string (KB, MB, GB)
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024;
  if (bytes < k * k) {
    const kb = Math.round(bytes / k);
    return `${kb} KB`;
  } else if (bytes < k * k * k) {
    const mb = (bytes / (k * k)).toFixed(2);
    return `${mb} MB`;
  } else {
    const gb = (bytes / (k * k * k)).toFixed(2);
    return `${gb} GB`;
  }
};

// Ingest Mobile Data / Internet session log from child app
export const ingestInternetLog = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      eventType,
      sessionId,
      bytesUsed,
      simCarrier,
      simCount,
      locationAddress,
      latitude,
      longitude,
      statusReason,
      timestamp,
    } = req.body;

    if (!deviceId || !eventType) {
      return res.status(400).json({ success: false, message: 'deviceId and eventType are required' });
    }

    const eventDate = timestamp ? new Date(timestamp) : new Date();

    if (eventType === 'DATA_CONNECTED' || eventType === 'DATA_ON') {
      let logEntry = null;
      if (sessionId) {
        logEntry = await InternetLog.findOne({ deviceId, sessionId });
      }

      if (logEntry) {
        // Idempotent retry / update for this session
        if (typeof bytesUsed === 'number' && bytesUsed > 0) {
          const total = Math.max(logEntry.bytesUsed || 0, bytesUsed);
          logEntry.bytesUsed = total;
          logEntry.dataUsageText = formatBytes(total);
        }
        if (simCarrier && (!logEntry.simCarrier || logEntry.simCarrier === 'Cellular Data')) {
          logEntry.simCarrier = simCarrier;
        }
        await logEntry.save();
      } else {
        const numBytes = typeof bytesUsed === 'number' ? bytesUsed : 0;
        logEntry = new InternetLog({
          deviceId,
          eventType,
          sessionId: sessionId || '',
          startTime: eventDate,
          endTime: null,
          durationSeconds: 0,
          bytesUsed: numBytes,
          dataUsageText: formatBytes(numBytes),
          isCurrentlyConnected: true,
          simCarrier: simCarrier || 'Cellular Data',
          simCount: simCount || 1,
          locationAddress: locationAddress || '',
          statusReason: statusReason || '',
          latitude: latitude || null,
          longitude: longitude || null,
          timestamp: eventDate,
        });
        await logEntry.save();
      }

      // Close any previous open session(s) for this device (different sessionId or older).
      const staleOpenSessions = await InternetLog.find({
        deviceId,
        isCurrentlyConnected: true,
        _id: { $ne: logEntry._id },
      });
      for (const openSess of staleOpenSessions) {
        const start = openSess.startTime ? new Date(openSess.startTime) : new Date(openSess.timestamp);
        const durationSec = Math.max(0, Math.floor((eventDate.getTime() - start.getTime()) / 1000));
        openSess.endTime = eventDate;
        openSess.durationSeconds = durationSec;
        openSess.isCurrentlyConnected = false;
        openSess.statusReason = 'Closed by next Data connection';
        await openSess.save();
      }

      return res.status(201).json({ success: true, message: 'Mobile Data session started', data: logEntry });
    } else if (eventType === 'DATA_DISCONNECTED' || eventType === 'DATA_OFF' || eventType === 'DATA_USAGE_UPDATE') {
      // 1. Primary: Find matching session by sessionId
      let activeSession = null;
      if (sessionId) {
        activeSession = await InternetLog.findOne({ deviceId, sessionId });
      }

      // 2. Fallback: Find currently open session for this device
      if (!activeSession) {
        activeSession = await InternetLog.findOne({ deviceId, isCurrentlyConnected: true }).sort({ timestamp: -1 });
      }

      // 3. Fallback: Find most recent session whose startTime <= eventDate
      if (!activeSession) {
        activeSession = await InternetLog.findOne({
          deviceId,
          eventType: { $in: ['DATA_CONNECTED', 'DATA_ON'] },
          startTime: { $lte: eventDate },
        }).sort({ startTime: -1 });
      }

      if (activeSession) {
        const startTime = activeSession.startTime ? new Date(activeSession.startTime) : new Date(activeSession.timestamp);
        const effectiveEndTime = eventDate.getTime() >= startTime.getTime() ? eventDate : startTime;
        const durationSec = Math.max(0, Math.floor((effectiveEndTime.getTime() - startTime.getTime()) / 1000));
        const totalBytes = Math.max(activeSession.bytesUsed || 0, typeof bytesUsed === 'number' ? bytesUsed : 0);

        activeSession.endTime = effectiveEndTime;
        activeSession.durationSeconds = durationSec;
        activeSession.bytesUsed = totalBytes;
        activeSession.dataUsageText = formatBytes(totalBytes);
        activeSession.isCurrentlyConnected = eventType === 'DATA_USAGE_UPDATE';
        if (locationAddress) activeSession.locationAddress = locationAddress;
        if (simCarrier) activeSession.simCarrier = simCarrier;
        if (statusReason) activeSession.statusReason = statusReason;

        await activeSession.save();
        return res.status(200).json({ success: true, message: 'Mobile Data session updated', data: activeSession });
      } else {
        // Fallback: create standalone record
        const numBytes = typeof bytesUsed === 'number' ? bytesUsed : 0;
        const fallbackEntry = new InternetLog({
          deviceId,
          eventType,
          sessionId: sessionId || '',
          startTime: eventDate,
          endTime: eventDate,
          durationSeconds: 0,
          bytesUsed: numBytes,
          dataUsageText: formatBytes(numBytes),
          isCurrentlyConnected: false,
          simCarrier: simCarrier || 'Cellular Data',
          simCount: simCount || 1,
          locationAddress: locationAddress || '',
          statusReason: statusReason || 'Offline fallback disconnect',
          latitude: latitude || null,
          longitude: longitude || null,
          timestamp: eventDate,
        });

        await fallbackEntry.save();
        return res.status(201).json({ success: true, message: 'Mobile Data session logged', data: fallbackEntry });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid eventType' });
    }
  } catch (error: any) {
    console.error('[INTERNET-LOG] Ingestion error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Retrieve Internet history logs with date-wise calendar filtering & summary stats (100% parity with Wi-Fi)
export const getInternetHistory = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit: limitQuery } = req.query;
    const limit = parseInt(limitQuery as string) || 200;

    const filter: any = { deviceId };

    if (date && typeof date === 'string') {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
        filter.timestamp = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    const logs = await getReadQuery(InternetLog).find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);

    const now = new Date();
    let totalBytesForDay = 0;
    let totalInternetDurationSeconds = 0;
    let simCarrierName = 'Cellular Data';
    let simCountNumber = 1;

    let morningBytes = 0, morningSeconds = 0, morningCount = 0;
    let afternoonBytes = 0, afternoonSeconds = 0, afternoonCount = 0;
    let nightBytes = 0, nightSeconds = 0, nightCount = 0;

    const formattedLogs = logs.map((log) => {
      const logObj = log.toObject();

      // Compute live duration if currently connected
      if (logObj.isCurrentlyConnected && logObj.startTime) {
        const start = new Date(logObj.startTime);
        logObj.durationSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      } else if (!logObj.isCurrentlyConnected && logObj.startTime && logObj.endTime && (!logObj.durationSeconds || logObj.durationSeconds === 0)) {
        const start = new Date(logObj.startTime);
        const end = new Date(logObj.endTime);
        const diff = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
        if (diff > 0) {
          logObj.durationSeconds = diff;
        }
      }

      const bytes = logObj.bytesUsed || 0;
      const dur = logObj.durationSeconds || 0;

      if (logObj.eventType === 'DATA_CONNECTED' || logObj.eventType === 'DATA_ON' || dur > 0) {
        totalBytesForDay += bytes;
        totalInternetDurationSeconds += dur;
        if (logObj.simCarrier) simCarrierName = logObj.simCarrier;
        if (logObj.simCount) simCountNumber = logObj.simCount;

        const eventTime = logObj.startTime ? new Date(logObj.startTime) : new Date(logObj.timestamp);
        const hour = eventTime.getHours();

        if (hour >= 6 && hour < 12) {
          morningBytes += bytes;
          morningSeconds += dur;
          morningCount++;
        } else if (hour >= 12 && hour < 18) {
          afternoonBytes += bytes;
          afternoonSeconds += dur;
          afternoonCount++;
        } else {
          nightBytes += bytes;
          nightSeconds += dur;
          nightCount++;
        }
      }

      return logObj;
    });

    return res.status(200).json({
      success: true,
      count: formattedLogs.length,
      totalInternetDurationSeconds,
      summary: {
        totalBytes: totalBytesForDay,
        totalDataText: formatBytes(totalBytesForDay),
        totalOnlineSeconds: totalInternetDurationSeconds,
        simCarrier: simCarrierName,
        simCount: simCountNumber,
      },
      timeOfDayBreakup: {
        morningSeconds,
        morningBytes,
        morningDataText: formatBytes(morningBytes),
        morningCount,
        afternoonSeconds,
        afternoonBytes,
        afternoonDataText: formatBytes(afternoonBytes),
        afternoonCount,
        nightSeconds,
        nightBytes,
        nightDataText: formatBytes(nightBytes),
        nightCount,
      },
      data: formattedLogs,
    });
  } catch (error: any) {
    console.error('[INTERNET-LOG] Retrieval error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Internet history for a specific day
export const deleteInternetHistoryDay = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'date parameter is required (YYYY-MM-DD)' });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    const parts = date.split('-').map(Number);
    const [y, m, d] = parts.length === 3 ? parts : [targetDate.getFullYear(), targetDate.getMonth() + 1, targetDate.getDate()];
    const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

    const result = await InternetLog.deleteMany({
      deviceId,
      $or: [
        { timestamp: { $gte: startOfDay, $lte: endOfDay } },
        { createdAt: { $gte: startOfDay, $lte: endOfDay } },
        { connectedAt: { $gte: startOfDay, $lte: endOfDay } },
        { date: date }
      ]
    });

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} internet logs for date: ${date}`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('[INTERNET-LOG] Delete day error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete ALL Internet history for a device
export const deleteInternetHistoryAll = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const result = await InternetLog.deleteMany({ deviceId });

    return res.status(200).json({
      success: true,
      message: `Deleted all ${result.deletedCount} internet logs for device`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('[INTERNET-LOG] Delete all error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete an individual Internet log entry by ID
export const deleteInternetLogItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await InternetLog.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Internet log entry not found' });
    }

    return res.status(200).json({ success: true, message: 'Internet log entry deleted successfully' });
  } catch (error: any) {
    console.error('[INTERNET-LOG] Delete item error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Batch ingest (local-first sync). See wifi.controller.ts for rationale.
// ---------------------------------------------------------------------------
const makeNoopResInternet = (): any => {
  const r: any = {};
  r.status = () => r;
  r.json = () => r;
  r.send = () => r;
  return r;
};

export const ingestInternetLogsBatch = async (req: Request, res: Response) => {
  try {
    const { deviceId, events } = req.body;
    if (!deviceId || !Array.isArray(events)) {
      return res.status(400).json({ success: false, message: 'deviceId and events[] are required' });
    }
    const sorted = [...events].sort((a: any, b: any) => ((a?.timestamp || 0) - (b?.timestamp || 0)));
    let processed = 0;
    for (const ev of sorted) {
      try {
        await ingestInternetLog({ body: { deviceId, ...ev } } as any, makeNoopResInternet());
        processed++;
      } catch (e: any) {
        console.error('[INTERNET-BATCH] event error:', e?.message);
      }
    }
    return res.status(200).json({ success: true, processed });
  } catch (error: any) {
    console.error('[INTERNET-BATCH] Ingestion error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
