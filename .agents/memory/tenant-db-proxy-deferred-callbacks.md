---
name: Ambient tenant db proxy is unsafe in deferred/fire-and-forget callbacks
description: Read before using setImmediate/setTimeout/queueMicrotask (or any deferred async work) that queries the DB after a request handler returns — covers why the ambient `db` proxy can silently run on a released/reused pooled connection.
---

`server/db.ts` exports `db` as an `AsyncLocalStorage`-backed proxy: inside a request, it resolves to the single Postgres connection leased for that request (with `SET LOCAL ROLE` + tenant context set). `server/tenant-context.ts` commits and releases that connection back to the pool as soon as the HTTP response finishes (`res.on("finish"/"close")`).

**Why this matters:** Any code that defers work past the response (`setImmediate`, detached promises, background dispatch of push notifications, etc.) but still calls the ambient `db` proxy is racing the response lifecycle. If the deferred callback runs after `res.on("finish")` has already committed+released the connection, it queries on a `PoolClient` object that may already have been handed to a *different concurrent request* — risking cross-request query interleaving, not just a "released client" error.

**How to apply:**
- Any helper that is (or might be) called from a deferred/background context — even one also used inside normal request-scoped code — should query via `dbSystem` (the pool-backed `drizzle(pool, ...)` instance, also exported from `server/db.ts`), not the ambient `db` proxy. `dbSystem` opens a fresh connection per query, so it has no lifetime coupling to any request's transaction.
- `dbSystem` bypasses RLS (runs as the pool's default/owner role), so any query routed through it must have an explicit `WHERE tenantId = ...` / `WHERE userId = ...` filter done in application code — don't rely on RLS for isolation once you're off the ambient proxy.
- This bit `getTenantUserIds` (`server/infrastructure/persistence/base.ts`) and `server/push.ts`'s `sendPushToUsers`/`sendPushToTenant`/`filterByPreference`, which are called both synchronously in request handlers and from a `setImmediate` in `products.ts`'s low-stock-alert dispatch — fixed by switching all of them to `dbSystem`.
