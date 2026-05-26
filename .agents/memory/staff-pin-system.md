---
name: Staff PIN clock-in system
description: Design decisions for the PIN-based clock-in system (no staff accounts, just PINs)
---

# Staff PIN Clock-in System

## Key design decisions

- `getJwtSecret()` in `server/auth.ts` was private — exported it to allow `server/routes/staff-pin.ts` to sign tokens with the same secret (including the ephemeral dev secret). Using a different hardcoded string would break JWT verification.

- `timeLogs` table has no `tenantId` column — only `userId`, `branchId`. Do NOT add tenantId to insert values.

- Owners and managers are excluded from PIN login by design — they use full email/OAuth login. Only cashiers and admins get PINs.

- Sessions are 8 h (one shift) — issued as httpOnly cookie with `pinSession: true` flag in the JWT payload so the frontend can distinguish PIN sessions from full owner sessions.

- PIN lock: after 5 wrong attempts, `pinLockedUntil` is set on the `users` row. Tracked in-memory per-userId (Map) and persisted to DB.

- `schema.ts` additions: `staffPin text` (scrypt-hashed) and `pinLockedUntil text` (ISO timestamp) on the `users` table — both nullable.

## Routes

- `GET  /api/staff-pin/roster?branchId=N` — requires owner/manager auth on device; returns name+hasPin+isLocked per staff member
- `POST /api/staff-pin/login`            — public (brute-force guarded); auto clocks in via timeLogs insert
- `POST /api/staff-pin/clockout`         — requireAuth; revokes JWT via revokedTokens table + clears cookie
- `POST /api/staff-pin/set`              — requireManagerOrAbove; hashes PIN and stores
- `DELETE /api/staff-pin/:userId`        — requireManagerOrAbove; nulls staffPin
- `POST /api/staff-pin/unlock/:userId`   — requireManagerOrAbove; nulls pinLockedUntil

## Frontend

- `/staff-clock-in` route in App.tsx — rendered inside ProtectedRouter (owner must be logged in on the device)
- Roster → PIN numpad → success toast → redirect to `/`
- PIN management button added to each staff card in `/admin/users` (owner-only, not for managers)
- "Staff Clock-in" button added to `/timeclock` page header for managers+

**Why:** Square/Clover model — shared device with owner account, staff clock in via PIN without personal accounts.
