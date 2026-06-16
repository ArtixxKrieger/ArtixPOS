---
name: Auth placeholderData and post-login loading
description: Why isLoading is useless as a redirect guard when placeholderData is set, and how to eliminate the LoadingScreen after sign-in.
---

## The placeholderData trap

`useQuery` with `placeholderData` sets `status = 'success'` immediately, making `isLoading = isPending && isFetching = false` always. Any redirect guard checking `if (isLoading) return` is a complete no-op and will never block.

**Correct guard**: `isPlaceholderData` — React Query's own flag meaning "this data is stale cache, not a real server response yet."

```ts
// In login.tsx redirect effect:
if (isLoading || isPlaceholderData) return;  // wait for real server answer
if (!isAuthenticated) return;                 // not logged in, stay
setLocation("/");                             // logged in, go to app
```

`isPlaceholderData` is exposed from `useAuth()` and passed through.

**Why:** Without this, stale localStorage cache immediately makes `isAuthenticated=true` and triggers redirect to "/" before fetchMe returns. If fetchMe returns 401, the app unmounts and redirects back to /login — visible as a "loading N times" loop.

## Post-login LoadingScreen

**Root cause**: After logout, `clearAllCache()` wipes IndexedDB. On next login, `useSettings()` has no prewarm cache. `prefetchBootstrapData` only fires in ProtectedRouter's `useEffect` — *after* AppRouter renders — so AppRouter hits `<LoadingScreen>` every time.

**Fix**: Call `initUserSession(userId).then(() => prefetchBootstrapData(userId))` **immediately in the login form handler** (right after `setQueryData`), not just in ProtectedRouter's effect. The prefetch races the React render cycle; settings is often cached before AppRouter's first render.

`prefetchBootstrapData` is guarded by `prefetchedUsers.has(userId)` so the ProtectedRouter call becomes a no-op — no double-fetch.

**How to apply**: In any login path that calls `setQueryData(["auth-me"], user)`, also fire the prefetch immediately after.
