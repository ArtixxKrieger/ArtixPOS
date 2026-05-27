---
name: Staff PIN clock-in system
description: Design decisions for the PIN-based clock-in system, kiosk integration, and session security
---

# Staff PIN Clock-in System

## Key design decisions

- `getJwtSecret()` in `server/auth.ts` was private — exported it to allow `server/routes/staff-pin.ts` to sign tokens with the same secret. Using a different hardcoded string would break JWT verification.

- `timeLogs` table has no `tenantId` column — only `userId`, `branchId`. Do NOT add tenantId to insert values.

- Owners and managers are excluded from PIN login by design — they use full email/OAuth login. Only cashiers and admins get PINs.

- Sessions are 8h (one shift) — issued as httpOnly cookie with `pinSession: true` flag in JWT payload so the frontend can distinguish PIN sessions from full owner sessions.

- PIN lock: after 5 wrong attempts, `pinLockedUntil` is set on the `users` row. Tracked in-memory per-userId (Map) and persisted to DB.

- `schema.ts` additions: `staffPin text` (scrypt-hashed) and `pinLockedUntil text` (ISO timestamp) on the `users` table — both nullable.

## PinSessionApp route guard

In `ProtectedRouter` (App.tsx), if `user.pinSession === true`, render `<PinSessionApp />` instead of `<AppRouter />`. This locks staff to POS-only — no sidebar, no navigation, no access to other routes. Any location other than `/pos` is redirected to `/pos` via `useEffect`.

**Why:** Cashier PIN sessions must not access settings, analytics, products, etc.

## Sign-out behavior

- **PIN session:** "Clock Out" button in PinSessionApp calls `POST /api/staff-pin/clockout` (auto-closes time log + revokes JWT), clears query cache, then calls `lock()` from useKioskMode → returns to staff roster lock screen. Does NOT navigate to `/login`.
- **Owner/full session:** regular logout → `/login`.

## Kiosk manager PIN (DB-backed)

- Stored as scrypt hash in `userSettings.kioskPin` (column added to schema).
- Set via `POST /api/kiosk/set-pin` (owner-only).
- Verified server-side via `POST /api/kiosk/verify-pin` — falls back to `"1234"` if no custom PIN set.
- `ManagerPinInput` in kiosk-overlay calls the server to verify; on success calls `forceUnlock()` or `forceDisableKiosk()` (no localStorage PIN check).

**Why:** Per-tenant PIN consistent across all devices, not the same default `1234` for everyone.

## useKioskMode exports added

- `forceUnlock()` — unlock without PIN check (after successful staff PIN auth)
- `forceDisableKiosk()` — disable kiosk mode without PIN check (after server-verified manager PIN)

## Auto clock-out job

`setInterval` in `staff-pin.ts` runs every 15 min. Closes time logs where `clockIn < NOW() - 8h` AND `clockOut IS NULL`. Handles expired JWT sessions where clockout was never called explicitly.

## Session duration

Owner `rememberMe=true` → 90-day JWT + cookie (changed from 30d).

## Routes

- `GET  /api/staff-pin/roster?branchId=N` — requires owner/manager auth; returns name+hasPin+isLocked
- `POST /api/staff-pin/login`             — brute-force guarded; auto clocks in via timeLogs
- `POST /api/staff-pin/clockout`          — requireAuth; revokes JWT + closes time log + clears cookie
- `POST /api/staff-pin/set`              — requireManagerOrAbove; hashes PIN and stores
- `DELETE /api/staff-pin/:userId`         — requireManagerOrAbove; nulls staffPin
- `POST /api/staff-pin/unlock/:userId`    — requireManagerOrAbove; nulls pinLockedUntil
- `POST /api/kiosk/set-pin`              — owner-only; hashes and stores kiosk PIN in userSettings
- `POST /api/kiosk/verify-pin`           — requireAuth; verifies against stored hash or fallback "1234"
