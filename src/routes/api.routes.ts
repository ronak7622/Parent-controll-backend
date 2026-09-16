import { Router } from 'express';
import { requestOtp, verifyOtp } from '../controllers/auth.controller';
import {
  generatePairingCode,
  checkPairingStatus,
  pairDeviceWithCode,
  pairChildDevice,
  getParentDevices,
  updateDeviceSettings,
  sendRemoteCommand,
  disconnectDevice,
} from '../controllers/device.controller';
import {
  updateHeartbeat,
  ingestBrowserHistory,
  ingestYouTubeHistory,
  uploadCapturedMedia,
  ingestGeneralLogs,
} from '../controllers/ingest.controller';
import {
  getBrowserHistory,
  getYouTubeHistory,
  getCapturedMedia,
  getContacts,
  getCallLogs,
  getAppUsage,
  getSocialMessages,
} from '../controllers/parent.controller';
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
router.post('/device/pair-code', generatePairingCode);
router.get('/device/pair-status/:code', checkPairingStatus);
router.post('/parent/pair-device', optionalAuthenticateJwt, pairDeviceWithCode);
router.post('/device/pair', pairChildDevice);
router.get('/parent/devices', optionalAuthenticateJwt, getParentDevices);
router.get('/device/list', optionalAuthenticateJwt, getParentDevices);
router.put('/device/:deviceId/settings', optionalAuthenticateJwt, updateDeviceSettings);
router.post('/device/:deviceId/command', optionalAuthenticateJwt, sendRemoteCommand);
router.post('/parent/device/:deviceId/disconnect', optionalAuthenticateJwt, disconnectDevice);
router.delete('/device/:deviceId', optionalAuthenticateJwt, disconnectDevice);
router.post('/parent/device/:deviceId/request-screenshot', optionalAuthenticateJwt, sendRemoteCommand);

// ===================================
// 3. Child App Data Ingestion Routes
// ===================================
router.post('/device/heartbeat', updateHeartbeat);
router.post('/ingest/heartbeat', updateHeartbeat);
router.post('/ingest/browser-history', ingestBrowserHistory);
router.post('/ingest/youtube-history', ingestYouTubeHistory);
router.post('/ingest/media-capture', uploadCapturedMedia);
router.post('/ingest/general-logs', ingestGeneralLogs);

// ===================================
// 4. Parent Data Retrieval Routes (90+ Days Calendar History)
// ===================================
router.get('/parent/device/:deviceId/browser-history', optionalAuthenticateJwt, getBrowserHistory);
router.get('/parent/device/:deviceId/youtube-history', optionalAuthenticateJwt, getYouTubeHistory);
router.get('/parent/device/:deviceId/media-captures', optionalAuthenticateJwt, getCapturedMedia);
router.get('/parent/device/:deviceId/contacts', optionalAuthenticateJwt, getContacts);
router.get('/parent/device/:deviceId/call-logs', optionalAuthenticateJwt, getCallLogs);
router.get('/parent/device/:deviceId/app-usage', optionalAuthenticateJwt, getAppUsage);
router.get('/parent/device/:deviceId/social-messages', optionalAuthenticateJwt, getSocialMessages);

export default router;
