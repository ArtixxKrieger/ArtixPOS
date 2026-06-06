import type { RouterAdapter, RouterConfig } from "./types";

function getBaseUrl(config: RouterConfig): string {
  const protocol = config.useSsl ? "https" : "http";
  const port = config.port || 80;
  return `${protocol}://${config.host}:${port}/rest`;
}

function getHeaders(config: RouterConfig): HeadersInit {
  const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
  };
}

function minutesToUptime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

const hotspotProfile = (config: RouterConfig): string => config.hotspotProfile || "default";

export const mikrotikAdapter: RouterAdapter = {
  async testConnection(config) {
    try {
      const url = `${getBaseUrl(config)}/system/resource`;
      const res = await fetch(url, {
        headers: getHeaders(config),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, string>;
        const version = data["version"] || "";
        return { ok: true, message: `Connected — RouterOS ${version}`.trim(), version };
      }
      if (res.status === 401) return { ok: false, message: "Wrong username or password" };
      if (res.status === 403)
        return { ok: false, message: "Access denied — check router API permissions" };
      return { ok: false, message: `Router returned HTTP ${res.status}` };
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return { ok: false, message: "Timed out — verify the router IP and port" };
      }
      if (err?.code === "ECONNREFUSED") {
        return {
          ok: false,
          message: `Connection refused — is the REST API enabled on port ${config.port || 80}?`,
        };
      }
      return { ok: false, message: err?.message || "Cannot reach router" };
    }
  },

  async createUser(config, code, durationMinutes) {
    try {
      const url = `${getBaseUrl(config)}/ip/hotspot/user`;
      const body = {
        name: code,
        password: code,
        "limit-uptime": minutesToUptime(durationMinutes),
        profile: hotspotProfile(config),
        comment: "ArtixPOS",
      };
      const res = await fetch(url, {
        method: "PUT",
        headers: getHeaders(config),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[mikrotik] createUser HTTP ${res.status}: ${text}`);
        return null;
      }
      const data = (await res.json()) as Record<string, string>;
      return data[".id"] ?? data["id"] ?? null;
    } catch (err: any) {
      console.warn("[mikrotik] createUser error:", err?.message);
      return null;
    }
  },

  async removeUser(config, userId) {
    try {
      const url = `${getBaseUrl(config)}/ip/hotspot/user/${encodeURIComponent(userId)}`;
      await fetch(url, {
        method: "DELETE",
        headers: getHeaders(config),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      console.warn("[mikrotik] removeUser error:", err?.message);
    }
  },

  async removeUserByName(config, name) {
    try {
      const url = `${getBaseUrl(config)}/ip/hotspot/user?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        headers: getHeaders(config),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const list = (await res.json()) as Array<Record<string, string>>;
      if (!list.length) return;
      const id = list[0][".id"] ?? list[0]["id"];
      if (id) await mikrotikAdapter.removeUser(config, id);
    } catch (err: any) {
      console.warn("[mikrotik] removeUserByName error:", err?.message);
    }
  },
};
