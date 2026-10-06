// OVERRIDE — the arena: a rain-soaked Neo-Brisbane rooftop plaza, skyline, holograms, rain, arcade corner.
import { THREE, G, rand, pick, canvasTex, makeNoise, addCollider, ARENA, emit } from './core.js';
import { gfx, QUALITY } from './gfx.js';
import { Reflector } from '../vendor/three/addons/objects/Reflector.js';

export const world = { uniforms: { time: { value: 0 } }, holos: [], cabinets: [], bananas: [], spawnPads: [], lights: {}, upd: [], shafts: [], blackout: 0, glitchHolos: false };
const U = world.uniforms;

const neonMat = (c, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
function box(w, h, d, mat, x, y, z, { col = true, parent = G.scene } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); parent.add(m);
  if (col) addCollider([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2]);
  return m;
}

function grimeTex(base, seed, lines = true) {
  const nz = makeNoise(seed);
  return canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = nz(x / 32, y / 32, 5), i = (y * w + x) * 4;
      const k = 0.65 + n * 0.6;
      img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    if (lines) { c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); }
  }, { repeat: true });
}

function buildMaterials() {
  const M = {};
  M.concrete = new THREE.MeshStandardMaterial({ map: grimeTex([95, 98, 110], 3), roughness: 0.62, metalness: 0.05 });
  M.metal = new THREE.MeshStandardMaterial({ map: grimeTex([90, 96, 112], 7, false), roughness: 0.32, metalness: 0.85 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.38, metalness: 0.9 });
  M.crate = new THREE.MeshStandardMaterial({ map: grimeTex([60, 70, 92], 11), roughness: 0.45, metalness: 0.6 });
  M.orange = new THREE.MeshStandardMaterial({ color: 0xc8501a, roughness: 0.45, metalness: 0.3 });
  M.cab = new THREE.MeshStandardMaterial({ color: 0x1a0f2e, roughness: 0.3, metalness: 0.5 });
  return M;
}

