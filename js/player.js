// OVERRIDE — Kestrel: snappy movement, dash (2 charges), jump, health/armour/regen, OVERRIDE hack ability.
import { THREE, G, clamp, damp, collideCircle, rayWorld, emit, ARENA } from './core.js';
import { CONFIG } from './config.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx, addShake, floatText, bark, forEachPeel } from './fx.js';

const C = CONFIG.player, O = CONFIG.override;
const V = new THREE.Vector3(), V2 = new THREE.Vector3();

export const player = {
  pos: new THREE.Vector3(0, 0, 14), vel: new THREE.Vector3(), yaw: 0, pitch: 0, y: 0, vy: 0, grounded: true,
  hp: C.health, armour: 0, sinceHit: 99, dead: false, override: 0,
  dashCharges: C.dash.charges, dashRecharge: 0, dashT: 0, dashDir: new THREE.Vector3(), iframes: 0,
  coyote: 0, jumpBuf: 0, bob: 0, fovPunch: 0, recoilPitch: 0, recoilYaw: 0, hurtDir: 0, damageFlash: 0,
  slowmo: 0, stillTime: 0, lastLowPA: 0,
  reset() {
    this.pos.set(0, 0, 14); this.vel.set(0, 0, 0); this.yaw = 0; this.pitch = 0; this.y = 0; this.vy = 0;
    this.hp = C.health; this.armour = 0; this.sinceHit = 99; this.dead = false; this.override = 0;
    this.dashCharges = C.dash.charges; this.dashRecharge = 0; this.dashT = 0; this.iframes = 0; this.damageFlash = 0; this.slowmo = 0; this.stillTime = 0;
  },
  get eye() { return V2.set(this.pos.x, this.y + C.eyeHeight, this.pos.z); },
  headPos(out) { return out.set(this.pos.x, this.y + C.eyeHeight - 0.15, this.pos.z); },
  forward(out) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); },

  update(dt, realDt) {
    if (this.dead) return;
    const invert = G.settings.invertY ? -1 : 1;
    let [dx, dy] = input.consumeLook();
    const scoped = G.weapons && G.weapons.scoped;
    let k = scoped ? 0.35 : 1;
    if (G.mobile && G.settings.aimAssist && G.weapons && G.weapons.overTarget) k *= 1 - CONFIG.aimAssist.slowdown;
    this.yaw -= dx * k; this.pitch = clamp(this.pitch - dy * k * invert, -1.45, 1.45);
    // recoil recovery (spring back towards zero)
    this.pitch = clamp(this.pitch + this.recoilPitch, -1.45, 1.45); this.yaw += this.recoilYaw;
    const rp = this.recoilPitch, ry = this.recoilYaw; this.recoilPitch = 0; this.recoilYaw = 0;
    this._rec = (this._rec || 0) + rp; this._recY = (this._recY || 0) + ry;
    const back = Math.min(1, realDt * 9); const bp = this._rec * back, by = this._recY * back;
    this.pitch -= bp; this.yaw -= by; this._rec -= bp; this._recY -= by;

    // movement: instant-ish accel/decel (GDD: 0.08 s to full, 0.06 s stop)
    const mx = input.move.x, mz = input.move.y; const ml = Math.min(1, Math.hypot(mx, mz));
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wishX = (mx * cy - mz * sy), wishZ = (-mx * sy - mz * cy);
    const tgtX = wishX * C.speed, tgtZ = wishZ * C.speed;
    const tc = ml > 0.05 ? C.accelTime : C.decelTime; const ctrl = this.grounded ? 1 : C.airControl;
    const a = 1 - Math.exp(-dt * 3 / tc * ctrl);
    this.vel.x += (tgtX - this.vel.x) * a; this.vel.z += (tgtZ - this.vel.z) * a;
    if (ml < 0.05 && this.grounded) this.stillTime += dt;

    // dash
    this.dashRecharge += dt;
    if (this.dashCharges < C.dash.charges && this.dashRecharge >= C.dash.recharge) { this.dashCharges++; this.dashRecharge = 0; }
    if (input.press('dash') && this.dashCharges > 0) this.dash(wishX, wishZ, ml);
    let vx = this.vel.x, vz = this.vel.z;
    if (this.dashT > 0) { this.dashT -= dt; vx = this.dashDir.x * C.dash.speed; vz = this.dashDir.z * C.dash.speed; }
    if (this.iframes > 0) this.iframes -= dt;

    // jump with coyote time + buffer
    if (this.grounded) this.coyote = C.coyote; else this.coyote -= dt;
    if (input.press('jump')) this.jumpBuf = C.jumpBuffer; else this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) { this.vy = Math.sqrt(2 * C.gravity * C.jumpHeight); this.grounded = false; this.coyote = 0; this.jumpBuf = 0; audio.blip(300, 0.08, 'sine', 0.08); }
    this.vy -= C.gravity * dt; this.y += this.vy * dt;
    if (this.y <= 0) { if (!this.grounded && this.vy < -6) { addShake(0.08); } this.y = 0; this.vy = 0; this.grounded = true; } else this.grounded = false;

    this.pos.x += vx * dt; this.pos.z += vz * dt;
    collideCircle(this.pos, C.radius, this.y + 1.6);
    this.pos.x = clamp(this.pos.x, -ARENA + 0.4, ARENA - 0.4); this.pos.z = clamp(this.pos.z, -ARENA + 0.4, ARENA - 0.4);

    // banana peels are slippery for humans too (tiny comedic nudge)
    forEachPeel((p) => { if (Math.abs(p.x - this.pos.x) < 0.5 && Math.abs(p.z - this.pos.z) < 0.5 && this.grounded && this.dashT <= 0) { this.vel.x *= 1.04; this.vel.z *= 1.04; } });

    // regen
    this.sinceHit += dt;
    if (this.sinceHit > C.regenDelay && this.hp < C.health) this.hp = Math.min(C.health, this.hp + C.regenRate * dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);

    // camera
    const speed = Math.hypot(vx, vz);
    if (this.grounded && speed > 1) this.bob += dt * speed * 1.6;
    const bobA = G.settings.headBob ? C.headBob : 0;
    const cam = G.camera;
    cam.position.set(this.pos.x, this.y + C.eyeHeight + Math.sin(this.bob * 2) * bobA * Math.min(1, speed / C.speed), this.pos.z);
    if (fx.shake > 0) { const s = fx.shake * fx.shake * 0.25; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; }
    cam.rotation.set(0, 0, 0, 'YXZ'); cam.rotation.order = 'YXZ'; cam.rotation.y = this.yaw; cam.rotation.x = this.pitch;
    cam.rotation.z = Math.sin(this.bob) * bobA * 0.3 + (fx.shake > 0 ? (Math.random() - 0.5) * fx.shake * 0.02 : 0);
    this.fovPunch = damp(this.fovPunch, 0, 8, dt);
    const baseFov = G.settings.fov || (G.mobile ? C.fovMobile : C.fovDesktop);
    const sprintFov = ml > 0.9 && G.mobile ? 3 : 0;
    const zoom = scoped ? CONFIG.weapons.thermal.zoom : 1;
    const fov = (baseFov + this.fovPunch + sprintFov) / zoom;
    // convert horizontal-ish design FOV to vertical FOV for landscape screens
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.max(1, cam.aspect * 0.75)));
    if (Math.abs(cam.fov - vfov) > 0.01) { cam.fov = vfov; cam.updateProjectionMatrix(); }

    if (input.press('override')) this.tryOverride();
  },

  dash(wx, wz, ml) {
    if (ml < 0.1) { wx = -Math.sin(this.yaw); wz = -Math.cos(this.yaw); }
    const l = Math.hypot(wx, wz) || 1; this.dashDir.set(wx / l, 0, wz / l);
    this.dashCharges--; this.dashRecharge = 0; this.dashT = C.dash.time; this.iframes = C.dash.iframes; this.fovPunch = C.dash.fovPunch;
    audio.dash(); if (navigator.vibrate && G.settings.haptics) navigator.vibrate(15);
    G.stats.dashes++; emit('dash');
  },

  hurt(amount, from) {
    if (this.dead || G.god || this.iframes > 0) return;
    if (this.armour > 0) { const absorbed = Math.min(this.armour, amount * C.armourAbsorb); this.armour -= absorbed; amount -= absorbed; }
    this.hp -= amount; this.sinceHit = 0; this.damageFlash = Math.min(1, this.damageFlash + amount / 30);
    G.stats.damageTaken += amount; G.stats.waveDamage += amount;
    addShake(0.12 + amount / 80); audio.hurt();
    if (navigator.vibrate && G.settings.haptics) navigator.vibrate(40);
    if (from) { V.subVectors(from, this.pos); this.hurtDir = Math.atan2(V.x, -V.z) + this.yaw; emit('hurtDir', this.hurtDir); }
    emit('playerHurt', amount);
    if (this.hp < 30 && G.t - this.lastLowPA > 20) { this.lastLowPA = G.t; emit('pa', bark('paLow')); }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; emit('playerDied'); }
  },
  heal(n) { this.hp = Math.min(C.health, this.hp + n); },
  addArmour(n) { this.armour = Math.min(C.armourMax, this.armour + n); },
  addOverride(n) { const was = this.override; this.override = Math.min(O.max, this.override + n); if (was < O.max && this.override >= O.max) emit('overrideReady'); },

  tryOverride() {
    if (this.override < O.max) { emit('toast', 'OVERRIDE charging… ' + Math.floor(this.override) + '%', 'small'); emit('overrideFail'); return false; }
    const eye = this.eye.clone(); let best = null, bestScore = 1e9, boss = null;
    for (const e of G.enemies) {
      if (!e.alive || e.team !== 'synod') continue;
      const d = e.pos.distanceTo(eye); if (d > O.range) continue;
      V.subVectors(e.center, eye); const dist = V.length(); V.normalize();
      const wh = rayWorld(eye, V, dist); if (wh >= 0 && wh < dist - 0.5) continue; // must be visible
      if (e.type === 'warden') { boss = e; continue; }
      if (!e.hackable) continue;
      const sc = d - (e.type === 'sentinel' ? 15 : 0);
      if (sc < bestScore) { bestScore = sc; best = e; }
    }
    if (!best && boss && boss.shield > 0) {
      this.override = 0; boss.stripShield(CONFIG.enemies.warden.shield * O.wardenShieldStrip);
      emit('overrideUsed', boss); return true;
    }
    if (!best) { emit('toast', 'No signal, mate', 'small'); emit('overrideFail'); return false; }
    this.override = 0; best.hack(O.duration);
    G.stats.overrides++;
    emit('overrideUsed', best);
    return true;
  },
};
