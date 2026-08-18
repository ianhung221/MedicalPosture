const CACHE_NAME = 'posture-health-shell-v4';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './src/app.js', './src/styles/main.css',
  './src/styles/tokens.css', './src/styles/reset.css', './src/styles/layout.css', './src/styles/components.css', './src/styles/pages.css',
  './src/components/app-shell.js', './src/components/header.js', './src/components/bottom-nav.js',
  './src/pages/home.page.js', './src/pages/statistics.page.js', './src/pages/assessment.page.js', './src/pages/records.page.js', './src/pages/profile.page.js',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
