import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env';
import { Device, enrichDeviceWithOnlineStatus } from '../models/Device';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';
import { LiveUsageService } from '../services/LiveUsageService';

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
    const initialUserId = socket.data.auth?.userId || socket.data.auth?.id || socket.data.auth?._id;
    if (initialUserId) {
      socket.join(`user_${initialUserId}`);
      socket.join(`parent_${initialUserId}`);
    }

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

      if (auth && (auth.userId || auth.id || auth._id)) {
        const uid = auth.userId || auth.id || auth._id;
        socket.join(`user_${uid}`);
        socket.join(`parent_${uid}`);
      }

      if (!auth) {
        // Fallback for child device socket: if role === 'child' and the device exists & is paired in MongoDB, allow room join!
        if (role === 'child' && rawDeviceId) {
          const isObjId = mongoose.isValidObjectId(rawDeviceId);
          const dev = await Device.findOne({
            $or: [
              { deviceId: rawDeviceId },
              ...(isObjId ? [{ _id: rawDeviceId }] : [])
            ],
            isPaired: true
          });
          if (dev) {
            auth = { kind: 'device', deviceId: dev.deviceId };
            socket.data.auth = auth;
            console.log(`[WEBRTC-ROOM] Authenticated child device via DB fallback: ${dev.deviceId} for socket ${socket.id}`);
          }
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

      // ── ONE CHILD = ONE SOCKET ──────────────────────────────────────────────
      // Before this child joins, evict any STALE/ghost child socket already in this
      // device room. Ghost sockets (left over from reconnects / renew / network churn
      // where the old connection was not cleaned up) cause live stream requests and
      // WebRTC signalling (offer/answer/ICE) to be duplicated or routed to a dead peer
      // — which makes Live get stuck on "connecting" and then fail. Keeping exactly one
      // live child socket per device fixes that and also lowers memory/connection cost.
      if (role === 'child') {
        try {
          // Cross-instance eviction: fetchSockets() returns matching sockets across ALL backend
          // instances via the Redis adapter (adapter.rooms is LOCAL-only and would miss a ghost
          // socket living on another server). This keeps "one child = one socket" correct when
          // horizontally scaled to multiple OVH boxes.
          const existing = await signalingNamespace.in(targetDeviceId).fetchSockets();
          for (const other of existing) {
            if (other.id === socket.id) continue;
            if (other.data?.role === 'child') {
              console.log(`[WEBRTC-ROOM] Evicting stale child socket ${other.id} for device ${targetDeviceId} (replaced by ${socket.id})`);
              try { other.leave(targetDeviceId); } catch (_) {}
              try { other.disconnect(true); } catch (_) {}
            }
          }
        } catch (e: any) {
          console.warn(`[WEBRTC-ROOM] Stale child-socket eviction skipped: ${e?.message}`);
        }
      }

      socket.data.role = role;
      socket.data.deviceId = targetDeviceId;
      socket.join(targetDeviceId);
      if (rawDeviceId !== targetDeviceId) {
        socket.join(rawDeviceId);
      }
      if (auth.userId) {
        socket.join(`user_${auth.userId}`);
        socket.join(`parent_${auth.userId}`);
      }

      console.log(`[WEBRTC-ROOM] Socket ${socket.id} (${role}) joined room: ${targetDeviceId} (raw: ${rawDeviceId})`);
      socket.to(targetDeviceId).emit('peer-joined', { socketId: socket.id, role });
      if (rawDeviceId !== targetDeviceId) {
        socket.to(rawDeviceId).emit('peer-joined', { socketId: socket.id, role });
      }

      if (role === 'child') {
        try {
          const dev = await Device.findOne({ deviceId: targetDeviceId });
          if (dev && dev.appRemoved === true) {
            console.log(`[WEBRTC-ROOM] Device ${targetDeviceId} is marked as appRemoved. Skipping online update from stray child socket.`);
            return;
          }
          const now = new Date();
          await Device.updateOne({ deviceId: targetDeviceId }, { $set: { isOnline: true, lastSeenAt: now } });
          socket.to(targetDeviceId).emit('device-status-changed', {
            deviceId: targetDeviceId,
            isOnline: true,
            lastSeenAt: now.toISOString(),
          });
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

    socket.on('device-app-removed', async (data: any) => {
      const devId = data?.deviceId;
      if (!devId) return;
      console.log(`[WEBRTC-APP-REMOVED] Received device-app-removed via socket for ${devId}`);
      try {
        const { reportAppRemoved } = require('../controllers/device.controller');
        await reportAppRemoved({ params: { deviceId: devId }, body: data }, {
          status: () => ({ json: () => {} }),
          json: () => {},
        });
      } catch (err: any) {
        console.error('[WEBRTC-APP-REMOVED] Error handling device-app-removed socket:', err.message);
      }
    });

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

      const sessionId = data?.sessionId || `live_${targetDeviceId}_${Date.now()}`;
      if (!data) data = {};
      data.sessionId = sessionId;

      // Subscription & Live Usage Enforcement Check (§3 & §10)
      try {
        const { StorageAccountingService } = require('../services/StorageAccountingService');
        const parentUserId = await StorageAccountingService.resolveParentUserId(targetDeviceId);
        if (parentUserId) {
          const grant = await LiveUsageService.grantSession({
            sessionId,
            parentUserId,
            deviceId: targetDeviceId,
            rawDeviceId: inputDeviceId,
            parentSocketId: socket.id,
            type: data?.type || 'camera',
          });

          if (!grant.allowed) {
            console.warn(`[WEBRTC-REQUEST-REJECTED] Device ${targetDeviceId}: ${grant.reason} - ${grant.message}`);
            socket.emit('stream-failed', {
              deviceId: inputDeviceId,
              type: data?.type,
              sessionId,
              reason: grant.reason || 'LIVE_MINUTES_EXCEEDED',
              message: grant.message || 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.',
              canRetry: grant.canRetry ?? false,
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
          LiveUsageService.cancelSession(sessionId, targetDeviceId, socket.id);
          try {
            await Device.updateMany({ $or: [{ deviceId: targetDeviceId }, { deviceId: inputDeviceId }] }, { $set: { isOnline: false } });
            signalingNamespace.to(targetDeviceId).emit('device-status-changed', {
              deviceId: targetDeviceId,
              isOnline: false,
            });
            if (inputDeviceId !== targetDeviceId) {
              signalingNamespace.to(inputDeviceId).emit('device-status-changed', {
                deviceId: inputDeviceId,
                isOnline: false,
              });
            }
          } catch (_) {}
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
          LiveUsageService.cancelSession(sessionId, targetDeviceId, socket.id);
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
      const sessId = data?.sessionId;
      LiveUsageService.cancelSession(sessId, deviceId, socket.id);
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

    const broadcastToDeviceRooms = async (rawDevId: string, sessId: string | undefined, eventName: string, payload: any) => {
      const targetRooms = new Set<string>();
      if (rawDevId) targetRooms.add(String(rawDevId));
      try {
        const { Device } = require('../models/Device');
        const isObjId = mongoose.isValidObjectId(rawDevId);
        let dev = rawDevId ? await Device.findOne({
          $or: [
            { deviceId: rawDevId },
            ...(isObjId ? [{ _id: rawDevId }] : [])
          ]
        }) : null;

        if (!dev && sessId) {
          const { Recording } = require('../models/Recording');
          const rec = await Recording.findOne({ sessionId: sessId });
          if (rec) {
            targetRooms.add(rec.deviceId);
            dev = await Device.findOne({
              $or: [
                { deviceId: rec.deviceId },
                ...(mongoose.isValidObjectId(rec.deviceId) ? [{ _id: rec.deviceId }] : [])
              ]
            });
          }
        }
        if (dev) {
          if (dev.deviceId) targetRooms.add(String(dev.deviceId));
          if (dev._id) targetRooms.add(dev._id.toString());
        }
      } catch (err: any) {
        console.error(`[WEBRTC-BROADCAST-${eventName}-ROOMS-ERROR]`, err?.message);
      }

      for (const room of targetRooms) {
        socket.to(room).emit(eventName, payload);
        signalingNamespace.to(room).emit(eventName, payload);
        try {
          getSignalingIo()?.to(room).emit(eventName, payload);
        } catch (_) {}
      }
    };

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
      await broadcastToDeviceRooms(deviceId, sessionId, 'recording-failed', data);
      await broadcastToDeviceRooms(deviceId, sessionId, 'stream-failed', data);
    });

    socket.on('recording-started', async (data: any) => {
      const deviceId = data?.deviceId;
      const sessionId = data?.sessionId;
      console.log(`[WEBRTC-RECORDING-STARTED] Recording started reported for device: ${deviceId}, sessionId: ${sessionId}, type: ${data?.recordingType}`);
      try {
        const { Recording } = require('../models/Recording');
        if (sessionId) {
          await Recording.updateOne(
            { sessionId },
            { $set: { startedAt: new Date(), status: 'in_progress', childStarted: true } }
          );
        } else if (deviceId) {
          await Recording.updateOne(
            { deviceId, status: 'in_progress' },
            { $set: { startedAt: new Date(), childStarted: true } }
          );
        }
      } catch (dbErr: any) {
        console.error('[WEBRTC-RECORDING-STARTED-DB-ERROR]', dbErr?.message);
      }
      await broadcastToDeviceRooms(deviceId, sessionId, 'recording-started', data);
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
      LiveUsageService.markMediaConnected(data?.sessionId, deviceId, socket.id);
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
      LiveUsageService.markMediaConnected(data?.sessionId, deviceId, socket.id);
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
    socket.on('stop-stream', async (data: any) => {
      const deviceId = typeof data === 'string' ? data : data?.deviceId;
      const sessId = typeof data === 'object' ? data?.sessionId : undefined;
      console.log(`[WEBRTC-STOP] Stop stream requested for room: ${deviceId}, sessionId: ${sessId}`);

      const session = LiveUsageService.findSession(sessId, deviceId, socket.id);
      if (session) {
        // If an untargeted stop-stream (without sessionId) arrives from child while session is newly connecting (< 4s), ignore it
        if (!sessId && socket.data.role === 'child' && Date.now() - session.startedAt.getTime() < 4000) {
          console.warn(`[WEBRTC-STOP-IGNORED] Ignoring untargeted child stop-stream for newly connecting session ${session.sessionId}`);
          return;
        }
      }

      await LiveUsageService.endSession(sessId || deviceId || socket.id, 'STOP_STREAM');

      if (deviceId) {
        socket.to(deviceId).emit('stop-stream', { deviceId, sessionId: sessId });
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('stop-stream', { deviceId, sessionId: sessId });
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

    // Real-time Permission Status Updates (Child -> Parent during Pairing & Setup)
    socket.on('permission-status-update', async (data: any) => {
      const deviceId = data?.deviceId || socket.data.deviceId;
      console.log(`[PERMISSION-STATUS] Relaying live permission status update for device: ${deviceId}`);
      if (deviceId) {
        if (data?.permissions && typeof data.permissions === 'object') {
          try {
            const updateSet: any = { grantedPermissions: data.permissions };
            const perms = data.permissions;
            if (typeof perms.isAppHidden !== 'undefined') {
              updateSet.isAppHidden = Boolean(perms.isAppHidden);
            } else if (typeof perms.HIDE_APP !== 'undefined') {
              updateSet.isAppHidden = Boolean(perms.HIDE_APP);
            }
            if (typeof perms.secureOurChildApp !== 'undefined') {
              updateSet.secureOurChildApp = Boolean(perms.secureOurChildApp);
            } else if (typeof perms.SECURE_OUR_APP !== 'undefined') {
              updateSet.secureOurChildApp = Boolean(perms.SECURE_OUR_APP);
            }
            const updatedDev = await Device.findOneAndUpdate(
              { deviceId },
              { $set: updateSet },
              { new: true }
            );
            if (updatedDev) {
              const enriched = enrichDeviceWithOnlineStatus(updatedDev.toObject());
              const statusPayload = {
                deviceId,
                isOnline: enriched.isOnline,
                appRemoved: enriched.appRemoved,
                grantedPermissions: enriched.grantedPermissions,
                isCriticalPermissionsOff: enriched.isCriticalPermissionsOff,
                disabledPermissionsCount: enriched.disabledPermissionsCount,
                disabledPermissionsList: enriched.disabledPermissionsList,
                lastSeen: enriched.lastSeen,
                lastSeenAt: enriched.lastSeenAt,
              };
              io.to(deviceId).emit('device-status-changed', statusPayload);
              if (updatedDev.parentUserId) {
                io.to(`parent_${updatedDev.parentUserId}`).emit('device-status-changed', statusPayload);
              }
            }
          } catch (e: any) {
            console.warn(`[PERMISSION-STATUS-DB-WARN] Could not persist permissions: ${e.message}`);
          }
        }

        socket.to(deviceId).emit('permission-status-update', data);
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('permission-status-update', data);
        }
      }
    });

    // Request Live Permission Status (Parent -> Child)
    socket.on('request-permission-status', (data: any) => {
      const deviceId = data?.deviceId || socket.data.deviceId;
      console.log(`[REQUEST-PERMISSION-STATUS] Relaying request for device: ${deviceId}`);
      if (deviceId) {
        socket.to(deviceId).emit('request-permission-status', data);
        if (socket.data.deviceId && socket.data.deviceId !== deviceId) {
          socket.to(socket.data.deviceId).emit('request-permission-status', data);
        }
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[WEBRTC-DISCONNECT] Socket disconnected: ${socket.id}`);
      await LiveUsageService.endSession(socket.id, 'SOCKET_DISCONNECT');
      if (socket.data?.role === 'child' && socket.data?.deviceId) {
        const devId = socket.data.deviceId;
        const isStillPresent = await isChildInRoom(devId);
        if (!isStillPresent) {
          console.log(`[WEBRTC-DISCONNECT] Child socket disconnected and no other child sockets in room for device ${devId}. Marking device offline.`);
          try {
            const now = new Date();
            await Device.updateMany(
              { $or: [{ deviceId: devId }, ...(mongoose.isValidObjectId(devId) ? [{ _id: devId }] : [])] },
              { $set: { isOnline: false, lastSeenAt: now } }
            );
            signalingNamespace.to(devId).emit('device-status-changed', {
              deviceId: devId,
              isOnline: false,
              lastSeenAt: now.toISOString(),
            });
          } catch (err: any) {
            console.error(`[WEBRTC-DISCONNECT] Error marking child device offline:`, err?.message);
          }
        }
      }
    });
  });

  return io;
};

export const getSignalingIo = () => signalingIo;

/**
 * Cross-instance presence check: is a 'child'-role socket currently connected for this device
 * anywhere in the cluster? Uses the Redis adapter's fetchSockets() which aggregates sockets
 * across ALL backend instances. NEVER use adapter.rooms for presence — that is local to one
 * instance and breaks as soon as a second server is added.
 */
export const isChildOnline = async (deviceId?: string, alternateId?: string): Promise<boolean> => {
  const ns: any = signalingIo;
  if (!ns) return false;
  const ids = Array.from(new Set([deviceId, alternateId].filter((x): x is string => !!x)));
  for (const id of ids) {
    try {
      const sockets = await ns.in(id).fetchSockets();
      if (sockets.some((s: any) => s?.data?.role === 'child')) return true;
    } catch (_) {}
  }
  return false;
};
