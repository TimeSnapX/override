// OVERRIDE — shared core: THREE re-export, global game context, small utils.
import * as THREE from 'three';
export { THREE };

export const G = {
  t: 0, dt: 0, frame: 0,
  scene: null, camera: null, renderer: null,
  state: 'boot',            // boot | intro | menu | play | paused | arcade | end
  phase: 'intermission',    // intermission | wave | boss
  wave: 0, maxWave: 10,
  enemies: [], colliders: [], shootables: [],
  player: null,
  debug: /[?&]debug=1/.test(location.search),
  params: new URLSearchParams(location.search),
  mobile: false,
  settings: null,
  stats: null,
  timeScale: 1,
  god: false,
};

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

// All save data lives in one localStorage key ("override.v1"), per the GDD.
let _save = null;
function loadSave() { if (_save) return _save; try { _save = JSON.parse(localStorage.getItem('override.v1') || '{}') || {}; } catch (e) { _save = {}; } return _save; }
export const LS = {
  get(k, d) { const s = loadSave(); return k in s ? s[k] : d; },
  set(k, v) { const s = loadSave(); s[k] = v; try { localStorage.setItem('override.v1', JSON.stringify(s)); } catch (e) { /* private mode */ } },
};

export function canvasTex(w, h, draw, { srgb = true, repeat = false, mips = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.generateMipmaps = mips; t.anisotropy = 4;
  return t;
}

// Simple value noise for texture generation
export function makeNoise(seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const N = 256, p = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) p[i] = rnd();
  const v = (x, y) => p[((y & 255) * N) + (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), xf), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), xf), yf);
  };
  return (x, y, oct = 4) => { let a = 0, f = 1, amp = 0.5; for (let i = 0; i < oct; i++) { a += n2(x * f, y * f) * amp; f *= 2; amp *= 0.5; } return a; };
}

// Ray vs AABB (slab). Returns distance or -1.
export function rayAABB(o, d, b, maxD) {
  let tmin = 0, tmax = maxD;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (b.min[ax] - o[ax]) * inv, t2 = (b.max[ax] - o[ax]) * inv;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}
// Ray vs sphere. Returns distance or -1.
const _oc = new THREE.Vector3();
export function raySphere(o, d, c, r) {
  _oc.subVectors(o, c);
  const b = _oc.dot(d), cc = _oc.lengthSq() - r * r, h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (-b + Math.sqrt(h) >= 0 ? 0 : -1);
}
// Closest world (collider) hit along a ray.
export function rayWorld(o, d, maxD) {
  let best = maxD, hit = false;
  for (const b of G.colliders) { if (b.noRay) continue; const t = rayAABB(o, d, b, best); if (t >= 0 && t < best) { best = t; hit = true; } }
  if (d.y < -1e-4) { const t = -o.y / d.y; if (t < best) { best = t; hit = true; } }
  return hit ? best : -1;
}
// Push a circle (x,z,r) out of colliders. Mutates pos.
export function collideCircle(pos, r, h = 1.0) {
  for (const b of G.colliders) {
    if (b.max.y < 0.35 || b.min.y > h) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else { // inside: push along smallest axis
        const ox = Math.min(pos.x - b.min.x, b.max.x - pos.x), oz = Math.min(pos.z - b.min.z, b.max.z - pos.z);
        if (ox < oz) pos.x = (pos.x - b.min.x < b.max.x - pos.x) ? b.min.x - r : b.max.x + r;
        else pos.z = (pos.z - b.min.z < b.max.z - pos.z) ? b.min.z - r : b.max.z + r;
      }
    }
  }
}
export function addCollider(min, max, extra = {}) {
  const b = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), ...extra };
  G.colliders.push(b); return b;
}
export const ARENA = 27; // half size of the playable rooftop

// event bus
const listeners = {};
export const on = (ev, fn) => ((listeners[ev] ||= []).push(fn));
export const emit = (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a));
