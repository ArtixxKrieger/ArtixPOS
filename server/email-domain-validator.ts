/**
 * Disposable / temporary email domain validator.
 *
 * Uses the `disposable-email-domains` community blocklist (~100 K domains)
 * loaded into a Set for O(1) lookups.  If the module somehow fails to load
 * (e.g. corrupted install) the check degrades gracefully and allows through.
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
 * Returns true if the email's domain is in the disposable-email blocklist.
 *
 * @example
 *   isDisposableEmail("user@mailinator.com") // true
 *   isDisposableEmail("user@gmail.com")       // false
 */
export function isDisposableEmail(email: string): boolean {
  if (!blocklist.size) return false; // graceful degradation if blocklist failed
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return blocklist.has(domain);
}
