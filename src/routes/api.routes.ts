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
  ingestGeneralLogs,
  ingestCallLogs,
  ingestContacts,
  ingestCallRecording,
  ingestCallRecordingStream,
  ingestAppSessions,
  updateDeviceSyncStatus,
  ingestInstalledApps,
} from '../controllers/ingest.controller';
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
  getAppLimits,
  saveAppLimit,
  deleteAppLimit,
  getAppBlockRules,
  saveAppBlockRule,
  deleteAppBlockRule,
  uninstallChildApp,
  getSocialMessages,
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

const router = Router();

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
router.post('/parent/device/:deviceId/request-screenshot', optionalAuthenticateJwt, sendRemoteCommand);

// ===================================
// 3. Child App Data Ingestion Routes
// ===================================
router.post('/device/heartbeat', updateHeartbeat);
router.post('/ingest/heartbeat', updateHeartbeat);
router.post('/ingest/browser-history', ingestBrowserHistory);
router.post('/ingest/youtube-history', ingestYouTubeHistory);
router.post('/ingest/youtube-session', ingestYouTubeSession);
router.post('/ingest/media-capture', uploadCapturedMedia);
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
router.get('/parent/device/:deviceId/app-limits', optionalAuthenticateJwt, getAppLimits);
router.post('/parent/device/:deviceId/app-limits', optionalAuthenticateJwt, saveAppLimit);
router.delete('/parent/device/:deviceId/app-limits/:packageName', optionalAuthenticateJwt, deleteAppLimit);
router.get('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, getAppBlockRules);
router.post('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, saveAppBlockRule);
router.delete('/parent/device/:deviceId/app-blocks', optionalAuthenticateJwt, deleteAppBlockRule);
router.post('/parent/device/:deviceId/uninstall-app', optionalAuthenticateJwt, uninstallChildApp);

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

export default router;
