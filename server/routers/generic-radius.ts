

import type { RouterAdapter, RouterConfig } from "./types";

function getBaseUrl(config: RouterConfig): string {
  const protocol = config.useSsl ? "https" : "http";
  const port = config.port || 80;
  return `${protocol}://${config.host}:${port}`;
}

export const genericRadiusAdapter: RouterAdapter = {
  async testConnection(config) {
    try {
      const baseUrl = getBaseUrl(config);
      const res = await fetch(`${baseUrl}/api/radius/health`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          ok: true,
          message: `Connected — RADIUS API (${data?.version || "ok"})`,
          version: data?.version,
        };
      }
      if (res.status === 404) {

        return {
          ok: true,
          message: "Connected — RADIUS API (no health check available)",
        };
      }
      return {
        ok: false,
        message: `RADIUS API returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return {
          ok: false,
          message:
            "RADIUS API timed out. Make sure your RADIUS REST API is running. You can use FreeRADIUS with rest module, or point this at any RADIUS management service.",
        };
      }
      if (err?.code === "ECONNREFUSED") {
        return {
          ok: false,
          message: `Connection refused on port ${config.port || 80}. Is your RADIUS REST API reachable?`,
        };
      }
      return { ok: false, message: err?.message || "Cannot reach RADIUS API" };
    }
  },

  async createUser(config, code, durationMinutes) {
    try {
      const baseUrl = getBaseUrl(config);
      const body = {
        username: code,
        password: code,
        durationMinutes,
        secret: config.radiusSecret || "",
      };

      const res = await fetch(`${baseUrl}/api/radius/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[generic-radius] createUser HTTP ${res.status}: ${text}`);
        return null;
      }

      const data = await res.json().catch(() => ({}));
      return data?.id ? String(data.id) : code;
    } catch (err: any) {
      console.warn("[generic-radius] createUser error:", err?.message);
      return null;
    }
  },

  async removeUser(config, userId) {
    try {
      const baseUrl = getBaseUrl(config);
      await fetch(`${baseUrl}/api/radius/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      console.warn("[generic-radius] removeUser error:", err?.message);
    }
  },

  async removeUserByName(config, name) {

    try {
      const baseUrl = getBaseUrl(config);
      await fetch(`${baseUrl}/api/radius/users/${encodeURIComponent(name)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      console.warn("[generic-radius] removeUserByName error:", err?.message);
    }
  },
};
