/**
 * Shared cache-key helpers.
 *
 * Rules:
 *  - React Query query keys use the bare API path (e.g. "/api/dashboard/stats")
 *    so that invalidateQueries() works correctly everywhere.
 *  - IndexedDB (offline) cache keys embed the calendar date for any query whose
 *    results are date-scoped.  This ensures that when the clock rolls past
 *    midnight the old entry is a cache-miss and fresh data is fetched instead
 *    of serving yesterday's data to the user.
 */

export const STATS_QUERY_KEY = "/api/dashboard/stats";

/**
 * IDB key for today's dashboard stats.
 * Changes every calendar day, so yesterday's cached entry is never returned.
 */
export function statsDayIdbKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${STATS_QUERY_KEY}:${yyyy}-${mm}-${dd}`;
}
