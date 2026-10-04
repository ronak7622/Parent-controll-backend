import { Request, Response } from 'express';
import { WifiLog } from '../models/wifi-log.model';

// Ingest Wi-Fi log event from child device
export const ingestWifiLog = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      eventType,
      ssid,
      bssid,
      ipAddress,
      sessionId, // NEW: unique id generated client-side per connection session
      latitude,
      longitude,
      locationName,
      locationAddress,
      isBlockedAttempt,
      bytesUsed,
      timestamp,
    } = req.body;

    if (!deviceId || !eventType) {
      return res.status(400).json({ success: false, message: 'deviceId and eventType are required' });
    }

    const eventDate = timestamp ? new Date(timestamp) : new Date();

    if (eventType === 'WIFI_CONNECTED') {
      let logEntry = null;
      if (sessionId) {
        logEntry = await WifiLog.findOne({ deviceId, sessionId });
      }

      if (logEntry) {
        // Idempotent retry / update for this session
        if (typeof bytesUsed === 'number' && bytesUsed > 0) {
          logEntry.bytesUsed = Math.max(logEntry.bytesUsed || 0, bytesUsed);
        }
        if (ssid && (!logEntry.ssid || logEntry.ssid === 'Connected Wi-Fi')) {
          logEntry.ssid = ssid;
        }
        await logEntry.save();
      } else {
        logEntry = new WifiLog({
          deviceId,
          eventType,
          ssid: ssid || '',
          bssid: bssid || '',
          ipAddress: ipAddress || '',
          sessionId: sessionId || '',
          startTime: eventDate,
          endTime: null,
          durationSeconds: 0,
          bytesUsed: typeof bytesUsed === 'number' ? bytesUsed : 0,
          isCurrentlyConnected: true,
          latitude: latitude || null,
          longitude: longitude || null,
          locationName: locationName || '',
          locationAddress: locationAddress || '',
          isBlockedAttempt: false,
          statusReason: '',
          timestamp: eventDate,
        });
        await logEntry.save();
      }

      // Close any previous open session(s) for this device (different sessionId or older).
      // Note: we mark them disconnected with fallback end time, but if the real disconnect
      // event arrives later (delayed offline queue), it will overwrite with the true disconnect time.
      const staleOpenSessions = await WifiLog.find({
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
        openSess.statusReason = 'Closed by next Wi-Fi connection';
        await openSess.save();
      }

      return res.status(201).json({ success: true, message: 'Wi-Fi connection session started', data: logEntry });
    } else if (eventType === 'WIFI_DISCONNECTED' || eventType === 'WIFI_OFF') {
      // 1. Primary: Find the matching session by sessionId.
      // NOTE: We deliberately do NOT restrict to isCurrentlyConnected: true!
      // When the child device disconnects while offline, the disconnect event is queued.
      // If the child reconnects to Wi-Fi later, the new WIFI_CONNECTED event arrives first,
      // marking the old session as closed with fallback time.
      // When this queued disconnect event arrives shortly after, finding by sessionId allows us
      // to update that exact session with the REAL disconnect timestamp, duration, and data usage!
      let activeSession = null;
      if (sessionId) {
        activeSession = await WifiLog.findOne({ deviceId, sessionId });
      }

      // 2. Fallback: Find the currently open session for this device
      if (!activeSession) {
        activeSession = await WifiLog.findOne({ deviceId, isCurrentlyConnected: true }).sort({ timestamp: -1 });
      }

      // 3. Fallback: Find the most recent session whose startTime <= eventDate
      if (!activeSession) {
        activeSession = await WifiLog.findOne({
          deviceId,
          eventType: 'WIFI_CONNECTED',
          startTime: { $lte: eventDate },
        }).sort({ startTime: -1 });
      }

      if (activeSession) {
        const startTime = activeSession.startTime ? new Date(activeSession.startTime) : new Date(activeSession.timestamp);
        // Use the eventDate (the exact disconnect timestamp recorded on-device) as endTime
        const effectiveEndTime = eventDate.getTime() >= startTime.getTime() ? eventDate : startTime;
        const durationSec = Math.max(0, Math.floor((effectiveEndTime.getTime() - startTime.getTime()) / 1000));

        activeSession.endTime = effectiveEndTime;
        activeSession.durationSeconds = durationSec;
        activeSession.isCurrentlyConnected = false;
        activeSession.statusReason = ''; // Cleared on clean disconnect

        const parsedBytes = typeof bytesUsed === 'number' ? bytesUsed : (typeof bytesUsed === 'string' ? parseInt(bytesUsed) : 0);
        if (!isNaN(parsedBytes) && parsedBytes > 0) {
          activeSession.bytesUsed = Math.max(activeSession.bytesUsed || 0, parsedBytes);
        }
        if (ssid && (!activeSession.ssid || activeSession.ssid === 'Connected Wi-Fi')) {
          activeSession.ssid = ssid;
        }
        if (bssid && !activeSession.bssid) {
          activeSession.bssid = bssid;
        }
        if (locationAddress && !activeSession.locationAddress) {
          activeSession.locationAddress = locationAddress;
        }

        await activeSession.save();
        return res.status(200).json({ success: true, message: 'Wi-Fi session closed with exact disconnect timestamp', data: activeSession });
      }

      // If no matching session is found (e.g. app was started right when disconnected),
      // create a clean session record instead of an orphan disconnected row
      const fallbackEntry = new WifiLog({
        deviceId,
        eventType: 'WIFI_CONNECTED',
        ssid: ssid || 'Wi-Fi Network',
        bssid: bssid || '',
        ipAddress: ipAddress || '',
        sessionId: sessionId || '',
        startTime: eventDate,
        endTime: eventDate,
        durationSeconds: 0,
        bytesUsed: typeof bytesUsed === 'number' ? bytesUsed : 0,
        isCurrentlyConnected: false,
        latitude: latitude || null,
        longitude: longitude || null,
        locationName: locationName || '',
        locationAddress: locationAddress || '',
        isBlockedAttempt: false,
        statusReason: '',
        timestamp: eventDate,
      });
      await fallbackEntry.save();
      return res.status(201).json({ success: true, message: 'Wi-Fi session logged', data: fallbackEntry });
    } else {
      // WIFI_ON, WIFI_BLOCKED_ATTEMPT, or any other event — acknowledge
      return res.status(200).json({ success: true, message: 'Wi-Fi event acknowledged' });
    }
  } catch (error: any) {
    console.error('[WIFI-LOG] Ingestion error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Retrieve Wi-Fi log history with date-wise calendar filtering & session calculation
export const getWifiHistory = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit: limitQuery } = req.query;
    const limit = parseInt(limitQuery as string) || 200;

    // Filter out raw WIFI_ON / WIFI_OFF / WIFI_BLOCKED_ATTEMPT events
    const filter: any = {
      deviceId,
      eventType: { $nin: ['WIFI_ON', 'WIFI_OFF', 'WIFI_BLOCKED_ATTEMPT'] }
    };

    if (date && typeof date === 'string') {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
        filter.timestamp = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    const logs = await WifiLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);

    // Compute live active duration for currently connected sessions & Time-of-Day breakup
    const now = new Date();
    let totalWifiDurationSeconds = 0;
    let morningSeconds = 0, morningCount = 0, morningBytes = 0;
    let afternoonSeconds = 0, afternoonCount = 0, afternoonBytes = 0;
    let nightSeconds = 0, nightCount = 0, nightBytes = 0;

    const formattedLogs = logs.map((log) => {
      const logObj = log.toObject();
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

      const dur = logObj.durationSeconds || 0;
      const bytes = logObj.bytesUsed || 0;

      if (logObj.eventType === 'WIFI_CONNECTED' || dur > 0) {
        totalWifiDurationSeconds += dur;

        const eventTime = logObj.startTime ? new Date(logObj.startTime) : new Date(logObj.timestamp);
        const hour = eventTime.getHours();

        if (hour >= 6 && hour < 12) {
          morningSeconds += dur;
          morningCount++;
          morningBytes += bytes;
        } else if (hour >= 12 && hour < 18) {
          afternoonSeconds += dur;
          afternoonCount++;
          afternoonBytes += bytes;
        } else {
          nightSeconds += dur;
          nightCount++;
          nightBytes += bytes;
        }
      }
      return logObj;
    });

    return res.status(200).json({
      success: true,
      count: formattedLogs.length,
      totalWifiDurationSeconds,
      timeOfDayBreakup: {
        morningSeconds,
        morningCount,
        morningBytes,
        afternoonSeconds,
        afternoonCount,
        afternoonBytes,
        nightSeconds,
        nightCount,
        nightBytes,
      },
      data: formattedLogs,
    });
  } catch (error: any) {
    console.error('[WIFI-LOG] Retrieval error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Wi-Fi history for a specific selected day
export const deleteWifiHistoryForDay = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'date query parameter is required (YYYY-MM-DD)' });
    }

    const parts = date.split('-').map(Number);
    let startOfDay: Date;
    let endOfDay: Date;

    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const [y, m, d] = parts;
      startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    } else {
      const targetDate = new Date(date);
      startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
    }

    const result = await WifiLog.deleteMany({
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
      message: `Deleted ${result.deletedCount} Wi-Fi logs for date: ${date}`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('[WIFI-LOG] Delete day error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete ALL Wi-Fi history for a device
export const deleteWifiHistoryAll = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const result = await WifiLog.deleteMany({ deviceId });

    return res.status(200).json({
      success: true,
      message: `Deleted all ${result.deletedCount} Wi-Fi logs for device`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('[WIFI-LOG] Delete all error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete an individual Wi-Fi log record by ID
export const deleteWifiLogItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await WifiLog.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Wi-Fi log entry not found' });
    }

    return res.status(200).json({ success: true, message: 'Wi-Fi log entry deleted successfully' });
  } catch (error: any) {
    console.error('[WIFI-LOG] Delete item error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// ---------------------------------------------------------------------------
// Batch ingest (local-first sync). Accepts { deviceId, events: [...] } and
// replays each event through the proven single-event handler in timestamp
// order, so the exact same session pairing / idempotency logic applies.
// A no-op Response is passed so the per-event handler's res calls are harmless.
// ---------------------------------------------------------------------------
const makeNoopRes = (): any => {
  const r: any = {};
  r.status = () => r;
  r.json = () => r;
  r.send = () => r;
  return r;
};

export const ingestWifiLogsBatch = async (req: Request, res: Response) => {
  try {
    const { deviceId, events } = req.body;
    if (!deviceId || !Array.isArray(events)) {
      return res.status(400).json({ success: false, message: 'deviceId and events[] are required' });
    }
    const sorted = [...events].sort((a: any, b: any) => ((a?.timestamp || 0) - (b?.timestamp || 0)));
    let processed = 0;
    for (const ev of sorted) {
      try {
        await ingestWifiLog({ body: { deviceId, ...ev } } as any, makeNoopRes());
        processed++;
      } catch (e: any) {
        console.error('[WIFI-BATCH] event error:', e?.message);
      }
    }
    return res.status(200).json({ success: true, processed });
  } catch (error: any) {
    console.error('[WIFI-BATCH] Ingestion error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
