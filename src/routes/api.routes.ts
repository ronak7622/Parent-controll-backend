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
  getSocialMessages,
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
  getWifiHistory,
  deleteWifiHistoryForDay,
  deleteWifiHistoryAll,
  deleteWifiLogItem,
} from '../controllers/wifi.controller';
import {
  ingestInternetLog,
  getInternetHistory,
  deleteInternetHistoryDay,
  deleteInternetHistoryAll,
  deleteInternetLogItem,
} from '../controllers/internet.controller';
import { authenticateJwt, optionalAuthenticateJwt } from '../middleware/auth';
import recordingRoutes from './recording.routes';

const router = Router();
router.use('/', recordingRoutes);


// ===================================
// 1. Auth Routes (Parent App & Web)
// ===================================
router.post('/auth/send-otp', requestOtp);
router.post('/auth/request-otp', requestOtp);
router.post('/auth/verify-otp', verifyOtp);

// ===================================
// 2. Device Pairing & Management Routes
// ===================================
router.post('/device/pair-code', optionalAuthenticateJwt, generatePairingCode);
router.get('/device/pair-status/:code', optionalAuthenticateJwt, checkPairingStatus);
router.post('/parent/pair-device', optionalAuthenticateJwt, pairDeviceWithCode);
router.post('/device/pair', pairChildDevice);
router.post('/device/complete-setup', completeChildSetup);
router.get('/device/setup-status/:code', optionalAuthenticateJwt, checkSetupStatus);
router.get('/parent/devices', optionalAuthenticateJwt, getParentDevices);
router.get('/device/list', optionalAuthenticateJwt, getParentDevices);
router.get('/parent/device/:deviceId', optionalAuthenticateJwt, getDeviceDetails);
router.put('/device/:deviceId/settings', optionalAuthenticateJwt, updateDeviceSettings);
router.put('/device/:deviceId/restrictions', optionalAuthenticateJwt, updateDeviceSettings);
router.put('/parent/device/:deviceId/settings', optionalAuthenticateJwt, updateDeviceSettings);
router.put('/parent/device/:deviceId/restrictions', optionalAuthenticateJwt, updateDeviceSettings);
router.post('/parent/device/:deviceId/restrictions', optionalAuthenticateJwt, updateDeviceSettings);
router.post('/device/:deviceId/settings', optionalAuthenticateJwt, updateDeviceSettings);
router.post('/device/:deviceId/command', optionalAuthenticateJwt, sendRemoteCommand);
router.post('/parent/device/:deviceId/disconnect', optionalAuthenticateJwt, disconnectDevice);
router.post('/device/unpair', disconnectDevice);
router.delete('/device/:deviceId', optionalAuthenticateJwt, disconnectDevice);
router.get('/parent/device/:deviceId/schedule-config', optionalAuthenticateJwt, getScheduleConfig);
router.post('/parent/device/:deviceId/schedule-config', optionalAuthenticateJwt, updateScheduleConfig);
router.put('/parent/device/:deviceId/schedule-config', optionalAuthenticateJwt, updateScheduleConfig);
router.get('/device/:deviceId/schedule-config', optionalAuthenticateJwt, getScheduleConfig);
router.post('/device/:deviceId/schedule-config', optionalAuthenticateJwt, updateScheduleConfig);
router.get('/parent/device/:deviceId/installed-apps', optionalAuthenticateJwt, getInstalledApps);
router.get('/device/:deviceId/installed-apps', optionalAuthenticateJwt, getInstalledApps);


// ===================================
// 3. Child App Data Ingestion Routes
// ===================================
router.post('/device/heartbeat', updateHeartbeat);
router.post('/ingest/heartbeat', updateHeartbeat);
router.post('/ingest/browser-history', ingestBrowserHistory);
router.post('/ingest/youtube-history', ingestYouTubeHistory);
router.post('/ingest/youtube-session', ingestYouTubeSession);
router.post('/ingest/media-capture', uploadCapturedMedia);
router.post('/ingest/media-captures/batch', uploadBatchCapturedMedia);
router.post('/ingest/media-captures/presigned-url', getPresignedUploadUrl);
router.post('/ingest/general-logs', ingestGeneralLogs);
router.post('/ingest/social-message', ingestGeneralLogs);
router.post('/ingest/call-log', ingestCallLogs);
router.post('/ingest/call-logs', ingestCallLogs);
router.post('/ingest/app-usage', ingestGeneralLogs);
router.post('/ingest/contact', ingestContacts);
router.post('/ingest/contacts', ingestContacts);
router.post('/ingest/call-recording', ingestCallRecording);
router.post('/ingest/call-recording-stream', ingestCallRecordingStream);
router.post('/ingest/app-sessions', ingestAppSessions);
router.post('/ingest/installed-apps', ingestInstalledApps);
router.post('/ingest/notifications', ingestNotifications);
router.post('/ingest/messages', ingestMessages);
router.post('/device/sync-status', updateDeviceSyncStatus);

