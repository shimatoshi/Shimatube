const CACHE_NAME = 'shimatube-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
  // Viteが生成するJS/CSSは動的にキャッシュする戦略をとる
];

// インストール時: 基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 起動時: 古いキャッシュを削除
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
    })
  );
});

// 通信時: キャッシュがあればそれを使う (Cache First)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIリクエストはキャッシュしない (常にネットワークへ)
  if (url.pathname.startsWith('/api')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // キャッシュにあればそれを返す
      if (response) {
        return response;
      }
      // なければネットワークに取りに行き、次回のためにキャッシュする
      return fetch(event.request).then((networkResponse) => {
        // レスポンスが正しいか確認
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        // クローンしてキャッシュに保存
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
