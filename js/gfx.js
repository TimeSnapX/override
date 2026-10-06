// OVERRIDE — renderer, post-processing, environment lighting, quality scaler, thermal vision.
import { THREE, G, LS, clamp } from './core.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from '../vendor/three/addons/postprocessing/SMAAPass.js';
import { Pass } from '../vendor/three/addons/postprocessing/Pass.js';
import { FXAAShader } from '../vendor/three/addons/shaders/FXAAShader.js';

export const LAYER_VIEW = 1, LAYER_HEAT = 2;

// Tiers from GDD §11. Switching tiers only changes render scale/DPR, pass enable flags, draw ranges and
// visibility — every resource (SMAA, bloom, reflector, rain buffers, light pool) is pre-created at boot.
export const QUALITY = {
  low:    { name: 'Low',    scale: 0.6,  dpr: 1.0,  bloom: false, aa: 'none', reflect: 0,   rain: 1500,  splash: 0,   farCity: 0.5, particles: 300,  shafts: false, bloomRes: 0.5 },
  medium: { name: 'Medium', scale: 0.75, dpr: 1.25, bloom: true,  aa: 'fxaa', reflect: 0,   rain: 4000,  splash: 150, farCity: 0.8, particles: 800,  shafts: true, bloomRes: 0.35, strength: 0.7 },
  high:   { name: 'High',   scale: 1.0,  dpr: 1.5,  bloom: true,  aa: 'fxaa', reflect: 0,   rain: 8000,  splash: 300, farCity: 1,   particles: 1500, shafts: true, bloomRes: 0.5, strength: 0.75 },
  ultra:  { name: 'Ultra',  scale: 1.0,  dpr: 2.0,  bloom: true,  aa: 'smaa', reflect: 0.5, rain: 15000, splash: 500, farCity: 1,   particles: 1500, shafts: true, bloomRes: 0.5, strength: 0.85 },
};
export const QORDER = ['low', 'medium', 'high', 'ultra'];

const FxShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, glitch: { value: 0 },
    thermal: { value: 0 }, aberr: { value: 0.0015 }, vig: { value: 1.0 }, overclock: { value: 0 }, flash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, damage, glitch, thermal, aberr, vig, overclock, flash;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec3 heat(float t){ // cold -> hot palette
      t = clamp(t,0.0,1.0);
      vec3 c = mix(vec3(0.01,0.02,0.08), vec3(0.05,0.12,0.45), smoothstep(0.0,0.35,t));
      c = mix(c, vec3(0.45,0.05,0.55), smoothstep(0.35,0.6,t));
      c = mix(c, vec3(1.6,0.35,0.05), smoothstep(0.6,0.82,t));
      c = mix(c, vec3(3.0,2.6,1.2), smoothstep(0.82,1.0,t));
      return c;
    }
    void main(){
      vec2 uv = vUv;
      // glitch: horizontal slice offsets
      if (glitch > 0.0) {
        float band = floor(uv.y * 24.0 + floor(time*30.0));
        float r = h(vec2(band, floor(time*20.0)));
        if (r < glitch*0.5) uv.x += (h(vec2(band,1.0))-0.5)*0.08*glitch;
      }
      vec2 dir = uv - 0.5; float d = length(dir);
      float ab = aberr + damage*0.006 + glitch*0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir*ab).b;
      if (thermal > 0.5) {
        float l = dot(col, vec3(0.2126,0.7152,0.0722));
        float t = 0.08 + pow(clamp(l*0.35,0.0,1.0),0.7)*0.42;
        col = heat(t) * 0.7;
        col += (h(uv*vec2(800.0,600.0)+time)-0.5)*0.04;
        col *= 0.92 + 0.08*sin(uv.y*600.0);
      }
      // overclock tint
      col = mix(col, col*vec3(1.1,0.9,1.25), overclock*0.6);
      // damage vignette
      float v = smoothstep(0.85, 0.2, d*vig);
      col *= mix(0.55, 1.0, v);
      col = mix(col, col*0.5 + vec3(0.9,0.04,0.05)*0.6, damage * smoothstep(0.25,0.75,d));
      col += vec3(0.6,0.7,1.0)*flash;
      // fine film grain
      col += (h(uv*1000.0 + fract(time)*91.0)-0.5)*0.015;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Renders "hot" enemies on top of the thermal image, ignoring depth (see through walls).
