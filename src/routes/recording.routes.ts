import { Router } from 'express';
import {
  getRecordingConfig,
  startRecording,
  stopRecording,
  getActiveRecordingStatus,
  getRecordings,
  deleteRecordings,
  getRecordingPresignedUrl,
  uploadRecordingDirect,
  completeRecording,
} from '../controllers/recording.controller';
import { authenticateJwt, authenticateDevice } from '../middleware/auth';
import { verifyDeviceOwnership } from '../middleware/ownership';

const router = Router();

// Parent App Endpoints
router.get('/parent/recording/config', authenticateJwt, getRecordingConfig);
router.post('/parent/recording/start', authenticateJwt, verifyDeviceOwnership, startRecording);
router.post('/parent/recording/stop', authenticateJwt, verifyDeviceOwnership, stopRecording);
router.get('/parent/recording/active-status', authenticateJwt, verifyDeviceOwnership, getActiveRecordingStatus);
router.get('/parent/recording/list', authenticateJwt, verifyDeviceOwnership, getRecordings);
router.post('/parent/recording/delete', authenticateJwt, verifyDeviceOwnership, deleteRecordings);

// Child App Ingest Endpoints
router.post('/ingest/recording/presigned-url', authenticateDevice, getRecordingPresignedUrl);
router.put('/ingest/recording/direct', uploadRecordingDirect);
router.post('/ingest/recording/complete', authenticateDevice, completeRecording);

export default router;
