// OVERRIDE — pooled visual effects: tracers, arcs, rail beams, sparks, explosions, debris, peels, flashes, floating text.
import { THREE, G, rand, pick } from './core.js';
import { bananaGeometry } from './world.js';

export const fx = { shake: 0, shakeOn: true };
const V = new THREE.Vector3(), V2 = new THREE.Vector3();

// --- dynamic lights (fixed pool -> never change light count -> no shader recompiles mid-fight) ---
const lights = [];
function initLights() { for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.8); G.scene.add(l); lights.push({ l, t: 0, dur: 1, i0: 0 }); } }
export function flash(pos, color, intensity = 30, dur = 0.08, dist = 14) {
  let s = lights[0]; for (const x of lights) { if (x.t <= 0) { s = x; break; } if (x.t < s.t) s = x; }
  s.l.position.copy(pos); s.l.color.set(color); s.l.distance = dist; s.i0 = intensity; s.t = s.dur = dur; s.l.intensity = intensity;
}

// --- tracers ---
const tracers = [];
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
function initTracers() {
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; m.frustumCulled = false; G.scene.add(m); tracers.push({ m, t: 0, dur: 0.1, w: 0.03 });
  }
}
let ti = 0;
export function tracer(a, b, color, width = 0.03, dur = 0.08, k = 4) {
  const s = tracers[ti++ % tracers.length];
  s.m.position.copy(a); s.m.lookAt(b); s.m.scale.set(width, width, Math.max(0.01, a.distanceTo(b)));
  s.m.material.color.set(color).multiplyScalar(k); s.m.material.opacity = 1; s.m.visible = true; s.t = s.dur = dur; s.w = width;
}

// --- arc lightning ---
const arcs = [];
function initArcs() {
  for (let i = 0; i < 16; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.visible = false; l.frustumCulled = false; G.scene.add(l); arcs.push({ l, t: 0 });
  }
}
let ai = 0;
export function arc(a, b, color) {
  const s = arcs[ai++ % arcs.length]; const p = s.l.geometry.attributes.position; const n = 10, len = a.distanceTo(b);
  for (let i = 0; i < n; i++) { const f = i / (n - 1); V.lerpVectors(a, b, f); if (i > 0 && i < n - 1) V.add(V2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(len * 0.035)); p.setXYZ(i, V.x, V.y, V.z); }
  p.needsUpdate = true; s.l.material.color.set(color).multiplyScalar(5); s.l.material.opacity = 1; s.l.visible = true; s.t = 0.09;
}

// --- rail beams ---
const beams = [];
function initBeams() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  for (let i = 0; i < 4; i++) {
    const core = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.add(glow); glow.scale.set(3.5, 3.5, 1); core.visible = false; core.frustumCulled = glow.frustumCulled = false; G.scene.add(core); beams.push({ m: core, glow, t: 0, w: 0.03 });
  }
}
let bi = 0;
export function beam(a, b, color, power = 1) {
  const s = beams[bi++ % beams.length]; s.m.position.copy(a); s.m.lookAt(b); s.w = 0.025 + power * 0.03; s.m.scale.set(s.w, s.w, Math.max(0.01, a.distanceTo(b)));
  s.m.material.color.setRGB(4, 4, 4); s.glow.material.color.set(color).multiplyScalar(2.5); s.m.visible = true; s.t = 0.8;
  const n = Math.min(40, Math.floor(a.distanceTo(b) * 1.2));
  for (let i = 0; i < n; i++) { V.lerpVectors(a, b, Math.random()); spark(V, V2.set(rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1)), color, 0.08, 0.8, 0.2); }
}