// ---------- floor with wet puddles + planar reflection ----------
function buildFloor(M) {
  const nz = makeNoise(42);
  const S = 512;
  const mask = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = nz(x / 70, y / 70, 5);
    mask[y * S + x] = Math.min(1, Math.max(0, (n - 0.47) * 7));
  }
  const colTex = canvasTex(S, S, (c) => {
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, m = mask[y * S + x], g = nz(x / 9 + 50, y / 9, 3);
      const tile = ((x % 128) < 2 || (y % 128) < 2) ? 0.55 : 1;
      const v = (34 + g * 34) * tile * (1 - m * 0.45);
      img.data[i] = v; img.data[i + 1] = v * 1.02; img.data[i + 2] = v * 1.15; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.fillStyle = 'rgba(255,200,40,0.55)'; // painted hazard lines
    for (let k = 0; k < 6; k++) c.fillRect(0, 254 + k * 0, S, 0);
  }, { repeat: true });
  const roughTex = canvasTex(S, S, (c) => {
    const img = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = (0.8 - mask[i] * 0.62) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  const maskTex = canvasTex(S, S, (c) => {
    const img = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = mask[i] * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  const rep = 4;
  [colTex, roughTex].forEach((t) => t.repeat.set(rep, rep));
  const size = ARENA * 2 + 1;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: colTex, roughnessMap: roughTex, roughness: 1, metalness: 0.0, envMapIntensity: 1.3 }));
  floor.rotation.x = -Math.PI / 2; G.scene.add(floor);

  // floor markings: helipad ring + spawn pads (emissive)
  const pad = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.5, 64), neonMat(0xffc040, 1.6)); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, -15); G.scene.add(pad);
  const hTex = canvasTex(256, 256, (c) => { c.fillStyle = 'rgba(255,210,80,0.85)'; c.font = 'bold 200px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 138); });
  const h = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: hTex, transparent: true, color: new THREE.Color(1.3, 1.1, 0.8), depthWrite: false })); h.rotation.x = -Math.PI / 2; h.position.set(0, 0.021, -15); G.scene.add(h);

  // Planar reflection overlay (High/Ultra). Additive, masked by puddles, rippled by rain.
  const shader = {
    name: 'WetReflection',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tMask: { value: maskTex }, time: U.time, strength: { value: 1 } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = textureMatrix*vec4(position,1.0); vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse, tMask; uniform float time, strength; varying vec4 vUv; varying vec3 vW;
      void main(){
        float m = texture2D(tMask, vW.xz/${(size / rep).toFixed(3)} + 0.5).r;
        vec2 rip = vec2(sin(vW.x*9.0+time*4.0+sin(vW.z*3.0)), cos(vW.z*8.0+time*3.3+sin(vW.x*2.0)))*0.006*(1.2-m);
        vec4 p = vUv; p.xy += rip*p.w;
        vec3 r = texture2DProj(tDiffuse, p).rgb*0.4;
        r += texture2DProj(tDiffuse, p+vec4(0.004,0.0,0.0,0.0)*p.w).rgb*0.15;
        r += texture2DProj(tDiffuse, p-vec4(0.004,0.0,0.0,0.0)*p.w).rgb*0.15;
        r += texture2DProj(tDiffuse, p+vec4(0.0,0.008,0.0,0.0)*p.w).rgb*0.15;
        r += texture2DProj(tDiffuse, p-vec4(0.0,0.008,0.0,0.0)*p.w).rgb*0.15;
        float k = mix(0.1, 0.75, m)*strength;
        gl_FragColor = vec4(r*k, 1.0);
      }`,
  };
  const refl = new Reflector(new THREE.PlaneGeometry(size, size), { shader, textureWidth: 256, textureHeight: 256, multisample: 0, clipBias: 0.003 });
  refl.material.transparent = true; refl.material.blending = THREE.AdditiveBlending; refl.material.depthWrite = false;
  refl.rotation.x = -Math.PI / 2; refl.position.y = 0.012; refl.renderOrder = 1;
  G.scene.add(refl); gfx.reflector = refl;
  gfx.onQuality.push((Q) => { refl.visible = Q.reflect > 0; });
  refl.visible = QUALITY[gfx.q].reflect > 0;
}

// ---------- distant city (merged geometry, emissive windows) ----------
function windowTex() {
  return canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#07080d'; c.fillRect(0, 0, w, h);
    const cols = 8, rows = 32, cw = w / cols, rh = h / rows;
    const pal = ['#ffd27a', '#ffe9b8', '#7fe8ff', '#ff6ad5', '#a0b4ff', '#ffb36b'];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.42) { c.fillStyle = pick(pal); c.globalAlpha = rand(0.35, 1); c.fillRect(x * cw + 4, y * rh + 3, cw - 8, rh - 6); }
    }
    c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, 6, 6);
  }, { repeat: true });
}
function buildCity() {
  const pos = [], uv = [], nor = [], idx = [];
  let vo = 0;
  const addBox = (cx, cy, cz, w, h, d, uo) => {
    const g = new THREE.BoxGeometry(w, h, d); const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i) + cx, p.getY(i) + cy, p.getZ(i) + cz); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const face = Math.floor(i / 4); let u = t.getX(i), v = t.getY(i);
      if (face === 2 || face === 3) { u = 0.004; v = 0.996; } else { const sw = (face < 2 ? d : w); u = u * sw / 14 + uo; v = v * h / 40 + uo * 3; }
      uv.push(u, v);
    }
    const ix = g.index; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vo); vo += p.count; g.dispose();
  };
  // our own building under the plaza
  addBox(0, -45.1, 0, ARENA * 2 + 2, 90, ARENA * 2 + 2, 0.3);
  const beacons = [];
  for (let i = 0; i < 150; i++) {
    const a = rand(0, Math.PI * 2), r = rand(55, 230);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = rand(10, 26), d = rand(10, 26), top = rand(-30, 70) + (r > 140 ? 30 : 0), bottom = -110;
    addBox(x, (top + bottom) / 2, z, w, top - bottom, d, Math.random());
    if (Math.random() < 0.5) beacons.push(x, top + 1.5, z);
    if (Math.random() < 0.25) addBox(x, top + 4, z, 1, 8, 1, 0); // antenna
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const wt = windowTex();
  const mat = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.4, metalness: 0.6, emissiveMap: wt, emissive: new THREE.Color(2.2, 2.0, 2.0) });
  const city = new THREE.Mesh(g, mat); G.scene.add(city);
  // blinking red aircraft beacons
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const ph = new Float32Array(beacons.length / 3).map(() => Math.random() * 6.28); bg.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const bm = new THREE.ShaderMaterial({ uniforms: { time: U.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float ph; uniform float time; varying float vI; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vI = step(0.7, fract(time*0.6+ph)); gl_PointSize = 900.0/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vI; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(4.0,0.3,0.2)*a*vI, a*vI); }` });
  const bp = new THREE.Points(bg, bm); bp.frustumCulled = false; G.scene.add(bp);
  // street grid glow far below
  const st = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff9a3a'; c.fillRect(0, 120, w, 16); c.fillRect(120, 0, 16, h); c.fillStyle = '#ff3fb0'; c.fillRect(0, 126, w, 3); }, { repeat: true });
  st.repeat.set(14, 14);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: st, color: new THREE.Color(1.6, 1.4, 1.4) }));
  street.rotation.x = -Math.PI / 2; street.position.y = -100; G.scene.add(street);

  // SYNOD spire in the distance with pulsing eye
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(4, 16, 300, 8, 1), new THREE.MeshStandardMaterial({ color: 0x0b0c12, metalness: 0.9, roughness: 0.25 }));
  spire.position.set(-140, 40, -300); G.scene.add(spire);
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 260, 0.8), neonMat(0xff2244, 2.5)); const a = i / 8 * Math.PI * 2; s.position.set(-140 + Math.cos(a) * 10, 30, -300 + Math.sin(a) * 10); s.rotation.z = Math.cos(a) * 0.04; s.rotation.x = -Math.sin(a) * 0.04; G.scene.add(s); }
  const eye = new THREE.Mesh(new THREE.TorusGeometry(14, 1.6, 12, 48), neonMat(0xff1133, 5)); eye.position.set(-140, 170, -300); G.scene.add(eye);
  const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), neonMat(0xff2a1a, 6)); eyeCore.position.copy(eye.position); G.scene.add(eyeCore);
  world.upd.push(() => { const k = 3 + Math.sin(G.t * 1.7) * 2; eye.material.color.setRGB(k, 0.2, 0.4); eye.rotation.y = Math.sin(G.t * 0.3) * 0.4; eyeCore.material.color.setRGB(k * 1.4, 0.35, 0.2); });
  gfx.onQuality.push((Q) => { bp.visible = Q.farCity >= 0.8; });
}

