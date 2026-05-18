// ═══════════════════════════════════════════════════════════════════════════
// ArtixPOS Service Worker v7
//
// Caching strategies per resource type:
//   • HTML / navigation   → Network-first, cache fallback, offline page last
//   • Hashed assets       → Cache-first, immutable (content hash = permanent)
//   • Fonts               → Cache-first, long TTL
//   • Images              → Stale-while-revalidate
//   • API calls           → Network-only (never cache — app layer handles IDB)
//   • /api/health         → Network-only (used for connectivity probing)
//
// Update flow:
//   • New SW waits to activate until all tabs send SKIP_WAITING or close.
//   • main.tsx sends SKIP_WAITING on load (so single-tab users get instant
//     updates); multi-tab POS sessions wait for all tabs to reload first.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = "v7";
const SHELL_CACHE   = `artix-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `artix-assets-${CACHE_VERSION}`;
const FONT_CACHE    = `artix-fonts-${CACHE_VERSION}`;
const IMAGE_CACHE   = `artix-images-${CACHE_VERSION}`;

const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE, IMAGE_CACHE];

// URLs to pre-cache on install so the app shell loads even on first offline visit
const PRECACHE_URLS = ["/", "/index.html", "/manifest.json"];

// ── Install ───────────────────────────────────────────────────────────────
// Pre-cache the shell. Errors are swallowed — a failed pre-cache is not fatal;
// the runtime fetch handler will populate the cache on first real visit.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
    // DO NOT call skipWaiting() here. We wait for the explicit SKIP_WAITING
    // message from main.tsx so we don't activate mid-session on a live POS tab.
  );
});

// ── Activate ──────────────────────────────────────────────────────────────
// Delete every cache that doesn't belong to this SW version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Message handler ───────────────────────────────────────────────────────
// main.tsx sends SKIP_WAITING after React mounts, giving us a clean window
// to take over. This replaces the old skipWaiting()-in-install approach.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch { return false; }
}

function isHashedAsset(pathname) {
  // Vite fingerprinted assets: /assets/vendor-Ab3Cd4EF.js, /assets/index-Xx.css
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{7,}\.(js|css|woff2?)(\?.*)?$/.test(pathname);
}

function isFont(url) {
  return /\.(woff2?|ttf|otf|eot)(\?.*)?$/.test(url.pathname) ||
         url.hostname === "fonts.gstatic.com" ||
         url.hostname === "fonts.googleapis.com";
}

function isImage(url) {
  return /\.(png|jpe?g|gif|webp|svg|ico)(\?.*)?$/.test(url.pathname);
}

function isNavigation(req) {
  return req.mode === "navigate";
}

// Clone, store, and return the original — background best-effort.
// Never awaited by the caller so it doesn't block the response.
async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {}
}

// ── Offline fallback HTML ─────────────────────────────────────────────────
// Returned only when the user navigates while offline AND the shell isn't
// cached yet (e.g. first-ever visit with no network).
function offlineFallbackResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ArtixPOS — Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
         background:#09090f;color:#e5e7eb;min-height:100vh;
         display:flex;align-items:center;justify-content:center;padding:24px}
    .card{max-width:360px;width:100%;text-align:center}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-size:22px;font-weight:700;margin-bottom:8px;color:#fff}
    p{font-size:14px;color:#9ca3af;line-height:1.6;margin-bottom:24px}
    button{background:#7c3aed;color:#fff;border:none;padding:12px 28px;
           border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%}
    button:active{opacity:0.85}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>You're offline</h1>
    <p>ArtixPOS needs a connection to load for the first time. Connect to the internet and try again.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ── Fetch handler ─────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET — POST/PUT/DELETE go straight to network (mutation queue
  // is managed by the app layer in offline-db.ts, not by the SW).
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ── 1. API & auth — network only, never intercept ─────────────────────
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return; // fall through: browser handles it directly
  }

  // ── 2. Hashed Vite assets — cache-first, immutable ───────────────────
  // Content hash in the filename guarantees the file never changes.
  // Serve from cache immediately; fetch and cache on first miss.
  //
  // STALE-DEPLOYMENT GUARD: if a hashed asset returns 404 it means the
  // server has a new deployment and our cached HTML is pointing to
  // files that no longer exist. In that case:
  //   1. Delete the shell cache so the next navigation fetches fresh HTML.
  //   2. Broadcast SW_ASSET_404 to all open tabs so main.tsx can wipe
  //      all caches and hard-reload without waiting for the user to act.
  if (isSameOrigin(req.url) && isHashedAsset(url.pathname)) {
    event.respondWith(
      caches.match(req, { cacheName: ASSET_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.status === 404) {
            // Stale deployment detected — nuke shell cache + notify clients.
            caches.delete(SHELL_CACHE).catch(() => {});
            self.clients.matchAll({ type: "window", includeUncontrolled: true })
              .then((clients) => clients.forEach((c) => c.postMessage({ type: "SW_ASSET_404" })))
              .catch(() => {});
            return res; // pass 404 to the app so ErrorBoundary can react
          }
          cacheResponse(ASSET_CACHE, req, res);
          return res;
        }).catch(() => new Response("Asset unavailable offline", { status: 503 }));
      })
    );
    return;
  }

  // ── 3. Web fonts — cache-first, long TTL ─────────────────────────────
  if (isFont(url)) {
    event.respondWith(
      caches.match(req, { cacheName: FONT_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          cacheResponse(FONT_CACHE, req, res);
          return res;
        }).catch(() => new Response("", { status: 503 }));
      })
    );
    return;
  }

  // ── 4. Images — stale-while-revalidate ───────────────────────────────
  if (isSameOrigin(req.url) && isImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        // Kick off a background revalidation regardless
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        // Return cached immediately if available, otherwise wait for network
        return cached ?? networkPromise ?? new Response("", { status: 503 });
      })
    );
    return;
  }

  // ── 5. Navigation requests (HTML pages) — network-first ──────────────
  // Try network first to get the freshest shell. On failure, fall back to
  // any cached version of the URL, then the root /, then the inline page.
  if (isNavigation(req) || (isSameOrigin(req.url) && url.pathname.endsWith(".html"))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache every successful navigation response for offline use
          cacheResponse(SHELL_CACHE, req, res);
          return res;
        })
        .catch(async () => {
          // Network failed — try the cache
          const fromCache =
            (await caches.match(req, { cacheName: SHELL_CACHE })) ??
            (await caches.match("/", { cacheName: SHELL_CACHE })) ??
            (await caches.match("/index.html", { cacheName: SHELL_CACHE }));
          if (fromCache) return fromCache;
          // Nothing in cache — serve the inline offline page
          return offlineFallbackResponse();
        })
    );
    return;
  }

  // ── 6. Everything else same-origin — network-first, cache fallback ────
  if (isSameOrigin(req.url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          cacheResponse(SHELL_CACHE, req, res);
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached ?? new Response("Offline", { status: 503 }))
        )
    );
  }
  // Cross-origin requests not matched above: fall through to browser default
});

// ── Push notifications ─────────────────────────────────────────────────────
// Receives push events from the server and displays a system notification
// even when all app tabs are closed or in the background.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  const options = {
    body:             data.body  ?? "",
    icon:             data.icon  ?? "/logo192.png",
    badge:            "/logo192.png",
    tag:              data.tag   ?? "artixpos",
    data:             { url: data.url ?? "/" },
    requireInteraction: false,
    silent:           false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? "ArtixPOS", options)
  );
});

// ── Notification click ─────────────────────────────────────────────────────
// When the user taps the notification, focus an existing app window or open
// a new one at the URL embedded in the notification data.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus the first existing tab that belongs to this origin
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        // No existing tab — open a new one
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
