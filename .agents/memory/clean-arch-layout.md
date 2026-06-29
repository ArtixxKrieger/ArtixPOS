---
name: Clean Architecture layout
description: How the server storage layer is now structured and the key gotchas that apply when extending it.
---

## Directory structure

```
server/
  domain/repositories/        # Pure TS interfaces — no Drizzle, no DB imports
  application/use-cases/      # One file per use case, depends only on domain interfaces
  infrastructure/persistence/ # Drizzle ORM implementations (all *.ts files live here)
  storage/
    index.ts                  # Thin shim — re-exports everything from infrastructure
    base.ts                   # Re-exports from infrastructure/persistence/base (avoid dual-cache)
```

All Express routes still `import { storage } from "../storage"` — unchanged.

## Import path rules inside infrastructure/persistence/

When a file was moved from `server/storage/` → `server/infrastructure/persistence/`, every `../` prefix needs an extra level:
- `../db`  →  `../../db`
- `../db-read`  →  `../../db-read`
- `../tenant-context`  →  `../../tenant-context`
- Cross-file imports within the same persistence directory stay as `./`

**Why:** Node resolution is relative to the file, not the project root. The sed script that batch-copied files only fixed `../db` and `../db-read`; any other `../` import (e.g. `../tenant-context`) must be manually updated or it will throw ERR_MODULE_NOT_FOUND at startup.

**How to apply:** After adding any new persistence file, grep for `from "\.\./` inside `server/infrastructure/persistence/` and confirm every hit resolves two directories up (to `server/`), not one.

## Bugs fixed during migration (round 1)

| File | Bug | Fix |
|---|---|---|
| timeclock.ts | Cross-midnight shift — `getHours()*60+getMinutes()` ignores date | `buildScheduledDatetime()` builds full ISO timestamp; adds 24 h when end ≤ start |
| inventory.ts | Stock transfer logs hard-coded `previousStock:0/newStock:0` | Real SELECT before each UPDATE, then insert log with actual values |
| inventory.ts | `setRecipeForProduct` deleted all rows before validating filtered list → silent wipe | Guard: if items provided but none pass tenant check, throw instead of wipe |
| products.ts | `deductProductStockForSale` had no transaction wrapper | Wrapped in `db.transaction()` |
| customers.ts | `redeemLoyaltyReward` not in a transaction | Wrapped all 3 mutations in `db.transaction()` |
| inventory.ts | `adjustIngredientStock` allowed negative stock | `GREATEST(0, stock + delta)` in SQL |
| orders.ts | Hardcoded `.limit(300)` | `opts?: { limit?, offset? }` added with sensible default |

## Bugs fixed during audit (round 2 — previously-unmodified modules)

| File | Bug | Fix |
|---|---|---|
| payroll.ts | `deletePayrollPeriod` updated entries' `notes` field instead of deleting — orphaned entries forever | `tx.delete(payrollEntries)` + soft-delete period in one transaction |
| payroll.ts | `createPayrollPeriod` loaded ALL timeLogs then filtered by date in JS — full table scan | SQL `gte`/`lte` filter pushed to DB query |
| suppliers.ts | `receivePurchaseOrder` incremented stock but wrote no stock log entries — silent audit gap | SELECT stock before update; insert stockLogs inside same transaction |
| memberships.ts | `checkInMember` never enforced plan's `maxCheckIns` limit — unlimited check-ins possible | Fetch plan, compare `checkInsUsed >= maxCheckIns`, throw if exceeded |
| memberships.ts | `getCheckIns` scoped by raw `userId` not tenant IDs — staff always got empty results | Added `getTenantUserIds` check, verify membership ownership before returning rows |
