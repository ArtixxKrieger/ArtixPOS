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

## Post-login LoadingScreen — critical ordering rule

`setQueryData(["auth-me"], user)` must be called **AFTER** `await prefetchBootstrapData()`, not before.

**Why the order matters:** If `setQueryData` fires first, React sees `isAuthenticated=true`, schedules a re-render, and the redirect `useEffect` fires after that render — which happens BEFORE the `await` in the form handler resolves. The `await` in an async event handler does NOT block React's effect system. Navigation happens before the prefetch completes → LoadingScreen still shows.

If `prefetchBootstrapData` is awaited first and THEN `setQueryData` fires: settings is already in cache when React sees `isAuthenticated=true` and runs the redirect. AppRouter renders directly to Dashboard — no LoadingScreen.

**Correct pattern in handleEmailSubmit**:
```ts
// 1. prefetch first (auth cookie from login response is already set, so requests are authenticated)
await initUserSession(userId);
await Promise.race([prefetchBootstrapData(userId), new Promise(r => setTimeout(r, 1500))]);
// 2. THEN flip auth state — triggers redirect AFTER data is ready
queryClient.setQueryData(["auth-me"], authUser);
```

`prefetchBootstrapData` is guarded by `prefetchedUsers.has(userId)` so the ProtectedRouter effect call becomes a no-op — no double-fetch.

**How to apply**: In any login path (email form, OAuth callback), always put `setQueryData(["auth-me"], user)` LAST — after all critical prefetching is done.
