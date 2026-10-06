// OVERRIDE — tiny WebAudio synth: weapons, explosions, rain ambience, music loop, silly banana noises.
import { LS, rand } from './core.js';

let ctx = null, master, sfx, musicBus, ambBus, noiseBuf;
export const audio = {
  muted: LS.get('muted', false), started: false,
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.35; ambBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.started = true;
  },
  setMuted(m) { this.muted = m; LS.set('muted', m); if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); },
  get ctx() { return ctx; },

  _noise(dur, { type = 'bandpass', f = 1000, q = 1, g = 0.5, f2 = null, attack = 0.002, bus = sfx, when = 0 } = {}) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rand(0.9, 1.1);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + attack); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(gn).connect(bus); s.start(t, rand(0, 1.5)); s.stop(t + dur + 0.05);
  },
  _tone(dur, { type = 'sine', f = 440, f2 = null, g = 0.3, attack = 0.003, bus = sfx, when = 0, curve = 'exp' } = {}) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) curve === 'exp' ? o.frequency.exponentialRampToValueAtTime(f2, t + dur) : o.frequency.linearRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + attack); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(bus); o.start(t); o.stop(t + dur + 0.05);
    return o;
  },

  shot(kind) {
    if (kind === 'rifle') { this._noise(0.12, { f: 2400, f2: 600, q: 0.8, g: 0.45 }); this._tone(0.09, { type: 'square', f: 420, f2: 90, g: 0.16 }); }
    else if (kind === 'shotgun') { this._noise(0.35, { type: 'lowpass', f: 4000, f2: 300, g: 0.85 }); this._tone(0.25, { type: 'sawtooth', f: 160, f2: 40, g: 0.3 }); this._tone(0.12, { type: 'square', f: 1800, f2: 300, g: 0.08 }); }
    else if (kind === 'rail') { this._tone(0.5, { type: 'sawtooth', f: 2200, f2: 60, g: 0.35 }); this._noise(0.5, { type: 'highpass', f: 3000, f2: 400, g: 0.4 }); this._tone(0.6, { type: 'sine', f: 90, f2: 30, g: 0.6 }); }
    else if (kind === 'banana') { this._tone(0.25, { type: 'triangle', f: 300, f2: 900, g: 0.35 }); this._noise(0.08, { f: 1200, g: 0.2 }); }
  },
  charge(p) { this._tone(0.06, { type: 'sine', f: 300 + p * 1400, g: 0.06 }); },
  enemyShot() { this._tone(0.16, { type: 'square', f: 900, f2: 200, g: 0.08 }); },
  hit(crit) { this._tone(0.05, { type: 'triangle', f: crit ? 2400 : 1500, g: crit ? 0.25 : 0.15 }); },
  kill() { this._tone(0.12, { type: 'square', f: 880, g: 0.12 }); this._tone(0.18, { type: 'square', f: 1320, g: 0.12, when: 0.07 }); },
  ricochet() { this._tone(0.15, { type: 'sine', f: 3000, f2: 1200, g: 0.04 }); },
  explosion(size = 1) { this._noise(0.9 * size, { type: 'lowpass', f: 1800, f2: 80, g: 0.9 }); this._tone(0.8 * size, { type: 'sine', f: 110, f2: 28, g: 0.8 }); },
  hurt() { this._tone(0.2, { type: 'sawtooth', f: 180, f2: 70, g: 0.25 }); this._noise(0.15, { f: 600, g: 0.2 }); },
  reload() { this._noise(0.05, { f: 3000, q: 3, g: 0.3 }); this._noise(0.06, { f: 1800, q: 3, g: 0.3, when: 0.25 }); this._tone(0.05, { type: 'square', f: 600, g: 0.06, when: 0.3 }); },
  dry() { this._tone(0.04, { type: 'square', f: 300, g: 0.08 }); },
  dash() { this._noise(0.3, { type: 'bandpass', f: 400, f2: 3000, q: 2, g: 0.4 }); },
  swap() { this._noise(0.06, { f: 2500, q: 4, g: 0.2 }); },
  override() { this._tone(0.7, { type: 'sawtooth', f: 80, f2: 1600, g: 0.25 }); this._tone(0.7, { type: 'square', f: 1200, f2: 60, g: 0.1 }); for (let i = 0; i < 6; i++) this._tone(0.04, { type: 'square', f: rand(400, 3000), g: 0.08, when: i * 0.06 }); },
  shield() { this._tone(0.6, { type: 'sine', f: 200, f2: 800, g: 0.25 }); },
  waveStart() { [0, 0.15, 0.3].forEach((w, i) => this._tone(0.25, { type: 'sawtooth', f: [220, 277, 330][i], g: 0.15, when: w })); },
  waveClear() { [0, 0.1, 0.2, 0.32].forEach((w, i) => this._tone(0.3, { type: 'square', f: [523, 659, 784, 1046][i], g: 0.12, when: w })); },
  boing() { this._tone(0.3, { type: 'sine', f: 180, f2: 520, g: 0.35 }); this._tone(0.25, { type: 'sine', f: 520, f2: 200, g: 0.2, when: 0.12 }); },
  peel() { // comedic peel burst: slide whistle + splat + kazoo-ish honk
    this._tone(0.45, { type: 'sine', f: 400, f2: 1600, g: 0.3, curve: 'lin' }); this._tone(0.3, { type: 'sine', f: 1600, f2: 300, g: 0.25, when: 0.4, curve: 'lin' });
    this._noise(0.3, { type: 'lowpass', f: 900, f2: 200, g: 0.7 }); this._tone(0.25, { type: 'sawtooth', f: 330, f2: 300, g: 0.12, when: 0.1 });
  },
  slip() { this._tone(0.5, { type: 'sine', f: 1200, f2: 200, g: 0.2, curve: 'lin' }); },
  goldBanana() { [0, 0.08, 0.16, 0.24, 0.36].forEach((w, i) => this._tone(0.2, { type: 'triangle', f: [660, 880, 990, 1320, 1760][i], g: 0.18, when: w })); },
  achievement() { [0, 0.12, 0.24, 0.5].forEach((w, i) => this._tone(0.4, { type: 'square', f: [784, 988, 1175, 1568][i], g: 0.12, when: w })); },
  thunder() { this._noise(3.5, { type: 'lowpass', f: 400, f2: 60, g: 0.7, attack: 0.08, bus: ambBus }); this._noise(1.2, { type: 'lowpass', f: 1500, f2: 100, g: 0.5, when: 0.05, bus: ambBus }); },
  blip(f = 880, d = 0.05, type = 'square', g = 0.1) { this._tone(d, { type, f, g }); },
  ui() { this._tone(0.05, { type: 'triangle', f: 1200, g: 0.1 }); },

  startAmbience() {
    // rain: looping filtered noise layers
    const mk = (f, type, g) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const gn = ctx.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(ambBus); s.start(); };
    mk(1200, 'lowpass', 0.5); mk(5000, 'highpass', 0.12);
    // city hum
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 55; o2.frequency.value = 55.4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; const hg = ctx.createGain(); hg.gain.value = 0.12;
    o1.connect(lp); o2.connect(lp); lp.connect(hg).connect(ambBus); o1.start(); o2.start();
  },

  // minimal synthwave loop scheduler
  music: { on: false, step: 0, next: 0, timer: null, intensity: 0 },
  startMusic() {
    if (!ctx || this.music.on) return; const m = this.music; m.on = true; m.next = ctx.currentTime + 0.1; m.step = 0;
    const bass = [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 19, 10];
    const root = 41.2; // E1
    m.timer = setInterval(() => {
      while (m.next < ctx.currentTime + 0.25) {
        const s = m.step % 16, bar = Math.floor(m.step / 16) % 4, dur = 0.125;
        const tr = [0, 0, -4, -2][bar];
        const f = root * Math.pow(2, (bass[s] + tr) / 12) * 2;
        const t0 = m.next - ctx.currentTime;
        this._tone(dur * 0.9, { type: 'sawtooth', f, g: 0.22, bus: musicBus, when: t0 });
        if (s % 4 === 0) { this._tone(0.18, { type: 'sine', f: 120, f2: 40, g: 0.55, bus: musicBus, when: t0 }); }
        if (s % 4 === 2 && m.intensity > 0) this._noise(0.05, { type: 'highpass', f: 7000, g: 0.25, bus: musicBus, when: t0 });
        if (s % 8 === 4) this._noise(0.15, { type: 'bandpass', f: 1800, g: 0.35, bus: musicBus, when: t0 });
        if (m.intensity > 1 && s % 2 === 1) this._tone(0.08, { type: 'square', f: f * 4, g: 0.04, bus: musicBus, when: t0 });
        m.next += dur; m.step++;
      }
    }, 60);
  },
  stopMusic() { const m = this.music; m.on = false; clearInterval(m.timer); },
};
