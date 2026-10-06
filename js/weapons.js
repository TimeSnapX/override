// OVERRIDE — weapons: Pulse Rifle, Arc Shotgun, Rail Lance, Thermal Rail (scope + see/shoot through cover), secret Banana Gun.
import { THREE, G, rand, clamp, damp, rayAABB, raySphere, canvasTex, LS, emit } from './core.js';
import { CONFIG } from './config.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { gfx, LAYER_VIEW } from './gfx.js';
import { world, bananaGeometry } from './world.js';
import { player } from './player.js';
import { fx, flash, tracer, arc, beam, spark, burst, explosion, debris, floatText, addShake } from './fx.js';

const W = CONFIG.weapons;
export const ORDER = ['pulse', 'arc', 'rail', 'thermal', 'banana'];
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), DIR = new THREE.Vector3(), ORG = new THREE.Vector3();
const DEG = Math.PI / 180;

// ---------------- shot resolution ----------------
// Returns { hits:[{e, t, part, through}], end:distance, banana } honouring pierce and cover penetration.
const _iv = [];
export function castShot(o, d, maxD, { pierce = 1, penetrate = 0, team = 'human', bananas = true } = {}) {
  // world intervals
  _iv.length = 0;
  for (const b of G.colliders) {
    if (b.noRay) continue;
    const t0 = rayAABB(o, d, b, maxD); if (t0 < 0) continue;
    // exit distance: cast from the far side
    let tx = maxD; for (const ax of ['x', 'y', 'z']) { const inv = 1 / (d[ax] || 1e-9); const t1 = (b.min[ax] - o[ax]) * inv, t2 = (b.max[ax] - o[ax]) * inv; tx = Math.min(tx, Math.max(t1, t2)); }
    _iv.push([t0, tx]);
  }
  _iv.sort((a, b) => a[0] - b[0]);
  let block = maxD, budget = penetrate, firstWall = maxD, penetrated = 0;
  if (d.y < -1e-4) block = Math.min(block, -o.y / d.y);
  for (const [a, b] of _iv) {
    if (a >= block) break;
    firstWall = Math.min(firstWall, a);
    const th = b - a;
    if (th <= budget) { budget -= th; penetrated++; continue; }
    block = a; break;
  }
  // enemies
  const hits = [];
  for (const e of G.enemies) {
    if (!e.alive || e.team === team || !e.hitSpheres) continue;
    let bt = 1e9, bp = null, wt = 1e9;
    for (const s of e.hitSpheres) {
      if (s.off) continue; const t = raySphere(o, d, s.c, s.r); if (t < 0) continue;
      if (t < bt) { bt = t; bp = s.part; }
      if (s.part === 'weak' && t < wt) wt = t;
    }
    // a weak point just behind the first surface still counts (eyes/cores sit inside their housings)
    if (bp && bp !== 'shield' && wt < bt + 0.3) bp = 'weak';
    if (bp && bt < block) hits.push({ e, t: bt, part: bp, through: bt > firstWall });
  }
  hits.sort((a, b) => a.t - b.t);
  if (hits.length > pierce) hits.length = pierce;
  let end = block;
  if (pierce === 1 && hits.length) end = hits[0].t;
  // golden bananas
  let banana = null;
  if (bananas) for (const bn of world.bananas) { if (bn.found) continue; const t = raySphere(o, d, bn.pos, bn.r); if (t >= 0 && t < block && t < (hits.length && pierce === 1 ? hits[0].t : 1e9)) { banana = bn; end = Math.min(end, t); } }
  return { hits, end, banana, penetrated, firstWall };
}

// ---------------- viewmodels ----------------
const mats = {};
function makeMats() {
  mats.metal = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.9, roughness: 0.28 });
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x111319, metalness: 0.6, roughness: 0.45 });
  mats.white = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.3, roughness: 0.35 });
  mats.wood = new THREE.MeshStandardMaterial({ color: 0x6b3d1f, metalness: 0.0, roughness: 0.6 });
  mats.yellow = new THREE.MeshStandardMaterial({ color: 0xffd23a, metalness: 0.2, roughness: 0.35 });
  mats.skin = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.7, roughness: 0.4 });
}
const glow = (c, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
function P(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; }
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CY = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s).rotateX(Math.PI / 2);

