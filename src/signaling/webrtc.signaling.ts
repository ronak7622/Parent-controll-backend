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
        socket.data.role = role;
        socket.data.deviceId = deviceId;
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

    // Returns true if a socket with role 'child' is currently in the given room.
    const isChildInRoom = (deviceId: string): boolean => {
      const roomSockets = signalingNamespace.adapter.rooms.get(deviceId);
      if (!roomSockets) return false;
      for (const sId of roomSockets) {
        const s = signalingNamespace.sockets.get(sId);
        if (s && s.data?.role === 'child') return true;
      }
      return false;
    };

    // Request Stream Signal (from Parent to Child)
    socket.on('request-stream', async (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-REQUEST] Relaying stream request for device: ${deviceId}, type: ${data?.type}`);
      if (deviceId) {
        if (!isChildInRoom(deviceId)) {
          // The child socket can be briefly absent from the room even while the
          // device is genuinely online - e.g. it just woke from Doze/network
          // sleep and its socket.io client is mid-reconnect (reconnectionDelay
          // is 2s on the child). Rather than instantly reporting the device as
          // offline on a single snapshot check, give it one short grace window
          // to reconnect before declaring it offline. This avoids the
          // intermittent false "child device is offline" the parent app was
          // seeing for a device that was actually on.
          console.warn(`[WEBRTC-REQUEST] No child socket in room ${deviceId} yet. Waiting briefly for reconnect before giving up...`);
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (!isChildInRoom(deviceId)) {
            console.warn(`[WEBRTC-REQUEST] Still no child socket in room ${deviceId} after grace period! Emitting stream-failed (DEVICE_OFFLINE)`);
            socket.emit('stream-failed', {
              deviceId,
              type: data?.type,
              sessionId: data?.sessionId,
              reason: 'DEVICE_OFFLINE',
              message: 'Child device is offline or shut down',
            });
            return;
          }
          console.log(`[WEBRTC-REQUEST] Child socket reappeared in room ${deviceId} within grace period. Proceeding...`);
        }

        // Mutual Exclusivity Check: If child is currently recording, reject stream request immediately!
        try {
          const { Recording } = require('../models/Recording');
          const activeRec = await Recording.findOne({ deviceId, status: { $in: ['in_progress', 'saving'] } });
          if (activeRec) {
            const elapsed = Math.max(0, Math.floor((Date.now() - activeRec.startedAt.getTime()) / 1000));
            const remaining = Math.max(0, activeRec.durationSeconds - elapsed);
            console.warn(`[WEBRTC-REQUEST] Device ${deviceId} has active ${activeRec.recordingType} recording! Emitting stream-failed (RECORDING_IN_PROGRESS)`);
            socket.emit('stream-failed', {
              deviceId,
              type: data?.type,
              sessionId: data?.sessionId,
              reason: 'RECORDING_IN_PROGRESS',
              message: `Active ${activeRec.recordingType} recording in progress on child device`,
              activeSession: {
                sessionId: activeRec.sessionId,
                recordingType: activeRec.recordingType,
                durationSeconds: activeRec.durationSeconds,
                elapsedSeconds: elapsed,
                remainingSeconds: remaining,
                startedAt: activeRec.startedAt,
              },
            });
            return;
          }
        } catch (dbErr: any) {
          console.error('[WEBRTC-REQUEST-DB-CHECK-ERROR]', dbErr?.message);
        }

        socket.to(deviceId).emit('remote-request', data);
        socket.to(deviceId).emit('request-stream', data);
      }
    });

    // Handle stream failure / screen off notification
    socket.on('stream-failed', (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-FAILED] Stream failed reported for device: ${deviceId}, reason: ${data?.reason}`);
      if (deviceId) {
        socket.to(deviceId).emit('stream-failed', data);
      }
    });

    socket.on('screenshot-failed', (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-FAILED] Screenshot/Stream failed reported for device: ${deviceId}, reason: ${data?.reason}`);
      if (deviceId) {
        socket.to(deviceId).emit('stream-failed', {
          deviceId,
          reason: data?.reason || 'SCREEN_OFF',
          message: data?.message || 'Child Device Screen is OFF',
        });
        socket.to(deviceId).emit('recording-failed', {
          deviceId,
          reason: data?.reason || 'SCREEN_OFF',
          message: data?.message || 'Child Device Screen is OFF',
          sessionId: data?.sessionId || data?.reqId,
        });
        socket.to(deviceId).emit('screenshot-failed', data);
      }
    });

    socket.on('recording-failed', async (data: any) => {
      const deviceId = data?.deviceId;
      const sessionId = data?.sessionId || data?.reqId;
      console.log(`[WEBRTC-FAILED] Recording failed reported for device: ${deviceId}, sessionId: ${sessionId}, reason: ${data?.reason}`);
      try {
        const { Recording } = require('../models/Recording');
        if (sessionId) {
          await Recording.updateOne({ sessionId }, { $set: { status: 'failed', endedAt: new Date() } });
        } else if (deviceId) {
          await Recording.updateMany({ deviceId, status: { $in: ['in_progress', 'saving'] } }, { $set: { status: 'failed', endedAt: new Date() } });
        }
      } catch (dbErr: any) {
        console.error('[WEBRTC-FAILED-DB-UPDATE-ERROR]', dbErr?.message);
      }
      if (deviceId) {
        socket.to(deviceId).emit('recording-failed', data);
        socket.to(deviceId).emit('stream-failed', data);
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

    // Camera Status Relay (e.g. CAMERA_IN_USE, CAMERA_RESUMED)
    socket.on('camera-status', (data: any) => {
      const deviceId = data?.deviceId;
      console.log(`[WEBRTC-CAMERA-STATUS] Relaying status for room: ${deviceId}, status: ${data?.status}`);
      if (deviceId) {
        socket.to(deviceId).emit('camera-status', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WEBRTC-DISCONNECT] Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getSignalingIo = () => signalingIo;