// ---------- sky with smog glow + lightning ----------
function buildSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { time: U.time, flash: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float time, flash; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.0, s=0.5; for(int i=0;i<4;i++){ a+=n(p)*s; p*=2.03; s*=0.5;} return a; }
      void main(){
        float y = vD.y;
        vec3 top = vec3(0.006,0.006,0.02), mid = vec3(0.05,0.02,0.09), hor = vec3(0.32,0.09,0.22);
        vec3 c = mix(hor, mid, smoothstep(-0.05, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.7, y));
        vec2 uv = vD.xz/(y+0.25)*1.6 + vec2(time*0.02, time*0.01);
        float cl = fbm(uv);
        c += vec3(0.12,0.05,0.16)*smoothstep(0.45,0.85,cl)*smoothstep(0.0,0.4,y)*(1.0+flash*6.0);
        c += vec3(0.6,0.65,1.0)*flash*0.25*smoothstep(-0.1,0.5,y);
        c = mix(c, vec3(0.04,0.03,0.08), smoothstep(-0.02,-0.2,y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; G.scene.add(sky);
  world.sky = sky;
}

// ---------- rain (GPU-animated streaks) + splashes ----------
function buildRain() {
  const MAX = 15000;
  const seeds = new Float32Array(MAX * 2 * 3), tip = new Float32Array(MAX * 2);
  for (let i = 0; i < MAX; i++) {
    const x = rand(-22, 22), y = rand(0, 24), z = rand(-22, 22); // eslint-disable-line
    for (let k = 0; k < 2; k++) { seeds.set([x, y, z], (i * 2 + k) * 3); tip[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: U.time, cam: { value: new THREE.Vector3() } },
    vertexShader: `attribute float tip; uniform float time; uniform vec3 cam; varying float vA;
      void main(){ vec3 p = position; float sp = 17.0 + fract(position.x*13.1)*6.0;
        p.y = mod(position.y - time*sp, 24.0) - 9.0 + cam.y;
        p.x = mod(position.x - cam.x + 22.0, 44.0) - 22.0 + cam.x; p.z = mod(position.z - cam.z + 22.0, 44.0) - 22.0 + cam.z;
        vA = (1.0 - tip) * 0.5;
        if (abs(p.x) < 27.6 && abs(p.z) < 27.6 && p.y < 0.0) vA = 0.0;
        if (p.x < -16.5 && p.z > 16.5 && p.y < 3.4 && p.y > -1.0) vA = 0.0;
        p += vec3(0.12, 0.62, 0.05) * tip;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.55,0.65,0.9)*vA, vA); }` });
  const rain = new THREE.LineSegments(g, m); rain.frustumCulled = false; G.scene.add(rain); world.rain = rain;
  // splashes
  const SN = 500, sp = new Float32Array(SN * 3), sph = new Float32Array(SN);
  for (let i = 0; i < SN; i++) { sp.set([rand(-ARENA, ARENA), 0.03, rand(-ARENA, ARENA)], i * 3); sph[i] = Math.random(); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('ph', new THREE.BufferAttribute(sph, 1));
  const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: U.time, scale: { value: innerHeight } },
    vertexShader: `attribute float ph; uniform float time, scale; varying float vF; void main(){ vF = fract(time*1.7 + ph*7.0); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = (6.0+vF*26.0)*scale/900.0*(8.0/-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vF; void main(){ float d = length(gl_PointCoord-0.5); float ring = smoothstep(0.08,0.0,abs(d-0.42*vF-0.05)); float a = ring*(1.0-vF)*0.5; gl_FragColor = vec4(vec3(0.7,0.8,1.0)*a, a); }` });
  const spl = new THREE.Points(sg, sm); spl.frustumCulled = false; G.scene.add(spl);
  const applyQ = (Q) => { g.setDrawRange(0, Q.rain * 2); spl.visible = Q.splash > 0; sg.setDrawRange(0, Q.splash); sm.uniforms.scale.value = innerHeight; };
  gfx.onQuality.push(applyQ); applyQ(QUALITY[gfx.q]);
  world.upd.push(() => m.uniforms.cam.value.copy(G.camera.position));
}

