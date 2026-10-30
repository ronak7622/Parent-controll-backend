import { config } from '../config/env';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

let cached: { servers: IceServer[]; expiresAt: number } | null = null;

/**
 * Generates short-lived Cloudflare TURN credentials and caches them.
 * Served to apps via /config/options iceServers (no app update needed on rotate/scale).
 * Returns [] if TURN is not configured or on error (STUN fallback still applies).
 */
export async function getCloudflareTurnIceServers(): Promise<IceServer[]> {
  const keyId = config.turn.keyId;
  const apiToken = config.turn.apiToken;
  if (!keyId || !apiToken) return [];

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.servers;

  try {
    const ttl = 86400; // 24h
    const resp = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl }),
      }
    );
    if (!resp.ok) {
      console.warn('[CloudflareTURN] generate failed:', resp.status, await resp.text());
      return cached?.servers || [];
    }
    const data: any = await resp.json();
    const ice = data?.iceServers;
    const servers: IceServer[] = ice
      ? [{ urls: ice.urls, username: ice.username, credential: ice.credential }]
      : [];
    cached = { servers, expiresAt: now + (ttl - 3600) * 1000 }; // cache until 1h before expiry
    console.log('[CloudflareTURN] credentials generated, urls:', JSON.stringify(ice?.urls));
    return servers;
  } catch (err: any) {
    console.warn('[CloudflareTURN] error:', err?.message || err);
    return cached?.servers || [];
  }
}
