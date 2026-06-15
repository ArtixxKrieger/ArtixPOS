---
name: Logout redirect loop fix
description: Four interacting bugs that caused the browser to loop/reload repeatedly after logout; all fixed in use-auth.ts and login.tsx.
---

## The four bugs

### Bug 1 — login.tsx redirect effect didn't wait for real auth state
`placeholderData: loadCachedAuthUser()` makes React Query's status `success` immediately when localStorage has a cached user, so `isLoading = false` even before the real server response. The redirect effect only guarded on `isLoading`, so it fired immediately with stale placeholder auth, redirected to `/`, fetchMe returned 401, then `<Redirect to="/login" />` brought the user back — creating a visible reload cycle.

**Fix:** Add `isFetching` to the guard and deps:
```js
if (isLoading || isFetching) return;
```

### Bug 2 — logout `onError` didn't call `saveCachedAuthUser(null)`
If the mutation threw (edge case), `onError` called `window.location.replace("/login")` without clearing the localStorage auth cache. On the reload, `loadCachedAuthUser()` returned the stale user, causing Bug 1 to trigger.

**Fix:** Add `saveCachedAuthUser(null)` to `onError`.

### Bug 3 — `queryClient.cancelQueries()` had no filter in logout
Cancelling `auth-me` caused a brief `isFetching = false` window at the wrong moment, same class of bug noted for `ProtectedRouter` cleanup.

**Fix:** Scope to `predicate: (q) => q.queryKey[0] !== "auth-me"` in both `onSuccess` and `onError`.

### Bug 4 — logoutPending path in login.tsx didn't clear localStorage
The async logout block in login.tsx's redirect effect called `window.location.replace("/login")` without calling `clearAuthCache()` / `saveCachedAuthUser(null)`, leaving stale auth in localStorage for the next page load.

**Fix:** Call `clearAuthCache()` in that async block before navigating.

## Additional hardening in onSuccess
`queryClient.setQueryData(["auth-me"], null)` is called before `queryClient.clear()` so that any in-flight React render between clear and the page replace sees user = null, preventing a brief flash of the app with stale auth.

**Why:** Together these bugs could create a 2–20 navigation storm that browsers detect as ERR_TOO_MANY_REDIRECTS.

**How to apply:** Any future logout path (error handlers, session-expiry handlers) must: (1) clear localStorage before navigating, (2) scope cancelQueries to non-auth-me, (3) setQueryData(["auth-me"], null) before clear.
