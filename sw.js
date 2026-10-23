const CACHE_NAME = 'tokyo-manga-lab-shell-v8';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './assets/favicon.svg',
  './css/base.css', './css/theme.css', './css/layout.css', './css/components.css', './css/screens.css', './css/reader.css',
  './src/app.js', './src/core/app-controller.js', './src/core/router.js',
  './src/data/database.js', './src/data/models.js', './src/data/repositories/library-repository.js',
  './src/services/api-client.js', './src/sources/source-registry.js', './src/sources/manga/mangadex-adapter.js',
  './src/features/anilist/anilist-config.js', './src/features/anilist/anilist-mapper.js', './src/features/anilist/anilist-auth.js', './src/features/anilist/anilist-client.js', './src/features/anilist/sync-planner.js', './src/features/anilist/anilist-store.js', './src/features/anilist/anilist-sync.js', './src/features/anilist/anilist-native.js', './src/features/reader/reader-pages.js', './src/features/reader/reader-report.js', './src/features/reader/reader-progress.js', './src/features/reader/reader-native.js', './src/features/reader/reader-features.js', './src/features/reader/reader-view.js', './src/features/linking/mangadex-link.js', './src/data/repositories/link-repository.js', './src/features/settings/settings-service.js', './src/features/settings/settings-schema.js', './src/features/profile/profile-sections.js', './src/features/feature-registry.js', './src/shared/icons.js', './src/shared/app-info.js', './src/features/settings/legacy-migration.js', './src/features/statistics/statistics-service.js', './src/shared/utils.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('tokyo-manga-lab-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (url.origin !== scopeUrl.origin) return; // Never cache the catalogue API or external cover assets here.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(new URL('./index.html', self.registration.scope), response.clone()).catch(() => {});
        return response;
      } catch {
        return (await caches.match(new URL('./index.html', self.registration.scope))) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
