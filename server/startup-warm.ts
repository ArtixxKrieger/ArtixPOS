

import { db } from "./db";
import { users } from "@shared/schema";
import { isNotNull } from "drizzle-orm";
import { cache, TTL, productsCacheKey, settingsCacheKey, customersCacheKey } from "./cache";
import { storage } from "./storage";

const WARM_LIMIT = 100;

export async function warmCache(): Promise<void> {
  const t0 = Date.now();
  try {

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

        }
      })
    );

    const elapsed = Date.now() - t0;
    console.log(
      `[cache-warm] Done in ${elapsed}ms — ${cache.size()} entries in L1 cache`
    );
  } catch (err) {

    console.warn("[cache-warm] Warm failed (non-fatal):", (err as Error).message);
  }
}
