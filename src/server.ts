import express from 'express';
import http from 'http';
import cors from 'cors';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import apiRoutes from './routes/api.routes';
import { setupWebRtcSignaling } from './signaling/webrtc.signaling';

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON Body Parser
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check Route
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Child Protect Backend API Engine',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api', apiRoutes);

// Setup WebRTC P2P Signaling Server via WebSockets
setupWebRtcSignaling(server);

// Start Server
const startServer = async () => {
  await connectDatabase();
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 CHILD PROTECT BACKEND SERVER IS RUNNING ON PORT ${config.port}`);
    console.log(`🌐 Health Check: http://localhost:${config.port}/health`);
    console.log(`⚡ Real-time WebRTC Signaling: /webrtc-signaling`);
    console.log(`=======================================================`);
  });
};

startServer();
