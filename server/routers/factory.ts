/**
 * RouterFactory — returns the correct RouterAdapter for a given vendor type.
 *
 * Each adapter is lazily imported so we never load vendor code for routers
 * the tenant isn't using. This keeps cold starts fast.
 */
import type { RouterAdapter, RouterConfig, RouterVendorType } from "./types";
import { defaultRouterConfig } from "./types";

const VENDOR_ADAPTERS: Record<RouterVendorType, () => Promise<RouterAdapter>> = {
  mikrotik: () => import("./mikrotik").then((m) => m.mikrotikAdapter),
  omada: () => import("./omada").then((m) => m.omadaAdapter),
  unifi: () => import("./unifi").then((m) => m.unifiAdapter),
  generic: () => import("./generic-radius").then((m) => m.genericRadiusAdapter),
  tplink: () => Promise.resolve(todoAdapter("TP-Link")),
  cisco: () => Promise.resolve(todoAdapter("Cisco")),
  openwrt: () => Promise.resolve(todoAdapter("OpenWrt")),
};

// ── Placeholder for adapters not yet implemented ──────────────────────────
function todoAdapter(name: string): RouterAdapter {
  return {
    testConnection: async () => ({ ok: false, message: `${name} adapter coming soon` }),
    createUser: async () => null,
    removeUser: async () => {},
    removeUserByName: async () => {},
  };
}

// ── Public API ────────────────────────────────────────────────────────────

const _cache = new Map<RouterVendorType, RouterAdapter>();

/**
 * Get (or lazy-load and cache) the adapter for a given vendor type.
 * The adapter is loaded once per process lifetime.
 */
export async function getAdapter(type: RouterVendorType): Promise<RouterAdapter> {
  const cached = _cache.get(type);
  if (cached) return cached;

  const loader = VENDOR_ADAPTERS[type];
  if (!loader) throw new Error(`Unknown router vendor type: ${type}`);

  const adapter = await loader();
  _cache.set(type, adapter);
  return adapter;
}

/**
 * Parse router_config JSONB from the database into a typed RouterConfig,
 * filling in defaults for the declared vendor type.
 */
export function parseRouterConfig(raw: any): RouterConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type as RouterVendorType | undefined;
  if (!type) return null;

  const defaults = defaultRouterConfig(type);
  return {
    ...defaults,
    ...raw,
    port: raw.port ?? defaults.port,
    username: raw.username ?? defaults.username,
    useSsl: raw.useSsl ?? defaults.useSsl,
    type,
  };
}