// ===================================
// 4. Parent Data Retrieval & Deletion Routes (90+ Days Calendar History)
// ===================================
router.get('/parent/device/:deviceId/browser-history', optionalAuthenticateJwt, getBrowserHistory);
router.delete('/parent/browser-history/:id', optionalAuthenticateJwt, deleteBrowserHistory);
router.post('/parent/browser-history/batch-delete', optionalAuthenticateJwt, deleteBrowserHistoryBatch);
router.delete('/parent/device/:deviceId/browser-history', optionalAuthenticateJwt, deleteBrowserHistoryForDevice);
router.get('/parent/device/:deviceId/youtube-history', optionalAuthenticateJwt, getYouTubeHistory);
router.get('/parent/device/:deviceId/youtube-sessions', optionalAuthenticateJwt, getYouTubeSessions);
router.delete('/parent/youtube-session/:id', optionalAuthenticateJwt, deleteYouTubeSession);
router.delete('/parent/device/:deviceId/youtube-sessions', optionalAuthenticateJwt, deleteYouTubeSessionsForDevice);
router.delete('/parent/youtube-history/:id', optionalAuthenticateJwt, deleteYouTubeHistory);
router.delete('/parent/device/:deviceId/youtube-history', optionalAuthenticateJwt, deleteYouTubeHistoryForDevice);
router.get('/parent/device/:deviceId/media-captures', optionalAuthenticateJwt, getCapturedMedia);
router.delete('/parent/device/:deviceId/media-captures', optionalAuthenticateJwt, deleteCapturedMedia);
router.get('/parent/device/:deviceId/screenshot-schedule', optionalAuthenticateJwt, getScheduleConfig);
router.post('/parent/device/:deviceId/screenshot-schedule', optionalAuthenticateJwt, updateScheduleConfig);
router.get('/parent/device/:deviceId/contacts', optionalAuthenticateJwt, getContacts);
router.delete('/parent/device/:deviceId/contacts/:id', optionalAuthenticateJwt, deleteContact);
router.get('/parent/device/:deviceId/call-logs', optionalAuthenticateJwt, getCallLogs);
router.delete('/parent/device/:deviceId/call-logs', optionalAuthenticateJwt, deleteSelectedDayCallLogs);
router.delete('/parent/device/:deviceId/call-logs/all', optionalAuthenticateJwt, deleteAllCallLogs);
router.post('/parent/device/:deviceId/trigger-sync', optionalAuthenticateJwt, triggerDeviceSync);
router.post('/parent/device/:deviceId/calls/block', optionalAuthenticateJwt, blockPhoneNumber);
router.post('/parent/device/:deviceId/calls/unblock', optionalAuthenticateJwt, unblockPhoneNumber);
router.post('/parent/device/:deviceId/calls/block-outgoing', optionalAuthenticateJwt, blockOutgoingPhoneNumber);
router.post('/parent/device/:deviceId/calls/unblock-outgoing', optionalAuthenticateJwt, unblockOutgoingPhoneNumber);
router.get('/parent/device/:deviceId/blocked-calls', optionalAuthenticateJwt, getBlockedCalls);
router.get('/parent/device/:deviceId/call-recording-settings', optionalAuthenticateJwt, getCallRecordingSettings);
router.post('/parent/device/:deviceId/call-recording-settings', optionalAuthenticateJwt, updateCallRecordingSettings);
router.get('/parent/device/:deviceId/call-recording-contacts', optionalAuthenticateJwt, getCallRecordingContacts);
router.get('/parent/device/:deviceId/call-recordings', optionalAuthenticateJwt, getCallRecordings);
router.get('/parent/call-recording/:id/stream', optionalAuthenticateJwt, streamCallRecording);
router.delete('/parent/call-recording/:id', optionalAuthenticateJwt, deleteCallRecording);
router.delete('/parent/device/:deviceId/call-recordings/day', optionalAuthenticateJwt, deleteCallRecordingsForDay);
router.delete('/parent/device/:deviceId/call-recordings/all', optionalAuthenticateJwt, deleteAllCallRecordings);
router.get('/parent/device/:deviceId/app-usage', optionalAuthenticateJwt, getAppUsage);
router.get('/parent/device/:deviceId/app-sessions', optionalAuthenticateJwt, getAppSessions);
router.delete('/parent/app-session/:id', optionalAuthenticateJwt, deleteAppSession);
router.delete('/parent/device/:deviceId/app-usage', optionalAuthenticateJwt, deleteAppUsageForDevice);
router.get('/parent/device/:deviceId/app-limits', optionalAuthenticateJwt, getAppLimits);
router.post('/parent/device/:deviceId/app-limits', optionalAuthenticateJwt, saveAppLimit);
router.delete('/parent/device/:deviceId/app-limits/:packageName', optionalAuthenticateJwt, deleteAppLimit);
router.get('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, getAppBlockRules);
router.post('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, saveAppBlockRule);
router.delete('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, deleteAppBlockRule);

// Notification Center
router.get('/parent/device/:deviceId/notification-apps', optionalAuthenticateJwt, getNotificationApps);
router.get('/parent/device/:deviceId/notifications', optionalAuthenticateJwt, getNotificationsForApp);
router.get('/parent/device/:deviceId/notifications/:id', optionalAuthenticateJwt, getNotificationDetail);
router.delete('/parent/device/:deviceId/notifications/day', optionalAuthenticateJwt, deleteNotificationsForDay);
router.delete('/parent/device/:deviceId/notifications/all', optionalAuthenticateJwt, deleteAllNotificationsForApp);
router.post('/parent/device/:deviceId/notifications/mark-all-read', optionalAuthenticateJwt, markAllNotificationsRead);
router.delete('/parent/device/:deviceId/notifications/:id', optionalAuthenticateJwt, deleteNotification);

// Messages (SMS/MMS)
router.get('/parent/device/:deviceId/messages', optionalAuthenticateJwt, getConversations);
router.get('/parent/device/:deviceId/messages/thread', optionalAuthenticateJwt, getMessagesForConversation);
router.post('/parent/device/:deviceId/messages/mark-all-read', optionalAuthenticateJwt, markAllMessagesRead);
router.delete('/parent/device/:deviceId/messages', optionalAuthenticateJwt, deleteMessagesForDevice);
router.get('/parent/message/:id', optionalAuthenticateJwt, getMessageDetail);
router.delete('/parent/message/:id', optionalAuthenticateJwt, deleteMessage);

// Child App Limits & Alert Routes
router.get('/device/app-limits', getChildAppLimits);
router.post('/device/limit-reached', reportLimitReached);
router.get('/device/app-blocks', getChildAppBlocks);
router.post('/device/blocked-attempt', reportBlockedAppAttempt);

// Wi-Fi Routes
router.post('/ingest/wifi-log', ingestWifiLog);
router.get('/parent/device/:deviceId/wifi-history', optionalAuthenticateJwt, getWifiHistory);
router.delete('/parent/device/:deviceId/wifi-history/day', optionalAuthenticateJwt, deleteWifiHistoryForDay);
router.delete('/parent/device/:deviceId/wifi-history/all', optionalAuthenticateJwt, deleteWifiHistoryAll);
router.delete('/parent/wifi-history/:id', optionalAuthenticateJwt, deleteWifiLogItem);

// Mobile Data / Internet Routes
router.post('/ingest/internet-log', ingestInternetLog);
router.get('/parent/device/:deviceId/internet-history', optionalAuthenticateJwt, getInternetHistory);
router.delete('/parent/device/:deviceId/internet-history/day', optionalAuthenticateJwt, deleteInternetHistoryDay);
router.delete('/parent/device/:deviceId/internet-history/all', optionalAuthenticateJwt, deleteInternetHistoryAll);
router.delete('/parent/internet-history/:id', optionalAuthenticateJwt, deleteInternetLogItem);

// Location Tracker & History Routes
router.post('/ingest/location-history', ingestLocationHistory);
router.post('/ingest/location-live', ingestLiveLocation);
router.post('/ingest/driving-trips', ingestDrivingTrips);
router.post('/child/ingest-driving-trips', ingestDrivingTrips);
router.get('/parent/device/:deviceId/location-history', optionalAuthenticateJwt, getLocationHistory);
router.get('/parent/device/:deviceId/location-live', optionalAuthenticateJwt, getLiveLocation);
router.get('/parent/device/:deviceId/driving-history', optionalAuthenticateJwt, getDrivingHistory);
router.delete('/parent/device/:deviceId/driving-history/day', optionalAuthenticateJwt, deleteDrivingHistoryForDay);
router.delete('/parent/device/:deviceId/driving-history/all', optionalAuthenticateJwt, deleteAllDrivingHistory);
router.delete('/parent/driving-trip/:id', optionalAuthenticateJwt, deleteDrivingTripItem);
router.delete('/parent/device/:deviceId/location-history/day', optionalAuthenticateJwt, deleteLocationHistoryForDay);
router.delete('/parent/device/:deviceId/location-history/all', optionalAuthenticateJwt, deleteAllLocationHistory);
router.delete('/parent/location-history/:id', optionalAuthenticateJwt, deleteLocationLogItem);

// Keyboard Tracker Routes
router.post('/ingest/keyboard-logs', ingestKeyboardLogs);
router.get('/parent/device/:deviceId/monitored-keywords', optionalAuthenticateJwt, getMonitoredKeywords);
router.post('/parent/device/:deviceId/monitored-keywords', optionalAuthenticateJwt, addMonitoredKeyword);
router.delete('/parent/device/:deviceId/monitored-keywords', optionalAuthenticateJwt, deleteMonitoredKeyword);
router.get('/parent/device/:deviceId/keyboard-history', optionalAuthenticateJwt, getKeyboardHistory);
router.delete('/parent/device/:deviceId/keyboard-history/day', optionalAuthenticateJwt, deleteKeyboardHistoryForDay);
router.delete('/parent/device/:deviceId/keyboard-history/all', optionalAuthenticateJwt, deleteAllKeyboardHistory);
router.delete('/parent/keyboard-history/:id', optionalAuthenticateJwt, deleteKeyboardLogItem);

export default router;
