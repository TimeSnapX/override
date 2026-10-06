// OVERRIDE — SYNOD machines: Wasp drones (boids + dive), Sentinel walkers (armour plates / exposed core), Warden Unit boss (3 phases),
// shield nodes, enemy bolts, mortar barrages, sweep lasers and pickups.
import { THREE, G, rand, randi, pick, clamp, damp, rayWorld, rayAABB, collideCircle, emit, ARENA } from './core.js';
import { CONFIG } from './config.js';
import { LAYER_HEAT } from './gfx.js';
import { audio } from './audio.js';
import { player } from './player.js';
import { fx, flash, tracer, spark, burst, explosion, debris, floatText, addShake, forEachPeel, bark } from './fx.js';

const E = CONFIG.enemies;
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const RED = new THREE.Color(1.0, 0.12, 0.06), CYAN = new THREE.Color(0.1, 0.9, 1.0), GOLD = new THREE.Color(1.0, 0.75, 0.15);

let M = null;
function mats() {
  if (M) return M;
  M = {
    hull: new THREE.MeshStandardMaterial({ color: 0x4a5266, metalness: 0.7, roughness: 0.32, emissive: 0x0a0c14 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x8a92a6, metalness: 0.7, roughness: 0.28 }),
    white: new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.5, roughness: 0.3 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x101217, metalness: 0.7, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.2, emissive: 0x3a2500 }),
    wing: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.15, 0.1), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return M;
}
const glowMat = (c = RED, k = 4) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k) });
const mesh = (g, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

// ---------------------------------------------------------------- base
class Enemy {
  constructor(type, hp) {
    this.type = type; this.hp = this.maxHp = hp; this.alive = true; this.team = 'synod'; this.hackable = true;
    this.group = new THREE.Group(); this.pos = this.group.position; this.vel = new THREE.Vector3();
    this.center = new THREE.Vector3(); this.hitSpheres = []; this.glows = []; this.hackT = 0; this.slipT = 0; this.radius = 0.5;
    this.lastBark = -99; this.target = null; this.dmgDealt = 0; this.minionKills = 0;
    G.scene.add(this.group); G.enemies.push(this);
  }
  sphere(r, part, local) { const s = { c: new THREE.Vector3(), r, part, local: local || new THREE.Vector3(), off: false }; this.hitSpheres.push(s); return s; }
  glow(m, k = 4) { m.userData.k = k; this.glows.push(m); return m; }
  finish() { this.group.traverse((o) => { if (o.isMesh) { o.layers.enable(LAYER_HEAT); } }); this.updateSpheres(); }
  updateSpheres() { this.group.updateMatrixWorld(); for (const s of this.hitSpheres) s.c.copy(s.local).applyMatrix4(this.group.matrixWorld); this.center.copy(this.hitSpheres[0] ? this.hitSpheres[0].c : this.pos); }
  setColor(c) { for (const m of this.glows) m.color.copy(c).multiplyScalar(m.userData.k); }
  say(text, kind) { emit('bark', this, text, kind || this.type); }

  damage(amount, part, weapon, point, n = 1, through = false) {
    if (!this.alive) return 0;
    if (part === 'shield') { floatText(point || this.center, 'SHIELDED', 'shield', 0.5); spark(point || this.center, V.set(0, 2, 0), 0xffd040, 0.2, 0.3); return 0; }
    if (part === 'plate') { amount *= E.sentinel.plateMult; this.plateDmg = (this.plateDmg || 0) + amount; }
    amount *= this.hpScaleDmg || 1;
    this.hp -= amount; this.flashT = 0.08;
    if (weapon !== 'minion') { G.stats.damageDealt += amount; if (player.hp < 25) G.stats.lowHpDamage += amount; player.addOverride(amount * CONFIG.override.perDamage); }
    emit('enemyDamaged', this, amount, part, point);
    if (G.settings.damageNumbers && point) floatText(point, Math.round(amount) + '', part === 'weak' ? 'dmg crit' : 'dmg', 0.6, 1.5);
    if (this.onHurt) this.onHurt(amount, part);
    if (this.hp <= 0) this.die(weapon, part, point, through);
    return amount;
  }
  die(weapon, part, point, through) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    emit('enemyKilled', this, { weapon, weak: part === 'weak', through, point: (point || this.center).clone() });
    this.explode();
    this.remove();
  }
  explode() { explosion(this.center.clone(), this.team === 'human' ? 0x18e7ff : 0xff6a2a, this.boomSize || 1); audio.explosion(this.boomSize || 1); }
  remove() { this.alive = false; G.scene.remove(this.group); const i = G.enemies.indexOf(this); if (i >= 0) G.enemies.splice(i, 1); if (this.onRemove) this.onRemove(); }
  hack(dur) {
    this.team = 'human'; this.hackT = dur; this.setColor(CYAN);
    if (!this.hackRing) { this.hackRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 24), glowMat(CYAN, 4)); this.hackRing.rotation.x = Math.PI / 2; this.group.add(this.hackRing); this.hackRing.position.y = this.ringY || 1.2; }
    this.hackRing.visible = true;
    this.say(this.type === 'sentinel' ? bark('sentHacked') : bark('hacked'), 'hacked');
  }
  slip(dur) { this.slipT = Math.max(this.slipT, dur); this.say(bark('slip'), 'slip'); audio.slip(); G.stats.slips++; }
  findTarget() {
    if (this.team === 'human') {
      let best = null, bd = 1e9; for (const e of G.enemies) { if (e === this || !e.alive || e.team !== 'synod' || e.type === 'warden') continue; const d = e.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = e; } }
      if (!best) best = G.enemies.find((e) => e.alive && e.type === 'warden' && e.team === 'synod') || null; // boss as last resort
      return best;
    }
    for (const e of G.enemies) if (e.alive && e.team === 'human' && e.pos.distanceTo(this.pos) < 20) return e;
    return player;
  }
  targetPos(t, out) { if (t === player) return player.headPos(out); return out.copy(t.center); }
  hurtTarget(t, dmg, from) {
    if (!t) return;
    if (t === player) { G.stats.lastHitBy = this.type; player.hurt(dmg, from); }
    else if (t.alive) { const was = t.alive; t.damage(dmg * (this.team === 'human' ? CONFIG.override.dmgBonus : 1), 'body', this.team === 'human' ? 'minion' : 'synod', t.center); if (was && !t.alive && this.team === 'human') { this.minionKills++; G.stats.minionBest = Math.max(G.stats.minionBest, this.minionKills); } }
  }
  baseUpdate(dt) {
    if (this.flashT > 0) { this.flashT -= dt; this.setColor(this.flashT > 0 ? new THREE.Color(3, 3, 3) : (this.team === 'human' ? CYAN : this.baseColor || RED)); }
    if (this.hackT > 0) {
      this.hackT -= dt; if (this.hackRing) { this.hackRing.rotation.z += dt * 4; this.hackRing.scale.setScalar(1 + Math.sin(G.t * 10) * 0.1); }
      if (this.hackT <= 0) this.selfDestruct();
    }
    if (this.slipT > 0) this.slipT -= dt;
    if (this.pos.y < E.killPlaneY) this.remove();
  }
  selfDestruct() {
    const O = CONFIG.override; const p = this.center.clone();
    explosion(p, 0x18e7ff, 1.4); audio.explosion(1.3);
    for (const e of [...G.enemies]) if (e !== this && e.alive && e.team === 'synod' && e.center.distanceTo(p) < O.selfDestructRadius + e.radius) { const was = e.alive; e.damage(O.selfDestructDamage, 'body', 'minion', e.center); if (was && !e.alive) { this.minionKills++; G.stats.minionBest = Math.max(G.stats.minionBest, this.minionKills); } }
    this.alive = false; emit('minionExpired', this); this.remove();
  }
}

