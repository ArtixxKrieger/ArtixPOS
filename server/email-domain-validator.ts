

import { createRequire } from "module";

let blocklist: Set<string> = new Set();

try {
  const require = createRequire(import.meta.url);
  const domains: string[] = require("disposable-email-domains");
  blocklist = new Set(domains.map((d: string) => d.toLowerCase()));
  console.info(`[email-validator] Loaded ${blocklist.size.toLocaleString()} blocked disposable domains.`);
} catch (err) {
  console.error("[email-validator] Failed to load disposable-email-domains blocklist — check will be skipped:", err);
}

export function isDisposableEmail(email: string): boolean {
  if (!blocklist.size) return false;

  const at = email.lastIndexOf("@");
  if (at === -1) return false;

const domain = email.slice(at + 1).toLowerCase().replace(/\.+$/, "").trim();
  if (!domain) return false;

const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (blocklist.has(candidate)) return true;
  }

  return false;
}
