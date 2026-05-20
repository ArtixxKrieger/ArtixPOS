// ArtixPOS Service Worker v9
// Caching strategies:
//   HTML/navigation   → network-first, cache fallback, offline page last
//   Hashed assets     → cache-first, immutable
//   Fonts             → cache-first
//   Images            → stale-while-revalidate
//   API calls         → network-only
//
// v9 changes:
//   skipWaiting() on install — new SW activates immediately so a stale/broken
//   SW can never trap users in an infinite loading loop. Previously the page
//   JS had to send SKIP_WAITING; if the page was stuck (e.g. the old loop bug)
//   that message was never sent and the broken SW stayed in control forever.

const CACHE_VERSION = "v9";
const SHELL_CACHE   = `artix-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `artix-assets-${CACHE_VERSION}`;
const FONT_CACHE    = `artix-fonts-${CACHE_VERSION}`;
const IMAGE_CACHE   = `artix-images-${CACHE_VERSION}`;

const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE, IMAGE_CACHE];

const PRECACHE_URLS = ["/", "/index.html", "/manifest.json"];

// ── Install ───────────────────────────────────────────────────────────────
// skipWaiting() is called unconditionally so any newly downloaded sw.js
// immediately takes over from a stale/broken predecessor. Without this, a
// page that is stuck in a loading loop can never send the SKIP_WAITING
// message, leaving the broken old SW in control indefinitely.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .finally(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────
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
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Background Sync ────────────────────────────────────────────────────────
// Fires when the OS restores network connectivity while all tabs may be
// backgrounded. We notify every open window client to run their sync logic
// rather than attempting fetch() from inside the SW (which has no access to
// the app's IndexedDB mutation queue or auth cookies).
//
// Registration is done in use-online-status.ts:
//   navigator.serviceWorker.ready.then(reg => reg.sync.register('pos-offline-sync'))
//
// The 'sync' event will also fire immediately if the device is already online
// at registration time, ensuring queued mutations are not forgotten.
self.addEventListener("sync", (event) => {
  if (event.tag === "pos-offline-sync") {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          if (clients.length === 0) return;
          clients.forEach((client) =>
            client.postMessage({ type: "TRIGGER_SYNC" })
          );
        })
        .catch(() => {})
    );
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch { return false; }
}

function isHashedAsset(pathname) {
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

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {}
}

// ── Offline fallback HTML ─────────────────────────────────────────────────
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

  // Only intercept GETs — mutations are queued by the app layer, not the SW
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. API & auth — always network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // 2. Hashed Vite assets — cache-first, immutable
  //
  // STALE-DEPLOYMENT GUARD: if a hashed asset returns 404 the server has a new
  // deployment and our cached HTML points to files that no longer exist.
  //   1. Delete the shell cache so the next navigation fetches fresh HTML.
  //   2. Broadcast SW_ASSET_404 to all open tabs so main.tsx can wipe all
  //      caches and hard-reload without waiting for the user to act.
  if (isSameOrigin(req.url) && isHashedAsset(url.pathname)) {
    event.respondWith(
      caches.match(req, { cacheName: ASSET_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.status === 404) {
            caches.delete(SHELL_CACHE).catch(() => {});
            self.clients.matchAll({ type: "window", includeUncontrolled: true })
              .then((clients) => clients.forEach((c) => c.postMessage({ type: "SW_ASSET_404" })))
              .catch(() => {});
            return res;
          }
          cacheResponse(ASSET_CACHE, req, res);
          return res;
        }).catch(() => new Response("Asset unavailable offline", { status: 503 }));
      })
    );
    return;
  }

  // 3. Web fonts — cache-first
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

  // 4. Images — stale-while-revalidate
  if (isSameOrigin(req.url) && isImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached ?? networkPromise ?? new Response("", { status: 503 });
      })
    );
    return;
  }

  // 5. Navigation requests — network-first, cache fallback
  if (isNavigation(req) || (isSameOrigin(req.url) && url.pathname.endsWith(".html"))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          cacheResponse(SHELL_CACHE, req, res);
          return res;
        })
        .catch(async () => {
          const fromCache =
            (await caches.match(req, { cacheName: SHELL_CACHE })) ??
            (await caches.match("/", { cacheName: SHELL_CACHE })) ??
            (await caches.match("/index.html", { cacheName: SHELL_CACHE }));
          if (fromCache) return fromCache;
          return offlineFallbackResponse();
        })
    );
    return;
  }

  // 6. Everything else same-origin — network-first, cache fallback
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
});

// ── Push notifications ─────────────────────────────────────────────────────
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
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
