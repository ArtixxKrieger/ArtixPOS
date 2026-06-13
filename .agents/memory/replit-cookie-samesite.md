---
name: Auth cookie SameSite fix
description: Auth and CSRF cookies must use SameSite=None;Secure=true unconditionally — do not use SameSite=Lax or environment-specific detection.
---

## The Rule

`AUTH_COOKIE_OPTIONS` in `server/auth.ts` uses `secure: true, sameSite: "none"` unconditionally.
CSRF cookie in `server/csrf.ts` does the same.
`fetchMe` in `client/src/hooks/use-auth.ts` calls `saveCachedAuthUser(null)` on any 401 response.

## Why

The app is always served over HTTPS (reverse proxy in dev, Vercel in prod), so `secure: true` is safe everywhere. `SameSite=None` is required for the cookie to be delivered in any embedded context (iframes, OAuth pop-ups, etc.). We have explicit CSRF token double-submit validation (`csrfProtection` middleware) so the CSRF protection that `SameSite=Lax` provides is redundant.

The phantom redirect loop: `useAuth` uses `placeholderData: loadCachedAuthUser()`. If a stale user is cached in localStorage, `isAuthenticated` is immediately `true` (placeholder), the login page redirects to `/`, then `fetchMe` returns null → ProtectedRouter kicks back to `/login` → loop. Fixed by clearing localStorage in `fetchMe` on 401.

## How to Apply

- Never add environment-specific (`NODE_ENV`, Replit env vars) branching to cookie SameSite/Secure settings — just use `SameSite=None; Secure: true` always.
- Any `res.cookie(AUTH_COOKIE, ...)` call must spread `...AUTH_COOKIE_OPTIONS` — never hardcode `sameSite: "lax"` or `secure: false`.
- If `fetchMe` ever gets a 401, it must call `saveCachedAuthUser(null)` before returning null.