function buildPulse() {
  const g = new THREE.Group(), c = W.pulse.color;
  P(g, B(0.09, 0.12, 0.46), mats.metal, 0, 0, -0.18);
  P(g, B(0.1, 0.05, 0.3), mats.white, 0, 0.075, -0.16);
  P(g, CY(0.022, 0.026, 0.3), mats.dark, 0, 0.01, -0.5);
  P(g, B(0.06, 0.16, 0.08), mats.dark, 0, -0.12, -0.02, 0.25);
  P(g, B(0.05, 0.17, 0.09), mats.metal, 0, -0.12, -0.24, -0.15);
  P(g, B(0.095, 0.012, 0.36), glow(c, 2.2), 0, 0.03, -0.2);
  P(g, B(0.04, 0.05, 0.1), mats.dark, 0, 0.12, -0.12);
  P(g, CY(0.02, 0.02, 0.07), glow(c, 3), 0, 0.12, -0.12);
  const ring = P(g, new THREE.TorusGeometry(0.035, 0.008, 6, 16), glow(c, 5), 0, 0.01, -0.62);
  g.userData.muzzleZ = -0.66; g.userData.glow = ring; return g;
}
function buildArc() {
  const g = new THREE.Group(), c = W.arc.color;
  P(g, B(0.14, 0.13, 0.42), mats.metal, 0, 0, -0.16);
  for (const x of [-0.035, 0.035]) P(g, CY(0.03, 0.03, 0.34), mats.dark, x, 0.02, -0.5);
  for (let i = 0; i < 4; i++) P(g, new THREE.TorusGeometry(0.075, 0.012, 6, 20), glow(c, 4), 0, 0.02, -0.38 - i * 0.07);
  P(g, B(0.1, 0.06, 0.16), mats.dark, 0, -0.06, -0.42);
  P(g, B(0.07, 0.17, 0.09), mats.dark, 0, -0.13, -0.02, 0.25);
  P(g, B(0.145, 0.015, 0.3), glow(0xff2bd6, 3), 0, 0.068, -0.15);
  const coil = P(g, CY(0.025, 0.025, 0.2), glow(c, 2), 0, 0.09, -0.16);
  g.userData.muzzleZ = -0.7; g.userData.glow = coil; g.userData.pump = g.children[6]; return g;
}
function buildRail() {
  const g = new THREE.Group(), c = W.rail.color;
  P(g, B(0.1, 0.12, 0.36), mats.white, 0, 0, -0.1);
  for (const y of [0.045, -0.035]) P(g, B(0.03, 0.025, 0.6), mats.metal, 0, y, -0.52);
  const core = P(g, CY(0.018, 0.018, 0.56), glow(c, 2), 0, 0.005, -0.5);
  for (let i = 0; i < 5; i++) P(g, B(0.07, 0.008, 0.008), glow(c, 3), 0, 0.005, -0.3 - i * 0.1);
  P(g, B(0.06, 0.16, 0.08), mats.dark, 0, -0.12, 0.02, 0.25);
  P(g, B(0.04, 0.05, 0.16), mats.dark, 0, 0.09, -0.08);
  g.userData.muzzleZ = -0.84; g.userData.glow = core; return g;
}
function buildThermal() {
  const g = new THREE.Group(), c = W.thermal.color;
  P(g, B(0.12, 0.14, 0.5), mats.metal, 0, 0, -0.16);
  P(g, CY(0.03, 0.04, 0.45), mats.dark, 0, 0.0, -0.6);
  P(g, B(0.125, 0.02, 0.44), glow(c, 3), 0, -0.04, -0.16);
  P(g, CY(0.045, 0.045, 0.26), mats.dark, 0, 0.12, -0.14);
  const lens = P(g, new THREE.CircleGeometry(0.04, 20), glow(c, 4), 0, 0.12, -0.271, 0, Math.PI);
  P(g, new THREE.CircleGeometry(0.04, 20), glow(0xffd9a0, 1.2), 0, 0.12, -0.009);
  P(g, B(0.06, 0.16, 0.08), mats.dark, 0, -0.13, 0.02, 0.25);
  for (let i = 0; i < 6; i++) P(g, B(0.13, 0.03, 0.012), mats.dark, 0, 0.06, -0.3 - i * 0.03);
  const core = P(g, CY(0.012, 0.012, 0.4), glow(c, 2), 0.064, 0, -0.18);
  g.userData.muzzleZ = -0.84; g.userData.glow = core; g.userData.lens = lens; return g;
}
function buildBanana() {
  const g = new THREE.Group();
  P(g, CY(0.05, 0.11, 0.42, 20), mats.yellow, 0, 0.0, -0.4);
  P(g, new THREE.TorusGeometry(0.11, 0.015, 8, 24), glow(0xffe14a, 2), 0, 0, -0.61);
  P(g, B(0.09, 0.11, 0.26), mats.wood, 0, -0.02, -0.08);
  P(g, B(0.07, 0.16, 0.08), mats.wood, 0, -0.13, 0.02, 0.3);
  const b = new THREE.Mesh(bananaGeometry(0.5), mats.yellow); b.position.set(0, 0.03, -0.6); b.rotation.set(0, Math.PI / 2, 0.4); g.add(b);
  for (let i = 0; i < 3; i++) P(g, new THREE.SphereGeometry(0.018, 8, 6), glow([0xff2bd6, 0x18e7ff, 0x3cff8a][i], 3), -0.05, 0.03, -0.15 - i * 0.06);
  g.userData.muzzleZ = -0.66; g.userData.glow = g.children[1]; g.userData.ammoBanana = b; return g;
}
function buildArm() {
  const g = new THREE.Group();
  P(g, CY(0.045, 0.055, 0.42, 12), mats.skin, 0, 0, 0);
  for (let i = 0; i < 4; i++) P(g, new THREE.TorusGeometry(0.052, 0.006, 6, 16), glow(0x18e7ff, 4), 0, 0, -0.15 + i * 0.09);
  P(g, B(0.1, 0.05, 0.11), mats.skin, 0, 0, -0.26);
  for (let i = 0; i < 4; i++) P(g, B(0.016, 0.02, 0.09), mats.skin, -0.035 + i * 0.023, 0.01, -0.35, -0.3);
  P(g, B(0.012, 0.06, 0.25), glow(0x18e7ff, 3), 0, 0.05, -0.05);
  return g;
}

