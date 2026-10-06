// OVERRIDE service worker — NETWORK-FIRST with offline fallback to a versioned precache.
// Bump VERSION on every deploy.
const VERSION = 'override-v1.0.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/core.js', './js/config.js', './js/gfx.js', './js/world.js', './js/fx.js', './js/audio.js', './js/input.js',
  './js/player.js', './js/weapons.js', './js/enemies.js', './js/game.js', './js/arcade.js', './js/ui.js',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/postprocessing/EffectComposer.js', './vendor/three/addons/postprocessing/RenderPass.js', './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js', './vendor/three/addons/postprocessing/ShaderPass.js', './vendor/three/addons/postprocessing/SMAAPass.js',
  './vendor/three/addons/postprocessing/Pass.js', './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/shaders/CopyShader.js', './vendor/three/addons/shaders/LuminosityHighPassShader.js', './vendor/three/addons/shaders/OutputShader.js',
  './vendor/three/addons/shaders/SMAAShader.js', './vendor/three/addons/shaders/FXAAShader.js', './vendor/three/addons/objects/Reflector.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
