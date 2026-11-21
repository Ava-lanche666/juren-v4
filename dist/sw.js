/* 聚仁 · Service Worker
 * 只缓存应用外壳，不缓存错题/日程 API 与天气。
 * 所有业务数据在 localStorage 的加密仓库里，离线也能打开。
 */

const CACHE = 'juren-shell-v39';
const SHELL = [
  './',
  './index.html',
  './assets/juren.css',
  './assets/warm.css',
  './assets/themes.css',
  './assets/premium.css',
  './assets/question-photo.css',
  './assets/glass.css',
  './assets/fracture.css',
  './assets/fracture-hairline.svg',
  './assets/fracture-ice.svg',
  './assets/fracture-crystal.svg',
  './assets/week-agenda.css',
  './assets/personalize.css',
  './assets/plum.css',
  './assets/plum-art.webp',
  './assets/plum-branch.svg',
  './assets/people-emblem.png',
  './assets/people-login.webp',
  './assets/people-portrait.webp',
  './assets/people-collective.webp',
  './assets/zhixu.css',
  './js/app.js',
  './js/question-image.js',
  './js/theme.js',
  './js/remember.js',
  './js/store.js',
  './js/crypto.js',
  './js/parser.js',
  './js/data.js',
  './js/ai.js',
  './js/weather.js',
  './js/icons.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 模型网关、天气、任何第三方请求都不经过缓存
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#timeline', self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.startsWith(self.registration.scope));
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    }),
  );
});
