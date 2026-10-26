const CACHE_NAME = 'dolboni-v8.4-web-app-label';
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './studio.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './audio/bgm_music.mp3',
  './audio/bgm_rain.mp3',
  './audio/bgm_birds.mp3',
  './audio/bgm_stream.mp3',
  './audio/voice_female_intro.mp3',
  './audio/voice_female_inhale.mp3',
  './audio/voice_female_hold.mp3',
  './audio/voice_female_exhale.mp3',
  './audio/voice_female_complete.mp3',
  './audio/voice_male_intro.mp3',
  './audio/voice_male_inhale.mp3',
  './audio/voice_male_hold.mp3',
  './audio/voice_male_exhale.mp3',
  './audio/voice_male_complete.mp3',
  './audio/voice_male_injoon_intro.mp3',
  './audio/voice_male_injoon_inhale.mp3',
  './audio/voice_male_injoon_hold.mp3',
  './audio/voice_male_injoon_exhale.mp3',
  './audio/voice_male_injoon_complete.mp3',
  'https://cdn.tailwindcss.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Dolboni SW v8] Precaching offline resources');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[Dolboni SW v8] Precache warning:', err);
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
            console.log('[Dolboni SW v8] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. 핵심 코드 (HTML, JS, manifest) ➔ Network-First (최신 코드 즉시 반영, 오프라인 시 캐시)
  const isCoreCode = 
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('manifest.json');

  if (isCoreCode) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. 대용량 미디어 (MP3 오디오, 이미지, 폰트) ➔ Cache-First (초고속 오프라인 재생, 데이터 절약)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      }).catch((err) => {
        console.warn('[Dolboni SW v8] Fetch failed for:', event.request.url, err);
      });
    })
  );
});
