import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env';
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

  if (config.redisUri) {
    try {
      const pubClient = new Redis(config.redisUri, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      pubClient.on('error', (err) => console.warn('[SOCKET.IO-REDIS-PUB-WARN]', err.message));
      const subClient = pubClient.duplicate();
      subClient.on('error', (err) => console.warn('[SOCKET.IO-REDIS-SUB-WARN]', err.message));
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[SOCKET.IO-REDIS] Redis Adapter attached to Socket.io for horizontal scaling.');
    } catch (err: any) {
      console.warn('[SOCKET.IO-REDIS-WARN] Could not attach Redis Adapter:', err.message);
    }
  }

  const signalingNamespace = io.of('/webrtc-signaling');
  signalingIo = signalingNamespace;

  // Socket authentication middleware
  signalingNamespace.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      if (token) {
        const decoded: any = jwt.verify(token, config.jwtSecret);
        socket.data.auth = decoded;
      }
      return next();
    } catch (err: any) {
      console.warn(`[WEBRTC-AUTH-WARN] Handshake token verification deferred: ${err.message}`);
      return next();
    }
  });

  signalingNamespace.on('connection', (socket: Socket) => {
    console.log(`[WEBRTC-SIGNALING] New socket connected: ${socket.id}`);

    // Join room identified by deviceId (Handles both 'join-room' and 'register-device')
    const handleJoinRoom = async (data: any) => {
      const rawDeviceId = typeof data === 'string' ? data : (data?.deviceId || data);
      const role = typeof data === 'object' && data?.role ? data.role : 'unknown';
      if (!rawDeviceId) return;

      // Extract auth from socket handshake or event payload fallback
      let auth = socket.data.auth;
      if (!auth && typeof data === 'object') {
        const payloadToken = data.token || data.jwt || data.parentToken || data.deviceToken;
        if (payloadToken) {
          try {
            auth = jwt.verify(payloadToken, config.jwtSecret);
            socket.data.auth = auth;
          } catch (_) {}
        }
      }

      if (!auth) {
        console.warn(`[WEBRTC-ROOM] Unauthenticated join attempt for socket ${socket.id}`);
        socket.emit('error', { message: 'Unauthorized room join: Missing token' });
        return;
      }

      let targetDeviceId = rawDeviceId;

      if (auth.kind === 'device') {
        if (auth.deviceId !== rawDeviceId) {
          const isObjId = mongoose.isValidObjectId(rawDeviceId);
          const dev = await Device.findOne({
            $or: [
              { deviceId: rawDeviceId },
              ...(isObjId ? [{ _id: rawDeviceId }] : [])
            ]
          });
          if (!dev || dev.deviceId !== auth.deviceId) {
            console.warn(`[WEBRTC-ROOM] Device token mismatch for socket ${socket.id}: token device ${auth.deviceId} != target room ${rawDeviceId}`);
            socket.emit('error', { message: 'Unauthorized room join: Device ID mismatch' });
            return;
          }
        }
        targetDeviceId = auth.deviceId;
      } else if (auth.userId) {
        const isObjId = mongoose.isValidObjectId(rawDeviceId);
        let ownedDev = await Device.findOne({
          $or: [
            { deviceId: rawDeviceId },
            ...(isObjId ? [{ _id: rawDeviceId }] : [])
          ]
        }).select('deviceId parentUserId');

        if (ownedDev) {
          if (!ownedDev.parentUserId) {
            await Device.updateOne({ _id: ownedDev._id }, { parentUserId: auth.userId });
          }
          targetDeviceId = ownedDev.deviceId;
        } else {
          targetDeviceId = rawDeviceId;
        }
      } else {
        socket.emit('error', { message: 'Unauthorized room join' });
        return;
      }

      socket.data.role = role;
      socket.data.deviceId = targetDeviceId;
      socket.join(targetDeviceId);
      if (rawDeviceId !== targetDeviceId) {
        socket.join(rawDeviceId);
      }

      console.log(`[WEBRTC-ROOM] Socket ${socket.id} (${role}) joined room: ${targetDeviceId} (raw: ${rawDeviceId})`);
      socket.to(targetDeviceId).emit('peer-joined', { socketId: socket.id, role });
      if (rawDeviceId !== targetDeviceId) {
        socket.to(rawDeviceId).emit('peer-joined', { socketId: socket.id, role });
      }

      if (role === 'child') {
        try {
          const dev = await Device.findOne({ deviceId: targetDeviceId });
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

            const [appLimits, appBlockRules] = await Promise.all([
              AppLimit.find({ deviceId: targetDeviceId, isEnabled: true }),
              AppBlockRule.find({ deviceId: targetDeviceId, isBlocked: true }),
            ]);
            socket.emit('remote-command', {
              command: 'UPDATE_RULES',
              deviceId: targetDeviceId,
              appLimits,
              appBlockRules,
            });
          }
        } catch (err: any) {
          console.error(`[WEBRTC-ROOM] Error syncing rules/numbers to child: ${err?.message}`);
        }
      }
    };

    socket.on('join-room', handleJoinRoom);
    socket.on('register-device', handleJoinRoom);

    // Returns true if a socket with role 'child' is currently in the given room.
    // Supports both single-node fast local in-memory lookup and multi-node Redis cluster adapter lookup.
    const isChildInRoom = async (deviceId: string): Promise<boolean> => {
      // 1. Fast local in-memory lookup
      const roomSockets = signalingNamespace.adapter.rooms.get(deviceId);
      if (roomSockets && roomSockets.size > 0) {
        for (const sId of roomSockets) {
          const s = signalingNamespace.sockets.get(sId);
          if (s && s.data?.role === 'child') return true;
        }
      }
      // 2. Multi-node cluster-wide lookup via Redis adapter
      try {
        const sockets = await signalingNamespace.in(deviceId).fetchSockets();
        return sockets.some((s) => s.data?.role === 'child');
      } catch (_err) {
        return false;
      }
    };

    // Request Stream Signal (from Parent to Child)
    socket.on('request-stream', async (data: any) => {
      const inputDeviceId = data?.deviceId;
      if (!inputDeviceId) return;

      let targetDeviceId = inputDeviceId;
      if (mongoose.isValidObjectId(inputDeviceId)) {
        const dev = await Device.findById(inputDeviceId).select('deviceId');
        if (dev && dev.deviceId) {
          targetDeviceId = dev.deviceId;
        }
      }

      console.log(`[WEBRTC-REQUEST] Relaying stream request for device: ${targetDeviceId} (raw: ${inputDeviceId}), type: ${data?.type}`);

      // Subscription & Live Usage Enforcement Check
      try {
        const { StorageAccountingService } = require('../services/StorageAccountingService');
        const { Subscription } = require('../models/Subscription');
        const { LiveUsage } = require('../models/LiveUsage');

        const parentUserId = await StorageAccountingService.resolveParentUserId(targetDeviceId);
        if (parentUserId) {
          const sub = await Subscription.findOne({ parentUserId, status: { $in: ['active', 'trial', 'grace'] } });
          if (!sub || sub.status === 'expired') {
            socket.emit('stream-failed', {
              deviceId: inputDeviceId,
              type: data?.type,
              sessionId: data?.sessionId,
              reason: 'SUBSCRIPTION_EXPIRED',
              message: 'Subscription plan expired. Please renew plan to access live view/stream.',
            });
            return;
          }

          const liveMinutesTotal = sub.planSnapshot?.liveMinutesTotal || 60;
          const now = new Date();
          const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          let liveUsage = await LiveUsage.findOne({ parentUserId, monthKey });
          if (!liveUsage) {
            liveUsage = await LiveUsage.create({ parentUserId, monthKey, minutesUsed: 0, resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1) });
          }

          const remaining = liveMinutesTotal - (liveUsage.minutesUsed || 0);
          if (remaining <= 0) {
            socket.emit('stream-failed', {
              deviceId: inputDeviceId,
              type: data?.type,
              sessionId: data?.sessionId,
              reason: 'LIVE_MINUTES_EXCEEDED',
              message: 'Monthly live minutes quota exceeded for your plan. Please upgrade for additional live stream time.',
            });
            return;
          }
        }
      } catch (err: any) {
        console.warn(`[WEBRTC-LIVE-CHECK-WARN] ${err?.message}`);
      }

      const childPresentInitially = (await isChildInRoom(targetDeviceId)) || (await isChildInRoom(inputDeviceId));
      if (!childPresentInitially) {
        console.warn(`[WEBRTC-REQUEST] No child socket in room ${targetDeviceId} / ${inputDeviceId} yet. Sending FCM wakeup push...`);
        try {
          const dev = await Device.findOne({ $or: [{ deviceId: targetDeviceId }, { deviceId: inputDeviceId }] });
          if (dev?.fcmToken) {
            const { sendFcmDataCommand } = require('../services/fcm.service');
            await sendFcmDataCommand(dev.fcmToken, 'REQUEST_STREAM', {
              type: data?.type || 'camera',
              sessionId: data?.sessionId || '',
              deviceId: dev.deviceId,
            }).catch(() => {});
          }
        } catch (_) {}

        await new Promise((resolve) => setTimeout(resolve, 3000));
        const childPresentRetry = (await isChildInRoom(targetDeviceId)) || (await isChildInRoom(inputDeviceId));
        if (!childPresentRetry) {
          console.warn(`[WEBRTC-REQUEST] Still no child socket in room ${targetDeviceId} after grace period! Emitting stream-failed (DEVICE_OFFLINE)`);
          socket.emit('stream-failed', {
            deviceId: inputDeviceId,
            type: data?.type,
            sessionId: data?.sessionId,
            reason: 'DEVICE_OFFLINE',
            message: 'Child device is offline or shut down',
          });
          return;
        }
      }

      // Mutual Exclusivity Check: If child is currently recording, reject stream request immediately!
      try {
        const { Recording } = require('../models/Recording');
        const activeRec = await Recording.findOne({
          deviceId: { $in: [targetDeviceId, inputDeviceId] },
          status: { $in: ['in_progress', 'saving'] }
        });
        if (activeRec) {
          const elapsed = Math.max(0, Math.floor((Date.now() - activeRec.startedAt.getTime()) / 1000));
          const remaining = Math.max(0, activeRec.durationSeconds - elapsed);
          console.warn(`[WEBRTC-REQUEST] Device ${targetDeviceId} has active ${activeRec.recordingType} recording! Emitting stream-failed (RECORDING_IN_PROGRESS)`);
          socket.emit('stream-failed', {
            deviceId: inputDeviceId,
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

      socket.to(targetDeviceId).emit('remote-request', { ...data, deviceId: targetDeviceId });
      socket.to(targetDeviceId).emit('request-stream', { ...data, deviceId: targetDeviceId });
      if (inputDeviceId !== targetDeviceId) {
        socket.to(inputDeviceId).emit('remote-request', data);
        socket.to(inputDeviceId).emit('request-stream', data);
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
      const rawOffer = data?.offer || data?.sdp;
      const offerObj = typeof rawOffer === 'object' ? rawOffer : { type: 'offer', sdp: rawOffer };
      const sdpStr = typeof rawOffer === 'string' ? rawOffer : (rawOffer?.sdp || '');

      const payload = {
        offer: offerObj,
        sdp: offerObj,
        sdpString: sdpStr,
        type: 'offer',
        from: socket.id,
        sessionId: data?.sessionId,
        deviceId
      };

      console.log(`[WEBRTC-OFFER] Relaying SDP offer for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('offer', payload);
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('offer', payload);
        }
      }
    });

    // Relay SDP Answer
    socket.on('answer', (data: any) => {
      const deviceId = data?.deviceId;
      const rawAnswer = data?.answer || data?.sdp;
      const answerObj = typeof rawAnswer === 'object' ? rawAnswer : { type: 'answer', sdp: rawAnswer };
      const sdpStr = typeof rawAnswer === 'string' ? rawAnswer : (rawAnswer?.sdp || '');

      const payload = {
        answer: answerObj,
        sdp: answerObj,
        sdpString: sdpStr,
        type: 'answer',
        from: socket.id,
        sessionId: data?.sessionId,
        deviceId
      };

      console.log(`[WEBRTC-ANSWER] Relaying SDP answer for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('answer', payload);
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('answer', payload);
        }
      }
    });

    // Relay ICE Candidates
    socket.on('ice-candidate', (data: any) => {
      const deviceId = data?.deviceId;
      const cand = data?.candidate;
      const candObj = typeof cand === 'object' ? cand : { candidate: cand, sdpMid: data?.sdpMid || '0', sdpMLineIndex: data?.sdpMLineIndex || 0 };

      const payload = {
        candidate: candObj,
        sdpMid: candObj?.sdpMid || data?.sdpMid,
        sdpMLineIndex: candObj?.sdpMLineIndex ?? data?.sdpMLineIndex,
        from: socket.id,
        sessionId: data?.sessionId,
        deviceId
      };

      if (deviceId) {
        socket.to(deviceId).emit('ice-candidate', payload);
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('ice-candidate', payload);
        }
      }
    });

    // Stop Stream Signal
    socket.on('stop-stream', (data: any) => {
      const deviceId = typeof data === 'string' ? data : data?.deviceId;
      console.log(`[WEBRTC-STOP] Stop stream requested for room: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('stop-stream', { deviceId });
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('stop-stream', { deviceId });
        }
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
