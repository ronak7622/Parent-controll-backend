import { Router } from 'express';
import { requestOtp, verifyOtp } from '../controllers/auth.controller';
import {
  generatePairingCode,
  checkPairingStatus,
  pairDeviceWithCode,
  pairChildDevice,
  completeChildSetup,
  checkSetupStatus,
  getParentDevices,
  getDeviceDetails,
  updateDeviceSettings,
  sendRemoteCommand,
  disconnectDevice,
  getChildAppLimits,
  reportLimitReached,
  getChildAppBlocks,
  reportBlockedAppAttempt,
} from '../controllers/device.controller';
import {
  updateHeartbeat,
  ingestBrowserHistory,
  ingestYouTubeHistory,
  ingestYouTubeSession,
  uploadCapturedMedia,
  uploadBatchCapturedMedia,
  getPresignedUploadUrl,
  registerMediaMetadata,
  ingestGeneralLogs,
  ingestCallLogs,
  ingestContacts,
  ingestCallRecording,
  ingestCallRecordingStream,
  ingestAppSessions,
  updateDeviceSyncStatus,
  ingestInstalledApps,
  ingestNotifications,
  ingestLocationHistory,
  ingestLiveLocation,
  ingestDrivingTrips,
  ingestKeyboardLogs,
} from '../controllers/ingest.controller';
import {
  ingestMessages,
  getConversations,
  getMessagesForConversation,
  getMessageDetail,
  markAllMessagesRead,
  deleteMessage,
  deleteMessagesForDevice,
} from '../controllers/message.controller';
import {
  getBrowserHistory,
  deleteBrowserHistory,
  deleteBrowserHistoryBatch,
  deleteBrowserHistoryForDevice,
  getYouTubeHistory,
  getYouTubeSessions,
  deleteYouTubeSession,
  deleteYouTubeSessionsForDevice,
  deleteYouTubeHistory,
  deleteYouTubeHistoryForDevice,
  getCapturedMedia,
  getScheduleConfig,
  updateScheduleConfig,
  deleteCapturedMedia,
  getContacts,
  deleteContact,
  getCallLogs,
  deleteSelectedDayCallLogs,
  deleteAllCallLogs,
  triggerDeviceSync,
  blockPhoneNumber,
  unblockPhoneNumber,
  blockOutgoingPhoneNumber,
  unblockOutgoingPhoneNumber,
  getBlockedCalls,
  getCallRecordings,
  streamCallRecording,
  getCallRecordingSettings,
  updateCallRecordingSettings,
  getCallRecordingContacts,
  deleteCallRecording,
  deleteCallRecordingsForDay,
  deleteAllCallRecordings,
  getAppUsage,
  getAppSessions,
  deleteAppSession,
  deleteAppUsageForDevice,
  getAppLimits,
  saveAppLimit,
  deleteAppLimit,
  getAppBlockRules,
  saveAppBlockRule,
  deleteAppBlockRule,
  getNotificationApps,
  getInstalledApps,
  getNotificationsForApp,
  getNotificationDetail,
  deleteNotification,
  deleteNotificationsForDay,
  deleteAllNotificationsForApp,
  markAllNotificationsRead,
  getLocationHistory,
  getLiveLocation,
  getDrivingHistory,
  deleteDrivingHistoryForDay,
  deleteAllDrivingHistory,
  deleteDrivingTripItem,
  deleteLocationHistoryForDay,
  deleteAllLocationHistory,
  deleteLocationLogItem,
  getMonitoredKeywords,
  addMonitoredKeyword,
  deleteMonitoredKeyword,
  getKeyboardHistory,
  deleteKeyboardHistoryForDay,
  deleteAllKeyboardHistory,
  deleteKeyboardLogItem,
} from '../controllers/parent.controller';


import {
  ingestWifiLog,
  ingestWifiLogsBatch,
  getWifiHistory,
  deleteWifiHistoryForDay,
  deleteWifiHistoryAll,
  deleteWifiLogItem,
} from '../controllers/wifi.controller';
import {
  ingestInternetLog,
  ingestInternetLogsBatch,
  getInternetHistory,
  deleteInternetHistoryDay,
  deleteInternetHistoryAll,
  deleteInternetLogItem,
} from '../controllers/internet.controller';
import { authenticateJwt, authenticateDevice } from '../middleware/auth';
import { verifyDeviceOwnership } from '../middleware/ownership';
import { getRemoteConfig } from '../controllers/config.controller';
import {
  getStorageStatus,
  purchasePlan,
  purchaseStorageAddon,
  updateAutoDeleteSettings,
} from '../controllers/storage.controller';
import recordingRoutes from './recording.routes';

