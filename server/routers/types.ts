

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
  label: string;
  description: string;
  icon: string;
  defaultPort: number;
  defaultUsername: string;
  defaultUseSsl: boolean;

extraFields?: {
    key: string;
    label: string;
    placeholder: string;
    defaultValue: string;
  }[];

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

export interface RouterConfig {
  type: RouterVendorType;
  enabled: boolean;
  host: string;
  port: string | number;
  username: string;
  password: string;
  useSsl: boolean;

  [key: string]: any;
}

export interface RouterAdapter {

  testConnection(config: RouterConfig): Promise<{ ok: boolean; message: string; version?: string }>;

createUser(config: RouterConfig, code: string, durationMinutes: number): Promise<string | null>;

removeUser(config: RouterConfig, userId: string): Promise<void>;

removeUserByName(config: RouterConfig, name: string): Promise<void>;
}

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
