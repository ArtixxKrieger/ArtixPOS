/**
 * Periodic maintenance tasks that prevent unbounded table growth.
 *
 * revoked_tokens  — checked on EVERY authenticated request via jwtAuthMiddleware.
 *                   Without cleanup the table grows forever and the index scan
 *                   becomes O(N) for the expiry-based pruning query.
 *
 * notifications   — read notifications older than 90 days serve no purpose and
 *                   bloat the table for no benefit.
 */
import { pool } from "./db";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

async function pruneExpiredTokens(): Promise<void> {
  try {
    const result = await pool.query(
      "DELETE FROM revoked_tokens WHERE expires_at < $1",
      [new Date().toISOString()],
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[cleanup] Pruned ${result.rowCount} expired revoked tokens`);
    }
  } catch (err: unknown) {
    console.warn("[cleanup] revoked_tokens prune failed:", (err as Error)?.message ?? String(err));
  }
}

async function pruneOldNotifications(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  try {
    const result = await pool.query(
      "DELETE FROM notifications WHERE created_at < $1 AND read_at IS NOT NULL",
      [cutoff.toISOString()],
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[cleanup] Pruned ${result.rowCount} old read notifications`);
    }
  } catch (err: unknown) {
    console.warn("[cleanup] notifications prune failed:", (err as Error)?.message ?? String(err));
  }
}

export function startCleanupScheduler(): void {
  // Run once at startup to immediately clear any stale rows
  pruneExpiredTokens().catch(() => {});
  pruneOldNotifications().catch(() => {});

  const timer = setInterval(() => {
    pruneExpiredTokens().catch(() => {});
    pruneOldNotifications().catch(() => {});
  }, CLEANUP_INTERVAL_MS);

  // Don't hold the event loop open — the server manages its own lifecycle
  timer.unref();

  console.log("[cleanup] Scheduler started — expired tokens + old notifications pruned every 1h");
}