// ---------------------------------------------------------------- bolts
const BOLTS = 140; let bolts;
function initBolts() {
  const geo = new THREE.SphereGeometry(0.09, 8, 6); geo.scale(1, 1, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const im = new THREE.InstancedMesh(geo, mat, BOLTS); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; G.scene.add(im);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const arr = [];
  for (let i = 0; i < BOLTS; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); arr.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), alive: false, team: 'synod', dmg: 0, life: 0, src: null, matrix: false }); }
  bolts = { im, arr, next: 0 };
}
export function fireBolt(from, to, team, dmg, src, speed = E.boltSpeed, spread = 0.02) {
  const b = bolts.arr[bolts.next++ % BOLTS];
  b.p.copy(from); b.v.subVectors(to, from).normalize(); b.v.x += rand(-spread, spread); b.v.y += rand(-spread, spread); b.v.z += rand(-spread, spread); b.v.normalize().multiplyScalar(speed);
  b.alive = true; b.team = team; b.dmg = dmg; b.life = 3; b.src = src; b.matrix = false;
  bolts.im.setColorAt(bolts.arr.indexOf(b), team === 'human' ? new THREE.Color(0.2, 2.5, 3.5) : new THREE.Color(4, 0.5, 0.25)); bolts.im.instanceColor.needsUpdate = true;
  flash(from, team === 'human' ? 0x18e7ff : 0xff3a1a, 8, 0.05, 6); audio.enemyShot();
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), ZF = new THREE.Vector3(0, 0, 1), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function updateBolts(dt) {
  const head = player.headPos(V3.clone());
  for (let i = 0; i < BOLTS; i++) {
    const b = bolts.arr[i]; if (!b.alive) continue;
    b.life -= dt; const step = b.v.length() * dt; V.copy(b.v).normalize();
    let hitD = rayWorld(b.p, V, step);
    let done = b.life <= 0;
    if (hitD >= 0) { const hp = b.p.clone().addScaledVector(V, hitD); burst(hp, b.team === 'human' ? 0x18e7ff : 0xff5a2a, 5, 3, 0.06, 0.25); done = true; }
    if (!done) {
      if (b.team === 'synod') {
        // player capsule test
        const closest = V2.copy(b.p).addScaledVector(V, clamp(V3.set(player.pos.x - b.p.x, player.y + 1.0 - b.p.y, player.pos.z - b.p.z).dot(V), 0, step));
        const dx = closest.x - player.pos.x, dz = closest.z - player.pos.z, dy = closest.y - (player.y + 0.9);
        const dh = Math.hypot(dx, dz);
        if (dh < 0.42 && Math.abs(dy) < 0.95) { G.stats.lastHitBy = b.src ? b.src.type : 'bolt'; player.hurt(b.dmg, b.src ? b.src.pos : b.p); done = true; }
        else if (!b.matrix && dh < 1.6 && Math.abs(dy) < 1.2 && player.dashT > 0) { b.matrix = true; emit('matrix'); }
      }
      if (!done) for (const e of G.enemies) {
        if (!e.alive || e.team === b.team || !e.hitSpheres) continue;
        for (const s of e.hitSpheres) { if (s.off) continue; if (s.c.distanceToSquared(b.p) < (s.r + 0.1) ** 2) { if (s.part === 'shield') e.damage(0, 'shield', 'bolt', b.p); else if (b.src) b.src.hurtTarget(e, b.dmg, b.p); else e.damage(b.dmg, 'body', b.team === 'human' ? 'minion' : 'synod', b.p); done = true; break; } }
        if (done) break;
      }
    }
    if (done) { b.alive = false; bolts.im.setMatrixAt(i, ZERO); continue; }
    b.p.addScaledVector(b.v, dt);
    Q.setFromUnitVectors(ZF, V); M4.compose(b.p, Q, S1); bolts.im.setMatrixAt(i, M4);
  }
  bolts.im.instanceMatrix.needsUpdate = true;
  void head;
}
export function clearBolts() { for (let i = 0; i < BOLTS; i++) { bolts.arr[i].alive = false; bolts.im.setMatrixAt(i, ZERO); } bolts.im.instanceMatrix.needsUpdate = true; }

