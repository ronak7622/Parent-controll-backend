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

const router = Router();

// Parent App Endpoints
router.get('/parent/recording/config', getRecordingConfig);
router.post('/parent/recording/start', startRecording);
router.post('/parent/recording/stop', stopRecording);
router.get('/parent/recording/active-status', getActiveRecordingStatus);
router.get('/parent/recording/list', getRecordings);
router.post('/parent/recording/delete', deleteRecordings);

// Child App Ingest Endpoints
router.post('/ingest/recording/presigned-url', getRecordingPresignedUrl);
router.put('/ingest/recording/direct', uploadRecordingDirect);
router.post('/ingest/recording/complete', completeRecording);

export default router;
