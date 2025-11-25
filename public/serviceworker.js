/* serviceworker.js */
const CACHE_VERSION = 'v25'; // Updated for Supabase migration
const CACHE_NAME = `headstone-memorial-cache-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/app.js',
  '/js/supabase-client.js',
  '/js/auth-manager.js',
  '/js/pages/home.js',
  '/js/pages/login.js',
  '/js/pages/memorial-form.js',
  '/js/pages/memorial-template.js',
  '/js/pages/curator-panel.js',
  '/js/pages/scout-mode.js',
  '/favicon.png',
  '/logo1.png',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png',
  '/pages/login.html',
  '/pages/memorial-template.html'
];

// Install: Pre-cache the app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Implement Stale-While-Revalidate and Network-First strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) {
    return;
  }

  // Strategy: Network-First for HTML pages.
  // This ensures users always get the latest page markup.
  if (request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Strategy: Stale-While-Revalidate for all other assets (CSS, JS, images).
  // This serves the cached version for speed, then updates the cache in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      
      const fetchPromise = fetch(request).then((networkResponse) => {
        cache.put(request, networkResponse.clone());
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});