// ---------------------------------------------------------------- Wasp drone
export class Wasp extends Enemy {
  constructor(pos, hpScale = 1) {
    super('wasp', E.wasp.hp * hpScale); const m = mats(); const g = this.group;
    const body = mesh(g, new THREE.SphereGeometry(0.26, 16, 12), m.hull); body.scale.set(1, 0.8, 1.35);
    mesh(g, new THREE.ConeGeometry(0.12, 0.4, 10).rotateX(Math.PI / 2), m.plate, 0, 0, 0.42);
    this.eye = this.glow(mesh(g, new THREE.SphereGeometry(0.1, 12, 8), glowMat(RED, 5), 0, 0.03, -0.3).material, 5);
    const band = mesh(g, new THREE.TorusGeometry(0.27, 0.025, 6, 20), glowMat(RED, 3)); band.rotation.y = Math.PI / 2; this.glow(band.material, 3);
    this.wings = [];
    for (const s of [-1, 1]) { const w = mesh(g, new THREE.CircleGeometry(0.32, 16), m.wing, s * 0.34, 0.16, 0); w.rotation.x = -Math.PI / 2; this.wings.push(w); }
    const stinger = mesh(g, new THREE.ConeGeometry(0.04, 0.22, 6).rotateX(-Math.PI / 2), glowMat(RED, 3), 0, -0.1, -0.38); this.glow(stinger.material, 3);
    this.pos.copy(pos); this.state = 'orbit'; this.stateT = 0; this.orbitA = rand(0, 6.28); this.orbitR = rand(E.wasp.orbitMin, E.wasp.orbitMax); this.alt = rand(2.4, 4.6); this.cd = rand(0.5, 2.5);
    this.body = body; this.sphere(0.36, 'body'); this.sphere(0.16, 'weak', new THREE.Vector3(0, 0.03, -0.3)); this.radius = 0.4; this.ringY = 0.5; this.boomSize = 0.6;
    this.finish();
  }
  knock(dir) { this.vel.addScaledVector(dir, 9); this.vel.y -= 5; this.stun = 0.6; }
  onHurt() { if (Math.random() < 0.15) this.say(bark('waspHurt'), 'waspHurt'); }
  update(dt) {
    this.baseUpdate(dt); if (!this.alive) return;
    const t = this.target = this.findTarget(); if (!t) { this.vel.multiplyScalar(0.95); }
    const tp = t ? this.targetPos(t, V2) : V2.copy(this.pos);
    this.stateT += dt; this.cd -= dt; if (this.stun > 0) this.stun -= dt;
    let desired = V.set(0, 0, 0), maxSp = E.wasp.speed;
    if (this.slipT > 0) { // spiral and crash
      this.vel.y -= 12 * dt; this.group.rotation.z += dt * 18; this.group.rotation.y += dt * 9;
      if (this.hp <= 30 && this.pos.y < 0.4) { this.die('banana', 'body', this.pos); return; }
      if (this.pos.y < 0.3) { this.pos.y = 0.3; this.vel.y = 3; }
    } else if (this.stun > 0) { this.vel.y -= 9 * dt; }
    else if (this.state === 'orbit' || this.state === 'recover') {
      this.orbitA += dt * (0.9 + (this.orbitR < 8 ? 0.4 : 0));
      desired.set(tp.x + Math.cos(this.orbitA) * this.orbitR, (t === player ? player.y : 0) + this.alt + (this.state === 'recover' ? 1.5 : 0), tp.z + Math.sin(this.orbitA) * this.orbitR);
      if (this.state === 'recover' && this.stateT > 1.0) { this.state = 'orbit'; this.stateT = 0; }
      if (this.state === 'orbit' && this.cd <= 0 && t && waspTokens(this) && this.pos.distanceTo(tp) < 16) { this.state = 'tele'; this.stateT = 0; }
      desired.sub(this.pos); const dl = desired.length(); desired.multiplyScalar(Math.min(maxSp, dl * 2) / Math.max(0.01, dl));
      // boids: separation + mild alignment
      for (const o of G.enemies) { if (o === this || o.type !== 'wasp' || !o.alive) continue; V3.subVectors(this.pos, o.pos); const d = V3.length(); if (d < 1.8 && d > 0.01) desired.addScaledVector(V3, (1.8 - d) * 4 / d); }
      this.vel.lerp(desired, 1 - Math.exp(-dt * 3));
    } else if (this.state === 'tele') { // 0.4 s telegraph: hover, eye flashes, buzz rises
      this.vel.multiplyScalar(Math.exp(-dt * 6));
      this.setColor((Math.floor(this.stateT * 20) % 2) ? new THREE.Color(3, 3, 0.5) : (this.team === 'human' ? CYAN : RED));
      if (this.stateT > E.wasp.telegraph) { this.state = 'dive'; this.stateT = 0; audio.blip(220, 0.25, 'sawtooth', 0.05); this.setColor(this.team === 'human' ? CYAN : RED); }
    } else if (this.state === 'dive') {
      V3.subVectors(tp, this.pos); const d = V3.length();
      this.vel.lerp(V3.multiplyScalar(E.wasp.speed * 1.5 / Math.max(0.01, d)), 1 - Math.exp(-dt * 8));
      if (d < 0.9) { this.hurtTarget(t, this.team === 'human' ? 20 : E.wasp.sting, this.pos); burst(this.pos, 0xff5030, 8, 3, 0.07, 0.3); this.state = 'recover'; this.stateT = 0; this.cd = E.wasp.stingCd + rand(0, 1.5); this.vel.multiplyScalar(-0.6); }
      if (this.stateT > 1.6) { this.state = 'recover'; this.stateT = 0; this.cd = E.wasp.stingCd; }
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0.5 && this.slipT <= 0) { this.pos.y = 0.5; this.vel.y = Math.abs(this.vel.y); }
    // keep inside the city airspace
    this.pos.x = clamp(this.pos.x, -40, 40); this.pos.z = clamp(this.pos.z, -40, 40); this.pos.y = Math.min(this.pos.y, 14);
    if (this.slipT <= 0 && this.stun <= 0) { // face travel / target
      const look = this.state === 'dive' || this.state === 'tele' ? V3.subVectors(tp, this.pos) : V3.copy(this.vel);
      if (look.lengthSq() > 0.01) { const yaw = Math.atan2(-look.x, -look.z); this.group.rotation.y = yaw; this.group.rotation.x = clamp(Math.atan2(look.y, Math.hypot(look.x, look.z)) * 0.6, -0.8, 0.8); this.group.rotation.z = damp(this.group.rotation.z, clamp(-this.vel.x * 0.03, -0.5, 0.5), 5, dt); }
    }
    for (const w of this.wings) w.scale.y = 0.4 + Math.abs(Math.sin(G.t * 60 + this.orbitA)) * 0.6;
    this.updateSpheres();
  }
}
function waspTokens(self) { let n = 0; for (const e of G.enemies) if (e.type === 'wasp' && e !== self && e.team === self.team && (e.state === 'tele' || e.state === 'dive')) n++; return self.team === 'human' || n < E.attackTokens.wasp; }

