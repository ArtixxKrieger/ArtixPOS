---
name: DB encapsulation — route layer
description: Pitfalls and decisions from removing all direct db imports from route files; persistence layer is now sole Drizzle consumer.
---

## Rule
Route files must never import `db` from `../db`. All DB access goes through `server/infrastructure/persistence/*` or `storage.*`. Only `dbSystem` (admin operations) is still permitted in `settings.ts`.

**Why:** Keeps query logic testable in isolation and prevents ad-hoc queries creeping back into handlers.

**How to apply:** When adding a new route that needs DB data not yet in the persistence layer, add a function to the relevant persistence file rather than importing `db` in the route.

## Timestamp column types
Drizzle returns `timestamp` columns as `string | null`, not `Date | null`, in this project's pg driver setup. Return type declarations in persistence functions must use `string | null` for openedAt/closedAt/createdAt, and route comparisons (`>=`, `<=`) work correctly on ISO strings.

## BIR persistence return types
`getBirHashVerifyRows`, `getBirRefundTrailRows`, `getBirVoidTrailRows`, `getBirVoidTrailExportRows` all return `Record<string, unknown>[]` (raw Drizzle execute rows). Route handlers must cast each row `as Record<string, any>` before property access.

## Security fixes applied during audit
- **getExpenseById IDOR**: added `userId` parameter so the query scopes to the tenant; previously a caller could read any expense's description/amount. Update both the persistence signature and IStorage interface together.
- **Timestamp comparison**: shift-lock checks (`saleTimestamp >= s.openedAt`) must use `new Date(x).getTime()` for numeric comparison — ISO string lexicographic comparison can silently fail if precision differs (e.g. `Z` vs milliseconds).
- **requirePro gate**: `/api/inventory` (summary endpoint) was missing `requirePro`; all sibling inventory routes have it.

## Common pitfall: "dead" import audit
Before removing a `db` import as "unused", grep for `db.` calls in the entire file — the import declaration line can appear unused while actual query calls exist deeper in the file. This burned sales.ts, refunds.ts, and shifts.ts in one session (imports removed, `db.` calls left behind → runtime ReferenceError).

## Persistence files added/extended
- `persistence/bir.ts` — all BIR SQL queries
- `persistence/staff-pin-queries.ts` — full PIN auth + time-clock queries  
- `persistence/push.ts` — upsert/delete push subscriptions
- `persistence/sales.ts` — added `getSaleTimestamp`, `getClosedShiftsForUser` (shift-lock check shared by sales and refunds routes)
- `persistence/shifts.ts` — added `getShiftById`, `getClosedShiftsForUser`
- `persistence/inventory.ts` — added `getInventorySummary`, `getIngredientReorderSuggestions`
- `persistence/settings.ts` — added `fetchUserById`, `atomicClaimTenant`, `deleteOrphanedTenant`
- `persistence/expenses.ts` — added `getExpenseById`
- `persistence/appointments.ts` — added `checkAppointmentConflict`
- `persistence/sales.ts` — added `getDashboardAggregates`
- `persistence/products.ts` — added `getLowStockProductIdsByUser`
- `persistence/orders.ts` — added `getPendingOrderCount`