class ThermalOverlayPass extends Pass {
  constructor(scene, camera) {
    super(); this.scene = scene; this.camera = camera; this.needsSwap = false; this.enabled = false;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float time; varying vec3 vN; varying vec3 vV;
        void main(){ float f = clamp(dot(normalize(vN), normalize(vV)),0.0,1.0);
          vec3 core = vec3(3.2,2.8,1.4), mid = vec3(2.2,0.7,0.08), edge = vec3(0.9,0.05,0.25);
          vec3 c = mix(edge, mid, smoothstep(0.0,0.5,f)); c = mix(c, core, smoothstep(0.55,1.0,f));
          c *= 0.9 + 0.1*sin(time*8.0);
          gl_FragColor = vec4(c, 0.92); }`,
      depthTest: false, depthWrite: false, transparent: true,
    });
  }
  render(renderer, writeBuffer, readBuffer) {
    const s = this.scene, cam = this.camera;
    const prevMask = cam.layers.mask, prevBg = s.background, prevOver = s.overrideMaterial, prevAuto = renderer.autoClear, prevFog = s.fog;
    cam.layers.set(LAYER_HEAT); s.background = null; s.overrideMaterial = this.mat; s.fog = null; renderer.autoClear = false;
    this.mat.uniforms.time.value = G.t;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.render(s, cam);
    cam.layers.mask = prevMask; s.background = prevBg; s.overrideMaterial = prevOver; s.fog = prevFog; renderer.autoClear = prevAuto;
  }
}

export const gfx = {
  q: 'high', auto: true, composer: null, bloom: null, fx: null, thermalPass: null, aa: null, smaa: null, output: null,
  fpsEma: 60, lowSince: 0, highSince: 0, lastChange: 0, maxAuto: 'ultra', reflector: null, onQuality: [], onAutoChange: null, renderScale: 1,
  pixelProbe: null,

  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    G.renderer = r;
    const scene = new THREE.Scene(); G.scene = scene;
    scene.fog = new THREE.FogExp2(0x0d0b22, 0.018);
    const cam = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.04, 900);
    cam.layers.enable(LAYER_VIEW); G.camera = cam; scene.add(cam);
    this.buildEnv();
    const comp = new EffectComposer(r);
    comp.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.4, 0.8); comp.addPass(this.bloom);
    this.fx = new ShaderPass(FxShader); comp.addPass(this.fx);
    this.thermalPass = new ThermalOverlayPass(scene, cam); comp.addPass(this.thermalPass);
    this.output = new OutputPass(); comp.addPass(this.output);
    this.aa = new ShaderPass(FXAAShader); comp.addPass(this.aa);
    this.smaa = new SMAAPass(256, 256); this.smaa.enabled = false; comp.addPass(this.smaa); // pre-created: no mid-fight allocation of new passes
    this.composer = comp;
    const saved = LS.get('quality', null);
    const qp = G.params.get('q');
    if (qp && QUALITY[qp]) { this.auto = false; this.q = qp; }
    else if (saved && saved !== 'auto' && QUALITY[saved]) { this.auto = false; this.q = saved; }
    else { this.auto = true; this.q = this.guessTier(); }
    this.maxAuto = G.mobile ? 'high' : 'ultra';
    this.setQuality(this.q, false);
    addEventListener('resize', () => this.resize());
  },

  buildEnv() {
    // Neon HDR environment (RoomEnvironment-style PMREM bake with coloured emitters)
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.03), side: THREE.BackSide }));
    room.position.y = 5; env.add(room);
    const panel = (c, k, pos, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(...sz), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 3, 0); env.add(m); };
    panel(0xff2bd6, 6, [-12, 4, -6], [6, 3]); panel(0x18e7ff, 6, [12, 3, 4], [5, 4]); panel(0xff7a1a, 4, [3, 2, -13], [8, 1.5]);
    panel(0x6a5cff, 3, [-6, 2, 13], [6, 2]); panel(0xc8d8ff, 1.6, [0, 11, 0], [10, 10]); panel(0xff3355, 5, [10, 6, -10], [2, 4]);
    const pm = new THREE.PMREMGenerator(G.renderer);
    G.scene.environment = pm.fromScene(env, 0.035).texture;
    G.scene.environmentIntensity = 1.0;
    pm.dispose();
  },

  setQuality(q, save = true) {
    if (!QUALITY[q]) return;
    this.q = q; const Q = QUALITY[q];
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // render scale x DPR cap, then a hard pixel budget so huge phone screens never render > ~1.6-2.4 MP
    let pr = Math.min(dpr, Q.dpr) * Q.scale * this.renderScale;
    const maxPx = G.mobile ? (q === 'ultra' ? 2.4e6 : 1.6e6) : 4.2e6;
    const px = innerWidth * innerHeight * pr * pr;
    if (px > maxPx) pr *= Math.sqrt(maxPx / px);
    this.pr = Math.max(0.5, pr);
    G.renderer.setPixelRatio(this.pr);
    this.bloom.enabled = Q.bloom && !(G.weapons && G.weapons.scoped);
    this.bloom.strength = Q.strength || 0.9;
    this.aa.enabled = Q.aa === 'fxaa';
    this.smaa.enabled = Q.aa === 'smaa';
    this.resize();
    if (save) LS.set('quality', this.auto ? 'auto' : q);
    this.onQuality.forEach((f) => f(Q, q));
  },
  setAuto(a) { this.auto = a; LS.set('quality', a ? 'auto' : this.q); this.lowSince = this.highSince = 0; },

  resize() {
    const w = innerWidth, h = innerHeight;
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.pr); this.composer.setSize(w, h);
    const Q = QUALITY[this.q];
    if (this.bloom) this.bloom.setSize(Math.round(w * this.pr * (Q.bloomRes || 0.5)), Math.round(h * this.pr * (Q.bloomRes || 0.5)));
    this.aa.material.uniforms.resolution.value.set(1 / (w * this.pr), 1 / (h * this.pr));
    if (this.smaa) this.smaa.setSize(w * this.pr, h * this.pr);
    if (this.reflector) { const k = Q.reflect || 0.25; this.reflector.getRenderTarget().setSize(Math.max(64, Math.round(w * this.pr * k)), Math.max(64, Math.round(h * this.pr * k))); }
  },

  render(dt) {
    const u = this.fx.uniforms; u.time.value = G.t;
    this.composer.render(dt);
    if (this.pixelProbe) { // test hook: read back a pixel from the frame just drawn
      const gl = G.renderer.getContext(); const p = new Uint8Array(4);
      const { x, y } = this.pixelProbe; const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(x * cw), Math.round((1 - y) * ch), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      this.pixelProbe.result = Array.from(p); this.pixelProbe.done = true; this.pixelProbe = null;
    }
  },

  // Automatic quality scaler (GDD §11): rolling ~2 s frame-time average; < 28 fps for 3 s -> step down,
  // > 55 fps for 10 s -> step up (never above the device's max tier); at most one change every 5 s.
  frames: [],
  tickFps(realDt) {
    if (realDt <= 0 || realDt > 0.5) return;
    const now = performance.now();
    this.frames.push([now, realDt]); while (this.frames.length && now - this.frames[0][0] > 2000) this.frames.shift();
    let sum = 0; for (const f of this.frames) sum += f[1]; this.fps = this.frames.length / Math.max(1e-3, sum);
    if (!this.auto || G.state !== 'play') { this.lowSince = this.highSince = 0; return; }
    if (now - this.lastChange < 5000) return;
    const i = QORDER.indexOf(this.q);
    if (this.fps < 28 && i > 0) { this.highSince = 0; if (!this.lowSince) this.lowSince = now; if (now - this.lowSince > 3000) this.autoStep(QORDER[i - 1], now); }
    else if (this.fps > 55 && i < QORDER.indexOf(this.maxAuto)) { this.lowSince = 0; if (!this.highSince) this.highSince = now; if (now - this.highSince > 10000) this.autoStep(QORDER[i + 1], now); }
    else { this.lowSince = this.highSince = 0; }
  },
  autoStep(q, now) { this.setQuality(q, false); this.lastChange = now; this.lowSince = this.highSince = 0; this.frames.length = 0; if (this.onAutoChange) this.onAutoChange(q); },
  // first-guess tier from a quick device heuristic
  guessTier() {
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    let r = ''; try { const gl = G.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* ignore */ }
    if (/swiftshader|llvmpipe|software/i.test(r)) return 'low';
    if (G.mobile) return (mem >= 6 && cores >= 8) ? 'medium' : (mem <= 3 ? 'low' : 'medium');
    return (mem >= 8 && cores >= 8) ? 'high' : 'medium';
  },

  bloomWanted() { return QUALITY[this.q].bloom; },
  setThermal(on) { this.fx.uniforms.thermal.value = on ? 1 : 0; this.thermalPass.enabled = on; },
};
