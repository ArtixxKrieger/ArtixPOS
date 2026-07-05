---
name: Push notification scheduler design
description: How business-type-aware and dedup'd push alerts (overdue POs, expiring products, offline branches) are structured — read before adding new proactive push notification types.
---

Proactive (non-request-triggered) push notifications live in a single polling scheduler (`setInterval`, unref'd, started alongside the existing cleanup scheduler in server startup) rather than as ad-hoc checks scattered in route handlers.

**Why:** Per-event push notifications (e.g. on every new order/appointment) were too noisy and got explicitly removed. Proactive/periodic checks with dedup flags are the preferred pattern for "state changed and needs attention" alerts (overdue, expiring, offline) rather than firing on every write.

**How to apply:**
- Each alert type needs a `*AlertedAt` timestamp column on the relevant row (e.g. `overdueAlertedAt`, `expiryAlertedAt`, `offlineAlertedAt`) so the same condition doesn't re-notify every poll cycle. Clear the flag when the condition resolves (e.g. heartbeat received clears `offlineAlertedAt`).
- Business-type-conditional alerts (e.g. expiry tracking only matters for food/pharmacy/grocery, not salons/hotels) should gate through a shared helper (`isExpiryTrackingBusiness` in `shared/business-access.ts`) rather than inlining business-type checks in the scheduler.
- Branch "online" state is client-reported via a heartbeat endpoint (`POST /api/admin/branches/:id/heartbeat`) called periodically from `useAuth()` on the client — there is no server-side passive detection of branch connectivity.
