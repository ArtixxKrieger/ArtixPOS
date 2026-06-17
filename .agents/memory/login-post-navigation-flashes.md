---
name: Login post-navigation flashes
description: Root causes and fixes for the multi-flash/reload loop after email login or register.
---

## The problem
After a successful login POST, the user saw 2-7 visible "reloads" (blank flashes, route changes) before landing on the dashboard.

## Root causes (in order of severity)

### 1. In-flight auth-me fetch overwriting setQueryData (the loop cause)
When the login page first loads, `auth-me` starts fetching (returns `null` = 401).
If the user submits the form before that fetch completes (e.g. auto-fill + quick submit),
`setQueryData(["auth-me"], user)` sets the logged-in user, but the in-flight fetch later
completes and overwrites the cache back to `null` → `isAuthenticated = false` → redirect to `/login` → loop.

**Fix**: Call `queryClient.cancelQueries({ queryKey: ["auth-me"] })` BEFORE `setQueryData`.
`fetchMe` already rethrows `AbortError` (see its comment), so TanStack Query discards
the cancelled result and keeps the manually-set user. The Google OAuth handler already
did this — email login was missing it.

### 2. AppRouter's LoadingScreen blank while settings fetches (blank flash)
After navigating to `/`, `AppRouter` checks `settingsEverLoaded.current` which starts
as `false` because settings is not in the TanStack Query cache yet. It returns
`<LoadingScreen />` (which renders `null`) until settings loads (~100-300ms).

**Fix**: In the login handler, `await fetchSettingsFromNetwork()` (exported from
`use-settings.ts`) and call `queryClient.setQueryData(["/api/settings"], result)`
BEFORE calling `setLocation`. This puts settings in cache so `useSettings()` in
AppRouter sees data on first render → `settingsEverLoaded.current = true` → no blank.

The `fetchSettingsFromNetwork` function uses the exact same Zod-parsed format as
`useSettings`'s queryFn. `prefetchBootstrapData` later finds settings in cache with
`staleTime: Infinity` → returns cached data, no double-fetch.

### 3. Extra client-side redirect for new users (extra route change)
For new users, `AppRouter` renders `<Redirect to="/onboarding">` AFTER mounting,
which fires in a `useEffect` asynchronously → causes a visible transition: `/` → `/onboarding`.

**Fix**: In the login handler, after fetching settings, evaluate `needsOnboarding`
using the same logic as AppRouter and call `setLocation(navigateTo)` where `navigateTo`
is either `"/"` or `"/onboarding"`. Navigate directly to the correct destination.

### 4. Tab-switch force logout (visibilitychange handler)
The `visibilitychange` handler in `queryClient.ts` was invalidating ALL errored queries
on tab focus, including `auth-me`. This bypassed `refetchOnWindowFocus: false`.

**Fix**: Skip `auth-me` and `/api/auth/*` in the visibilitychange handler.

## What NOT to do
- Do NOT prefetch settings via `nativeFetch` + raw `setQueryData` in the login handler.
  This bypasses Zod parsing and races with `prefetchBootstrapData`'s own settings fetch,
  causing TWO `setQueryData` calls with potentially different data shapes → extra re-renders.
- Do NOT use `prefetchQuery` with `getQueryFn` for settings in the login handler if
  `useSettings` uses `fetchSettingsFromNetwork` — the two queryFns have different data shapes
  (raw axios vs Zod-parsed).

**Why:** `prefetchBootstrapData` has a guard (`prefetchedUsers.has(userId)`) that prevents
double-fetching. Settings has `staleTime: Infinity`, so once data is in cache, no re-fetch occurs.
The key is to use `fetchSettingsFromNetwork` (same function as `useSettings`) and set data
before navigation.
