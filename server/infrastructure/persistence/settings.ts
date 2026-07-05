import { db, pool } from "../../db";
import { runAsAdmin } from "../../tenant-context";
import {
  userSettings,
  users,
  type UserSetting,
  type InsertUserSetting,
  type User,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export async function getSettings(userId: string): Promise<UserSetting | undefined> {
  try {
    const [setting] = await runAsAdmin(pool, (adminDb) =>
      adminDb.select().from(userSettings).where(eq(userSettings.userId, userId))
    );
    return setting;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return undefined;
  }
}

export async function updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting> {
  const doUpsert = async () => {
    const [result] = await runAsAdmin(pool, (adminDb) =>
      adminDb.insert(userSettings)
        .values({ userId, ...settings } as any)
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: settings as any,
        })
        .returning()
    );
    return result;
  };

  try {
    return await doUpsert();
  } catch (error: any) {
    if (error?.code === "25P02") {
      console.warn("[storage] updateSettings hit 25P02 — retrying after 50 ms");
      await new Promise(r => setTimeout(r, 50));
      return await doUpsert();
    }
    console.error("Error updating settings:", error);
    throw error;
  }
}

// ── Tenant claiming helpers ───────────────────────────────────────────────────

export async function fetchUserById(userId: string): Promise<User | null> {
  const [user] = await runAsAdmin(pool, adminDb =>
    adminDb.select().from(users).where(eq(users.id, userId)),
  );
  return user ?? null;
}

/**
 * Atomically claims a tenant for the user: sets tenant_id only if it's still NULL.
 * Returns `{ claimed: true }` when this process won the race, or
 * `{ claimed: false, fallbackTenantId }` when another process beat us.
 */
export async function atomicClaimTenant(
  userId: string,
  tenantId: string,
): Promise<{ claimed: true } | { claimed: false; fallbackTenantId: string | null }> {
  const result = await db.execute(
    sql`UPDATE users SET tenant_id = ${tenantId} WHERE id = ${userId} AND tenant_id IS NULL`,
  );
  const claimed = (result as any).rowCount === 1 || (result as any).rowsAffected === 1;
  if (claimed) return { claimed: true };

  const [refreshed] = await runAsAdmin(pool, adminDb =>
    adminDb.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId)),
  );
  return { claimed: false, fallbackTenantId: refreshed?.tenantId ?? null };
}

export async function deleteOrphanedTenant(tenantId: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  } catch {
    // Best-effort cleanup — ignore errors
  }
}