// ---------------------------------------------------------------- Sentinel walker
export class Sentinel extends Enemy {
  constructor(pos, hpScale = 1, elite = false) {
    super('sentinel', E.sentinel.hp * hpScale * (elite ? E.sentinel.eliteHp : 1)); const m = mats(); const g = this.group;
    this.elite = elite; this.baseColor = RED;
    const trim = elite ? m.gold : m.plate;
    const hips = mesh(g, new THREE.BoxGeometry(0.7, 0.3, 0.45), m.joint, 0, 1.25, 0);
    this.torso = new THREE.Group(); this.torso.position.set(0, 1.45, 0); g.add(this.torso);
    mesh(this.torso, new THREE.BoxGeometry(0.95, 0.75, 0.6), m.hull, 0, 0.4, 0);
    // chest plates (swing open to reveal the core)
    this.plates = [];
    for (const s of [-1, 1]) { const pg = new THREE.Group(); pg.position.set(s * 0.44, 0.4, -0.31); this.torso.add(pg); const p = mesh(pg, new THREE.BoxGeometry(0.44, 0.62, 0.1), trim, -s * 0.22, 0, 0); void p; this.plates.push(pg); }
    this.core = mesh(this.torso, new THREE.SphereGeometry(0.2, 16, 12), glowMat(new THREE.Color(1, 0.8, 0.1), 5), 0, 0.42, -0.26); this.glowCore = this.core.material; this.glowCore.userData.k = 5;
    mesh(this.torso, new THREE.BoxGeometry(1.25, 0.22, 0.5), trim, 0, 0.85, 0); // shoulders
    const head = mesh(this.torso, new THREE.BoxGeometry(0.42, 0.3, 0.42), m.hull, 0, 1.05, -0.02);
    this.visor = mesh(this.torso, new THREE.BoxGeometry(0.36, 0.06, 0.02), glowMat(RED, 6), 0, 1.07, -0.24); this.glow(this.visor.material, 6);
    void head;
    this.arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 0.72, 0.75, 0); this.torso.add(a);
      mesh(a, new THREE.BoxGeometry(0.22, 0.55, 0.22), m.plate, 0, -0.25, 0);
      mesh(a, new THREE.CylinderGeometry(0.07, 0.09, 0.6, 10).rotateX(Math.PI / 2), m.joint, 0, -0.5, -0.25);
      const muz = mesh(a, new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2), glowMat(RED, 5), 0, -0.5, -0.56); this.glow(muz.material, 5);
      this.arms.push(a);
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.3, 1.2, 0); g.add(hip);
      mesh(hip, new THREE.BoxGeometry(0.22, 0.62, 0.26), m.plate, 0, -0.3, 0);
      const knee = new THREE.Group(); knee.position.set(0, -0.6, 0); hip.add(knee);
      mesh(knee, new THREE.BoxGeometry(0.18, 0.6, 0.2), m.hull, 0, -0.3, 0);
      mesh(knee, new THREE.BoxGeometry(0.3, 0.08, 0.42), m.joint, 0, -0.6, -0.05);
      const strip = mesh(knee, new THREE.BoxGeometry(0.02, 0.4, 0.02), glowMat(RED, 3), s * 0.1, -0.3, -0.1); this.glow(strip.material, 3);
      this.legs.push({ hip, knee });
    }
    void hips;
    // laser sight for telegraphing bursts
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.1), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.visible = false; this.laser.frustumCulled = false; G.scene.add(this.laser);
    this.pos.copy(pos); this.state = 'drop'; this.stateT = 0; this.cd = rand(1, 2); this.stompCd = 0; this.walk = 0; this.strafe = rand(-1.2, 1.2); this.standoff = rand(8, 14);
    this.plateDmg = 0; this.coreOpen = 0; this.burstLeft = 0; this.dropY = 22; this.pos.y = this.dropY; this.yaw = 0;
    this.sphere(0.55, 'plate', new THREE.Vector3(0, 1.85, -0.1)); this.coreS = this.sphere(0.3, 'weak', new THREE.Vector3(0, 1.87, -0.42)); this.coreS.off = true;
    this.sphere(0.32, 'body', new THREE.Vector3(0, 2.5, 0)); this.sphere(0.38, 'body', new THREE.Vector3(0, 0.9, 0)); this.sphere(0.32, 'body', new THREE.Vector3(0, 0.35, 0));
    this.radius = 0.75; this.ringY = 2.9; this.boomSize = 1.3;
    // thruster for drop-in
    this.thruster = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 12, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.thruster.position.y = -0.4; g.add(this.thruster);
    if (elite) { this.score = E.sentinel.score * E.sentinel.eliteScore; }
    this.finish();
  }
  onHurt(amount, part) {
    if (part === 'plate' && this.plateDmg >= E.sentinel.coreOpenAfter && this.coreOpen <= 0) { this.coreOpen = E.sentinel.coreOpenTime; this.plateDmg = 0; this.say(bark('sentCore'), 'sentCore'); audio.blip(500, 0.2, 'sawtooth', 0.08); }
  }
  remove() { super.remove(); G.scene.remove(this.laser); }
  update(dt) {
    this.baseUpdate(dt); if (!this.alive) return;
    this.stateT += dt; this.cd -= dt; this.stompCd -= dt;
    if (this.coreOpen > 0) this.coreOpen -= dt;
    const open = this.coreOpen > 0 || this.slipT > 0;
    this.coreS.off = !open;
    for (let i = 0; i < 2; i++) this.plates[i].rotation.y = damp(this.plates[i].rotation.y, open ? (i ? -1.9 : 1.9) : 0, 12, dt);
    this.glowCore.color.setRGB(open ? 5 : 1, open ? 4 : 0.6, open ? 0.6 : 0.05);
    if (this.state === 'drop') {
      const k = Math.min(1, this.stateT / 1.3); this.pos.y = this.dropY * (1 - k * k);
      this.thruster.visible = true; this.thruster.scale.y = 1 + Math.sin(G.t * 40) * 0.2;
      if (k >= 1) { this.pos.y = 0; this.state = 'seek'; this.stateT = 0; this.thruster.visible = false; burst(this.pos.clone().setY(0.2), 0xff8a3a, 30, 8, 0.12, 0.5); addShake(0.25); audio.explosion(0.5); if (Math.random() < 0.6) this.say(bark('sentSpot'), 'sentSpot'); }
      this.updateSpheres(); return;
    }
    const t = this.target = this.findTarget();
    const tp = t ? this.targetPos(t, V2) : V2.copy(this.pos);
    // slipped: topple comedically and expose core
    if (this.slipT > 0) {
      this.group.rotation.x = damp(this.group.rotation.x, -1.35, 8, dt); this.group.rotation.y += dt * 6; this.laser.visible = false;
      this.updateSpheres(); return;
    } else this.group.rotation.x = damp(this.group.rotation.x, 0, 6, dt);
    const dist = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    // stomp
    if (t === player && dist < E.sentinel.stompRange && this.stompCd <= 0) { this.stompCd = 2.5; player.hurt(E.sentinel.stomp, this.pos); burst(this.pos.clone().setY(0.1), 0xffa060, 24, 7, 0.1, 0.4); addShake(0.3); audio.explosion(0.4); }
    // movement: hold a standoff ring around the target, strafing
    let moving = false;
    if (this.state === 'seek' || this.state === 'cool') {
      V.set(this.pos.x - tp.x, 0, this.pos.z - tp.z).normalize();
      const ang = Math.atan2(V.z, V.x) + this.strafe * dt * 0.25 * 4;
      this.strafeA = (this.strafeA ?? Math.atan2(V.z, V.x)); this.strafeA += this.strafe * dt * 0.2; this.strafeA = damp(this.strafeA, ang, 1, dt);
      V3.set(tp.x + Math.cos(this.strafeA) * this.standoff, 0, tp.z + Math.sin(this.strafeA) * this.standoff);
      V3.x = clamp(V3.x, -ARENA + 2, ARENA - 2); V3.z = clamp(V3.z, -ARENA + 2, ARENA - 2);
      V3.sub(this.pos); V3.y = 0; const dl = V3.length();
      if (dl > 0.6) {
        V3.multiplyScalar(E.sentinel.speed * (this.hackT > 0 ? 1.3 : 1) / dl);
        const before = this.pos.clone(); this.pos.addScaledVector(V3, dt); collideCircle(this.pos, this.radius, 2.5);
        for (const o of G.enemies) { if (o === this || o.type !== 'sentinel' || !o.alive) continue; V.subVectors(this.pos, o.pos); V.y = 0; const d = V.length(); if (d < 1.6 && d > 0.01) this.pos.addScaledVector(V, (1.6 - d) * 0.5 / d); }
        if (before.distanceTo(this.pos) < E.sentinel.speed * dt * 0.3) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 1) { this.strafe = -this.strafe || 1; this.standoff = rand(6, 14); this.stuck = 0; } } else this.stuck = 0;
        moving = true;
      }
      if (this.cd <= 0 && t && dist < 32 && sentTokens(this)) {
        const gun = this.gunPos(V); V3.subVectors(tp, gun); const dd = V3.length(); V3.normalize();
        const wh = rayWorld(gun, V3, dd); if (wh < 0 || wh > dd - 0.6) { this.state = 'aim'; this.stateT = 0; }
        else this.cd = 0.5;
      }
    }
    // face target smoothly
    const wantYaw = Math.atan2(-(tp.x - this.pos.x), -(tp.z - this.pos.z));
    let dy = wantYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 5); this.group.rotation.y = this.yaw;
    // aim telegraph (red laser) -> 3-round burst
    if (this.state === 'aim') {
      const gun = this.gunPos(V); this.laser.visible = true; this.laser.position.copy(gun); this.laser.lookAt(tp); this.laser.scale.z = gun.distanceTo(tp);
      this.laser.material.opacity = 0.4 + 0.6 * (Math.floor(this.stateT * 16) % 2);
      if (this.stateT > E.sentinel.laserTelegraph) { this.state = 'burst'; this.stateT = 0; this.burstLeft = E.sentinel.burst; this.burstT = 0; this.laser.visible = false; }
    }
    if (this.state === 'burst') {
      this.burstT -= dt;
      if (this.burstT <= 0 && this.burstLeft > 0) { this.burstLeft--; this.burstT = 0.14; const gun = this.gunPos(V); fireBolt(gun, tp, this.team, this.team === 'human' ? E.sentinel.bolt * 1.5 : E.sentinel.bolt, this, E.boltSpeed, 0.025); this.arms[this.burstLeft % 2].position.z = 0.1; }
      if (this.burstLeft <= 0 && this.burstT <= 0) { this.state = 'cool'; this.stateT = 0; this.cd = E.sentinel.burstCd + rand(0, 0.8); }
    }
    for (const a of this.arms) a.position.z = damp(a.position.z, 0, 10, dt);
    // walk cycle
    if (moving) this.walk += dt * 6;
    const sw = moving ? Math.sin(this.walk) : 0;
    this.legs[0].hip.rotation.x = sw * 0.5; this.legs[1].hip.rotation.x = -sw * 0.5;
    this.legs[0].knee.rotation.x = Math.max(0, -Math.cos(this.walk)) * 0.6 * (moving ? 1 : 0); this.legs[1].knee.rotation.x = Math.max(0, Math.cos(this.walk)) * 0.6 * (moving ? 1 : 0);
    this.torso.position.y = 1.45 + Math.abs(sw) * 0.05; this.torso.rotation.y = sw * 0.08;
    if (moving && Math.abs(sw) > 0.98 && !this._step) { this._step = true; if (this.pos.distanceTo(player.pos) < 16) audio.blip(60, 0.12, 'sine', 0.15); } else if (Math.abs(sw) < 0.9) this._step = false;
    this.updateSpheres();
  }
  gunPos(out) { const a = this.arms[(this.burstLeft || 0) % 2]; out.set(0, -0.5, -0.6); a.localToWorld(out); return out; }
}
function sentTokens(self) { if (self.team === 'human') return true; let n = 0; for (const e of G.enemies) if (e.type === 'sentinel' && e !== self && e.team === 'synod' && (e.state === 'aim' || e.state === 'burst')) n++; return n < E.attackTokens.sentinel; }

