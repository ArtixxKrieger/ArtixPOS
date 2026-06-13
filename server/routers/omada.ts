

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

const _sessionCache = new Map<string, OmadaSession>();

async function getSession(config: RouterConfig): Promise<string | null> {
  const baseUrl = getBaseUrl(config);

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

const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;

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

const cookie = `omadac_id=${match[1]}`;
      const infoRes = await fetch(`${baseUrl}/api/v2/sites`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(6000),
      });

      if (infoRes.ok) {
        const sites = await infoRes.json();

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

        validTime: hours,

enableRateLimit: true,
        rateLimit: {

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

      const userId = data?.result?.id ?? data?.id ?? data?.result?._id;
      return userId ? String(userId) : code;
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

const listRes = await fetch(
        `${baseUrl}/api/v2/sites/${encodeURIComponent(siteId)}/setting/hotspot/users?currentPage=1&currentPageSize=500`,
        {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!listRes.ok) return;

      const list: any = await listRes.json().catch(() => ({}));
      const data = list?.result?.data ?? list?.data ?? [];

      if (!Array.isArray(data) || data.length === 0) return;

const user = data.find((u: any) => u.name === name || u.userName === name);
      const userId = user?.id ?? user?._id;
      if (userId) await omadaAdapter.removeUser(config, String(userId));
    } catch (err: any) {
      console.warn("[omada] removeUserByName error:", err?.message);
    }
  },
};
