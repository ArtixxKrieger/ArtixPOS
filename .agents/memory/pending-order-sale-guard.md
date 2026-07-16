---
name: Pending order → sale guard (saleId)
description: How the active-orders completion guard decides whether to create a new sale or just delete the pending order.
---

## The rule
The guard in `handleComplete` (pending-orders.tsx) must use `(order as any).saleId != null`
to decide if the server already auto-created a sale — **not** the client-side `isFoodBeverage` flag.

## Why
`isFoodBeverage` is derived from `settings`, which loads asynchronously. If settings
hadn't loaded yet when the POS checkout ran, `isFoodBeverage` could be `false` even for
a food/bev business, causing `deferSale: false` to be sent to the server. The server would
then auto-create a sale. Later, when the user opens active orders with settings loaded,
`isFoodBeverage` would be `true`, the guard wouldn't fire, and `createSale.mutate` would
create a second sale → doubled revenue.

## How to apply
- Server (`server/routes/pending-orders.ts`): after creating the auto-sale for a paid
  non-deferred order, call `storage.updatePendingOrder(order.id, uid, { saleId: sale.id })`
  (fire-and-forget, .catch logged).
- Client (`client/src/pages/pending-orders.tsx`): `const autoSaleExists = (order as any).saleId != null`
  → if true, just deleteOrder and return; if false, proceed with `createSale.mutate`.
- DB: `pending_orders` table has a nullable `sale_id INTEGER` column (added via
  `ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS sale_id INTEGER`).
- Schema: `saleId: integer("sale_id")` in `pendingOrders` pgTable in `shared/schema.ts`.

## Edge cases
- Orders created before this fix exist with `saleId = null` — these are old non-food/bev
  paid orders whose auto-sale is already in the DB. For these legacy orders, completing
  from active orders would call `createSale.mutate` and create a duplicate. This is a
  one-time migration concern for existing pending orders only; new orders are clean.
- Unpaid orders that get paid via `handleUpdatePayment` retain `saleId = null` → 
  `handleComplete` correctly calls `createSale.mutate` for them (fixes a secondary
  missing-sale bug where the guard previously fired and deleted without recording a sale).