function flashTex() {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,200,0.8)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 6;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); c.stroke(); }
  });
}

// ---------------- banana projectiles ----------------
const bananas = [];
function initBananas() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.4, emissive: new THREE.Color(0.35, 0.25, 0.0) });
  const geo = bananaGeometry(0.9);
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; G.scene.add(m); bananas.push({ m, p: m.position, v: new THREE.Vector3(), t: 0, bounces: 0, alive: false }); }
}
function fireBanana(o, d) {
  const b = bananas.find((x) => !x.alive) || bananas[0];
  b.alive = true; b.m.visible = true; b.p.copy(o); b.v.copy(d).multiplyScalar(W.banana.speed); b.v.y += 2; b.t = 0; b.bounces = 0;
}
function bananaBurst(b, direct) {
  b.alive = false; b.m.visible = false;
  const p = b.p.clone(); p.y = Math.max(0.3, p.y);
  explosion(p, 0xffd23a, 0.7, 0xffe14a);
  debris(p, 6, 0xffe14a, true, W.banana.peelLife);
  burst(p, 0xfff2a0, 30, 7, 0.14, 0.6);
  audio.peel(); floatText(p.clone().setY(p.y + 1), Math.random() < 0.5 ? 'SPLAT!' : 'PEEL OUT!', 'pop banana', 1.0, 1.6);
  if (direct) direct.damage(W.banana.dmg * weapons.dmgMult, 'body', 'banana', p);
  for (const e of G.enemies) {
    if (!e.alive || e.team !== 'synod') continue;
    const d = e.center.distanceTo(p);
    if (d < W.banana.radius + (e.radius || 0.5)) { e.damage(W.banana.burst * weapons.dmgMult * (1 - d / (W.banana.radius * 2)), 'body', 'banana', p); if (e.alive && e.slip) e.slip(W.banana.slip); }
  }
}
function updateBananas(dt) {
  for (const b of bananas) {
    if (!b.alive) continue;
    b.t += dt; b.v.y -= 9.8 * dt;
    const prev = V3.copy(b.p); b.p.addScaledVector(b.v, dt);
    b.m.rotation.x += dt * 14; b.m.rotation.z += dt * 9;
    let bounced = false;
    if (b.p.y < 0.12) { b.p.y = 0.12; b.v.y = Math.abs(b.v.y) * W.banana.restitution; b.v.x *= 0.85; b.v.z *= 0.85; bounced = true; }
    for (const c of G.colliders) {
      if (b.p.x > c.min.x && b.p.x < c.max.x && b.p.y > c.min.y && b.p.y < c.max.y && b.p.z > c.min.z && b.p.z < c.max.z) {
        // reflect on the axis we entered through
        if (prev.x <= c.min.x || prev.x >= c.max.x) { b.v.x *= -W.banana.restitution; b.p.x = prev.x; }
        else if (prev.z <= c.min.z || prev.z >= c.max.z) { b.v.z *= -W.banana.restitution; b.p.z = prev.z; }
        else { b.v.y = Math.abs(b.v.y) * W.banana.restitution; b.p.y = c.max.y + 0.12; }
        bounced = true; break;
      }
    }
    if (bounced) { b.bounces++; audio.boing(); spark(b.p, V.set(0, 2, 0), 0xffe14a, 0.15, 0.3); }
    // enemy contact
    let hitE = null;
    for (const e of G.enemies) { if (!e.alive || e.team !== 'synod' || !e.hitSpheres) continue; for (const s of e.hitSpheres) { if (!s.off && s.c.distanceTo(b.p) < s.r + 0.2) { hitE = e; break; } } if (hitE) break; }
    if (hitE || b.t > W.banana.fuse || b.bounces >= W.banana.bounces) bananaBurst(b, hitE);
  }
}