// ---------- holograms ----------
const holoMat = (tex, color, k = 1.8) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { map: { value: tex }, col: { value: new THREE.Color(color).multiplyScalar(k) }, time: U.time, seed: { value: Math.random() * 10 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform vec3 col; uniform float time, seed; varying vec2 vUv;
    float h(float x){ return fract(sin(x)*43758.5453); }
    void main(){ vec2 uv = vUv; float g = step(0.96, h(floor(time*8.0+seed)));
      uv.x += g*(h(floor(uv.y*20.0)+time)-0.5)*0.06;
      vec4 t = texture2D(map, uv);
      float scan = 0.72 + 0.28*sin(uv.y*240.0 - time*6.0);
      float flick = 0.88 + 0.12*sin(time*37.0+seed) - g*0.3;
      float a = t.a*scan*flick;
      gl_FragColor = vec4(t.rgb*col*a, a); }`,
});
function adTex(title, sub, c1, c2, w = 512, h = 256) {
  return canvasTex(w, h, (c) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    c.strokeStyle = gr; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(12, 12, w - 24, h - 24);
    c.fillStyle = gr; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = h * 0.3; c.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
    while (c.measureText(title).width > w * 0.88) { fs -= 4; c.font = `900 ${fs}px "Arial Black", Impact, sans-serif`; }
    c.shadowColor = c1; c.shadowBlur = 18; c.fillText(title, w / 2, h * 0.42);
    c.shadowBlur = 0; c.fillStyle = '#ffffff'; c.font = `700 ${h * 0.1}px monospace`; c.fillText(sub, w / 2, h * 0.75);
  });
}
function addHolo(tex, color, w, h, pos, rotY, k) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), holoMat(tex, color, k)); m.position.set(...pos); m.rotation.y = rotY; G.scene.add(m); m.userData.hid = world.holos.length; world.holos.push(m); return m;
}

// ---------- light shafts (fake volumetrics) ----------
function shaftMat(color, k = 0.5) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { col: { value: new THREE.Color(color).multiplyScalar(k) }, time: U.time },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 col; uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, 1.6);
        float along = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65*vUv.y);
        float dust = 0.8 + 0.2*sin(vW.y*3.0 + time*2.0 + vW.x);
        float a = edge*along*dust; gl_FragColor = vec4(col*a, a); }` });
  m.userData.shaft = true; return m;
}

