const CACHE_VERSION = 'ai-space-v1';
const MODEL_CACHE = 'ai-space-models-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for API/models
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle share target POST
  if (url.searchParams.has('share-target') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Model weight requests -> model cache
  if (url.pathname.includes('wasm') || url.pathname.includes('model') || url.hostname.includes('huggingface')) {
    event.respondWith(
      caches.open(MODEL_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    }).catch(() => {
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});

// Handle share target POST: store in IndexedDB and redirect
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const shared = {
      title: formData.get('title') || '',
      text: formData.get('text') || '',
      url: formData.get('url') || '',
      timestamp: Date.now()
    };

    // Store in IndexedDB
    const db = await openShareDB();
    const tx = db.transaction('shared', 'readwrite');
    const store = tx.objectStore('shared');
    store.add(shared);

    return Response.redirect('/?shared=true', 303);
  } catch (e) {
    return Response.redirect('/', 303);
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
