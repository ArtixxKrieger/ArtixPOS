import { dbSystem } from "../../db";
import { users } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const _tenantUserCache = new Map<string, { ids: string[]; at: number }>();
export const TENANT_CACHE_TTL = 5 * 60 * 1000;

export const SCHEDULE_GRACE_MINS = 5;

export function _timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function invalidateTenantCache(userId: string): void {
  _tenantUserCache.delete(userId);
  _inflightTenantLookups.delete(userId);
}

// In-flight deduplication: if two requests arrive simultaneously for the same
// userId before the cache is populated, reuse the same Promise instead of
// firing duplicate DB queries.
const _inflightTenantLookups = new Map<string, Promise<string[]>>();

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

  // Return the in-flight promise if one already exists for this userId so
  // concurrent requests (e.g. /employees + /schedules landing at the same
  // time) share a single DB round-trip instead of both querying.
  const inflight = _inflightTenantLookups.get(userId);
  if (inflight) return inflight;

  const promise = (async (): Promise<string[]> => {
    try {
      // Single self-join query replaces the previous two sequential queries:
      //   1. SELECT tenantId FROM users WHERE id = $userId
      //   2. SELECT id FROM users WHERE tenantId = $tenantId
      // A LEFT JOIN with the anchor row handles the null-tenantId fallback.
      const anchor = alias(users, "anchor");
      const rows = await dbSystem
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          anchor,
          and(
            eq(anchor.id, userId),
            isNotNull(anchor.tenantId),
            eq(users.tenantId, anchor.tenantId),
          ),
        );
      const ids = rows.length > 0 ? rows.map((r) => r.id) : [userId];
      _tenantUserCache.set(userId, { ids, at: Date.now() });
      return ids;
    } finally {
      _inflightTenantLookups.delete(userId);
    }
  })();

  _inflightTenantLookups.set(userId, promise);
  return promise;
}