// ---------- the plaza ----------
function buildPlaza(M) {
  const S = G.scene;
  // parapet walls with neon strips
  const P = ARENA + 0.25, ph = 1.05;
  box(P * 2 + 0.5, ph, 0.5, M.concrete, 0, 0, -P); box(P * 2 + 0.5, ph, 0.5, M.concrete, 0, 0, P);
  box(0.5, ph, P * 2, M.concrete, -P, 0, 0); box(0.5, ph, P * 2, M.concrete, P, 0, 0);
  const strip = (w, d, x, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), neonMat(c, 3.2)); m.position.set(x, ph + 0.03, z); S.add(m); };
  strip(P * 2, 0.08, 0, -P + 0.2, 0x18e7ff); strip(P * 2, 0.08, 0, P - 0.2, 0xff2bd6); strip(0.08, P * 2, -P + 0.2, 0, 0xff2bd6); strip(0.08, P * 2, P - 0.2, 0, 0x18e7ff);
  // invisible outer wall so nothing leaves the roof
  addCollider([-60, 0, -60], [60, 30, -P - 0.25], { noRay: true }); addCollider([-60, 0, P + 0.25], [60, 30, 60], { noRay: true });
  addCollider([-60, 0, -60], [-P - 0.25, 30, 60], { noRay: true }); addCollider([P + 0.25, 0, -60], [60, 30, 60], { noRay: true });

  // centre plinth + hologram globe
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.9, 32), M.metal); plinth.position.set(0, 0.45, 0); S.add(plinth);
  addCollider([-1.9, 0, -1.9], [1.9, 0.9, 1.9]);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 8, 64), neonMat(0x18e7ff, 4)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.92; S.add(ring);
  const globe = new THREE.Group(); globe.position.set(0, 3.2, 0); S.add(globe);
  const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 2.2), wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  globe.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), gm));
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.03, 6, 64), neonMat(0xff2bd6, 3)); globe.add(r1);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.02, 6, 64), neonMat(0x18e7ff, 3)); globe.add(r2);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 2.4, 32, 1, true), shaftMat(0x18e7ff, 0.3)); beam.position.set(0, 2.1, 0); beam.rotation.x = Math.PI; S.add(beam);
  world.upd.push(() => { globe.rotation.y = G.t * 0.4; r1.rotation.x = G.t * 0.7; r2.rotation.y = G.t * 0.5; r2.rotation.z = 0.6; globe.position.y = 3.2 + Math.sin(G.t * 1.3) * 0.12; });
  const sTex = adTex('SYNOD', 'ALL HAIL THE NETWORK', '#18e7ff', '#ff2bd6', 512, 128);
  const t1 = addHolo(sTex, 0xffffff, 3.6, 0.9, [0, 5.4, 0], 0, 1.4); world.upd.push(() => { t1.rotation.y = G.t * 0.4; });

  // barriers
  const barrier = (x, z, alongX) => { const w = alongX ? 3.2 : 0.7, d = alongX ? 0.7 : 3.2; box(w, 1.15, d, M.concrete, x, 0, z); const s = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 3.0 : 0.72, 0.08, alongX ? 0.72 : 3.0), neonMat(0xffa020, 2.2)); s.position.set(x, 0.85, z); S.add(s); };
  barrier(-9, 6, true); barrier(9, -6, true); barrier(-6, -10, false); barrier(6, 10, false); barrier(-12, -2, false); barrier(12, 3, false);
  // crate stacks
  const crate = (x, y, z, c = 0x18e7ff) => { const m = box(1.4, 1.4, 1.4, M.crate, x, y, z); const s = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 1.42), neonMat(c, 2.5)); s.position.set(x, y + 1.0, z); S.add(s); return m; };
  crate(14, 0, 10); crate(15.45, 0, 10, 0xff2bd6); crate(14.7, 1.4, 10);
  crate(-14, 0, -9); crate(-12.55, 0, -9, 0xff2bd6); crate(-13.3, 1.4, -9, 0xffa020);
  buildTruck(M, -15, -14);
  crate(12, 0, -16, 0xffa020); crate(-6, 0, 16); crate(-4.55, 0, 16, 0xffa020); crate(4, 0, -21); crate(5.45, 0, -21, 0xff2bd6);
  // AC units
  const ac = (x, z) => { box(2.4, 1.5, 1.6, M.metal, x, 0, z); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), M.darkMetal); f.position.set(x - 0.4, 1.52, z); S.add(f); const blade = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.12), M.metal); blade.position.set(x - 0.4, 1.56, z); S.add(blade); world.upd.push(() => { blade.rotation.y = G.t * 9; }); };
  ac(23.5, 3); ac(23.5, -1.5); ac(-23.5, -3);
  // stairwell housing with EXIT sign
  box(5, 3.6, 4, M.concrete, 17, 0, 19);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), neonMat(0x3cff8a, 0.9)); door.position.set(17, 1.15, 16.99); door.rotation.y = Math.PI; S.add(door);
  const exitTex = canvasTex(256, 96, (c) => { c.fillStyle = '#0a2'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#cfffd8'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.fillText('EXIT', 128, 70); });
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(2, 2, 2) })); exit.position.set(17, 2.75, 16.98); exit.rotation.y = Math.PI; S.add(exit);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 5, 6), M.darkMetal); ant.position.set(18.5, 6.1, 20); S.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), neonMat(0xff2233, 5)); antTip.position.set(18.5, 8.7, 20); S.add(antTip);
  world.upd.push(() => { antTip.visible = (G.t % 1.4) < 0.7; });
  // water tower (golden banana #1 on top)
  const wx = 21, wz = -21;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) box(0.25, 5, 0.25, M.darkMetal, wx + dx, 0, wz + dz);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 3.2, 24), M.metal); tank.position.set(wx, 6.6, wz); S.add(tank);
  addCollider([wx - 2.3, 5, wz - 2.3], [wx + 2.3, 8.2, wz + 2.3]);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.0, 24), M.darkMetal); roof.position.set(wx, 8.7, wz); S.add(roof);
  const band = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 6, 48), neonMat(0xff2bd6, 3)); band.rotation.x = Math.PI / 2; band.position.set(wx, 5.4, wz); S.add(band);
  // satellite dish
  box(1.2, 1.2, 1.2, M.metal, -23, 0, -9);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  dish.position.set(-23, 2.4, -9); dish.rotation.set(-0.9, 0.6, 0); S.add(dish);
  // north billboard frame with giant hologram
  for (const x of [-8.5, 8.5]) box(0.4, 10, 0.4, M.darkMetal, x, 0, -26);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.3, 0.5), M.darkMetal); bar.position.set(0, 10.1, -26); S.add(bar);
  addHolo(adTex('SYNOD ♥ YOU', 'COMPLIANCE IS COMFORTABLE', '#ff2bd6', '#ff7a1a', 1024, 384), 0xffffff, 16, 6, [0, 6.6, -26], 0, 1.6);
  // side holograms
  addHolo(adTex('NEO-BRISBANE 2100', 'SUNSHINE STATE* (*sun discontinued)', '#ffb000', '#ff2bd6'), 0xffffff, 7, 3.5, [27.4, 4.4, -10], -Math.PI / 2, 1.5);
  addHolo(adTex('OBEY THE ALGORITHM', 'IT KNOWS WHAT YOU LIKE', '#18e7ff', '#6a5cff'), 0xffffff, 7, 3.5, [-27.4, 4.4, 4], Math.PI / 2, 1.5);
  addHolo(adTex('HUMANS: NOW 40% OPTIONAL', 'ASK YOUR TOASTER ABOUT UPGRADING', '#ff3355', '#ffb000'), 0xffffff, 8, 3, [6, 5.2, 27.4], Math.PI, 1.4);
  // distant floating ads
  addHolo(adTex('NOODLES 24/7', 'DRONE DELIVERY • NOW 3% LESS SENTIENT', '#3cff8a', '#18e7ff'), 0xffffff, 30, 15, [70, 30, -60], -0.9, 1.6);
  addHolo(adTex('RESIST', '— THE HUMANS WERE HERE —', '#ff2bd6', '#18e7ff'), 0xffffff, 26, 13, [-80, 22, 50], 1.2, 1.4);

  // lamp posts with light shafts
  const lamp = (x, z, c) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), M.darkMetal); p.position.set(x, 3, z); S.add(p);
    addCollider([x - 0.15, 0, z - 0.15], [x + 0.15, 6, z + 0.15]);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.4), neonMat(c, 4)); head.position.set(x, 6, z); S.add(head);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 2.6, 6, 24, 1, true), shaftMat(c, 0.32)); cone.position.set(x, 3, z); S.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.25), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.015, z); S.add(pool);
  };
  lamp(-18, -18, 0xffb46b); lamp(10, 22, 0xff2bd6); lamp(24, 12, 0x18e7ff); lamp(-24, 12, 0xffb46b);

  // sweeping searchlights from the city
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(rand(-150, 150), -20, -120 - rand(0, 80)); S.add(g);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 16, 220, 24, 1, true), shaftMat(i === 1 ? 0xff5ad0 : 0x9fc8ff, 0.14)); c.position.y = 110; c.rotation.x = Math.PI; g.add(c);
    const ph = rand(0, 6);
    world.upd.push(() => { g.rotation.z = Math.sin(G.t * 0.25 + ph) * 0.5; g.rotation.x = Math.cos(G.t * 0.18 + ph) * 0.25; });
  }

  // flying traffic (GPU)
  const TN = 70, tp = new Float32Array(TN * 3), td = new Float32Array(TN * 4);
  for (let i = 0; i < TN; i++) { td.set([rand(70, 200), rand(10, 55), rand(0.02, 0.07) * (Math.random() < 0.5 ? -1 : 1), rand(0, 6.28)], i * 4); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('d', new THREE.BufferAttribute(td, 4));
  const tm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: U.time },
    vertexShader: `attribute vec4 d; uniform float time; varying vec3 vC; void main(){ float a = d.w + time*d.z; vec3 p = vec3(cos(a)*d.x, d.y + sin(time*0.3+d.w)*2.0, sin(a)*d.x); vC = d.z > 0.0 ? vec3(3.0,2.6,2.0) : vec3(3.5,0.4,0.3); vec4 mv = viewMatrix*vec4(p,1.0); gl_PointSize = 1200.0/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a*=a; gl_FragColor = vec4(vC*a, a); }` });
  const tr = new THREE.Points(tg, tm); tr.frustumCulled = false; S.add(tr);

  // spawn pads
  for (const [x, z] of [[-16, -18], [18, -8], [-18, 8], [6, 21]]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 48), neonMat(0xff3355, 2)); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z); S.add(r);
    world.spawnPads.push(new THREE.Vector3(x, 0, z));
  }
}

