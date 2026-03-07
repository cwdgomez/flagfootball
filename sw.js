// CGMax FFTP — Service Worker v3
// Cache-first for assets, network-first for navigation, stale-while-revalidate for fonts
// Update CACHE_VERSION when deploying new app versions to bust the cache

const CACHE_VERSION = 'fftp-v12::2026-03-07';
const FONT_CACHE    = 'fftp-fonts-v1';  // Separate long-lived cache for Google Fonts
const OFFLINE_URL   = './app.html';

const PRECACHE_ASSETS = [
  './app.html',
  './parent.html',
  './index.html',
  './manifest.json',
  './privacy.html',
  './terms.html',
  './help.html',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './tournament.html',
  './playdesigner.html',
  './consent.html',
  './auth-callback.html',
  './statcoach.html',
];

// ── INSTALL: precache core pages ──
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())   // activate immediately
  );
  // Note: if precaching fails the error will surface in the DevTools SW panel
});

// ── ACTIVATE: purge old app caches (but keep font cache across versions) ──
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: smart routing ──
self.addEventListener('fetch', evt => {
  const req = evt.request;
  const url = new URL(req.url);

  // Skip non-GET, browser-extension, and non-http requests
  if(req.method !== 'GET') return;
  if(!url.protocol.startsWith('http')) return;

  // Google Fonts CSS + font files: cache-first with long TTL (stale-while-revalidate)
  // Use CORS mode so responses are non-opaque and safe to cache
  const isFontOrigin = url.origin === 'https://fonts.googleapis.com' ||
                       url.origin === 'https://fonts.gstatic.com';
  if(isFontOrigin){
    evt.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const networkFetch = fetch(req, { mode: 'cors', credentials: 'omit' })
            .then(resp => {
              // Only cache successful, non-opaque (CORS) responses
              if(resp && resp.status === 200 && resp.type === 'cors'){
                cache.put(req, resp.clone());
              }
              return resp;
            })
            .catch(() => null);
          // Return cached immediately; update in background
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Other cross-origin requests (CDN libs, Firebase SDK): try network, fall back to cache
  if(url.origin !== self.location.origin){
    evt.respondWith(
      caches.match(req).then(cached => cached || fetch(req).catch(() => null))
    );
    return;
  }

  // Navigation requests: network-first, fall back to offline app shell
  if(req.mode === 'navigate'){
    evt.respondWith(
      fetch(req)
        .then(resp => {
          // Update cache with fresh nav response
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // All other same-origin requests: cache-first, update in background (stale-while-revalidate)
  evt.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(cached => {
        const fetchAndCache = fetch(req).then(resp => {
          if(resp && resp.status === 200 && resp.type !== 'opaque'){
            cache.put(req, resp.clone());
          }
          return resp;
        }).catch(() => null);

        return cached || fetchAndCache;
      })
    )
  );
});
