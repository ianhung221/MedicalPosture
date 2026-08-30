const CACHE_NAME = 'posture-health-shell-v11';
const CACHE_PREFIX = 'posture-health-shell-';
const AI_CACHE_NAME = 'posture-ai-assets-v1';
const AI_CACHE_PREFIX = 'posture-ai-assets-';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './src/app.js', './src/styles/main.css',
  './src/styles/tokens.css', './src/styles/reset.css', './src/styles/layout.css', './src/styles/components.css', './src/styles/pages.css',
  './src/components/app-shell.js', './src/components/header.js', './src/components/bottom-nav.js', './src/components/info-card.js', './src/components/monitoring-controls.js',
  './src/config/features.js', './src/config/firebase.config.example.js',
  './src/services/firebase.service.js', './src/services/imu.service.js', './src/services/pose.service.js', './src/utils/dom.js',
  './src/state/monitoring-session.js', './src/state/platform-settings.js',
  './src/context/capability-detector.js', './src/context/motion-sampler.js', './src/context/activity-detector.js', './src/context/smart-mode-rules.js', './src/context/context-engine.js',
  './src/sensors/sensor-permission.js',
  './src/imu/imu-config.js', './src/imu/imu-debug-config.js', './src/imu/imu-sensor-source.js', './src/imu/orientation-normalizer.js', './src/imu/orientation-smoother.js', './src/imu/imu-calibration.js', './src/imu/imu-visual-mapper.js', './src/imu/imu-monitoring-engine.js',
  './src/ai/mediapipe-config.js', './src/ai/camera-controller.js', './src/ai/pose-runtime.js', './src/ai/landmark-smoother.js', './src/ai/posture-features.js', './src/ai/posture-calibration.js', './src/ai/posture-classifier.js', './src/ai/posture-stabilizer.js', './src/ai/posture-event-tracker.js', './src/ai/pose-pipeline.js', './src/ai/pose-overlay.js', './src/ai/performance-meter.js', './src/ai/ai-debug-config.js', './src/ai/background-ai-diagnostics.js', './src/ai/ai-monitoring-engine.js',
  './assets/vendor/mediapipe/vision_bundle.mjs',
  './src/pages/home.page.js', './src/pages/statistics.page.js', './src/pages/assessment.page.js', './src/pages/assessment-v3.page.js', './src/pages/assessment-render-policy.js', './src/pages/records.page.js', './src/pages/profile.page.js',
  './assets/icons/icon.svg', './assets/images/ai-detection-demo.png', './assets/images/imu-detection-demo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || (key.startsWith(AI_CACHE_PREFIX) && key !== AI_CACHE_NAME))
    .map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLargeAiAsset = url.origin === self.location.origin && (url.pathname.includes('/assets/models/') || url.pathname.includes('/assets/vendor/mediapipe/wasm/'));
  if (isLargeAiAsset) {
    event.respondWith(caches.open(AI_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
      return response;
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
