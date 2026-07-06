import { dbSystem } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export const _tenantUserCache = new Map<string, { ids: string[]; at: number }>();
export const TENANT_CACHE_TTL = 5 * 60 * 1000;

export const SCHEDULE_GRACE_MINS = 5;

export function _timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function invalidateTenantCache(userId: string): void {
  _tenantUserCache.delete(userId);
}

// NOTE: Deliberately uses `dbSystem` (a pool-backed instance that opens its
// own connection per query) instead of the ambient request-scoped `db` proxy.
// This function is called both synchronously inside request handlers AND
// from deferred/fire-and-forget contexts (e.g. `setImmediate` callbacks used
// to dispatch push notifications after a response has already been sent).
// The request's tenant-scoped connection is committed and released back to
// the pool as soon as the HTTP response finishes, so using the ambient `db`
// proxy from a deferred callback risks running a query on a connection that
// has already been handed to a different concurrent request. The tenantId
// filter below keeps this safe without relying on RLS/connection lifetime.
export async function getTenantUserIds(userId: string): Promise<string[]> {
  const cached = _tenantUserCache.get(userId);
  if (cached && Date.now() - cached.at < TENANT_CACHE_TTL) return cached.ids;
  const [user] = await dbSystem.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
  let ids: string[] = [userId];
  if (user?.tenantId) {
    const tenantUsers = await dbSystem.select({ id: users.id }).from(users).where(eq(users.tenantId, user.tenantId));
    if (tenantUsers.length > 0) ids = tenantUsers.map(u => u.id);
  }
  _tenantUserCache.set(userId, { ids, at: Date.now() });
  return ids;
}
