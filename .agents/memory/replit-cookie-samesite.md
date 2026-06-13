---
name: Replit iframe cookie SameSite fix
description: Auth and CSRF cookies must use SameSite=None;Secure in the Replit dev environment due to cross-site iframe context; and fetchMe must clear localStorage cache on 401 to prevent phantom redirect loops.
---

## The Rule

When running inside Replit, auth and CSRF cookies must use `SameSite=None; Secure`. Detect Replit with `process.env.REPL_ID || process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN`.

Also: `fetchMe` must call `saveCachedAuthUser(null)` on any 401 response.

## Why

The Replit preview embeds the app (`*.replit.dev`) in an iframe on `replit.com`. These are different eTLD+1 domains (`replit.dev` vs `replit.com`), making it a **cross-site iframe**. Browsers enforce that `SameSite=Lax` cookies are NOT sent in cross-site XHR/fetch requests from within an iframe. Result: every API call after login goes out without the auth cookie → 401 → the axios 401 interceptor fires `window.location.replace("/login")` → login loop.

Secondary issue: `useAuth` uses `placeholderData: loadCachedAuthUser()` from localStorage. If a stale cached user exists, `isAuthenticated` is immediately `true` (placeholder), the login page redirects to `/`, then `fetchMe` returns null (no cookie), and ProtectedRouter kicks back to `/login` → phantom redirect loop. Fixed by clearing localStorage in `fetchMe` on 401.

## How to Apply

- `server/auth.ts`: `AUTH_COOKIE_OPTIONS` sets `sameSite: "none"` and `secure: true` when `_isReplitEnv` is truthy.
- `server/csrf.ts`: CSRF cookie uses same `SameSite=None; Secure` pattern — otherwise every POST is rejected 403 because the CSRF cookie can't be read.
- `server/admin-routes.ts`: Any hardcoded `res.cookie(AUTH_COOKIE, ...)` must spread `AUTH_COOKIE_OPTIONS` — do not hardcode `sameSite: "lax"`.
- `client/src/hooks/use-auth.ts` `fetchMe`: Call `saveCachedAuthUser(null)` on 401 before returning null.
- SameSite=None is safe for CSRF double-submit: a cross-origin attacker still cannot READ the cookie value from JS (browser origin policy), so they cannot craft a matching X-CSRF-Token header.
