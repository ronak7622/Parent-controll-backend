import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Device } from '../models/Device';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';

let signalingIo: any = null;

export const setupWebRtcSignaling = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const signalingNamespace = io.of('/webrtc-signaling');
  signalingIo = signalingNamespace;

  signalingNamespace.on('connection', (socket: Socket) => {
    console.log(`[WEBRTC-SIGNALING] New socket connected: ${socket.id}`);

    // Join room identified by deviceId (Handles both 'join-room' and 'register-device')
    const handleJoinRoom = async (data: any) => {
      const deviceId = data?.deviceId || data;
      const role = data?.role || 'unknown';
      if (deviceId) {
        socket.join(deviceId);
        console.log(`[WEBRTC-ROOM] Socket ${socket.id} (${role}) joined room: ${deviceId}`);
        socket.to(deviceId).emit('peer-joined', { socketId: socket.id, role });

        if (role === 'child') {
          try {
            const dev = await Device.findOne({ deviceId });
            if (dev) {
              if (dev.blockedPhoneNumbers && dev.blockedPhoneNumbers.length > 0) {
                socket.emit('update-blocked-numbers', {
                  blockedPhoneNumbers: dev.blockedPhoneNumbers,
                });
              }
              if (dev.blockedOutgoingPhoneNumbers && dev.blockedOutgoingPhoneNumbers.length > 0) {
                socket.emit('update-blocked-outgoing-numbers', {
                  blockedOutgoingPhoneNumbers: dev.blockedOutgoingPhoneNumbers,
                });
              }

              // Push the current app limits / block rules on every (re)connect — not just at the
              // moment the parent edits one. This is what makes a rule the parent changed while
              // this device was offline (killed, no internet, phone off) actually reach it once
              // it comes back, with no extra polling/API cost since it rides the connection event.
              const [appLimits, appBlockRules] = await Promise.all([
                AppLimit.find({ deviceId, isEnabled: true }),
                AppBlockRule.find({ deviceId, isBlocked: true }),
              ]);
              socket.emit('remote-command', {
                command: 'UPDATE_RULES',
                deviceId,
                appLimits,
                appBlockRules,
              });
            }
          } catch (err: any) {
            console.error(`[WEBRTC-ROOM] Error syncing rules/numbers to child: ${err?.message}`);
          }
        }
      }
    };

    socket.on('join-room', handleJoinRoom);
    socket.on('register-device', handleJoinRoom);

    // Request Stream Signal (from Parent to Child)
    socket.on('request-stream', (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-REQUEST] Relaying stream request for device: ${deviceId}, type: ${data?.type}`);
      if (deviceId) {
        socket.to(deviceId).emit('remote-request', data);
        socket.to(deviceId).emit('request-stream', data);
      }
    });

    // Remote Commands (Screenshot, Disconnect, etc.)
    socket.on('remote-command', (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-COMMAND] Relaying command for device: ${deviceId}, command: ${data?.command}`);
      if (deviceId) {
        socket.to(deviceId).emit('remote-command', data);
      }
    });

    // Relay SDP Offer (from Child or Parent)
    socket.on('offer', (data: any) => {
      const deviceId = data?.deviceId;
      const offer = data?.offer || data?.sdp;
      console.log(`[WEBRTC-OFFER] Relaying SDP offer for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('offer', { offer, sdp: offer, from: socket.id, sessionId: data?.sessionId });
      }
    });

    // Relay SDP Answer
    socket.on('answer', (data: any) => {
      const deviceId = data?.deviceId;
      const answer = data?.answer || data?.sdp;
      console.log(`[WEBRTC-ANSWER] Relaying SDP answer for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('answer', { answer, sdp: answer, from: socket.id, sessionId: data?.sessionId });
      }
    });

    // Relay ICE Candidates
    socket.on('ice-candidate', (data: any) => {
      const deviceId = data?.deviceId;
      const candidate = data?.candidate;
      if (deviceId) {
        socket.to(deviceId).emit('ice-candidate', { candidate, from: socket.id, sessionId: data?.sessionId });
      }
    });

    // Stop Stream Signal
    socket.on('stop-stream', (data: any) => {
      const deviceId = typeof data === 'string' ? data : data?.deviceId;
      console.log(`[WEBRTC-STOP] Stop stream requested for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('stop-stream', { deviceId });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WEBRTC-DISCONNECT] Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getSignalingIo = () => signalingIo;
