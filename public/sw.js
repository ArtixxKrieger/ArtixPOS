// ═══════════════════════════════════════════════════════════════════════════
// ArtixPOS Service Worker — advanced caching + offline support
// Strategy:
//   • Shell (HTML)          → Network-first, cache fallback
//   • Hashed assets (JS/CSS)→ Cache-first, eternal (immutable URLs)
//   • Fonts                 → Cache-first, 365-day TTL
//   • API calls             → Network-only (no stale data), pass-through
//   • Images                → Stale-while-revalidate, 7-day TTL
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = "v5";
const SHELL_CACHE   = `artix-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `artix-assets-${CACHE_VERSION}`;
const FONT_CACHE    = `artix-fonts-${CACHE_VERSION}`;
const IMAGE_CACHE   = `artix-images-${CACHE_VERSION}`;

const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE, IMAGE_CACHE];

const SHELL_URLS = ["/", "/index.html"];

// ── Install: pre-cache shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate: delete old cache generations ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isCrossOrigin(url) {
  return new URL(url).origin !== self.location.origin;
}

function hasHashedFilename(pathname) {
  // Vite fingerprints: /assets/index-Ab3Cd4EF.js  or  /assets/vendor-XxYy.css
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)(\?.*)?$/.test(pathname);
}

function isFont(url) {
  return /\.(woff2?|ttf|otf|eot)(\?.*)?$/.test(url.pathname) ||
         url.hostname === "fonts.gstatic.com";
}

function isImage(url) {
  return /\.(png|jpe?g|gif|webp|svg|ico)(\?.*)?$/.test(url.pathname);
}

// Store response in a named cache, ignoring errors (best-effort)
async function storeInCache(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {}
}

// ── Fetch handler ─────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ── 1. API calls → network only, no caching ───────────────────────────
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return; // fall through to browser default
  }

  // ── 2. Hashed Vite assets → cache-first (immutable) ──────────────────
  if (!isCrossOrigin(req.url) && hasHashedFilename(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          storeInCache(ASSET_CACHE, req, res);
          return res;
        });
      })
    );
    return;
  }

  // ── 3. Fonts → cache-first, long TTL ─────────────────────────────────
  if (isFont(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          storeInCache(FONT_CACHE, req, res);
          return res;
        });
      })
    );
    return;
  }

  // ── 4. Images → stale-while-revalidate ────────────────────────────────
  if (!isCrossOrigin(req.url) && isImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            storeInCache(IMAGE_CACHE, req, res);
            return res.clone();
          }).catch(() => null);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ── 5. HTML / everything else → network-first, cache fallback ─────────
  if (!isCrossOrigin(req.url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          storeInCache(SHELL_CACHE, req, res);
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/index.html"))
        )
    );
    return;
  }
});

// ── Background sync hint (for future offline queue) ───────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