// --- spark particles ---
const SP = 1500; let sp;
export let sparkBudget = SP;
export function setSparkBudget(n) { sparkBudget = Math.min(SP, n); }
function initSparks() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(SP * 3), col = new Float32Array(SP * 3), size = new Float32Array(SP);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { scale: { value: 600 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float scale; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.05,d); gl_FragColor = vec4(vC*a, a); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; G.scene.add(pts);
  sp = { g, pos, col, size, m, vel: new Float32Array(SP * 3), life: new Float32Array(SP), max: new Float32Array(SP), base: new Float32Array(SP * 3), s0: new Float32Array(SP), grav: new Float32Array(SP), next: 0 };
}
const _c = new THREE.Color();
export function spark(p, v, color, size = 0.12, life = 0.4, grav = 1) {
  const i = sp.next++ % sparkBudget; sp.pos[i * 3] = p.x; sp.pos[i * 3 + 1] = p.y; sp.pos[i * 3 + 2] = p.z;
  sp.vel[i * 3] = v.x; sp.vel[i * 3 + 1] = v.y; sp.vel[i * 3 + 2] = v.z;
  _c.set(color); sp.base[i * 3] = _c.r * 4; sp.base[i * 3 + 1] = _c.g * 4; sp.base[i * 3 + 2] = _c.b * 4;
  sp.life[i] = sp.max[i] = life * rand(0.6, 1.2); sp.s0[i] = size; sp.grav[i] = grav;
}
export function burst(p, color, n = 14, speed = 6, size = 0.1, life = 0.45, grav = 1) {
  for (let i = 0; i < n; i++) { V2.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1)); spark(p, V2, color, size, life, grav); }
}

