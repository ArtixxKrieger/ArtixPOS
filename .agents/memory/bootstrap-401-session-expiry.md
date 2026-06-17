---
name: Bootstrap 401 false session-expiry
description: Why bootstrap prefetch 401s used to log out a freshly-logged-in user, and the fix pattern.
---

## The bug

The axios 401 response interceptor in `api.ts` dispatches `auth:session-expired` for any
401 that isn't in `NO_REDIRECT_401` (`/api/auth/`, `/api/staff-pin/`).  Bootstrap prefetch
queries (`/api/settings`, `/api/products`, etc.) can return 401 for restricted routes for
new users.  Even though those queries use `on401: "returnNull"` (so they never throw), the
axios interceptor fires *before* the queryFn error handler catches it.  This triggered
`invalidateQueries(["auth-me"])` in ProtectedRouter, causing fetchMe to re-run.  If the
cookie was momentarily unavailable the user was kicked back to /login.

## Second race condition

In `handleEmailSubmit` (login.tsx), `loginNavigatedRef.current = true` was set AFTER
`await fetchSettingsFromNetwork()`.  But `setQueryData(["auth-me"], user)` fires before
that await, and React's redirect effect runs *during* the await — seeing
`loginNavigatedRef.current = false` — and calls `setLocation("/")` prematurely.

## Fix

1. **`api.ts`** — Add `_authenticatedUserId: string | null` module-level flag and
   `setAuthenticatedUserId(id)` export.  Only dispatch `auth:session-expired` when
   `_authenticatedUserId` is non-null (i.e. we have a confirmed session).

2. **`use-auth.ts`** — Add `useEffect(() => { setAuthenticatedUserId(u?.id ?? null); }, [u?.id])`
   to keep the flag in sync with the React Query auth state.

3. **`login.tsx` `handleEmailSubmit`** — Set `loginNavigatedRef.current = true` AND call
   `setAuthenticatedUserId(authUser.id)` *before* `cancelQueries`/`setQueryData` so the
   redirect effect guard is armed before React re-renders.

4. **`App.tsx` `handleSessionExpired`** — Check `queryClient.getQueryData(["auth-me"])`
   first; if null (already logged out) skip the invalidation entirely.

**Why:** Without the flag, any 401 from a restricted route fires a session-expiry chain
that re-verifies auth.  If the re-verification returns 401 (e.g. cookie not yet
propagated), the user is immediately logged out after a successful login.
