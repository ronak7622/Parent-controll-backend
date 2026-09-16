# Child Protect Backend System

Production-grade, ultra-scalable Node.js (TypeScript) + MongoDB + Cloudflare R2 + WebRTC signaling backend designed to support 1M+ active devices at minimal server costs.

---

## Folder Location

`D:\Vora\Parent controll\backend`

---

## Key Features Built In

1. **Authentication**: Mobile Number + OTP Login with JWT Token generation (`/api/auth/request-otp`, `/api/auth/verify-otp`).
2. **Device Pairing & Management**: QR Code / 6-digit code pairing (`/api/device/pairing-code`, `/api/device/pair`, `/api/device/list`).
3. **High-Efficiency Log Ingestion**: Batch uploading for Browser History, YouTube History, Call Logs, Contacts, Screen Time, and Social Messages.
4. **Cloudflare R2 Zero-Egress Media Storage**: Uploading client-side compressed screenshots (`.webp`) and call recordings (`.opus`) to Cloudflare R2 storage without bandwidth fees.
5. **WebRTC P2P Signaling**: Socket.io real-time signaling endpoint (`/webrtc-signaling`) for Live Screen Mirroring, Live Camera, and Live Audio.
6. **90-Day Auto Data Retention**: TTL indexes on MongoDB schemas for automatic background purging of data older than 90 days.

---

## How to Install & Run Locally

### Step 1: Install Dependencies
Open terminal in `D:\Vora\Parent controll\backend` and run:
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Step 3: Run Development Server
```bash
npm run dev
```

The server will start at `http://localhost:5000` and report MongoDB connection status.

### Step 4: Build for Production
```bash
npm run build
npm start
```

---

## API Summary Matrix

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/request-otp` | Generate OTP for Parent phone number |
| `POST` | `/api/auth/verify-otp` | Verify OTP and return JWT token |
| `GET` | `/api/device/pairing-code` | Generate 6-digit child device pairing code |
| `POST` | `/api/device/pair` | Register and pair child device |
| `GET` | `/api/device/list` | Fetch all paired devices for parent account |
| `PUT` | `/api/device/:deviceId/settings` | Update restrictions (YouTube, Browser, App Block, Timers) |
| `POST` | `/api/device/:deviceId/command` | Send high-priority remote command via FCM |
| `POST` | `/api/ingest/heartbeat` | Child device battery & online heartbeat |
| `POST` | `/api/ingest/browser-history` | Ingest batch browser history logs |
| `POST` | `/api/ingest/youtube-history` | Ingest batch YouTube history logs |
| `POST` | `/api/ingest/media-capture` | Upload `.webp` screenshot/photo to Cloudflare R2 |
| `POST` | `/api/ingest/general-logs` | Ingest contacts, call logs, app usage, social messages |
| `GET` | `/api/parent/device/:deviceId/browser-history` | Parent fetch browser history with 90+ days calendar date |
| `GET` | `/api/parent/device/:deviceId/youtube-history` | Parent fetch YouTube history with 90+ days calendar date |
| `GET` | `/api/parent/device/:deviceId/media-captures` | Parent fetch screenshots & photos with type/date filters |
| `GET` | `/api/parent/device/:deviceId/contacts` | Parent fetch contacts list |
| `GET` | `/api/parent/device/:deviceId/call-logs` | Parent fetch call logs & audio recordings |
| `GET` | `/api/parent/device/:deviceId/app-usage` | Parent fetch screen time & app usage by date |
| `GET` | `/api/parent/device/:deviceId/social-messages` | Parent fetch social messages chat history |
