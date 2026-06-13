/**
 * Disposable / temporary email domain validator.
 *
 * Uses the `disposable-email-domains` community blocklist (~100 K domains)
 * loaded into a Set for O(1) lookups.  If the module somehow fails to load
 * (e.g. corrupted install) the check degrades gracefully and allows through.
 *
 * Bypass vectors defended against:
 *  • Uppercase domain  — normalized via .toLowerCase()
 *  • Trailing dot      — stripped before lookup
 *  • Subdomain bypass  — walks up the label hierarchy; blocks if any ancestor
 *                        domain is in the blocklist (e.g. abc.mailinator.com → blocked)
 */

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

/**
 * Returns true if the email's domain (or any ancestor domain) is in the
 * disposable-email blocklist.
 *
 * @example
 *   isDisposableEmail("user@mailinator.com")     // true
 *   isDisposableEmail("user@abc.mailinator.com") // true  (subdomain)
 *   isDisposableEmail("user@gmail.com")           // false
 */
export function isDisposableEmail(email: string): boolean {
  if (!blocklist.size) return false; // graceful degradation if blocklist failed

  const at = email.lastIndexOf("@");
  if (at === -1) return false;

  // Normalize: lowercase and strip trailing dots (e.g. "mailinator.com." → "mailinator.com")
  const domain = email.slice(at + 1).toLowerCase().replace(/\.+$/, "").trim();
  if (!domain) return false;

  // Walk up the label hierarchy so subdomain bypasses are caught.
  // "abc.mailinator.com" → checks "abc.mailinator.com", then "mailinator.com", then "com"
  // Stops at single-label segments (TLDs) to avoid false positives.
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (blocklist.has(candidate)) return true;
  }

  return false;
}
