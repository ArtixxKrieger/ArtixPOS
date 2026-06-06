/**
 * TP-Link Omada SDN Controller adapter.
 *
 * API docs: https://www.tp-link.com/en/omada-sdn/api/
 *
 * Auth flow:
 *   1. POST /api/v2/login → get session cookie
 *   2. Use cookie for subsequent requests
 *   3. POST /api/v2/logout when done (optional)
 */
import type { RouterAdapter, RouterConfig } from "./types";

function getBaseUrl(config: RouterConfig): string {
  const protocol = config.useSsl ? "https" : "http";
  const port = config.port || 8043;
  return `${protocol}://${config.host}:${port}`;
}

interface OmadaSession {
  cookie: string;
  expiresAt: number;
}

// Per-controller session cache — keyed by baseUrl so multi-tenant instances
// don't thrash each other's sessions.
const _sessionCache = new Map<string, OmadaSession>();

async function getSession(config: RouterConfig): Promise<string | null> {
  const baseUrl = getBaseUrl(config);

  // Reuse cached session if still valid (within 5 min margin)
  const cached = _sessionCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.cookie;
  }

  try {
    const res = await fetch(`${baseUrl}/api/v2/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    // Omada returns a session cookie in Set-Cookie header
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;

    // Extract the omadac_id cookie
    const match = setCookie.match(/omadac_id=([^;]+)/);
    if (!match) return null;

    const cookie = `omadac_id=${match[1]}`;
    _sessionCache.set(baseUrl, { cookie, expiresAt: Date.now() + 30 * 60_000 });

    return cookie;
  } catch (err: any) {
    console.warn("[omada] getSession error:", err?.message);
    return null;
  }
}

function getSiteId(config: RouterConfig): string {
  return config.siteId || "Default";
}

export const omadaAdapter: RouterAdapter = {
  async testConnection(config) {
    try {
      const baseUrl = getBaseUrl(config);

      // Try to log in
      const res = await fetch(`${baseUrl}/api/v2/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 401) {
        return { ok: false, message: "Invalid username or password" };
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          message: `Controller returned HTTP ${res.status} — ${text.slice(0, 200)}`,
        };
      }

      const setCookie = res.headers.get("set-cookie");
      const match = setCookie?.match(/omadac_id=([^;]+)/);
      if (!match) {
        return {
          ok: false,
          message: "Connected but no session cookie returned — is this an Omada controller?",
        };
      }

      // Try to get controller info
      const cookie = `omadac_id=${match[1]}`;
      const infoRes = await fetch(`${baseUrl}/api/v2/sites`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(6000),
      });

      if (infoRes.ok) {
        const sites = await infoRes.json();
        // result.data is an array of sites
        const siteList = Array.isArray(sites?.result?.data)
          ? sites.result.data
          : Array.isArray(sites?.data)
            ? sites.data
            : [];
        const siteNames = siteList.map((s: any) => s.name || s.siteName || "Unknown").join(", ");
        return {
          ok: true,
          message: `Connected — Omada Controller${siteNames ? ` (${siteList.length} site(s): ${siteNames})` : ""}`,
          version: "Omada SDN",
        };
      }

      return { ok: true, message: "Connected — Omada Controller", version: "Omada SDN" };
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return { ok: false, message: "Timed out — verify controller IP and port" };
      }
      if (err?.code === "ECONNREFUSED") {
        return {
          ok: false,
          message: `Connection refused — is the Omada controller reachable on port ${config.port || 8043}?`,
        };
      }
      return { ok: false, message: err?.message || "Cannot reach controller" };
    }
  },

  async createUser(config, code, durationMinutes) {
    try {
      const cookie = await getSession(config);
      if (!cookie) return null;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      const hours = durationMinutes / 60;

      const body = {
        name: code,
        password: code,
        // Omada uses "validTime" in hours for the user account validity
        validTime: hours,
        // Also set a usage quota — expire after N minutes of usage
        // We set a daily limit that expires today
        enableRateLimit: true,
        rateLimit: {
          // Not strictly time-based; we set a 0 minute quota essentially creating
          // a user that exists for the specified duration. Omada auto-clears expired users.
          downRate: 0,
          upRate: 0,
        },
      };

      const res = await fetch(
        `${baseUrl}/api/v2/sites/${encodeURIComponent(siteId)}/setting/hotspot/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[omada] createUser HTTP ${res.status}: ${text}`);
        return null;
      }

      const data: any = await res.json().catch(() => ({}));
      // Omada may return an id field
      const userId = data?.result?.id ?? data?.id ?? data?.result?._id;
      return userId ? String(userId) : code; // Fall back to code as identifier
    } catch (err: any) {
      console.warn("[omada] createUser error:", err?.message);
      return null;
    }
  },

  async removeUser(config, userId) {
    try {
      const cookie = await getSession(config);
      if (!cookie) return;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      await fetch(
        `${baseUrl}/api/v2/sites/${encodeURIComponent(siteId)}/setting/hotspot/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(8000),
        },
      );
    } catch (err: any) {
      console.warn("[omada] removeUser error:", err?.message);
    }
  },

  async removeUserByName(config, name) {
    try {
      const cookie = await getSession(config);
      if (!cookie) return;

      const siteId = getSiteId(config);
      const baseUrl = getBaseUrl(config);

      // Search for the user by name
      const listRes = await fetch(
        `${baseUrl}/api/v2/sites/${encodeURIComponent(siteId)}/setting/hotspot/users?searchKey=${encodeURIComponent(name)}`,
        {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!listRes.ok) return;

      const list: any = await listRes.json().catch(() => ({}));
      const data = list?.result?.data ?? list?.data ?? [];

      if (!Array.isArray(data) || data.length === 0) return;

      const user = data.find((u: any) => u.name === name);
      const userId = user?.id ?? user?._id;
      if (userId) await omadaAdapter.removeUser(config, String(userId));
    } catch (err: any) {
      console.warn("[omada] removeUserByName error:", err?.message);
    }
  },
};
