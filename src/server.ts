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

const app = express();
const server = http.createServer(app);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Enable Gzip Compression, CORS and JSON Body Parser
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

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

// Start Server
const startServer = async () => {
  await connectDatabase();
  await migrateYoutubeAppBlockToAppRule();
  initIngestQueue();
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
