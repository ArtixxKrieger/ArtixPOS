/**
 * Ubiquiti UniFi Controller / Dream Machine adapter.
 *
 * Auth flow:
 *   1. POST /api/auth/login → get session cookie
 *   2. Use cookie + X-CSRF-Token for subsequent requests
 *
 * API docs: https://ubntwiki.com/products/software/unifi-controller/api
 */
import type { RouterAdapter, RouterConfig } from "./types";

function getBaseUrl(config: RouterConfig): string {
  const protocol = config.useSsl ? "https" : "http";
  const port = config.port || 8443;
  return `${protocol}://${config.host}:${port}`;
}

interface UnifiSession {
  cookie: string;
  csrfToken: string;
  expiresAt: number;
}

// Per-controller session cache — keyed by baseUrl so multi-tenant instances
// don't thrash each other's sessions.
const _sessionCache = new Map<string, UnifiSession>();

async function getSession(config: RouterConfig): Promise<UnifiSession | null> {
  const baseUrl = getBaseUrl(config);

  const cached = _sessionCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached;
  }

  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
        rememberMe: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const setCookie = res.headers.get("set-cookie");
    const csrfToken = res.headers.get("X-CSRF-Token") || res.headers.get("x-csrf-token") || "";

    if (!setCookie) return null;

    // Extract the unifises cookie
    const match = setCookie.match(/unifises=([^;]+)/) || setCookie.match(/UNIFISES=([^;]+)/);
    if (!match) return null;

    const session: UnifiSession = {
      cookie: `unifises=${match[1]}`,
      csrfToken,
      expiresAt: Date.now() + 30 * 60_000,
    };

    _sessionCache.set(baseUrl, session);
    return session;
  } catch (err: any) {
    console.warn("[unifi] getSession error:", err?.message);
    return null;
  }
}

function getSiteId(config: RouterConfig): string {
  return config.siteId || "default";
}

export const unifiAdapter: RouterAdapter = {
  async testConnection(config) {
    try {
      const baseUrl = getBaseUrl(config);

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
          rememberMe: false,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 400 || res.status === 401) {
        return { ok: false, message: "Invalid username or password" };
      }

      if (!res.ok) {
        return { ok: false, message: `Controller returned HTTP ${res.status}` };
      }

      const setCookie = res.headers.get("set-cookie");
      const match = setCookie?.match(/unifises=([^;]+)/i);
      if (!match) {
        return {
          ok: false,
          message: "Connected but no session cookie — is this a UniFi controller?",
        };
      }

      // Try fetching basic controller info
      const cookie = `unifises=${match[1]}`;
      const csrfToken = res.headers.get("X-CSRF-Token") || "";
      const infoRes = await fetch(`${baseUrl}/api/self`, {
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": csrfToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (infoRes.ok) {
        const info = await infoRes.json().catch(() => ({}));
        const name = info?.data?.[0]?.name || info?.data?.name || "";
        return {
          ok: true,
          message: `Connected — UniFi${name ? ` (${name})` : " Controller"}`,
          version: info?.data?.[0]?.version || info?.data?.version || "UniFi",
        };
      }

      return { ok: true, message: "Connected — UniFi Controller", version: "UniFi" };
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return { ok: false, message: "Timed out — verify controller IP and port" };
      }
      if (err?.code === "ECONNREFUSED") {
        return {
          ok: false,
          message: `Connection refused — is the UniFi controller reachable on port ${config.port || 8443}?`,
        };
      }
      return { ok: false, message: err?.message || "Cannot reach controller" };
    }
  },

  async createUser(config, code, durationMinutes) {
    try {
      const session = await getSession(config);
      if (!session) return null;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      // UniFi creates hotspot vouchers as "guest" users with duration limits
      const body = {
        cmd: "create-voucher",
        expires: "custom",
        n: 1,
        quota: 0,
        up: 0,
        down: 0,
        bytes: 0,
        note: "ArtixPOS",
        // duration in minutes
        expire_number: durationMinutes,
        expire_unit: 1, // 1 = minutes
      };

      const res = await fetch(`${baseUrl}/api/s/${encodeURIComponent(siteId)}/cmd/hotspot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
          "X-CSRF-Token": session.csrfToken,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[unifi] createUser HTTP ${res.status}: ${text}`);
        return null;
      }

      const data: any = await res.json().catch(() => ({}));
      // UniFi returns the voucher with both _id (MongoDB ObjectId) and code.
      // We return _id so removeUser / sync can reliably delete by internal reference.
      // Fall back to code if _id isn't present (some older UniFi versions).
      const voucherId =
        data?.data?.[0]?._id ?? data?.data?._id ?? data?.data?.[0]?.code ?? data?.data?.code;
      return voucherId ? String(voucherId) : code;
    } catch (err: any) {
      console.warn("[unifi] createUser error:", err?.message);
      return null;
    }
  },

  async removeUser(config, userId) {
    try {
      const session = await getSession(config);
      if (!session) return;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      // Revoke the voucher by code
      const body = {
        cmd: "revoke-voucher",
        _id: userId,
      };

      await fetch(`${baseUrl}/api/s/${encodeURIComponent(siteId)}/cmd/hotspot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
          "X-CSRF-Token": session.csrfToken,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: any) {
      console.warn("[unifi] removeUser error:", err?.message);
    }
  },

  async removeUserByName(config, name) {
    try {
      const session = await getSession(config);
      if (!session) return;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      // List vouchers and find the one matching the code
      const listRes = await fetch(`${baseUrl}/api/s/${encodeURIComponent(siteId)}/stat/voucher`, {
        headers: {
          Cookie: session.cookie,
          "X-CSRF-Token": session.csrfToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!listRes.ok) return;

      const list: any = await listRes.json().catch(() => ({}));
      const vouchers = list?.data ?? [];

      if (!Array.isArray(vouchers) || vouchers.length === 0) return;

      const voucher = vouchers.find((v: any) => v.code === name || v.note === "ArtixPOS");
      // The revoke-voucher command requires the internal _id, not the code.
      const voucherId = voucher?._id ?? voucher?.code;
      if (voucherId) await unifiAdapter.removeUser(config, String(voucherId));
    } catch (err: any) {
      console.warn("[unifi] removeUserByName error:", err?.message);
    }
  },
};
