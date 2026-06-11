/**
 * EcoStep — Service Worker
 * Provides offline-first caching for the PWA.
 * Cache-first for app assets, stale-while-revalidate for fonts.
 */

var CACHE_NAME = 'ecostep-v1';

var ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/a11y.js',
  './js/storage.js',
  './js/auth.js',
  './js/export.js',
  './js/tracker.js',
  './js/insights.js',
  './js/charts.js',
  './js/tests.js',
  './js/app.js',
  './manifest.json'
];

/* ─── Install: Pre-cache core assets ─── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ─── Activate: Clean old caches ─── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ─── Fetch: Cache-first for app assets, network-first for fonts ─── */
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  /* Google Fonts: stale-while-revalidate */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  /* App assets: cache-first */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        /* Cache successful GETs for same-origin */
        if (response.ok && event.request.method === 'GET' && url.origin === self.location.origin) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        /* Offline fallback for navigation */
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