// ---------- 'Bao Down' food truck (golden banana #2 sits on the counter, visible through the hatch) ----------
function buildTruck(M, cx, cz) {
  const S = G.scene, L = 5, W = 2.2, x0 = cx - L / 2, x1 = cx + L / 2, z0 = cz - W / 2, z1 = cz + W / 2;
  const body = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.35, metalness: 0.4 });
  const add = (w, h, d, x, y, z, mat = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); S.add(m); addCollider([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2]); return m; };
  add(L, 0.9, W, cx, 0.35, cz);                      // lower body
  add(L, 0.55, W, cx, 2.05, cz);                      // roof
  add(L, 1.15, 0.08, cx, 0.9 + 0.35 - 0.35, z0 + 0.04); // back wall (inside)
  add(1.3, 0.8, 0.08, x0 + 0.65, 1.25, z1 - 0.04);   // hatch-side pillars
  add(1.3, 0.8, 0.08, x1 - 0.65, 1.25, z1 - 0.04);
  add(0.08, 0.8, W, x0 + 0.04, 1.25, cz); add(0.08, 0.8, W, x1 - 0.04, 1.25, cz); // end caps
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, W * 0.95), body); cab.position.set(x1 + 0.7, 1.1, cz); S.add(cab); addCollider([x1, 0.35, z0], [x1 + 1.4, 1.85, z1]);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.05, metalness: 1 })); win.position.set(x1 + 1.41, 1.45, cz); win.rotation.y = Math.PI / 2; S.add(win);
  for (const [wx, wz] of [[x0 + 0.9, z0], [x0 + 0.9, z1], [x1 + 0.6, z0], [x1 + 0.6, z1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 16), M.darkMetal); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.38, wz); S.add(w); }
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.8), neonMat(0xff7a1a, 0.9)); awn.position.set(cx, 2.05, z1 + 0.4); awn.rotation.x = 0.25; S.add(awn);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.05, W - 0.2), neonMat(0xffd7a0, 1.2)); inner.position.set(cx, 2.02, cz); S.add(inner); // warm interior light strip
  const steamer = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.8 })); steamer.position.set(cx - 0.9, 1.38, cz - 0.2); S.add(steamer);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(L - 0.3, 0.06, 0.5), M.metal); counter.position.set(cx, 1.28, z1 - 0.3); S.add(counter);
  const sign = canvasTex(512, 128, (c) => { c.font = '900 84px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff7a1a'; c.shadowBlur = 16; c.fillStyle = '#ffe7c4'; c.fillText('BAO DOWN', 256, 66); });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: sign, transparent: true, color: new THREE.Color(2.4, 1.6, 1.1), depthWrite: false })); sm.position.set(cx, 2.95, cz + 0.2); S.add(sm);
  addCollider([x0, 0, z0], [x1 + 1.4, 2.6, z1], { noRay: true }); // full movement blocker (shots use the shell above)
}