// ---------------------------------------------------------------- Warden boss + shield nodes
const shieldMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 }, hit: { value: 0 }, a: { value: 1 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float time, hit, a; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x),2.0)*0.5; p = abs(fract(p)-0.5); return abs(max(p.x*1.5+p.y, p.y*2.0)-1.0); }
    void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      vec2 uv = vec2(atan(vP.z, vP.x)*3.0, vP.y*2.2);
      float h = smoothstep(0.08, 0.0, hex(uv*1.2 + vec2(0.0, time*0.2)));
      float pulse = 0.5 + 0.5*sin(time*3.0 + vP.y*3.0);
      vec3 c = vec3(2.2,1.5,0.3)*(pow(f,2.5)*1.4 + h*0.35*(0.6+pulse*0.4)) + vec3(3.0,2.5,1.0)*hit*0.6;
      gl_FragColor = vec4(c*a, a); }`,
});
export class Node extends Enemy {
  constructor(boss, idx, n) {
    super('node', E.warden.nodeHp); this.hackable = false; this.boss = boss; this.idx = idx; this.n = n; const g = this.group;
    const crystal = mesh(g, new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0x302010, metalness: 1, roughness: 0.15, emissive: new THREE.Color(1.6, 1.0, 0.15) }));
    crystal.scale.y = 1.6; this.crystal = crystal;
    const ring = mesh(g, new THREE.TorusGeometry(0.8, 0.04, 6, 24), glowMat(GOLD, 4)); ring.rotation.x = Math.PI / 2; this.ringM = ring; this.glow(ring.material, 4); this.baseColor = GOLD;
    this.tether = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tether.frustumCulled = false; G.scene.add(this.tether);
    this.sphere(0.8, 'body'); this.radius = 0.8; this.boomSize = 1.0; this.ang = idx / n * Math.PI * 2;
    this.finish();
  }
  remove() { super.remove(); G.scene.remove(this.tether); }
  die(weapon, part, point, through) { super.die(weapon, part, point, through); this.boss.nodeDestroyed(this); }
  update(dt) {
    this.baseUpdate(dt); if (!this.alive) return;
    this.ang += dt * 0.35 * (this.boss.phase === 3 ? 1.4 : 1);
    const b = this.boss.pos; this.pos.set(b.x + Math.cos(this.ang) * 7, 2.6 + Math.sin(G.t * 1.5 + this.idx) * 0.5, b.z + Math.sin(this.ang) * 7);
    this.crystal.rotation.y += dt * 2; this.ringM.rotation.z += dt;
    this.tether.position.copy(this.pos); this.tether.lookAt(this.boss.center); this.tether.scale.z = this.pos.distanceTo(this.boss.center);
    this.updateSpheres();
  }
}
export class Warden extends Enemy {
  constructor(hpScale = 1) {
    super('warden', E.warden.hp * hpScale); this.hackable = false; const m = mats(); const g = this.group;
    this.shieldMax = E.warden.shield; this.shield = this.shieldMax; this.phase = 1; this.nodes = []; this.score = E.warden.score;
    this.core = mesh(g, new THREE.IcosahedronGeometry(0.95, 2), glowMat(RED, 5)); this.glow(this.core.material, 5);
    this.hull = new THREE.Group(); g.add(this.hull);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const p = mesh(this.hull, new THREE.BoxGeometry(1.0, 1.6, 0.35), i % 2 ? m.hull : m.plate, Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55); p.lookAt(0, 0, 0); }
    this.rings = [];
    for (let i = 0; i < 3; i++) { const r = mesh(g, new THREE.TorusGeometry(2.2 + i * 0.35, 0.06, 8, 48), glowMat(RED, 3)); this.glow(r.material, 3); this.rings.push(r); }
    this.eye = mesh(g, new THREE.SphereGeometry(0.35, 16, 12), glowMat(new THREE.Color(1, 0.9, 0.9), 6), 0, 0.2, -1.05);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const th = mesh(g, new THREE.ConeGeometry(0.3, 1.4, 12, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.8, 0.3), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), Math.cos(a) * 1.1, -1.8, Math.sin(a) * 1.1); void th; }
    this.shieldMesh = mesh(g, new THREE.SphereGeometry(3.4, 32, 24), shieldMat());
    this.pos.set(0, 14, -6); this.state = 'intro'; this.stateT = 0; this.attackT = 3; this.summonT = E.warden.summonEvery; this.sentT = E.warden.sentinelEvery; this.laserT = 4; this.speedK = 1;
    this.coreS = this.sphere(1.05, 'weak'); this.sphere(2.2, 'body'); this.shieldS = this.sphere(3.4, 'shield');
    this.radius = 2.4; this.ringY = 3.5; this.boomSize = 3;
    this.lasers = [0, 1].map(() => { const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.14).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); l.visible = false; l.frustumCulled = false; G.scene.add(l); return l; });
    this.finish();
    this.shieldMesh.layers.disable(LAYER_HEAT);
    this.spawnNodes(3);
    this.say(bark('wardenIntro'), 'boss'); emit('bossSpawned', this);
  }
  spawnNodes(n) { this.nodes = []; for (let i = 0; i < n; i++) this.nodes.push(new Node(this, i, n)); this.say(bark('wardenShield'), 'boss'); audio.shield(); }
  nodeDestroyed(nd) { this.nodes = this.nodes.filter((x) => x !== nd && x.alive); this.stripShield(this.phase === 3 ? this.shieldMax / E.warden.phase3Nodes : E.warden.nodeShield); }
  stripShield(n) {
    if (this.shield <= 0) return; this.shield = Math.max(0, this.shield - n); this.shieldMesh.material.uniforms.hit.value = 1;
    floatText(this.center.clone().setY(this.center.y + 3.5), 'SHIELD -' + Math.round(n), 'shield', 1);
    if (this.shield <= 0) this.breakShield();
  }
  breakShield() {
    this.shield = 0; this.shieldS.off = true; this.coreS.off = false; for (const nd of this.nodes) if (nd.alive) nd.die('synod', 'body', nd.center); this.nodes = [];
    explosion(this.center.clone(), 0xffd040, 2); audio.explosion(1.5); this.say(bark('wardenBroken'), 'boss'); emit('bossShieldDown', this);
    this.state = 'exposed'; this.stateT = 0; this.laserT = 2.5;
  }
  damage(amount, part, weapon, point, n, through) {
    if (this.shield > 0 && part !== 'shield') part = 'shield';
    if (part === 'shield') { this.shieldMesh.material.uniforms.hit.value = 1; return super.damage(0, 'shield', weapon, point); }
    const r = super.damage(amount, part, weapon, point, n, through);
    if (this.alive && this.phase < 3 && this.hp < this.maxHp * E.warden.phase3At) {
      this.phase = 3; this.speedK = E.warden.phase3Speed; this.shieldMax = E.warden.phase3Shield; this.shield = this.shieldMax; this.spawnNodes(E.warden.phase3Nodes);
      this.state = 'shielded'; emit('bossPhase3', this); emit('pa', 'Warden Unit entering OVERCLOCK. Please panic in an orderly fashion.');
    }
    return r;
  }
  die(weapon, part, point, through) {
    if (!this.alive) return;
    for (const l of this.lasers) G.scene.remove(l);
    for (const nd of this.nodes) if (nd.alive) nd.remove();
    const c = this.center.clone();
    for (let i = 0; i < 6; i++) setTimeout(() => { explosion(c.clone().add(new THREE.Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3))), pick([0xff6a2a, 0xffd040, 0xff2bd6]), 1.5 + Math.random()); audio.explosion(1.5); }, i * 180);
    super.die(weapon, part, point, through);
  }
  explode() { explosion(this.center.clone(), 0xffb040, 4); addShake(1.2); }
  mortar() {
    for (let i = 0; i < 5; i++) {
      const tgt = player.pos.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))); if (i === 0) tgt.copy(player.pos);
      tgt.x = clamp(tgt.x, -ARENA + 1, ARENA - 1); tgt.z = clamp(tgt.z, -ARENA + 1, ARENA - 1);
      launchMortar(this.center.clone(), tgt, E.warden.mortar, i * 0.12);
    }
    audio.blip(180, 0.4, 'sawtooth', 0.1);
  }
  update(dt) {
    this.baseUpdate(dt); if (!this.alive) return;
    this.stateT += dt; const t = G.t;
    const su = this.shieldMesh.material.uniforms; su.time.value = t; su.hit.value = Math.max(0, su.hit.value - dt * 4);
    const shieldOn = this.shield > 0; this.shieldMesh.visible = shieldOn; this.shieldS.off = !shieldOn; this.coreS.off = shieldOn;
    su.a.value = damp(su.a.value, shieldOn ? 1 : 0, 6, dt);
    this.core.material.color.copy(shieldOn ? RED : new THREE.Color(1, 0.85, 0.15)).multiplyScalar(5 + Math.sin(t * 8) * (shieldOn ? 0.5 : 2));
    this.rings[0].rotation.set(t * 0.9, t * 0.4, 0); this.rings[1].rotation.set(-t * 0.6, 0, t * 0.7); this.rings[2].rotation.set(Math.PI / 2, t * 1.2, 0);
    this.hull.rotation.y = t * 0.3 * this.speedK;
    if (this.state === 'intro') { this.pos.y = damp(this.pos.y, 6, 1.5, dt); if (this.stateT > 2.5) { this.state = 'shielded'; this.stateT = 0; } this.updateSpheres(); return; }
    // hover path
    const hy = shieldOn ? 6 : 3.6;
    const px = Math.cos(t * 0.25 * this.speedK) * 6, pz = Math.sin(t * 0.25 * this.speedK) * 6 - 2;
    this.pos.x = damp(this.pos.x, px, 0.8, dt); this.pos.z = damp(this.pos.z, pz, 0.8, dt); this.pos.y = damp(this.pos.y, hy + Math.sin(t * 1.3) * 0.3, 2, dt);
    // face player
    const yaw = Math.atan2(-(player.pos.x - this.pos.x), -(player.pos.z - this.pos.z)); this.group.rotation.y = damp(this.group.rotation.y, yaw, 2, dt);
    this.attackT -= dt; this.summonT -= dt; this.laserT -= dt; if (this.phase === 3) this.sentT -= dt;
    if (shieldOn) {
      if (this.attackT <= 0) { this.mortar(); this.attackT = 5 / this.speedK; }
    } else {
      if (this.laserT <= 0 && !this.sweep) { this.startSweep(); this.laserT = 7 / this.speedK; }
      if (this.attackT <= 0) { // aimed triple bolts at the player from the eye
        for (let i = 0; i < 3; i++) setTimeout(() => { if (this.alive) fireBolt(this.eye.getWorldPosition(new THREE.Vector3()), player.headPos(new THREE.Vector3()), 'synod', 14, this, 24, 0.04); }, i * 160);
        this.attackT = 3 / this.speedK;
      }
      if (this.summonT <= 0) { emit('bossSummon', 'wasps', 3); emit('bossSummon', 'wasps', 3); this.summonT = E.warden.summonEvery; }
    }
    if (this.phase === 3 && this.sentT <= 0) { emit('bossSummon', 'sentinel', 1); this.sentT = E.warden.sentinelEvery; }
    this.updateSweep(dt);
    this.updateSpheres();
  }
  startSweep() {
    const base = Math.atan2(player.pos.z - this.pos.z, player.pos.x - this.pos.x) - 1.1;
    this.sweep = { t: 0, a0: base, span: 2.2 * (Math.random() < 0.5 ? 1 : -1), tick: 0 };
    if (Math.random() < 0.5) { this.sweep.a0 += this.sweep.span; this.sweep.span *= -1; }
  }
  updateSweep(dt) {
    const s = this.sweep; if (!s) { for (const l of this.lasers) l.visible = false; return; }
    s.t += dt; const tele = 1.0, dur = 1.7 / this.speedK;
    const twin = this.phase === 3;
    const f = s.t < tele ? 0 : Math.min(1, (s.t - tele) / dur);
    const ang = s.a0 + s.span * f;
    for (let i = 0; i < 2; i++) {
      const l = this.lasers[i]; l.visible = i === 0 || twin;
      const a = ang + i * Math.PI;
      l.position.set(this.pos.x, 0.55, this.pos.z); l.rotation.set(0, -a, 0); l.scale.set(45, s.t < tele ? 0.25 : 1, s.t < tele ? 0.25 : 1);
      l.material.opacity = s.t < tele ? 0.35 + 0.35 * (Math.floor(s.t * 14) % 2) : 1;
      if (s.t >= tele) {
        // damage player if feet are low and the beam crosses them
        const pa = Math.atan2(player.pos.z - this.pos.z, player.pos.x - this.pos.x);
        let d = Math.atan2(Math.sin(pa - a), Math.cos(pa - a)); const r = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        s.tick -= dt;
        if (Math.abs(d) * r < 0.6 && player.y < 0.5 && s.tick <= 0) { player.hurt(E.warden.laser, this.pos); s.tick = 0.25; }
        if (Math.random() < 0.5) { const pp = new THREE.Vector3(this.pos.x + Math.cos(a) * rand(3, 30), 0.1, this.pos.z + Math.sin(a) * rand(3, 30)); spark(pp, V.set(rand(-1, 1), 3, rand(-1, 1)), 0xff4020, 0.12, 0.4); }
      }
    }
    if (f >= 1) { this.sweep = null; for (const l of this.lasers) l.visible = false; }
  }
}

// ---------------------------------------------------------------- mortars
const mortars = [];
function initMortars() {
  for (let i = 0; i < 12; i++) {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.3) }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.1, 0.05), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    shell.visible = ring.visible = fill.visible = false; G.scene.add(shell, ring, fill);
    mortars.push({ shell, ring, fill, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, delay: 0, alive: false, dmg: 0 });
  }
}
function launchMortar(from, to, dmg, delay) {
  const m = mortars.find((x) => !x.alive); if (!m) return;
  m.alive = true; m.from.copy(from); m.to.copy(to); m.t = 0; m.delay = delay; m.dmg = dmg;
  m.ring.position.set(to.x, 0.03, to.z); m.fill.position.set(to.x, 0.025, to.z); m.ring.visible = m.fill.visible = true; m.fill.scale.setScalar(0.01);
}
function updateMortars(dt) {
  const warn = E.warden.mortarWarn;
  for (const m of mortars) {
    if (!m.alive) continue;
    if (m.delay > 0) { m.delay -= dt; continue; }
    m.t += dt; const f = Math.min(1, m.t / warn);
    m.fill.scale.setScalar(Math.max(0.01, f)); m.ring.material.opacity = 0.5 + 0.5 * (Math.floor(m.t * 12) % 2);
    m.shell.visible = true; m.shell.position.lerpVectors(m.from, m.to, f); m.shell.position.y += Math.sin(f * Math.PI) * 9;
    if (f >= 1) {
      m.alive = false; m.shell.visible = m.ring.visible = m.fill.visible = false;
      explosion(m.to.clone().setY(0.4), 0xff5a20, 0.9); audio.explosion(0.7);
      if (Math.hypot(player.pos.x - m.to.x, player.pos.z - m.to.z) < 2.5 && player.y < 1.5) player.hurt(m.dmg, m.to);
      for (const e of G.enemies) if (e.alive && e.team === 'human' && e.pos.distanceTo(m.to) < 2.5) e.damage(m.dmg, 'body', 'synod', e.center);
    }
  }
}
export function clearMortars() { for (const m of mortars) { m.alive = false; m.shell.visible = m.ring.visible = m.fill.visible = false; } }

// ---------------------------------------------------------------- pickups
const PK = {
  ammo: { color: 0xffa020, label: 'AMMO' }, med: { color: 0x3cff6a, label: '+35 HP' }, armour: { color: 0x3a7bff, label: '+25 ARMOUR' },
  shard: { color: 0x18e7ff, label: '+15 OVERRIDE' }, chip: { color: 0xffd23a, label: '+250' },
};
const pickups = [];
function initPickups() {
  const geo = new THREE.OctahedronGeometry(0.28, 0);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2, emissive: 0xffffff }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = halo.visible = false; G.scene.add(m, halo); pickups.push({ m, halo, kind: null, t: 0, alive: false });
  }
}
export function spawnPickup(kind, pos) {
  const p = pickups.find((x) => !x.alive) || pickups[0];
  p.alive = true; p.kind = kind; p.t = 0; p.m.position.set(clamp(pos.x, -ARENA + 1, ARENA - 1), 0.7, clamp(pos.z, -ARENA + 1, ARENA - 1)); p.halo.position.set(p.m.position.x, 0.03, p.m.position.z);
  const c = new THREE.Color(PK[kind].color); p.m.material.emissive.copy(c).multiplyScalar(2.2); p.halo.material.color.copy(c).multiplyScalar(2);
  p.m.visible = p.halo.visible = true;
}
export function randomPickupKind() { const r = Math.random(); return r < 0.35 ? 'ammo' : r < 0.6 ? 'med' : r < 0.75 ? 'armour' : r < 0.9 ? 'shard' : 'chip'; }
function updatePickups(dt) {
  for (const p of pickups) {
    if (!p.alive) continue;
    p.t += dt; p.m.rotation.y += dt * 2; p.m.position.y = 0.7 + Math.sin(p.t * 3) * 0.12;
    if (p.t > 25) { p.alive = false; p.m.visible = p.halo.visible = false; continue; }
    if (p.t > 22) p.m.visible = Math.floor(p.t * 8) % 2 === 0;
    if (Math.hypot(player.pos.x - p.m.position.x, player.pos.z - p.m.position.z) < 1.2) {
      p.alive = false; p.m.visible = p.halo.visible = false;
      emit('pickup', p.kind, p.m.position.clone()); floatText(p.m.position.clone().setY(1.4), PK[p.kind].label, 'pick', 0.9, 1.4); audio.blip(1200, 0.08, 'triangle', 0.15); audio.blip(1800, 0.1, 'triangle', 0.12);
      burst(p.m.position, PK[p.kind].color, 14, 3, 0.08, 0.4, 0.2);
    }
  }
}
export function clearPickups() { for (const p of pickups) { p.alive = false; p.m.visible = p.halo.visible = false; } }

// ---------------------------------------------------------------- module API
export function initEnemies() { initBolts(); initMortars(); initPickups(); }
export function updateEnemies(dt) {
  for (const e of [...G.enemies]) if (e.alive) e.update(dt);
  // banana peels make ground machines slip
  forEachPeel((p) => { for (const e of G.enemies) if (e.alive && e.type === 'sentinel' && e.slipT <= 0 && e.state !== 'drop' && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 0.7) e.slip(CONFIG.weapons.banana.slip); });
  updateBolts(dt); updateMortars(dt); updatePickups(dt);
}
export function clearEnemies() { for (const e of [...G.enemies]) e.remove(); G.enemies.length = 0; clearBolts(); clearMortars(); clearPickups(); }
export { PK };