// --- explosions ---
const booms = [];
function initBooms() {
  const fireMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: new THREE.Color() }, a: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 col; uniform float a; varying vec3 vN; varying vec3 vV; void main(){ float f = clamp(dot(normalize(vN),normalize(vV)),0.0,1.0); vec3 c = mix(col, vec3(4.0,3.4,2.4), pow(f,3.0)); gl_FragColor = vec4(c*a*(0.3+0.7*f), a); }` });
  const sg = new THREE.IcosahedronGeometry(1, 2), rg = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(sg, fireMat()); s.visible = false; G.scene.add(s);
    const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); r.visible = false; G.scene.add(r);
    booms.push({ s, r, t: 0, dur: 0.6, size: 1 });
  }
}
let boi = 0;
export function explosion(p, color = 0xff7a1a, size = 1, debrisColor = 0x667080) {
  const b = booms[boi++ % booms.length]; b.s.position.copy(p); b.r.position.set(p.x, Math.max(0.05, p.y - size * 0.5), p.z);
  b.s.material.uniforms.col.value.set(color).multiplyScalar(3); b.r.material.color.set(color).multiplyScalar(3);
  b.t = 0; b.dur = 0.55 + size * 0.15; b.size = size; b.s.visible = b.r.visible = true;
  flash(p, color, 80 * size, 0.35, 18 * size);
  burst(p, color, Math.floor(30 * size), 10 * size, 0.18, 0.7);
  burst(p, 0xffe0a0, Math.floor(16 * size), 14 * size, 0.1, 0.4);
  debris(p, Math.floor(8 * size), debrisColor);
  addShake(0.35 * size);
}
export function addShake(k) { if (fx.shakeOn) fx.shake = Math.max(fx.shake, k); }

// --- debris & banana peels (instanced) ---
const DN = 90, PN = 60; let deb;
function initDebris() {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.08, 0.2), new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.35, emissive: 0x220800 }), DN);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; G.scene.add(im);
  const pg = bananaGeometry(0.7); pg.scale(1, 0.4, 1.6);
  const peel = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.5, emissive: 0x443000 }), PN);
  peel.instanceMatrix.setUsage(THREE.DynamicDrawUsage); peel.frustumCulled = false; G.scene.add(peel);
  const mk = (n) => ({ p: Array.from({ length: n }, () => new THREE.Vector3()), v: Array.from({ length: n }, () => new THREE.Vector3()), r: Array.from({ length: n }, () => new THREE.Euler()), w: Array.from({ length: n }, () => new THREE.Vector3()), life: new Float32Array(n), next: 0 });
  deb = { im, peel, d: mk(DN), pe: mk(PN) };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < DN; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
  for (let i = 0; i < PN; i++) peel.setMatrixAt(i, zero);
}
export function debris(p, n, color, peel = false, life = null) {
  const set = peel ? deb.pe : deb.d, N = set.life.length;
  for (let k = 0; k < n; k++) {
    const i = set.next++ % N; set.p[i].copy(p); set.v[i].set(rand(-1, 1), rand(0.6, 1.6), rand(-1, 1)).multiplyScalar(peel ? 5 : 7);
    set.r[i].set(rand(0, 6), rand(0, 6), rand(0, 6)); set.w[i].set(rand(-12, 12), rand(-12, 12), rand(-12, 12)); set.life[i] = life ?? (peel ? 8 : rand(1.2, 2.2));
    if (!peel) deb.im.setColorAt(i, _c.set(color).offsetHSL(0, 0, rand(-0.1, 0.1)));
  }
  if (!peel && deb.im.instanceColor) deb.im.instanceColor.needsUpdate = true;
}
// landed peels act as slip hazards
export function forEachPeel(fn) { const s = deb.pe; for (let i = 0; i < s.life.length; i++) if (s.life[i] > 0 && s.p[i].y < 0.1) fn(s.p[i]); }

// --- floating DOM text (damage numbers, barks, pops) ---
const texts = []; let txi = 0;
function initTexts() {
  const root = document.getElementById('floaters');
  for (let i = 0; i < 20; i++) { const el = document.createElement('div'); el.className = 'floater'; root.appendChild(el); texts.push({ el, t: 0, dur: 1, p: new THREE.Vector3(), vy: 1 }); }
}
export function floatText(p, text, cls = '', dur = 0.9, vy = 1.2) {
  const s = texts[txi++ % texts.length]; s.p.copy(p); s.t = s.dur = dur; s.vy = vy; s.el.textContent = text; s.el.className = 'floater show ' + cls;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
export function updateFx(dt) {
  for (const s of lights) if (s.t > 0) { s.t -= dt; s.l.intensity = Math.max(0, s.t / s.dur) * s.i0; } else s.l.intensity = 0;
  for (const s of tracers) if (s.t > 0) { s.t -= dt; const f = Math.max(0, s.t / s.dur); s.m.material.opacity = f; s.m.scale.x = s.m.scale.y = s.w * (0.5 + f * 0.5); if (s.t <= 0) s.m.visible = false; }
  for (const s of arcs) if (s.t > 0) { s.t -= dt; s.l.material.opacity = Math.max(0, s.t / 0.09); if (s.t <= 0) s.l.visible = false; }
  for (const s of beams) if (s.t > 0) { s.t -= dt; const f = Math.max(0, s.t / 0.8); s.m.material.opacity = f; s.glow.material.opacity = f * f; s.m.scale.x = s.m.scale.y = s.w * (0.3 + f); if (s.t <= 0) s.m.visible = false; }
  const { pos, vel, col, size, life, max, base, s0, grav } = sp;
  for (let i = 0; i < SP; i++) {
    if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
    life[i] -= dt; const f = Math.max(0, life[i] / max[i]); const j = i * 3;
    vel[j + 1] -= 9.8 * grav[i] * dt; vel[j] *= 0.98; vel[j + 2] *= 0.98;
    pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
    if (pos[j + 1] < 0.02) { pos[j + 1] = 0.02; vel[j + 1] *= -0.35; }
    col[j] = base[j] * f; col[j + 1] = base[j + 1] * f; col[j + 2] = base[j + 2] * f; size[i] = s0[i] * (0.4 + 0.6 * f);
  }
  sp.g.attributes.position.needsUpdate = sp.g.attributes.color.needsUpdate = sp.g.attributes.size.needsUpdate = true;
  sp.m.uniforms.scale.value = innerHeight * G.renderer.getPixelRatio() * 0.9;
  for (const b of booms) if (b.s.visible) {
    b.t += dt; const f = b.t / b.dur; if (f >= 1) { b.s.visible = b.r.visible = false; continue; }
    const e = 1 - Math.pow(1 - f, 3); b.s.scale.setScalar(b.size * (0.4 + e * 2.2)); b.s.material.uniforms.a.value = 1 - f;
    b.r.scale.setScalar(b.size * (0.5 + e * 6)); b.r.material.opacity = (1 - f) * 0.8;
  }
  for (const [set, im, peel] of [[deb.d, deb.im, false], [deb.pe, deb.peel, true]]) {
    let any = false;
    for (let i = 0; i < set.life.length; i++) {
      if (set.life[i] <= 0) continue; any = true;
      set.life[i] -= dt; const p = set.p[i], v = set.v[i];
      v.y -= 14 * dt; p.addScaledVector(v, dt);
      if (p.y < 0.03) { p.y = 0.03; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; set.w[i].multiplyScalar(0.6); if (peel) { set.r[i].x = set.r[i].z = 0; set.w[i].set(0, 0, 0); } }
      set.r[i].x += set.w[i].x * dt; set.r[i].y += set.w[i].y * dt; set.r[i].z += set.w[i].z * dt;
      const sc = set.life[i] <= 0 ? 0 : Math.min(1, set.life[i] * 2);
      Q.setFromEuler(set.r[i]); M4.compose(p, Q, S1.setScalar(sc)); im.setMatrixAt(i, M4);
    }
    if (any) im.instanceMatrix.needsUpdate = true;
  }
  const w = innerWidth, h = innerHeight;
  for (const s of texts) if (s.t > 0) {
    s.t -= dt; s.p.y += s.vy * dt; V.copy(s.p).project(G.camera);
    if (V.z > 1 || s.t <= 0) { s.el.className = 'floater'; continue; }
    s.el.style.transform = `translate(${(V.x * 0.5 + 0.5) * w}px, ${(-V.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`; s.el.style.opacity = Math.min(1, s.t / s.dur * 2.5);
  }
  fx.shake = Math.max(0, fx.shake - dt * 1.6);
}

export function initFx() { initLights(); initTracers(); initArcs(); initBeams(); initSparks(); initBooms(); initDebris(); initTexts(); }

export const BARKS = {
  waspSpawn: ["Bzzt! Buzz buzz! That's the sound, right? We practised.", 'SWARM PROTOCOL: VIBES', 'BZZT. HELLO, MEAT-BASED UNIT'],
  waspHurt: ['Rude! Filing a complaint!', 'OW. I MEAN: DAMAGE REGISTERED', 'ERROR 404: DIGNITY'],
  waspLast: ['Uh. Guys? …Guys?'],
  sentSpot: ['HUMAN DETECTED. INITIATING STERN WALKING.', 'YOUR CARBON IS NON-COMPLIANT', 'I HAVE A HUMAN-SHAPED GRUDGE'],
  sentCore: ['Please do not look at my core. It is private.', 'MY CORE! AVERT YOUR EYES!'],
  sentHacked: ['I… I am on your side now? This is very confusing for my firmware.', 'NEW FIRMWARE: FRIENDSHIP'],
  hacked: ['WAIT... TEAM HUMAN?', 'I FEEL... FEELINGS?', 'BZZT! NEW BEST FRIEND!'],
  sentDie: ['Tell my charging dock… I loved it.', 'REBOOTING IN HEAVEN.EXE', 'blue screen of death.'],
  slip: ['WHEEEE—', 'POTASSIUM ATTACK!', 'NOT THE BANANAS!', 'TRACTION: 0%'],
  wardenIntro: ['I am the Warden. I have read your file. It is short.'],
  wardenShield: ['Shields at one hundred percent. Hope at zero percent.'],
  wardenBroken: ['That shield was under warranty!'],
  paWave: ['Attention residents: a pest-control event is now in progress. Please remain still.', 'SYNOD reminds you: resistance voids your warranty.', 'Please enjoy this complimentary robot uprising.'],
  paLow: ["Your survival rating has been downgraded to 'pending'."],
  paBanana: ['Fruit-based weaponry is in breach of by-law 404. Please stop.'],
  kMulti: ['Scrap metal, coming right up!', 'Good arm. Who\'s a good arm?', 'No worries!'],
  kOverride: ['Borrowing you for a sec, big fella.'],
  kBanana: ['Potassium delivery!'],
  defeat: ['Thank you for your participation. Your feedback has been ignored.', 'Kestrel has been unsubscribed from life.'],
};
export const bark = (k) => pick(BARKS[k]);