const router = Router();
router.use('/', recordingRoutes);

// Remote Dynamic Config Route
router.get('/config/remote', getRemoteConfig);

// Parent Storage & Plan Management Routes
router.get('/parent/storage-status', authenticateJwt, getStorageStatus);
router.post('/parent/purchase-plan', authenticateJwt, purchasePlan);
router.post('/parent/purchase-addon', authenticateJwt, purchaseStorageAddon);
router.post('/parent/auto-delete-settings', authenticateJwt, updateAutoDeleteSettings);


// ===================================
// 1. Auth Routes (Parent App & Web)
// ===================================
router.post('/auth/send-otp', requestOtp);
router.post('/auth/request-otp', requestOtp);
router.post('/auth/verify-otp', verifyOtp);

// ===================================
// 2. Device Pairing & Management Routes
// ===================================
router.post('/device/pair-code', authenticateJwt, generatePairingCode);
router.get('/device/pair-status/:code', checkPairingStatus);
router.post('/parent/pair-device', authenticateJwt, pairDeviceWithCode);
router.post('/device/pair', pairChildDevice);
router.post('/device/complete-setup', completeChildSetup);
router.get('/device/setup-status/:code', checkSetupStatus);
router.get('/parent/devices', authenticateJwt, getParentDevices);
router.get('/device/list', authenticateJwt, getParentDevices);
router.get('/parent/device/:deviceId', authenticateJwt, verifyDeviceOwnership, getDeviceDetails);
router.put('/device/:deviceId/settings', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.put('/device/:deviceId/restrictions', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.put('/parent/device/:deviceId/settings', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.put('/parent/device/:deviceId/restrictions', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.post('/parent/device/:deviceId/restrictions', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.post('/device/:deviceId/settings', authenticateJwt, verifyDeviceOwnership, updateDeviceSettings);
router.post('/device/:deviceId/command', authenticateJwt, verifyDeviceOwnership, sendRemoteCommand);
router.post('/parent/device/:deviceId/disconnect', authenticateJwt, verifyDeviceOwnership, disconnectDevice);
router.post('/device/unpair', authenticateDevice, disconnectDevice);
router.delete('/device/:deviceId', authenticateJwt, verifyDeviceOwnership, disconnectDevice);
router.get('/parent/device/:deviceId/schedule-config', authenticateJwt, verifyDeviceOwnership, getScheduleConfig);
router.post('/parent/device/:deviceId/schedule-config', authenticateJwt, verifyDeviceOwnership, updateScheduleConfig);
router.put('/parent/device/:deviceId/schedule-config', authenticateJwt, verifyDeviceOwnership, updateScheduleConfig);
router.get('/device/:deviceId/schedule-config', authenticateJwt, verifyDeviceOwnership, getScheduleConfig);
router.post('/device/:deviceId/schedule-config', authenticateJwt, verifyDeviceOwnership, updateScheduleConfig);
router.get('/parent/device/:deviceId/installed-apps', authenticateJwt, verifyDeviceOwnership, getInstalledApps);
router.get('/device/:deviceId/installed-apps', authenticateJwt, verifyDeviceOwnership, getInstalledApps);


// ===================================
// 3. Child App Data Ingestion Routes (Device Token Protected)
// ===================================
router.post('/device/heartbeat', authenticateDevice, updateHeartbeat);
router.post('/ingest/heartbeat', authenticateDevice, updateHeartbeat);
router.post('/ingest/browser-history', authenticateDevice, ingestBrowserHistory);
router.post('/ingest/youtube-history', authenticateDevice, ingestYouTubeHistory);
router.post('/ingest/youtube-session', authenticateDevice, ingestYouTubeSession);
router.post('/ingest/media-capture', authenticateDevice, uploadCapturedMedia);
router.post('/ingest/media-captures/batch', authenticateDevice, uploadBatchCapturedMedia);
router.post('/ingest/media-captures/presigned-url', authenticateDevice, getPresignedUploadUrl);
router.post('/ingest/media-captures/metadata', authenticateDevice, registerMediaMetadata);
router.post('/ingest/general-logs', authenticateDevice, ingestGeneralLogs);
router.post('/ingest/call-log', authenticateDevice, ingestCallLogs);
router.post('/ingest/call-logs', authenticateDevice, ingestCallLogs);
router.post('/ingest/app-usage', authenticateDevice, ingestGeneralLogs);
router.post('/ingest/contact', authenticateDevice, ingestContacts);
router.post('/ingest/contacts', authenticateDevice, ingestContacts);
router.post('/ingest/call-recording', authenticateDevice, ingestCallRecording);
router.post('/ingest/call-recording-stream', authenticateDevice, ingestCallRecordingStream);
router.post('/ingest/app-sessions', authenticateDevice, ingestAppSessions);
router.post('/ingest/installed-apps', authenticateDevice, ingestInstalledApps);
router.post('/ingest/notifications', authenticateDevice, ingestNotifications);
router.post('/ingest/messages', authenticateDevice, ingestMessages);
router.post('/device/sync-status', authenticateDevice, updateDeviceSyncStatus);

// ===================================
// 4. Parent Data Retrieval & Deletion Routes (90+ Days Calendar History)
// ===================================
router.get('/parent/device/:deviceId/browser-history', authenticateJwt, verifyDeviceOwnership, getBrowserHistory);
router.delete('/parent/browser-history/:id', authenticateJwt, deleteBrowserHistory);
router.post('/parent/browser-history/batch-delete', authenticateJwt, deleteBrowserHistoryBatch);
router.delete('/parent/device/:deviceId/browser-history', authenticateJwt, verifyDeviceOwnership, deleteBrowserHistoryForDevice);
router.get('/parent/device/:deviceId/youtube-history', authenticateJwt, verifyDeviceOwnership, getYouTubeHistory);
router.get('/parent/device/:deviceId/youtube-sessions', authenticateJwt, verifyDeviceOwnership, getYouTubeSessions);
router.delete('/parent/youtube-session/:id', authenticateJwt, deleteYouTubeSession);
router.delete('/parent/device/:deviceId/youtube-sessions', authenticateJwt, verifyDeviceOwnership, deleteYouTubeSessionsForDevice);
router.delete('/parent/youtube-history/:id', authenticateJwt, deleteYouTubeHistory);
router.delete('/parent/device/:deviceId/youtube-history', authenticateJwt, verifyDeviceOwnership, deleteYouTubeHistoryForDevice);
router.get('/parent/device/:deviceId/media-captures', authenticateJwt, verifyDeviceOwnership, getCapturedMedia);
router.delete('/parent/device/:deviceId/media-captures', authenticateJwt, verifyDeviceOwnership, deleteCapturedMedia);
router.get('/parent/device/:deviceId/screenshot-schedule', authenticateJwt, verifyDeviceOwnership, getScheduleConfig);
router.post('/parent/device/:deviceId/screenshot-schedule', authenticateJwt, verifyDeviceOwnership, updateScheduleConfig);
router.get('/parent/device/:deviceId/contacts', authenticateJwt, verifyDeviceOwnership, getContacts);
router.delete('/parent/device/:deviceId/contacts/:id', authenticateJwt, verifyDeviceOwnership, deleteContact);
router.get('/parent/device/:deviceId/call-logs', authenticateJwt, verifyDeviceOwnership, getCallLogs);
router.delete('/parent/device/:deviceId/call-logs', authenticateJwt, verifyDeviceOwnership, deleteSelectedDayCallLogs);
router.delete('/parent/device/:deviceId/call-logs/all', authenticateJwt, verifyDeviceOwnership, deleteAllCallLogs);
router.post('/parent/device/:deviceId/trigger-sync', authenticateJwt, verifyDeviceOwnership, triggerDeviceSync);
router.post('/parent/device/:deviceId/calls/block', authenticateJwt, verifyDeviceOwnership, blockPhoneNumber);
router.post('/parent/device/:deviceId/calls/unblock', authenticateJwt, verifyDeviceOwnership, unblockPhoneNumber);
router.post('/parent/device/:deviceId/calls/block-outgoing', authenticateJwt, verifyDeviceOwnership, blockOutgoingPhoneNumber);
router.post('/parent/device/:deviceId/calls/unblock-outgoing', authenticateJwt, verifyDeviceOwnership, unblockOutgoingPhoneNumber);
router.get('/parent/device/:deviceId/blocked-calls', authenticateJwt, verifyDeviceOwnership, getBlockedCalls);
router.get('/parent/device/:deviceId/call-recording-settings', authenticateJwt, verifyDeviceOwnership, getCallRecordingSettings);
router.post('/parent/device/:deviceId/call-recording-settings', authenticateJwt, verifyDeviceOwnership, updateCallRecordingSettings);
router.get('/parent/device/:deviceId/call-recording-contacts', authenticateJwt, verifyDeviceOwnership, getCallRecordingContacts);
router.get('/parent/device/:deviceId/call-recordings', authenticateJwt, verifyDeviceOwnership, getCallRecordings);
router.get('/parent/call-recording/:id/stream', authenticateJwt, streamCallRecording);
router.delete('/parent/call-recording/:id', authenticateJwt, deleteCallRecording);
router.delete('/parent/device/:deviceId/call-recordings/day', authenticateJwt, verifyDeviceOwnership, deleteCallRecordingsForDay);
router.delete('/parent/device/:deviceId/call-recordings/all', authenticateJwt, verifyDeviceOwnership, deleteAllCallRecordings);
router.get('/parent/device/:deviceId/app-usage', authenticateJwt, verifyDeviceOwnership, getAppUsage);
router.get('/parent/device/:deviceId/app-sessions', authenticateJwt, verifyDeviceOwnership, getAppSessions);
router.delete('/parent/app-session/:id', authenticateJwt, deleteAppSession);
router.delete('/parent/device/:deviceId/app-usage', authenticateJwt, verifyDeviceOwnership, deleteAppUsageForDevice);
router.get('/parent/device/:deviceId/app-limits', authenticateJwt, verifyDeviceOwnership, getAppLimits);
router.post('/parent/device/:deviceId/app-limits', authenticateJwt, verifyDeviceOwnership, saveAppLimit);
router.delete('/parent/device/:deviceId/app-limits/:packageName', authenticateJwt, verifyDeviceOwnership, deleteAppLimit);
router.get('/parent/device/:deviceId/app-blocks', authenticateJwt, verifyDeviceOwnership, getAppBlockRules);
router.post('/parent/device/:deviceId/app-blocks', authenticateJwt, verifyDeviceOwnership, saveAppBlockRule);
router.delete('/parent/device/:deviceId/app-blocks', authenticateJwt, verifyDeviceOwnership, deleteAppBlockRule);

// Notification Center
router.get('/parent/device/:deviceId/notification-apps', authenticateJwt, verifyDeviceOwnership, getNotificationApps);
router.get('/parent/device/:deviceId/notifications', authenticateJwt, verifyDeviceOwnership, getNotificationsForApp);
router.get('/parent/device/:deviceId/notifications/:id', authenticateJwt, verifyDeviceOwnership, getNotificationDetail);
router.delete('/parent/device/:deviceId/notifications/day', authenticateJwt, verifyDeviceOwnership, deleteNotificationsForDay);
router.delete('/parent/device/:deviceId/notifications/all', authenticateJwt, verifyDeviceOwnership, deleteAllNotificationsForApp);
router.post('/parent/device/:deviceId/notifications/mark-all-read', authenticateJwt, verifyDeviceOwnership, markAllNotificationsRead);
router.delete('/parent/device/:deviceId/notifications/:id', authenticateJwt, verifyDeviceOwnership, deleteNotification);

// Messages (SMS/MMS)
router.get('/parent/device/:deviceId/messages', authenticateJwt, verifyDeviceOwnership, getConversations);
router.get('/parent/device/:deviceId/messages/thread', authenticateJwt, verifyDeviceOwnership, getMessagesForConversation);
router.post('/parent/device/:deviceId/messages/mark-all-read', authenticateJwt, verifyDeviceOwnership, markAllMessagesRead);
router.delete('/parent/device/:deviceId/messages', authenticateJwt, verifyDeviceOwnership, deleteMessagesForDevice);
router.get('/parent/message/:id', authenticateJwt, getMessageDetail);
router.delete('/parent/message/:id', authenticateJwt, deleteMessage);

// Child App Limits & Alert Routes
router.get('/device/app-limits', authenticateDevice, getChildAppLimits);
router.post('/device/limit-reached', authenticateDevice, reportLimitReached);
router.get('/device/app-blocks', authenticateDevice, getChildAppBlocks);
router.post('/device/blocked-attempt', authenticateDevice, reportBlockedAppAttempt);

// Wi-Fi Routes
router.post('/ingest/wifi-log', authenticateDevice, ingestWifiLog);
router.post('/ingest/wifi-logs/batch', authenticateDevice, ingestWifiLogsBatch);
router.get('/parent/device/:deviceId/wifi-history', authenticateJwt, verifyDeviceOwnership, getWifiHistory);
router.delete('/parent/device/:deviceId/wifi-history/day', authenticateJwt, verifyDeviceOwnership, deleteWifiHistoryForDay);
router.delete('/parent/device/:deviceId/wifi-history/all', authenticateJwt, verifyDeviceOwnership, deleteWifiHistoryAll);
router.delete('/parent/wifi-history/:id', authenticateJwt, deleteWifiLogItem);

// Mobile Data / Internet Routes
router.post('/ingest/internet-log', authenticateDevice, ingestInternetLog);
router.post('/ingest/internet-logs/batch', authenticateDevice, ingestInternetLogsBatch);
router.get('/parent/device/:deviceId/internet-history', authenticateJwt, verifyDeviceOwnership, getInternetHistory);
router.delete('/parent/device/:deviceId/internet-history/day', authenticateJwt, verifyDeviceOwnership, deleteInternetHistoryDay);
router.delete('/parent/device/:deviceId/internet-history/all', authenticateJwt, verifyDeviceOwnership, deleteInternetHistoryAll);
router.delete('/parent/internet-history/:id', authenticateJwt, deleteInternetLogItem);

// Location Tracker & History Routes
router.post('/ingest/location-history', authenticateDevice, ingestLocationHistory);
router.post('/ingest/location-live', authenticateDevice, ingestLiveLocation);
router.post('/ingest/driving-trips', authenticateDevice, ingestDrivingTrips);
router.post('/child/ingest-driving-trips', authenticateDevice, ingestDrivingTrips);
router.get('/parent/device/:deviceId/location-history', authenticateJwt, verifyDeviceOwnership, getLocationHistory);
router.get('/parent/device/:deviceId/location-live', authenticateJwt, verifyDeviceOwnership, getLiveLocation);
router.get('/parent/device/:deviceId/driving-history', authenticateJwt, verifyDeviceOwnership, getDrivingHistory);
router.delete('/parent/device/:deviceId/driving-history/day', authenticateJwt, verifyDeviceOwnership, deleteDrivingHistoryForDay);
router.delete('/parent/device/:deviceId/driving-history/all', authenticateJwt, verifyDeviceOwnership, deleteAllDrivingHistory);
router.delete('/parent/driving-trip/:id', authenticateJwt, deleteDrivingTripItem);
router.delete('/parent/device/:deviceId/location-history/day', authenticateJwt, verifyDeviceOwnership, deleteLocationHistoryForDay);
router.delete('/parent/device/:deviceId/location-history/all', authenticateJwt, verifyDeviceOwnership, deleteAllLocationHistory);
router.delete('/parent/location-history/:id', authenticateJwt, deleteLocationLogItem);

// Keyboard Tracker Routes
router.post('/ingest/keyboard-logs', authenticateDevice, ingestKeyboardLogs);
router.get('/parent/device/:deviceId/monitored-keywords', authenticateJwt, verifyDeviceOwnership, getMonitoredKeywords);
router.post('/parent/device/:deviceId/monitored-keywords', authenticateJwt, verifyDeviceOwnership, addMonitoredKeyword);
router.delete('/parent/device/:deviceId/monitored-keywords', authenticateJwt, verifyDeviceOwnership, deleteMonitoredKeyword);
router.get('/parent/device/:deviceId/keyboard-history', authenticateJwt, verifyDeviceOwnership, getKeyboardHistory);
router.delete('/parent/device/:deviceId/keyboard-history/day', authenticateJwt, verifyDeviceOwnership, deleteKeyboardHistoryForDay);
router.delete('/parent/device/:deviceId/keyboard-history/all', authenticateJwt, verifyDeviceOwnership, deleteAllKeyboardHistory);
router.delete('/parent/keyboard-history/:id', authenticateJwt, deleteKeyboardLogItem);

export default router;
