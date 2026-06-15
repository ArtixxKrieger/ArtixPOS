---
name: Post-login reload and login-page bugs
description: Root causes and fixes for (1) multiple reloads after sign-in and (2) login page appearing briefly after clicking features.
---

## Bug 1 — Multiple reloads after sign-in (production)

**Root cause:** `public/sw.js` v12 used *stale-while-revalidate* for HTML navigation.

Chain of events after a new Vercel deployment:
1. New SW installs → `skipWaiting()` fires unconditionally → new SW activates immediately.
2. New SW deletes old versioned caches (e.g. `artix-assets-v11`) and starts fresh.
3. User signs in (SPA navigation, no HTML fetch) — browser still holds OLD HTML with OLD chunk hashes.
4. Lazy chunk load: old URL → new SW's `ASSET_CACHE` (v12) is a cache miss → CDN at artixpos.com → **404** (Vercel only serves assets from the current deployment on the production domain).
5. SW broadcasts `SW_ASSET_404` → `main.tsx` handler fires.
6. `lazyWithRetry` also catches the import failure.
7. In the original code both handlers called `window.location.reload()` → **two reloads**.

**Fix:** Changed navigation strategy in `public/sw.js` from stale-while-revalidate to **network-first with 3-second timeout + cache fallback** (v13). Users always get fresh HTML with the current deployment's chunk hashes. The stale-HTML → stale-chunk-URL → 404 chain is broken.

**Why network-first is safe here:** Vercel edge CDN latency for HTML is 50-150 ms, well within the 3 s timeout. Offline / unreachable server still falls back to cached shell.

---

## Bug 2 — Login page appears briefly after clicking features

**Root cause:** `queryClient.cancelQueries()` (called with **no predicate**) in `App.tsx` cancelled **every** active query, including `auth-me`.

Chain of events on page reload (triggered by `lazyWithRetry` after a chunk failure):
1. `ProtectedRouter` mounts. `placeholderData = loadCachedAuthUser()`.
2. If localStorage has no cached user: `data = null`, `isAuthenticated = false`, `isLoading = false`, `isFetching = true` (auth-me fetch in flight).
3. Cleanup effect fires (`!isAuthenticated && !isLoading` = true) → `queryClient.cancelQueries()` → **cancels auth-me** → sets `isFetching = false`.
4. React re-renders before retry starts: `isAuthenticated = false`, `isFetching = false`, `isLoading = false`.
5. `ProtectedRouter` guard: `(!isAuthenticated && !isFetching)` → **`<Redirect to="/login" />`**.
6. User sees the login page for ~1 second until the auth-me retry resolves with 200.

**Fix:** Scoped `cancelQueries` to exclude auth-me:
```ts
// App.tsx line 612
queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== "auth-me" });
```

**Why:** The purpose of this cleanup effect is to cancel stale data from a previous user session (e.g. on logout). auth-me must never be cancelled here — it is the source of truth for authentication state and must complete its fetch uninterrupted.
