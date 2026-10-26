const CACHE_NAME = 'dolboni-v7.1-kakao-outlink';
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './audio/bgm_music.mp3',
  './audio/bgm_rain.mp3',
  './audio/bgm_birds.mp3',
  './audio/bgm_stream.mp3',
  './audio/voice_intro.mp3',
  './audio/voice_inhale.mp3',
  './audio/voice_hold.mp3',
  './audio/voice_exhale.mp3',
  './audio/voice_complete.mp3',
  'https://cdn.tailwindcss.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Dolboni SW] Precaching offline resources');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[Dolboni SW] Precache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Dolboni SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 캐시 우선 전략 (Cache First, fallback to Network)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== 'basic'
        ) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      // 오프라인 상태에서 HTML 요청인 경우 캐시된 index.html 반환
      if (event.request.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});
