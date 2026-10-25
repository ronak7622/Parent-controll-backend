# Child Protect — Deploy & Scale Guide

This backend is built **stateless + horizontally scalable**. Going live or adding servers
later needs **config/infra changes only — no app code change, no app update** (clients talk to
one stable domain and read runtime settings from `/config/options`).

---

## 1. Architecture

| Piece | What | Where |
|---|---|---|
| App server(s) | Node + Express + Socket.IO (API + live signaling) | OVH VPS (1 → many behind a load balancer) |
| Database | MongoDB | Separate OVH box (or managed) — connection string only |
| Redis | Socket.IO adapter + BullMQ + rate-limit + cache | Same box to start, managed later |
| Media storage | Cloudflare R2 (zero egress) | Cloudflare |
| Live relay | Cloudflare TURN (+ Google STUN) | Cloudflare; served to apps via `/config/options` |
| Push | Firebase FCM | Firebase |

All environment-specific values live in `.env` (see `.env.example`). Clients read the API base
URL + ICE/TURN servers at runtime, so infra can change without shipping an app update.

---

## 2. Environment

Copy `.env.example` → `.env` and fill real values. **Never commit `.env`** (gitignored).
Key vars: `PORT`, `MONGODB_URI`, `REDIS_URI`, `JWT_SECRET`, `R2_*`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
`SMS_PROVIDER` / `SMS_PROVIDER_API_KEY`. Full list + notes are in `.env.example`.

`REDIS_URI` is **required for horizontal scaling** (it is how multiple app servers share
Socket.IO rooms, queues and rate-limits). With it empty the server still runs single-instance.

---

## 3. Local development

```bash
# All-in-one (backend + mongo + redis) via Docker:
cp .env.example .env            # fill values (local mongo/redis are overridden by compose)
docker compose up --build

# OR run bare (needs local mongo + redis running):
npm install
npm run dev                     # ts-node-dev hot reload
```
Health check: `GET http://localhost:5000/health` → 200 when DB connected.

---

## 4. Build & run (production, one server)

```bash
npm run build          # tsc -> dist/
npm start              # node dist/server.js
# or containerized:
docker build -t childprotect-backend .
docker run -d --env-file .env -p 5000:5000 childprotect-backend
```

---

## 5. Go-live checklist (fill creds — no code change)

1. **Domain:** point `api.yourapp.com` (Cloudflare DNS) at the server; keep Cloudflare proxy ON
   (orange cloud) for free DDoS protection + hidden origin IP + LB-ready.
2. **Backend `.env`:** real `MONGODB_URI`, `REDIS_URI`, `JWT_SECRET`, `R2_*`,
   `FIREBASE_SERVICE_ACCOUNT_JSON`, SMS keys.
3. **Client base URL:** set to `https://api.yourapp.com`.
   - Child app: `AppConfig.kt` → `IS_LIVE = true`, `LIVE_URL = "https://api.yourapp.com/api"` (one-time).
   - Parent app: its API base config → same domain.
   (Base URL is intentionally the one thing set once at launch; after that the domain never
   changes — adding servers happens behind it.)
4. **TURN:** see §7. Default public STUN/TURN works out of the box; switch to Cloudflare TURN
   via DB config with **no app update**.
5. Verify `GET /health` through the domain returns 200, then test pairing + live.

---

## 6. Scaling: add more servers (NO app change)

Because the backend is stateless and uses the Redis adapter, adding capacity is infra-only:

1. Bump RAM first if easy (vertical): resize the VPS (4 → 8 → 16 GB).
2. Add servers (horizontal):
   - Spin up another OVH VPS, run the **same Docker image** with the **same `.env`**
     (same `MONGODB_URI` + `REDIS_URI`).
   - Put all app servers behind a **load balancer** (Cloudflare Load Balancer or Nginx/HAProxy)
     with **sticky sessions** enabled (WebSocket), health-check path `/health`.
   - DNS stays on `api.yourapp.com`. **Clients unchanged. No app update.**
3. Keep MongoDB on its own box; scale it independently (bigger box / replica set) by changing
   `MONGODB_URI` only.

The signaling layer was made **cross-instance correct** (presence/eviction use the Redis
adapter's `fetchSockets()` across all instances, never the local `adapter.rooms`), so live
streaming, device-online checks and "one child = one socket" work correctly with many servers.

---

## 7. Cloudflare TURN (live) — switch with no app update

ICE/TURN servers are delivered to both apps via `/config/options` (`iceServers`), which defaults
to free public STUN/TURN. To use Cloudflare TURN:

1. Get Cloudflare TURN ICE credentials.
2. Override the `iceServers` option in the **DB `Config`** document (admin), e.g.:
   ```json
   { "iceServers": [
       { "urls": "stun:stun.cloudflare.com:3478" },
       { "urls": "turn:turn.cloudflare.com:3478?transport=udp", "username": "<id>", "credential": "<token>" },
       { "urls": "turn:turn.cloudflare.com:3478?transport=tcp", "username": "<id>", "credential": "<token>" }
   ] }
   ```
3. Apps pick it up on next `/config/options` fetch — **no rebuild, no app update**. Clients fall
   back to the built-in public list if config is missing/invalid.

(If you later prefer short-lived per-session TURN credentials minted via the Cloudflare API, add
a backend endpoint for it and store the Cloudflare token in `.env` — placeholders are noted in
`.env.example`.)

---

## 8. Cloudflare proxy (do at go-live)

In Cloudflare DNS, set the `api` record to your origin and enable the proxy (orange cloud).
Benefits: free DDoS protection, hidden origin IP, caching, and easy Load Balancer later.

---

## 9. Uptime monitoring + alerts

Add a free monitor (e.g. UptimeRobot) hitting `https://api.yourapp.com/health` every 1–5 min
with email/push alerts, so you know immediately if a server is down. (Especially important while
on a single box.)

---

## 10. MongoDB backups (data insurance)

`scripts/backup-mongo.sh` dumps Mongo and uploads to R2 with rotation.

```bash
chmod +x scripts/backup-mongo.sh
# Requires on the host: mongodb-database-tools (mongodump) + awscli
# Cron (daily 02:30):
30 2 * * *  /path/to/backend/scripts/backup-mongo.sh >> /var/log/mongo-backup.log 2>&1
```
Backup vars (in `.env`): `BACKUP_R2_BUCKET`, `BACKUP_PREFIX`, `BACKUP_RETENTION_DAYS`.
R2 is already highly durable, so **only MongoDB needs backing up** (media on R2 does not).

---

## 11. What was hardened for scale (summary)

- Socket.IO **Redis adapter** wired (multi-instance rooms/broadcast) — was already present.
- **Stateless multi-instance fixes:** presence & "one child = one socket" eviction now use
  cross-instance `fetchSockets()` (signaling + parent.controller + recording.controller); the
  blocked-URL push dedup now uses the shared Redis throttle instead of an in-process Map.
- **`/health` + `/ready`** endpoints (LB-ready) — present.
- **All config externalized to env** (`.env.example` documents every var).
- **ICE/TURN delivered via `/config/options`** so TURN can change with no app update.
- **Dockerfile + docker-compose + .dockerignore** (same image on every server).
- **Mongo → R2 backup script.**
