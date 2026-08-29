const CACHE_NAME = 'posture-health-shell-v8';
const CACHE_PREFIX = 'posture-health-shell-';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './src/app.js', './src/styles/main.css',
  './src/styles/tokens.css', './src/styles/reset.css', './src/styles/layout.css', './src/styles/components.css', './src/styles/pages.css',
  './src/components/app-shell.js', './src/components/header.js', './src/components/bottom-nav.js', './src/components/monitoring-controls.js',
  './src/state/monitoring-session.js',
  './src/context/capability-detector.js', './src/context/motion-sampler.js', './src/context/activity-detector.js', './src/context/smart-mode-rules.js', './src/context/context-engine.js',
  './src/pages/home.page.js', './src/pages/statistics.page.js', './src/pages/assessment.page.js', './src/pages/assessment-v3.page.js', './src/pages/assessment-render-policy.js', './src/pages/records.page.js', './src/pages/profile.page.js',
  './assets/icons/icon.svg', './assets/images/ai-detection-demo.png', './assets/images/imu-detection-demo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
