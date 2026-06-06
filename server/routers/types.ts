/**
 * RouterAdapter — interface every vendor adapter must implement.
 *
 * Adding a new vendor:
 *   1. Create server/routers/<vendor>.ts that exports an object satisfying RouterAdapter.
 *   2. Add the vendor to the VENDOR_ADAPTERS map in factory.ts.
 *   3. Add a ROUTER_VENDORS entry with UI metadata.
 *
 * No database changes needed — router_config JSONB stores whatever fields
 * each vendor needs. The factory.ts createRouterConfig/parseRouterConfig
 * helpers keep the JSONB payloads clean.
 */

// ── Router Vendor UI Metadata ───────────────────────────────────────────────

export type RouterVendorType =
  | "mikrotik"
  | "omada"
  | "unifi"
  | "tplink"
  | "cisco"
  | "openwrt"
  | "generic";

export interface RouterVendorInfo {
  type: RouterVendorType;
  label: string; // Display name in the UI
  description: string; // One-line description for the setup wizard
  icon: string; // Lucide icon name (used by dynamic icon rendering)
  defaultPort: number;
  defaultUsername: string;
  defaultUseSsl: boolean;
  // Extra fields the UI should show beyond host/port/user/password.
  // If undefined, only the 4 standard fields are shown.
  extraFields?: {
    key: string;
    label: string;
    placeholder: string;
    defaultValue: string;
  }[];
  // Maximum voucher duration this router supports (minutes).
  // null = unlimited. Some SMB routers crash with >24h sessions.
  maxDurationMinutes: number | null;
}

export const ROUTER_VENDORS: RouterVendorInfo[] = [
  {
    type: "mikrotik",
    label: "MikroTik",
    description: "RouterOS REST API — hotspot user management",
    icon: "Router",
    defaultPort: 80,
    defaultUsername: "admin",
    defaultUseSsl: false,
    extraFields: [
      {
        key: "hotspotProfile",
        label: "Hotspot Profile",
        placeholder: "default",
        defaultValue: "default",
      },
    ],
    maxDurationMinutes: null,
  },
  {
    type: "omada",
    label: "TP-Link Omada",
    description: "Omada SDN Controller API",
    icon: "Server",
    defaultPort: 8043,
    defaultUsername: "admin",
    defaultUseSsl: true,
    extraFields: [
      { key: "siteId", label: "Site ID", placeholder: "Default", defaultValue: "Default" },
    ],
    maxDurationMinutes: null,
  },
  {
    type: "unifi",
    label: "Ubiquiti UniFi",
    description: "UniFi Controller / Dream Machine",
    icon: "Server",
    defaultPort: 8443,
    defaultUsername: "admin",
    defaultUseSsl: true,
    extraFields: [
      { key: "siteId", label: "Site", placeholder: "default", defaultValue: "default" },
    ],
    maxDurationMinutes: null,
  },
  {
    type: "tplink",
    label: "TP-Link Standalone",
    description: "TP-Link router web admin (no controller needed)",
    icon: "Server",
    defaultPort: 80,
    defaultUsername: "admin",
    defaultUseSsl: false,
    maxDurationMinutes: 1440,
  },
  {
    type: "cisco",
    label: "Cisco",
    description: "Cisco IOS XE / WLC (RESTCONF)",
    icon: "Server",
    defaultPort: 443,
    defaultUsername: "admin",
    defaultUseSsl: true,
    maxDurationMinutes: null,
  },
  {
    type: "openwrt",
    label: "OpenWrt",
    description: "OpenWrt / LEDE routers",
    icon: "Server",
    defaultPort: 80,
    defaultUsername: "root",
    defaultUseSsl: false,
    maxDurationMinutes: null,
  },
  {
    type: "generic",
    label: "Other (RADIUS)",
    description: "Any router with RADIUS support",
    icon: "Router",
    defaultPort: 1812,
    defaultUsername: "",
    defaultUseSsl: false,
    extraFields: [
      { key: "radiusSecret", label: "RADIUS Secret", placeholder: "", defaultValue: "" },
    ],
    maxDurationMinutes: null,
  },
];

// ── Router Config (stored as JSONB in user_settings.router_config) ──────────

export interface RouterConfig {
  type: RouterVendorType;
  enabled: boolean;
  host: string;
  port: string | number;
  username: string;
  password: string;
  useSsl: boolean;
  // Vendor-specific extras — flattened into the top-level JSONB
  [key: string]: any;
}

// ── Router Adapter Interface ────────────────────────────────────────────────

export interface RouterAdapter {
  /** Quick connectivity check. Returns { ok, message, version? }. */
  testConnection(config: RouterConfig): Promise<{ ok: boolean; message: string; version?: string }>;

  /** Create a time-limited user on the hotspot. Returns the router's internal user ID. */
  createUser(config: RouterConfig, code: string, durationMinutes: number): Promise<string | null>;

  /** Remove a user by router-internal ID. */
  removeUser(config: RouterConfig, userId: string): Promise<void>;

  /** Remove a user by name/code (for batch expiry). */
  removeUserByName(config: RouterConfig, name: string): Promise<void>;
}

// ── Default Config Builder ──────────────────────────────────────────────────

export function defaultRouterConfig(type: RouterVendorType): RouterConfig {
  const info = ROUTER_VENDORS.find((v) => v.type === type);
  return {
    type,
    enabled: false,
    host: "",
    port: info?.defaultPort ?? 80,
    username: info?.defaultUsername ?? "admin",
    password: "",
    useSsl: info?.defaultUseSsl ?? false,
  };
}