// ---------------- weapon system ----------------
export const weapons = {
  cur: 'pulse', ammo: {}, banana: false, swapT: 0, reloadT: 0, reloading: false, fireCd: 0, charge: 0, charging: false,
  scoped: false, streak: 0, lastShot: 0, overTarget: false, shotIdx: 0, dmgMult: 1, armT: -1, armTarget: null, bananaRegen: 0,
  vms: {}, kick: 0, kickRot: 0, swayX: 0, swayY: 0, flashT: 0, autoFiring: false, rangeText: '',

  init() {
    makeMats(); initBananas();
    const cam = G.camera;
    this.root = new THREE.Group(); this.root.position.set(0.14, -0.145, -0.3); this.root.scale.setScalar(0.42); this.root.rotation.y = 0.03; cam.add(this.root);
    const b = { pulse: buildPulse, arc: buildArc, rail: buildRail, thermal: buildThermal, banana: buildBanana };
    for (const k of ORDER) { const g = b[k](); g.visible = false; this.root.add(g); this.vms[k] = g; }
    const fm = new THREE.SpriteMaterial({ map: flashTex(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(fm); this.flash.visible = false; this.root.add(this.flash);
    this.arm = buildArm(); this.arm.position.set(-0.35, -0.5, -0.3); this.arm.visible = false; this.root.add(this.arm);
    this.root.traverse((o) => { o.layers.set(LAYER_VIEW); o.frustumCulled = false; });
    G.weapons = this;
    this.banana = !!LS.get('banana', false);
    this.reset();
  },
  reset() {
    for (const k of ORDER) this.ammo[k] = { mag: W[k].mag, reserve: W[k].reserve };
    this.select('pulse', true); this.dmgMult = 1; this.scoped = false; gfx.setThermal(false);
    for (const b of bananas) { b.alive = false; b.m.visible = false; }
  },
  available(k) { return k !== 'banana' || this.banana; },
  unlockBanana(source) {
    if (this.banana) return false;
    this.banana = true; LS.set('banana', true);
    emit('achievement', 'BANANA GUN UNLOCKED', 'Fruit Ninja! (' + source + ') — slot 5');
    emit('pa', 'Fruit-based weaponry is in breach of by-law 404. Please stop.');
    audio.boing();
    if (G.state === 'play') this.select('banana');
    return true;
  },
  select(k, instant = false) {
    if (!this.available(k) || (k === this.cur && !instant)) return;
    this.setScope(false);
    this.cur = k; this.reloading = false; this.charging = false; this.charge = 0; this.streak = 0;
    this.swapT = instant ? 0 : CONFIG.swapTime; this.fireCd = Math.max(this.fireCd, instant ? 0 : CONFIG.swapTime * 0.8);
    for (const kk of ORDER) this.vms[kk].visible = kk === k;
    if (!instant) audio.swap();
    emit('weaponChanged', k);
  },
  cycle(dir = 1) { const av = ORDER.filter((k) => this.available(k)); const i = av.indexOf(this.cur); this.select(av[(i + dir + av.length) % av.length]); },
  setScope(on) {
    on = on && this.cur === 'thermal';
    if (on === this.scoped) return;
    this.scoped = on; gfx.setThermal(on); this.root.visible = !on;
    if (world.rain) world.rain.visible = !on;
    gfx.bloom.enabled = on ? false : gfx.bloomWanted();
    emit('scope', on); audio.blip(on ? 1400 : 700, 0.05, 'sine', 0.08);
  },
  startReload() {
    const a = this.ammo[this.cur], w = W[this.cur];
    if (this.reloading || a.mag >= w.mag || a.reserve <= 0) return;
    this.setScope(false); this.charging = false; this.charge = 0;
    this.reloading = true; this.reloadT = this.cur === 'arc' ? w.reloadPerShell : w.reload; audio.reload();
    emit('reload', this.cur);
  },
  addReserveFrac(f, all = false) {
    for (const k of all ? ORDER : [this.cur]) { const w = W[k]; this.ammo[k].reserve = Math.min(w.reserve, this.ammo[k].reserve + Math.ceil(w.reserve * f)); }
  },

  muzzleWorld(out) { const g = this.vms[this.cur]; out.set(0, 0.01, g.userData.muzzleZ || -0.6); g.localToWorld(out); return out; },

  update(dt) {
    const w = W[this.cur], a = this.ammo[this.cur];
    // input
    if (input.press('swap')) this.cycle(1);
    if (input.press('swapPrev')) this.cycle(-1);
    for (let i = 1; i <= 5; i++) if (input.press('w' + i)) this.select(ORDER[i - 1]);
    if (input.press('reload')) this.startReload();
    if (input.press('scope')) this.setScope(!this.scoped);
    if (this.swapT > 0) this.swapT -= dt;
    this.fireCd -= dt;

    // banana regen (1 per 3 s)
    if (this.banana) { this.bananaRegen += dt; if (this.bananaRegen >= W.banana.regen) { this.bananaRegen = 0; const b = this.ammo.banana; if (b.reserve < W.banana.reserve) b.reserve++; } }

    // what's under the crosshair (for auto-fire + aim-assist slowdown)
    const cam = G.camera; cam.getWorldPosition(ORG); cam.getWorldDirection(DIR);
    const range = this.cur === 'arc' ? w.falloff : 140;
    const look = castShot(ORG, DIR, range, { bananas: false });
    this.overTarget = look.hits.length > 0;
    const eyeHit = castShot(ORG, DIR, 300, { bananas: false });
    this.rangeText = (eyeHit.hits.length ? eyeHit.hits[0].t : eyeHit.end).toFixed(1) + ' m';

    let fireHeld = input.isFire();
    if (G.settings.autoFire && this.overTarget && G.mobile) fireHeld = true;

    // reload progress
    if (this.reloading) {
      if (this.cur === 'arc' && fireHeld && a.mag > 0) this.reloading = false; // shell reload is interruptible
      else {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          if (this.cur === 'arc') { a.mag++; a.reserve--; audio.blip(900, 0.04, 'square', 0.08); if (a.mag < w.mag && a.reserve > 0) this.reloadT = w.reloadPerShell; else this.reloading = false; }
          else { const n = Math.min(w.mag - a.mag, a.reserve); a.mag += n; a.reserve -= n; this.reloading = false; }
        }
      }
    }

    const canFire = !this.reloading && this.swapT <= 0 && !player.dead;
    const charged = this.cur === 'rail' || this.cur === 'thermal';
    if (charged) {
      if (canFire && fireHeld && this.fireCd <= 0 && a.mag > 0) {
        if (!this.charging) { this.charging = true; this.charge = 0; }
        const before = this.charge; this.charge = Math.min(1, this.charge + dt / w.charge);
        if (Math.floor(before * 6) !== Math.floor(this.charge * 6)) audio.charge(this.charge);
        if (G.settings.autoFire && G.mobile && this.charge >= 1 && this.overTarget) this.release();
      } else if (this.charging && !fireHeld) this.release();
      else if (canFire && fireHeld && a.mag <= 0 && this.fireCd <= 0) { audio.dry(); this.fireCd = 0.3; this.startReload(); }
    } else if (canFire && fireHeld && this.fireCd <= 0) {
      const auto = this.cur === 'pulse';
      if (auto || !this._heldLast || this.cur === 'banana' || this.cur === 'arc') {
        if (a.mag > 0) this.fire(); else { audio.dry(); this.fireCd = 0.3; this.startReload(); }
      }
    }
    this._heldLast = fireHeld;
    if (!fireHeld && G.t - this.lastShot > W.pulse.bloomReset) this.streak = 0;
    if (a.mag <= 0 && !this.reloading && a.reserve > 0 && this.fireCd <= 0 && !this.charging) this.startReload();

    updateBananas(dt);
    this.updateViewmodel(dt);
    this.updateArm(dt);
  },

  release() {
    const w = W[this.cur], power = this.charge; this.charging = false; this.charge = 0;
    this.fire(power); this.fireCd = w.cooldown;
  },

  fire(power = 0) {
    const k = this.cur, w = W[k], a = this.ammo[k];
    a.mag--; this.lastShot = G.t; this.shotIdx++; this.streak++;
    G.stats.shots++; G.stats.weaponShots[k] = (G.stats.weaponShots[k] || 0) + 1;
    const cam = G.camera; cam.getWorldPosition(ORG); cam.getWorldDirection(DIR);
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    if (this.scoped) muzzle.copy(ORG).addScaledVector(DIR, 0.3).y -= 0.15;
    let anyHit = false;
    const assist = (d) => {
      if (!(G.mobile && G.settings.aimAssist)) return d;
      const direct = castShot(ORG, d, 140, { bananas: false }); if (direct.hits.length) return d;
      let best = null, bestA = CONFIG.aimAssist.cone * DEG;
      for (const e of G.enemies) {
        if (!e.alive || e.team !== 'synod' || !e.hitSpheres) continue;
        const s = e.hitSpheres.find((x) => x.part === 'weak' && !x.off) || e.hitSpheres[0];
        V.subVectors(s.c, ORG); const dist = V.length(); V.divideScalar(dist); const ang = Math.acos(clamp(V.dot(d), -1, 1));
        if (ang < bestA) { const chk = castShot(ORG, V, dist + 1, { bananas: false }); if (chk.hits.length && chk.hits[0].e === e) { bestA = ang; best = V.clone(); } }
      }
      return best || d;
    };
    const spreadDir = (base, deg) => { const s = deg * DEG; V2.set(rand(-1, 1), rand(-1, 1), 0).normalize().multiplyScalar(Math.sqrt(Math.random()) * s); const q = new THREE.Vector3().copy(base); const right = new THREE.Vector3().crossVectors(base, cam.up).normalize(); const up = new THREE.Vector3().crossVectors(right, base); return q.addScaledVector(right, V2.x).addScaledVector(up, V2.y).normalize(); };

    if (k === 'pulse') {
      const d = spreadDir(assist(DIR.clone()), this.streak >= 3 ? w.spreadMin : w.spreadHip);
      const r = castShot(ORG, d, w.range);
      const end = ORG.clone().addScaledVector(d, r.end);
      if (this.shotIdx % 3 === 0 || r.hits.length) tracer(muzzle, end, w.color, 0.025, 0.06);
      if (r.banana) this.hitBanana(r.banana);
      else if (r.hits.length) { anyHit = this.applyHit(r.hits[0], w.dmg, w.weakMult, k, end); }
      else this.impact(end, w.color, r.end < w.range);
      flash(muzzle, w.color, 14, 0.05, 8); audio.shot('rifle'); this.kickIt(w);
      if (this.shotIdx % 2 === 0) debris(muzzle.clone().add(V.set(0.05, 0, 0)), 1, 0xd0a040);
      this.fireCd = 1 / w.rate;
    } else if (k === 'arc') {
      const base = assist(DIR.clone()); const hitMap = new Map();
      for (let i = 0; i < w.pellets; i++) {
        const d = spreadDir(base, w.cone / 2);
        const r = castShot(ORG, d, 60);
        const end = ORG.clone().addScaledVector(d, r.end);
        arc(muzzle, end, i % 2 ? w.color : 0xff2bd6);
        if (r.banana) this.hitBanana(r.banana);
        else if (r.hits.length) {
          const h = r.hits[0]; const fall = h.t < 6 ? 1 : Math.max(0.25, 1 - (h.t - 6) / (w.falloff - 6) * 0.75);
          const prev = hitMap.get(h.e) || { dmg: 0, weak: false, end, t: h.t }; prev.dmg += w.dmg * fall * (h.part === 'weak' ? w.weakMult : h.part === 'plate' ? 1 : 1); prev.weak ||= h.part === 'weak'; prev.part = h.part; hitMap.set(h.e, prev);
        } else if (i % 3 === 0) this.impact(end, w.color, r.end < 60);
      }
      for (const [e, h] of hitMap) {
        anyHit = true; const wasAlive = e.alive;
        e.damage(h.dmg * this.dmgMult, h.part, k, h.end, 1);
        emit('hitmarker', !e.alive && wasAlive ? 'kill' : h.weak ? 'weak' : 'body');
        burst(h.end, w.color, 8, 5, 0.08, 0.3);
        if (e.type === 'wasp' && e.alive && e.knock) e.knock(DIR);
        // chain arc to one more enemy within 3 m
        const other = G.enemies.find((o) => o !== e && o.alive && o.team === 'synod' && o.center.distanceTo(e.center) < w.chainRange);
        if (other) { arc(e.center, other.center, w.color); other.damage(w.chainDmg * this.dmgMult, 'body', k, other.center); }
      }
      flash(muzzle, w.color, 40, 0.08, 12); audio.shot('shotgun'); this.kickIt(w); addShake(0.12);
      this.fireCd = 1 / w.rate;
    } else if (k === 'rail' || k === 'thermal') {
      const d = this.scoped ? DIR.clone() : assist(DIR.clone());
      const full = power >= 0.999;
      const dmg = w.dmgMin + (w.dmgMax - w.dmgMin) * power;
      const r = castShot(ORG, d, 220, { pierce: k === 'rail' ? (full ? w.pierce : 1) : (full ? 2 : 1), penetrate: k === 'thermal' && full ? w.penetrate : 0 });
      let end = ORG.clone().addScaledVector(d, r.end);
      if (r.hits.length > 1 || (k === 'thermal' && full)) end = ORG.clone().addScaledVector(d, r.hits.length ? Math.max(r.end, r.hits[r.hits.length - 1].t) : r.end);
      beam(muzzle, end, w.color, 0.5 + power);
      if (r.banana) this.hitBanana(r.banana);
      let mult = 1, kills = 0;
      for (const h of r.hits) {
        let dm = dmg * mult; if (h.through) dm *= w.penetrateMult || 1;
        const wasAlive = h.e.alive; this.applyHit(h, dm, w.weakMult, k, ORG.clone().addScaledVector(d, h.t), h.through);
        if (wasAlive && !h.e.alive) kills++;
        anyHit = true; mult *= 1 - (w.pierceFalloff || 0.15);
      }
      if (kills > 1) emit('pierceKills', kills);
      G.stats.maxPierce = Math.max(G.stats.maxPierce, r.hits.length);
      if (!r.hits.length) this.impact(end, w.color, true);
      if (r.penetrated) burst(ORG.clone().addScaledVector(d, r.firstWall), 0xffffff, 12, 4, 0.1, 0.4);
      flash(muzzle, w.color, 50 + power * 40, 0.12, 14); audio.shot('rail'); this.kickIt(w, 0.6 + power); addShake(0.1 + power * 0.15);
      if (navigator.vibrate && G.settings.haptics) navigator.vibrate(30);
    } else if (k === 'banana') {
      fireBanana(muzzle, DIR); audio.shot('banana'); this.kickIt(w); this.fireCd = 1 / w.rate;
      if (!this._bananaBarked) { this._bananaBarked = true; emit('kbark', 'Potassium delivery!'); }
    }
    if (anyHit) G.stats.hits++;
    if (navigator.vibrate && G.settings.haptics && k !== 'rail' && k !== 'thermal') navigator.vibrate(10);
    // muzzle flash sprite
    this.flash.position.set(0, 0.01, this.vms[k].userData.muzzleZ - 0.04); this.flash.material.color.set(w.color).multiplyScalar(2.5);
    this.flash.material.rotation = rand(0, 6.28); this.flash.scale.setScalar(k === 'arc' ? 0.45 : k === 'banana' ? 0.3 : 0.32); this.flash.visible = !this.scoped; this.flashT = 0.05;
    emit('shot', k);
  },

  applyHit(h, dmg, weakMult, k, point, through = false) {
    const e = h.e; const wasAlive = e.alive;
    const m = h.part === 'weak' ? weakMult : 1;
    e.damage(dmg * m * this.dmgMult, h.part, k, point, 1, through);
    emit('hitmarker', wasAlive && !e.alive ? 'kill' : h.part === 'weak' ? 'weak' : 'body');
    burst(point, h.part === 'weak' ? 0xffd200 : 0xff8a3a, h.part === 'weak' ? 12 : 7, 5, 0.08, 0.35);
    return true;
  },
  impact(p, color, solid) {
    if (!solid) return;
    burst(p, color, 6, 4, 0.07, 0.3); burst(p, 0xffe6b0, 4, 6, 0.05, 0.25);
    flash(p, color, 6, 0.05, 4);
  },
  hitBanana(b) {
    b.found = true; b.mesh.visible = false;
    explosion(b.pos.clone(), 0xffd23a, 0.5, 0xffd23a); burst(b.pos, 0xffffff, 30, 6, 0.12, 0.8, 0.3);
    G.match.goldBananas++; G.stats.goldBananas = G.match.goldBananas;
    audio.goldBanana();
    emit('toast', `${G.match.goldBananas}/3 GOLDEN BANANAS`, 'gold');
    if (G.match.goldBananas >= 3) this.unlockBanana('found all 3 golden bananas');
  },
  kickIt(w, k = 1) {
    this.kick = Math.min(1.5, this.kick + w.kick * 4 * k); this.kickRot = Math.min(1, this.kickRot + w.kick * 2.5 * k);
    player.recoilPitch += w.recoil * k * (this.scoped ? 0.5 : 1); player.recoilYaw += rand(-1, 1) * w.recoil * 0.3 * k;
  },

  updateViewmodel(dt) {
    const g = this.vms[this.cur]; if (!g) return;
    this.kick = damp(this.kick, 0, 16, dt); this.kickRot = damp(this.kickRot, 0, 12, dt);
    const sp = Math.hypot(player.vel.x, player.vel.z) / CONFIG.player.speed;
    const t = G.t;
    const bobX = Math.sin(player.bob) * 0.012 * sp, bobY = Math.abs(Math.cos(player.bob)) * 0.014 * sp;
    this.swayX = damp(this.swayX, 0, 6, dt); this.swayY = damp(this.swayY, 0, 6, dt);
    let dip = 0, rotX = 0;
    if (this.swapT > 0) dip = this.swapT / CONFIG.swapTime * 0.25;
    if (this.reloading) { const ph = Math.sin(Math.min(1, (G.t * 3) % 1) * Math.PI); dip += 0.08; rotX = 0.5; if (this.cur === 'arc' && g.userData.pump) g.userData.pump.position.z = -0.42 + Math.sin(G.t * 14) * 0.03; void ph; }
    g.position.set(bobX * 2 + this.swayX, -bobY * 2 - dip + Math.sin(t * 1.6) * 0.004 + this.swayY, this.kick * 0.09);
    g.rotation.set(this.kickRot * 0.25 + rotX, 0, -rotX * 0.3);
    // charge glow
    const gl = g.userData.glow;
    if (gl && gl.material.color) {
      const base = new THREE.Color(W[this.cur].color);
      const k = (this.charging ? 1 + this.charge * 5 : 1.4) + (G.t - this.lastShot < 0.08 ? 3 : 0);
      gl.material.color.copy(base).multiplyScalar(k);
      if (this.charging) gl.scale.setScalar(1 + this.charge * 0.3); else gl.scale.setScalar(1);
    }
    if (g.userData.ammoBanana) g.userData.ammoBanana.visible = this.ammo.banana.mag > 0;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
  },

  playArm(target) { this.armT = 0; this.armTarget = target; this.arm.visible = !this.scoped; },
  updateArm(dt) {
    if (this.armT < 0) return;
    this.armT += dt;
    const t = this.armT, up = t < 0.15 ? t / 0.15 : t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.2);
    this.arm.position.set(-0.32 + up * 0.08, -0.55 + up * 0.38, -0.32); this.arm.rotation.set(up * 0.4, 0.3, 0.2);
    if (this.armTarget && t < 0.6) { const p = new THREE.Vector3(0, 0.05, -0.3); this.arm.localToWorld(p); if (this.armTarget.center) { arc(p, this.armTarget.center, 0x18e7ff); arc(p, this.armTarget.center, 0x7ffcff); } }
    if (t > 0.9) { this.armT = -1; this.arm.visible = false; }
  },

  hud() { const a = this.ammo[this.cur]; return { k: this.cur, name: W[this.cur].name, mag: a.mag, reserve: a.reserve, max: W[this.cur].mag, charge: this.charging ? this.charge : 0, reloading: this.reloading }; },
};
