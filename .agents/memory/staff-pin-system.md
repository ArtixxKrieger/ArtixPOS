---
name: Staff PIN clock-in system
description: Design decisions for the PIN-based clock-in system and session security (kiosk mode fully removed)
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

## Sign-out / Clock-out behavior

- **PIN session (cashier):** "Clock Out" button in PinSessionApp calls `POST /api/staff-pin/clockout` (auto-closes time log + revokes JWT), clears query cache, then redirects to `/staff-clock-in`. Does NOT navigate to `/login` and does NOT affect the owner's Gmail session.
- **Owner/full session:** logout button (visible only to owners) → `/login`.
- **Managers/cashiers in full app-layout:** NO sign out button shown. They use Clock Out from PinSessionApp or TimeClock page.
- **Settings page:** Sign Out button only shown to owners (`isOwner` check).

## Kiosk mode — FULLY REMOVED

The entire kiosk mode system has been removed:
- `client/src/components/kiosk/kiosk-overlay.tsx` — deleted
- `client/src/hooks/use-kiosk-mode.ts` — deleted
- All kiosk buttons removed from app-layout.tsx, bottom-nav.tsx, settings.tsx
- `userSettings.kioskPin` column removed from schema
- `POST /api/kiosk/set-pin` and `POST /api/kiosk/verify-pin` endpoints removed

Fullscreen toggle is now implemented inline in app-layout.tsx and bottom-nav.tsx using `document.fullscreenElement` + `fullscreenchange` event listener.

**Why removed:** Owner requested simpler flow — staff clock in via PIN, clock out goes directly to /staff-clock-in. No separate kiosk lock screen needed.

## Auto clock-out job

`setInterval` in `staff-pin.ts` runs every 15 min. Closes time logs where `clockIn < NOW() - 8h` AND `clockOut IS NULL`. Handles expired JWT sessions where clockout was never called explicitly.

## Session duration

Owner `rememberMe=true` → 90-day JWT + cookie.

## Routes

- `GET  /api/staff-pin/roster?branchId=N` — requires owner/manager auth; returns name+hasPin+isLocked
- `POST /api/staff-pin/login`             — brute-force guarded; auto clocks in via timeLogs
- `POST /api/staff-pin/clockout`          — requireAuth; revokes JWT + closes time log + clears cookie
- `POST /api/staff-pin/set`              — requireManagerOrAbove; hashes PIN and stores
- `DELETE /api/staff-pin/:userId`         — requireManagerOrAbove; nulls staffPin
- `POST /api/staff-pin/unlock/:userId`    — requireManagerOrAbove; nulls pinLockedUntil
