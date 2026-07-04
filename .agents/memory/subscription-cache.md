---
name: Subscription cache
description: 30s in-process TTL cache for getSubscription(); invalidation wired to all write paths; per-process only (multi-worker caveat).
---

## Rule
`getSubscription(tenantId)` in `server/middleware.ts` is cached in-process (`_subCache` Map) with a 30-second TTL. Every path that writes to `tenantSubscriptions` must call `invalidateSubscriptionCache(tenantId)` immediately after the DB write.

**Why:** Each schedule page load hit `requirePro` twice (two parallel requests) with no caching — two uncached DB round-trips per page view. Cache reduces this to zero on cache hits.

## Covered write paths (as of implementation)
All in `server/subscription-routes.ts`:
- `GET /api/subscription` — auto-create free sub + expiry downgrade
- `POST /api/subscription/verify` — payment confirmation
- `POST /api/subscription/cancel`
- `POST /api/subscription/reactivate`
- `activateProForTenant()` — PayMongo voucher/webhook
- `activateRevenueCatPro()` — RevenueCat webhook
- `revokeRevenueCatPro()` — RevenueCat webhook

## Multi-worker caveat
`invalidateSubscriptionCache()` only clears the calling process's Map. In clustered/scaled deployments, other workers can serve stale data for up to 30s after a write. On Vercel serverless, each warm function instance is isolated anyway, so cross-instance staleness is bounded by TTL. Future improvement: migrate cache to Redis (already a project dependency via Upstash).

**How to apply:** Any new route that writes to `tenantSubscriptions` must import and call `invalidateSubscriptionCache(tenantId)` after the DB write. Check this file when adding subscription management features.