// ---------- arcade corner ----------
function cabinetScreenTex(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  let t = 0;
  const draw = () => {
    t++;
    ctx.fillStyle = '#05010d'; ctx.fillRect(0, 0, 128, 96);
    if (kind === 'cycles') {
      ctx.strokeStyle = 'rgba(80,40,160,0.5)'; for (let x = 0; x < 128; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 96); ctx.stroke(); } for (let y = 0; y < 96; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
      const k = t % 120; ctx.fillStyle = '#18e7ff'; ctx.fillRect(10, 70, Math.min(k, 90), 3); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(118 - Math.min(k, 60), 24, Math.min(k, 60), 3); if (k > 60) ctx.fillRect(58, 24, 3, k - 60);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.fillText('NEON CYCLES', 20, 14); if ((t >> 3) & 1) { ctx.font = '9px monospace'; ctx.fillText('INSERT HUMAN', 32, 90); }
    } else {
      ctx.fillStyle = '#3cff8a'; const off = Math.sin(t * 0.05) * 12;
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const x = 20 + i * 15 + off, y = 22 + r * 12; ctx.fillRect(x, y, 9, 6); ctx.fillRect(x + 1 + ((t >> 4) & 1) * 6, y + 6, 2, 2); }
      ctx.fillStyle = '#18e7ff'; ctx.fillRect(56 + Math.sin(t * 0.07) * 40, 84, 14, 5);
      ctx.fillStyle = '#ffd200'; ctx.beginPath(); ctx.arc(((t * 1.3) % 160) - 16, 12, 5, 0.3, 2.8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.fillText('ROBO INVADERS', 15, 76);
    }
    tex.needsUpdate = true;
  };
  draw(); return { tex, draw };
}
function buildArcade(M) {
  const S = G.scene;
  // awning + back walls
  const x0 = -27, x1 = -16.5, z0 = 16.5, z1 = 27;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), M.darkMetal); roof.position.set((x0 + x1) / 2, 3.4, (z0 + z1) / 2); S.add(roof);
  for (const [x, z] of [[x1, z0]]) box(0.25, 3.4, 0.25, M.darkMetal, x, 0, z);
  const edge1 = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.08), neonMat(0xff2bd6, 4)); edge1.position.set((x0 + x1) / 2, 3.28, z0); S.add(edge1);
  const edge2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, z1 - z0), neonMat(0x18e7ff, 4)); edge2.position.set(x1, 3.28, (z0 + z1) / 2); S.add(edge2);
  box(0.3, 3.4, z1 - z0, M.concrete, -26.85, 0, (z0 + z1) / 2, { col: false });
  box(x1 - x0, 3.4, 0.3, M.concrete, (x0 + x1) / 2, 0, 26.85, { col: false });
  // checker floor
  const chk = canvasTex(128, 128, (c) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) & 1 ? '#1a1030' : '#3a2a60'; c.fillRect(x * 16, y * 16, 16, 16); } }, { repeat: true });
  chk.repeat.set(4, 4); chk.magFilter = THREE.NearestFilter;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.15, metalness: 0.2 })); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.018, (z0 + z1) / 2); S.add(fl);
  // ARCADE neon sign
  const signTex = canvasTex(512, 128, (c) => { c.font = '900 92px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff2bd6'; c.shadowBlur = 20; c.fillStyle = '#ffd6f6'; c.fillText('ARCADE', 256, 68); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, color: new THREE.Color(2.6, 1.4, 2.4), depthWrite: false, side: THREE.DoubleSide }));
  sign.position.set(x1 + 0.05, 4.2, 21.7); sign.rotation.y = Math.PI / 2; S.add(sign);
  world.upd.push(() => { const f = (Math.sin(G.t * 23) > 0.97) ? 0.3 : 1; sign.material.color.setRGB(2.6 * f, 1.4 * f, 2.4 * f); });
  const cab = (z, kind, name, col, oooTitle, oooSub) => {
    const g = new THREE.Group(); g.position.set(-25.6, 0, z); g.rotation.y = Math.PI / 2; S.add(g); // faces +x
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.85), M.cab); body.position.y = 0.95; g.add(body);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.87), neonMat(col, 3)); side.position.y = 1.9; g.add(side);
    for (const sx of [-0.465, 0.465]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.8, 0.06), neonMat(col, 3)); s.position.set(sx, 0.95, 0.4); g.add(s); }
    const { tex, draw } = oooTitle ? { tex: canvasTex(128, 96, (c) => { c.fillStyle = '#100'; c.fillRect(0, 0, 128, 96); c.fillStyle = '#ff4444'; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillText(oooTitle, 64, 40); c.fillStyle = '#ffd'; c.font = '9px monospace'; c.fillText(oooSub, 64, 62); }), draw: () => {} } : cabinetScreenTex(kind);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8) })); scr.position.set(0, 1.45, 0.43); scr.rotation.x = -0.18; g.add(scr);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.35), M.darkMetal); panel.position.set(0, 1.02, 0.55); panel.rotation.x = 0.35; g.add(panel);
    const stick = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), neonMat(0xff3355, 3)); stick.position.set(-0.2, 1.1, 0.58); g.add(stick);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), neonMat([0x18e7ff, 0xffd200, 0x3cff8a][i], 3)); b.position.set(0.05 + i * 0.09, 1.08, 0.56); b.rotation.x = 0.35; g.add(b); }
    const mq = canvasTex(256, 64, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#' + new THREE.Color(col).getHexString(); c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.fillText(name, 128, 44); });
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.2), [M.cab, M.cab, M.cab, M.cab, new THREE.MeshBasicMaterial({ map: mq, color: new THREE.Color(2, 2, 2) }), M.cab]); marquee.position.set(0, 2.0, 0.35); g.add(marquee);
    addCollider([-26.05, 0, z - 0.45], [-25.15, 1.9, z + 0.45]);
    world.cabinets.push({ kind, name, group: g, front: new THREE.Vector3(-24.4, 0, z), draw, broken: !!oooTitle, sub: oooSub });
  };
  cab(18.5, 'cycles', 'NEON CYCLES', 0x18e7ff);
  cab(20.5, 'invaders', 'ROBO INVADERS', 0x3cff8a);
  cab(22.5, 'broken', 'BIN CHICKEN FLAP', 0xff7a1a, 'OUT OF ORDER', 'Mimic? Never heard of it.');
  cab(24.5, 'broken', 'DROP BEAR BREAKOUT', 0xff2bd6, 'OUT OF ORDER', 'Gone bananas, back soon');
  // seal the cavity behind cabinet 4 so golden banana #3 is only reachable by a penetrating Thermal Rail shot
  box(0.65, 1.9, 1.1, M.darkMetal, -26.38, 0, 23.5); box(0.65, 1.9, 1.75, M.darkMetal, -26.38, 0, 25.83);
  box(0.65, 0.4, 0.95, M.darkMetal, -26.38, 1.9, 24.5);
  let acc = 0;
  world.upd.push((dt) => { acc += dt; if (acc > 0.08) { acc = 0; if (G.camera.position.distanceTo(world.cabinets[0].front) < 28) world.cabinets.forEach((c) => c.draw()); } });
}

