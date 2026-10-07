import express from 'express';
import compression from 'compression';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { migrateYoutubeAppBlockToAppRule } from './migrations/youtubeAppBlockToAppRule';
import apiRoutes from './routes/api.routes';
import { setupWebRtcSignaling } from './signaling/webrtc.signaling';

import mongoose from 'mongoose';
import { apiRateLimiter } from './middleware/rateLimiter';
import { getPrometheusMetrics } from './controllers/metrics.controller';
import { initIngestQueue } from './queues/ingest.queue';
import { initSubscriptionQueue } from './queues/subscription.queue';
import { SubscriptionJob } from './jobs/SubscriptionJob';

const app = express();
const server = http.createServer(app);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Trust reverse proxy (Cloudflare / AWS ALB / NGINX Load Balancers) for accurate req.ip
app.set('trust proxy', 1);

// Enable Gzip Compression, CORS and JSON Body Parser
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply rate limiting to API routes
app.use('/api', apiRateLimiter);

// Serve static uploads with HTTP 206 Partial Content (Range) streaming support
app.use('/uploads', express.static(uploadsDir));
app.use('/api/uploads', express.static(uploadsDir));

// Metrics & Health Checks
app.get('/metrics', getPrometheusMetrics);

app.get(['/health', '/api/health'], (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'online' : 'degraded',
    system: 'Child Protect Backend API Engine (10M+ Scalable)',
    dbConnected,
    timestamp: new Date().toISOString(),
  });
});

app.get(['/ready', '/api/ready'], (req, res) => {
  const isReady = mongoose.connection.readyState === 1;
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    status: isReady ? 'READY' : 'NOT_READY',
  });
});

// API Routes
app.use('/api', apiRoutes);

// Setup WebRTC P2P Signaling Server via WebSockets
setupWebRtcSignaling(server);

// Global Express Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[EXPRESS-GLOBAL-ERROR]', err?.stack || err?.message || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Process-level Crash Safeguards
process.on('unhandledRejection', (reason: any) => {
  console.error('[UNHANDLED-REJECTION] Suppressed promise rejection:', reason?.stack || reason?.message || reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[UNCAUGHT-EXCEPTION] Suppressed uncaught exception:', error?.stack || error?.message || error);
});

// Start Server
const startServer = async () => {
  await connectDatabase();
  await migrateYoutubeAppBlockToAppRule();
  initIngestQueue();
  initSubscriptionQueue();

  // Run continuous storage auto-delete check every 60 seconds (1 min)
  setInterval(async () => {
    try {
      await SubscriptionJob.processAutoDeleteSettings();
    } catch (err: any) {
      console.error('[AUTO-DELETE-INTERVAL-ERROR]', err?.message);
    }
  }, 60000);
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 CHILD PROTECT BACKEND SERVER IS RUNNING ON PORT ${config.port}`);
    console.log(`🌐 Health Check: http://localhost:${config.port}/health`);
    console.log(`📊 Prometheus Metrics: http://localhost:${config.port}/metrics`);
    console.log(`⚡ Real-time WebRTC Signaling: /webrtc-signaling`);
    console.log(`=======================================================`);
  });
};

startServer();
