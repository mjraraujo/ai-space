const CACHE_VERSION = 'ai-space-v12';
const MODEL_CACHE = 'ai-space-models-v1';
const MAX_CACHE_ITEMS = 200;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './robots.txt',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.ico'
];

// Install: activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch((err) => {
      // Log precache failures for debugging; runtime cache will handle missing assets.
      console.warn('[SW] Precache failed:', err?.message || err);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => limitCacheSize(CACHE_VERSION, MAX_CACHE_ITEMS))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for everything, network fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET
  if (event.request.method !== 'GET') {
    // Handle share target POST
    if (url.searchParams.has('share-target') && event.request.method === 'POST') {
      event.respondWith(handleShareTarget(event.request));
    }
    return;
  }

  // Skip cross-origin CDN requests (web-llm from esm.run etc) — let them go to network
  if (url.origin !== self.location.origin) {
    // Cache model weights from huggingface (exact hostname match for security)
    const hostname = url.hostname;
    if (hostname === 'huggingface.co' || (hostname.endsWith('.huggingface.co') && hostname.length > '.huggingface.co'.length) || url.pathname.endsWith('.wasm') || url.pathname.endsWith('.bin')) {
      event.respondWith(cacheFirst(event.request, MODEL_CACHE));
      return;
    }
    // Cache transformers.js JS/WASM bundles from jsdelivr so they work offline
    if (hostname === 'cdn.jsdelivr.net') {
      event.respondWith(cacheFirst(event.request, MODEL_CACHE));
      return;
    }
    return;
  }

  // Documents: network-first to reduce stale HTML after deployments
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request, CACHE_VERSION));
    return;
  }

  // Static assets: stale-while-revalidate for fast load + fresh updates
  event.respondWith(staleWhileRevalidate(event.request, CACHE_VERSION, event));
});

/**
 * Cache-first strategy: serve from cache, fall back to network (and cache the response)
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Try cache first
  const cached = await cache.match(request);
  if (cached) return cached;

  // Network fallback
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline and not in cache — try to return index.html for navigation requests
    if (request.destination === 'document') {
      const fallback = await cache.match(new Request(self.registration.scope));
      if (fallback) return fallback;
      // Also try matching index.html under any path
      const keys = await cache.keys();
      for (const key of keys) {
        if (key.url.endsWith('index.html') || key.url.endsWith('/')) {
          return cache.match(key);
        }
      }
    }
    throw err;
  }
}

/**
 * Network-first strategy for navigation/doc requests.
 * Injects COOP/COEP headers on the response so SharedArrayBuffer and WebGPU
 * work in browsers that require cross-origin isolation (e.g. Chrome).
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    const stamped = stampCrossOriginIsolation(response);
    if (response.ok || response.type === 'opaque') {
      cache.put(request, stamped.clone());
    }
    return stamped;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
    throw new Error('Offline and no cached page available');
  }
}

/**
 * Clone a response and add Cross-Origin-Opener-Policy /
 * Cross-Origin-Embedder-Policy headers required for cross-origin isolation.
 * Only applied to same-origin HTML responses; other response types are returned as-is.
 */
function stampCrossOriginIsolation(response) {
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Stale-while-revalidate strategy for same-origin static assets.
 */
async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(fetchPromise.catch(() => {}));
    }
    return cached;
  }

  const fresh = await fetchPromise;
  if (fresh) return fresh;

  if (request.destination === 'document') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }

  throw new Error('Request failed and no cache entry exists');
}

// Handle share target POST
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const shared = {
      title: formData.get('title') || '',
      text: formData.get('text') || '',
      url: formData.get('url') || '',
      timestamp: Date.now()
    };

    const db = await openShareDB();
    const tx = db.transaction('shared', 'readwrite');
    tx.objectStore('shared').add(shared);

    return Response.redirect(self.registration.scope + '?shared=true', 303);
  } catch (e) {
    return Response.redirect(self.registration.scope, 303);
  }
}

function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ai-space-share', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('shared')) {
        db.createObjectStore('shared', { keyPath: 'timestamp' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Evict oldest entries when a cache exceeds the item limit.
 * Called after activate to keep storage usage bounded.
 */
async function limitCacheSize(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const toDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(toDelete.map((key) => cache.delete(key)));
    }
  } catch {
    // Non-critical — cache eviction failure is safe to ignore.
  }
}
