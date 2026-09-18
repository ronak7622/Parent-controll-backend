import { Request, Response } from 'express';
import { InternetLog } from '../models/internet-log.model';
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
      bytesUsed,
      simCarrier,
      simCount,
      locationAddress,
      latitude,
      longitude,
      timestamp,
    } = req.body;

    if (!deviceId || !eventType) {
      return res.status(400).json({ success: false, message: 'deviceId and eventType are required' });
    }

    const eventDate = timestamp ? new Date(timestamp) : new Date();

    if (eventType === 'DATA_CONNECTED') {
      // Close any existing active data session for this device
      await InternetLog.updateMany(
        { deviceId, isCurrentlyConnected: true },
        { $set: { isCurrentlyConnected: false, endTime: eventDate } }
      );

      const logEntry = new InternetLog({
        deviceId,
        eventType,
        startTime: eventDate,
        endTime: null,
        durationSeconds: 0,
        bytesUsed: bytesUsed || 0,
        dataUsageText: formatBytes(bytesUsed || 0),
        isCurrentlyConnected: true,
        simCarrier: simCarrier || 'Cellular Data',
        simCount: simCount || 1,
        locationAddress: locationAddress || '',
        latitude: latitude || null,
        longitude: longitude || null,
        timestamp: eventDate,
      });

      await logEntry.save();
      return res.status(201).json({ success: true, message: 'Mobile Data session started', data: logEntry });
    } else if (eventType === 'DATA_DISCONNECTED' || eventType === 'DATA_USAGE_UPDATE') {
      const activeSession = await InternetLog.findOne({ deviceId, isCurrentlyConnected: true }).sort({ timestamp: -1 });

      if (activeSession) {
        const startTime = activeSession.startTime ? new Date(activeSession.startTime) : new Date(activeSession.timestamp);
        const durationSec = Math.max(0, Math.floor((eventDate.getTime() - startTime.getTime()) / 1000));
        const totalBytes = Math.max(activeSession.bytesUsed || 0, bytesUsed || 0);

        activeSession.endTime = eventDate;
        activeSession.durationSeconds = durationSec;
        activeSession.bytesUsed = totalBytes;
        activeSession.dataUsageText = formatBytes(totalBytes);
        activeSession.isCurrentlyConnected = eventType === 'DATA_USAGE_UPDATE';
        if (locationAddress) activeSession.locationAddress = locationAddress;
        if (simCarrier) activeSession.simCarrier = simCarrier;

        await activeSession.save();
        return res.status(200).json({ success: true, message: 'Mobile Data session updated', data: activeSession });
      } else {
        const newLog = new InternetLog({
          deviceId,
          eventType,
          startTime: eventDate,
          endTime: eventDate,
          durationSeconds: 0,
          bytesUsed: bytesUsed || 0,
          dataUsageText: formatBytes(bytesUsed || 0),
          isCurrentlyConnected: false,
          simCarrier: simCarrier || 'Cellular Data',
          simCount: simCount || 1,
          locationAddress: locationAddress || '',
          latitude: latitude || null,
          longitude: longitude || null,
          timestamp: eventDate,
        });

        await newLog.save();
        return res.status(201).json({ success: true, message: 'Mobile Data session logged', data: newLog });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid eventType' });
    }
  } catch (error: any) {
    console.error('[INTERNET-LOG] Ingestion error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Retrieve Internet history logs with date-wise calendar filtering & summary stats
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

    const logs = await InternetLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);

    const now = new Date();
    let totalBytesForDay = 0;
    let totalOnlineSecondsForDay = 0;
    let simCarrierName = 'Cellular Data';
    let simCountNumber = 1;

    let morningBytes = 0, morningSeconds = 0, morningCount = 0;
    let afternoonBytes = 0, afternoonSeconds = 0, afternoonCount = 0;
    let nightBytes = 0, nightSeconds = 0, nightCount = 0;

    const formattedLogs = logs.map((log) => {
      const logObj = log.toObject();
      if (logObj.isCurrentlyConnected && logObj.startTime) {
        const start = new Date(logObj.startTime);
        logObj.durationSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      }

      const bytes = logObj.bytesUsed || 0;
      const dur = logObj.durationSeconds || 0;

      totalBytesForDay += bytes;
      totalOnlineSecondsForDay += dur;
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

      return logObj;
    });

    return res.status(200).json({
      success: true,
      count: formattedLogs.length,
      summary: {
        totalBytes: totalBytesForDay,
        totalDataText: formatBytes(totalBytesForDay),
        totalOnlineSeconds: totalOnlineSecondsForDay,
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

    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const result = await InternetLog.deleteMany({
      deviceId,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
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