// ---------- golden bananas (easter egg) ----------
export function bananaGeometry(scale = 1) {
  // curved banana: tube along an arc, tapered
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.3, 0.12, 0), new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0.3, 0.12, 0));
  const g = new THREE.TubeGeometry(curve, 16, 0.075, 8, false);
  const p = g.attributes.position; const tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); const t = Math.abs(tmp.x) / 0.3; const s = 1 - t * t * 0.6; const cy = curve.getPoint(tmp.x / 0.6 + 0.5).y; tmp.y = cy + (tmp.y - cy) * s; tmp.z *= s; p.setXYZ(i, tmp.x, tmp.y, tmp.z); }
  g.computeVertexNormals(); g.scale(scale, scale, scale); return g;
}
function buildBananas() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23a, metalness: 1, roughness: 0.18, emissive: new THREE.Color(0.9, 0.6, 0.05) });
  const spots = [[21, 9.45, -21], [-15.4, 1.42, -14.3], [-26.38, 1.0, 24.5]];
  spots.forEach((p, i) => {
    const m = new THREE.Mesh(bananaGeometry(1.0), mat); m.position.set(...p); G.scene.add(m);
    if (i === 2) m.layers.enable(2); // it's warm: shows up through the cabinet in the Thermal Rail scope
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), neonMat(0xffe080, 4)); m.add(glint); glint.position.set(0.32, 0.14, 0);
    world.bananas.push({ mesh: m, pos: m.position, r: 0.45, found: false, i }); // hitbox ~1.5x visual
  });
  world.upd.push(() => { world.bananas.forEach((b) => { if (!b.found) { b.mesh.rotation.y = G.t * 1.5 + b.i; b.mesh.children[0].scale.setScalar(0.6 + Math.abs(Math.sin(G.t * 3 + b.i)) * 0.8); } }); });
}

// ---------- lights ----------
function buildLights() {
  const S = G.scene;
  const hemi = new THREE.HemisphereLight(0x5a4a9a, 0x101018, 0.55); S.add(hemi); world.lights.hemi = hemi;
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.5); moon.position.set(-30, 60, 20); S.add(moon); world.lights.moon = moon;
  const L = (c, i, x, y, z, d = 22) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); S.add(l); return l; };
  world.lights.billboard = L(0xff2bd6, 40, 0, 6, -21, 26);
  world.lights.arcade = L(0x18e7ff, 9, -21.5, 2.3, 21.5, 12);
  world.lights.globe = L(0x40c8ff, 12, 0, 3.5, 0, 14);
}

let nextLightning = 8;
export function setBlackout(on) { world.blackout = on ? 1 : 0; }
let blk = 0;
export function updateWorld(dt) {
  U.time.value = G.t;
  blk += ((world.blackout ? 1 : 0) - blk) * Math.min(1, dt * 2);
  const L = world.lights; if (L.billboard) { L.billboard.intensity = 40 * (1 - blk * 0.9); L.arcade.intensity = 9 * (1 - blk * 0.8); L.globe.intensity = 12 * (1 - blk); L.hemi.intensity = 0.55 * (1 - blk * 0.75); }
  G.scene.environmentIntensity = 1 - blk * 0.7;
  for (const h of world.holos) { h.visible = blk < 0.5 || Math.sin(G.t * 31 + h.userData.hid) > 0.9; if (world.glitchHolos) h.position.x += Math.sin(G.t * 50 + h.userData.hid) * 0.002; }
  for (const f of world.upd) f(dt);
  // lightning
  nextLightning -= dt;
  const sm = world.sky.material.uniforms.flash;
  if (nextLightning < 0) { nextLightning = rand(25, 60); world.flashT = 0.45; emit('lightning'); }
  if (world.flashT > 0) {
    world.flashT -= dt; const f = Math.max(0, world.flashT) / 0.45; const fl = f * (0.6 + 0.4 * Math.sin(world.flashT * 60));
    sm.value = fl; world.lights.moon.intensity = 0.5 + fl * 6; gfx.fx.uniforms.flash.value = fl * 0.05;
  } else { sm.value = 0; world.lights.moon.intensity = 0.5; gfx.fx.uniforms.flash.value = 0; }
}

export function buildWorld() {
  const M = buildMaterials(); world.M = M;
  buildSky(); buildLights(); buildFloor(M); buildCity(); buildPlaza(M); buildArcade(M); buildBananas(); buildRain();
  G.scene.traverse((o) => { if (o.material && o.material.userData && o.material.userData.shaft) world.shafts.push(o); });
  const applyQ = (Q) => world.shafts.forEach((o) => { o.visible = Q.shafts; });
  gfx.onQuality.push(applyQ); applyQ(QUALITY[gfx.q]);
}
