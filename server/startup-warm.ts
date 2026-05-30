// ── Startup Cache Warmer ───────────────────────────────────────────────────────
// After the server initialises, pre-populate L1 cache for every onboarded user.
// This eliminates the "cold start thundering herd" where the first real request
// after a deploy hits empty cache and N concurrent callers all query the DB
// simultaneously.
//
// Design decisions:
//   • Runs fire-and-forget after init — never blocks server startup.
//   • Caps at 100 users to keep warm time under 2s even on busy instances.
//   • Uses Promise.allSettled so one user's bad data never aborts the rest.
//   • Non-fatal: if the DB is unavailable at warm time, the server still starts.

import { db } from "./db";
import { users } from "@shared/schema";
import { isNotNull } from "drizzle-orm";
import { cache, TTL, productsCacheKey, settingsCacheKey, customersCacheKey } from "./cache";
import { storage } from "./storage";

const WARM_LIMIT = 100; // max tenants warmed per boot

export async function warmCache(): Promise<void> {
  const t0 = Date.now();
  try {
    // Find all users that have completed onboarding (have a tenantId).
    const active = await db
      .select({ id: users.id })
      .from(users)
      .where(isNotNull(users.tenantId))
      .limit(WARM_LIMIT);

    if (active.length === 0) {
      console.log("[cache-warm] No onboarded users found — skipping warm");
      return;
    }

    console.log(`[cache-warm] Warming ${active.length} user(s) in background…`);

    await Promise.allSettled(
      active.map(async ({ id: uid }) => {
        try {
          // Run products + settings + customers fetches in parallel per user.
          const [products, settings, customers] = await Promise.allSettled([
            storage.getProducts(uid),
            storage.getSettings(uid),
            storage.getCustomers(uid),
          ]);

          if (products.status === "fulfilled")
            await cache.setAsync(productsCacheKey(uid), products.value, TTL.PRODUCTS);

          if (settings.status === "fulfilled" && settings.value)
            await cache.setAsync(settingsCacheKey(uid), settings.value, TTL.SETTINGS);

          if (customers.status === "fulfilled")
            await cache.setAsync(customersCacheKey(uid), customers.value, 60_000);
        } catch {
          // Per-user errors are silently swallowed — don't abort other users.
        }
      })
    );

    const elapsed = Date.now() - t0;
    console.log(
      `[cache-warm] Done in ${elapsed}ms — ${cache.size()} entries in L1 cache`
    );
  } catch (err) {
    // Warm failure is non-fatal — the app works fine with a cold cache.
    console.warn("[cache-warm] Warm failed (non-fatal):", (err as Error).message);
  }
}
