// OVERRIDE — retro arcade corner: NEON CYCLES (light-cycle / snake) and ROBO INVADERS (Space Invaders-style).
// 320x240 logical canvas, integer-scaled, CRT scanlines; touch D-pad/swipe + keyboard.
import { G, LS, rand, randi, emit } from './core.js';
import { CONFIG } from './config.js';
import { audio } from './audio.js';

const AC = CONFIG.arcade;
const Wd = 320, Ht = 240;
const session = { beat: { cycles: false, invaders: false }, ufoStreak: 0 };

function hs(kind) { return LS.get('arcade.' + kind, []); }
function addHs(kind, score) { const t = hs(kind); t.push({ s: score, d: new Date().toISOString().slice(0, 10) }); t.sort((a, b) => b.s - a.s); t.length = Math.min(t.length, 10); LS.set('arcade.' + kind, t); return t; }
export const bestOf = (kind) => (hs(kind)[0] || { s: 0 }).s;

// ------------------------------------------------------------ NEON CYCLES
function NeonCycles() {
  const [GW, GH] = AC.cycles.grid, CS = 8;
  const g = { name: 'NEON CYCLES', score: 0, over: false, round: 1, grid: null, bikes: [], orb: null, acc: 0, msg: 'GET READY', msgT: 1.2, queue: [] };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const free = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && !g.grid[y * GW + x];
  const placeOrb = () => { for (let i = 0; i < 200; i++) { const x = randi(1, GW - 2), y = randi(1, GH - 2); if (free(x, y)) { g.orb = { x, y }; return; } } };
  const flood = (sx, sy, limit = 250) => {
    if (!free(sx, sy)) return 0; const seen = new Set([sy * GW + sx]); const st = [[sx, sy]]; let n = 0;
    while (st.length && n < limit) { const [x, y] = st.pop(); n++; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = ny * GW + nx; if (!seen.has(k) && free(nx, ny)) { seen.add(k); st.push([nx, ny]); } } }
    return n;
  };
  g.startRound = () => {
    g.grid = new Uint8Array(GW * GH); g.bikes = [];
    g.bikes.push({ x: 6, y: GH >> 1, d: 0, alive: true, c: '#18e7ff', id: 1, ai: false });
    g.bikes.push({ x: GW - 7, y: GH >> 1, d: 2, alive: true, c: '#ff7a1a', id: 2, ai: true });
    if (g.round >= 3) g.bikes.push({ x: GW >> 1, y: 4, d: 1, alive: true, c: '#ff2bd6', id: 3, ai: true });
    for (const b of g.bikes) g.grid[b.y * GW + b.x] = b.id;
    placeOrb(); g.msg = 'ROUND ' + g.round; g.msgT = 1.0; g.queue.length = 0;
  };
  g.startRound();
  g.input = (a) => {
    const map = { right: 0, down: 1, left: 2, up: 3 }; if (!(a in map)) return;
    const last = g.queue.length ? g.queue[g.queue.length - 1] : g.bikes[0].d;
    const nd = map[a]; if (nd === last || (nd + 2) % 4 === last) return; // ignore 180° turns
    if (g.queue.length < 2) g.queue.push(nd);
  };
  const aiTurn = (b) => {
    const opts = [b.d, (b.d + 1) % 4, (b.d + 3) % 4].map((d) => { const nx = b.x + DIRS[d][0], ny = b.y + DIRS[d][1]; return { d, a: flood(nx, ny) }; }).filter((o) => o.a > 0);
    if (!opts.length) return;
    let best = opts.reduce((p, c) => (c.a > p.a ? c : p), opts[0]);
    const straight = opts.find((o) => o.d === b.d); if (straight && straight.a >= best.a * 0.9) best = straight;
    if (Math.random() < 0.1) best = opts[randi(0, opts.length - 1)];
    b.d = best.d;
  };
  g.update = (dt) => {
    if (g.over) return;
    if (g.msgT > 0) { g.msgT -= dt; return; }
    const speed = Math.min(AC.cycles.speedMax, AC.cycles.speed + AC.cycles.speedStep * (g.round - 1));
    g.acc += dt; const step = 1 / speed;
    while (g.acc >= step) {
      g.acc -= step;
      const p = g.bikes[0]; if (g.queue.length) p.d = g.queue.shift();
      for (const b of g.bikes) if (b.alive && b.ai) aiTurn(b);
      const moves = g.bikes.filter((b) => b.alive).map((b) => ({ b, x: b.x + DIRS[b.d][0], y: b.y + DIRS[b.d][1] }));
      for (const m of moves) { if (!free(m.x, m.y) || moves.some((o) => o !== m && o.x === m.x && o.y === m.y)) { m.b.alive = false; m.crash = true; audio.blip(110, 0.25, 'sawtooth', 0.12); } }
      for (const m of moves) if (!m.crash) { m.b.x = m.x; m.b.y = m.y; g.grid[m.y * GW + m.x] = m.b.id; if (g.orb && m.x === g.orb.x && m.y === g.orb.y) { if (m.b === p) { g.score += AC.cycles.orb; audio.blip(1500, 0.05, 'square', 0.1); } placeOrb(); } }
      if (!p.alive) { g.over = true; g.msg = 'DEREZZED'; return; }
      if (g.bikes.every((b) => !b.ai || !b.alive)) { g.score += AC.cycles.round; g.round++; audio.waveClear(); g.startRound(); return; }
    }
  };
  g.draw = (c) => {
    c.fillStyle = '#05010d'; c.fillRect(0, 0, Wd, Ht);
    c.strokeStyle = 'rgba(90,50,170,0.35)'; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x <= GW; x += 2) { c.moveTo(x * CS + 0.5, 0); c.lineTo(x * CS + 0.5, Ht); } for (let y = 0; y <= GH; y += 2) { c.moveTo(0, y * CS + 0.5); c.lineTo(Wd, y * CS + 0.5); } c.stroke();
    const cols = { 1: '#18e7ff', 2: '#ff7a1a', 3: '#ff2bd6' };
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const v = g.grid[y * GW + x]; if (v) { c.fillStyle = cols[v]; c.globalAlpha = 0.75; c.fillRect(x * CS + 1, y * CS + 1, CS - 2, CS - 2); } }
    c.globalAlpha = 1;
    for (const b of g.bikes) if (b.alive) { c.fillStyle = '#fff'; c.shadowColor = b.c; c.shadowBlur = 8; c.fillRect(b.x * CS, b.y * CS, CS, CS); c.shadowBlur = 0; }
    if (g.orb) { c.fillStyle = '#ffd200'; c.beginPath(); c.arc(g.orb.x * CS + 4, g.orb.y * CS + 4, 3 + Math.sin(performance.now() / 120), 0, 7); c.fill(); }
    hud(c, g.score, 'RND ' + g.round);
    if (g.msgT > 0 || g.over) banner(c, g.msg);
  };
  return g;
}

// ------------------------------------------------------------ ROBO INVADERS
function RoboInvaders() {
  const g = { name: 'ROBO INVADERS', score: 0, over: false, lives: AC.invaders.lives, wave: 1, msg: 'WAVE 1', msgT: 1.2 };
  const P = { x: Wd / 2, y: 222, w: 16, cd: 0, dead: 0 };
  let inv = [], dir = 1, stepT = 0, bullet = null, bombs = [], ufo = null, ufoT = rand(12, 20), bunkers = [], held = { left: false, right: false };
  const rowsInfo = [{ pts: 30, c: '#ff2bd6', k: 'warden' }, { pts: 20, c: '#ff7a1a', k: 'sentinel' }, { pts: 20, c: '#ff7a1a', k: 'sentinel' }, { pts: 10, c: '#3cff8a', k: 'wasp' }, { pts: 10, c: '#3cff8a', k: 'wasp' }];
  const mkBunkers = () => { bunkers = []; for (let b = 0; b < 4; b++) { const bx = 40 + b * 72; for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) { if (y > 5 && x > 3 && x < 8) continue; if (y === 0 && (x < 2 || x > 9)) continue; bunkers.push({ x: bx + x * 2, y: 184 + y * 2, alive: true }); } } };
  const mkWave = () => {
    inv = []; const top = 30 + Math.min(5, g.wave - 1) * 8;
    for (let r = 0; r < AC.invaders.rows; r++) for (let c = 0; c < AC.invaders.cols; c++) inv.push({ x: 30 + c * 22, y: top + r * 16, r, alive: true });
    dir = 1; stepT = 0; bombs = []; bullet = null; g.msg = 'WAVE ' + g.wave; g.msgT = 1.0;
  };
  mkBunkers(); mkWave();
  g.input = (a, down = true) => {
    if (a === 'left' || a === 'right') held[a] = down;
    if (a === 'fire' && down && !bullet && P.dead <= 0 && !g.over && g.msgT <= 0) { bullet = { x: P.x, y: P.y - 8 }; audio.blip(1200, 0.06, 'square', 0.08); }
  };
  g.setDrag = (x) => { P.x = Math.max(10, Math.min(Wd - 10, x)); };
  const hitBunker = (x, y) => { for (const b of bunkers) if (b.alive && x >= b.x - 1 && x <= b.x + 3 && y >= b.y - 1 && y <= b.y + 3) { b.alive = false; for (const o of bunkers) if (o.alive && Math.abs(o.x - b.x) <= 2 && Math.abs(o.y - b.y) <= 2 && Math.random() < 0.5) o.alive = false; return true; } return false; };
  g.update = (dt) => {
    if (g.over) return;
    if (g.msgT > 0) { g.msgT -= dt; return; }
    if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0 && g.lives <= 0) { g.over = true; g.msg = 'GAME OVER'; } return; }
    if (held.left) P.x -= 130 * dt; if (held.right) P.x += 130 * dt; P.x = Math.max(10, Math.min(Wd - 10, P.x));
    const alive = inv.filter((i) => i.alive);
    if (!alive.length) { g.wave++; audio.waveClear(); mkWave(); return; }
    stepT -= dt; const interval = Math.max(0.05, 0.03 + alive.length / 55 * 0.6 - (g.wave - 1) * 0.03);
    if (stepT <= 0) {
      stepT = interval; let edge = false;
      for (const i of alive) if ((dir > 0 && i.x > Wd - 16) || (dir < 0 && i.x < 16)) edge = true;
      if (edge) { dir = -dir; for (const i of alive) i.y += 8; } else for (const i of alive) i.x += 4 * dir;
      audio.blip(80 + (g.stepN = ((g.stepN || 0) + 1) % 4) * 15, 0.05, 'square', 0.06);
      if (alive.some((i) => i.y > 176)) { for (const i of alive) if (i.y > 176) for (const b of bunkers) if (Math.abs(b.x - i.x) < 10 && Math.abs(b.y - i.y) < 8) b.alive = false; }
      if (alive.some((i) => i.y > 210)) { g.lives = 0; P.dead = 1; audio.explosion(0.5); }
    }
    // bombs
    if (Math.random() < dt * (0.9 + g.wave * 0.25) && bombs.length < 4) {
      const cols = {}; for (const i of alive) if (!cols[Math.round(i.x)] || cols[Math.round(i.x)].y < i.y) cols[Math.round(i.x)] = i;
      const shooters = Object.values(cols); const s = shooters[randi(0, shooters.length - 1)]; if (s) bombs.push({ x: s.x, y: s.y + 6 });
    }
    for (const b of bombs) { b.y += 90 * dt; if (hitBunker(b.x, b.y)) b.dead = true; if (!b.dead && Math.abs(b.x - P.x) < 8 && b.y > P.y - 5 && b.y < P.y + 5) { b.dead = true; g.lives--; P.dead = 1.2; audio.explosion(0.6); } if (b.y > Ht) b.dead = true; }
    bombs = bombs.filter((b) => !b.dead);
    // bullet
    if (bullet) {
      bullet.y -= 300 * dt;
      if (bullet.y < 0) { bullet = null; }
      else if (hitBunker(bullet.x, bullet.y)) bullet = null;
      else {
        for (const i of alive) if (Math.abs(i.x - bullet.x) < 7 && Math.abs(i.y - bullet.y) < 6) { i.alive = false; g.score += rowsInfo[i.r].pts; bullet = null; audio.blip(300, 0.12, 'sawtooth', 0.1); break; }
        if (bullet && ufo && Math.abs(ufo.x - bullet.x) < (ufo.banana ? 7 : 12) && Math.abs(ufo.y - bullet.y) < 6) {
          if (ufo.banana) { g.score += 500; emit('toast', 'GOLDEN BANANA HINT: one hides behind a broken cabinet. It\'s warm.', 'gold'); audio.goldBanana(); session.ufoStreak = 0; }
          else { const pts = [100, 150, 200, 300][randi(0, 3)]; g.score += pts; g.popup = { x: ufo.x, y: ufo.y, t: 1, s: pts + '' }; session.ufoStreak++; audio.blip(600, 0.3, 'square', 0.12); }
          ufo = null; bullet = null;
        }
      }
    }
    // UFO "SYNOD Blimp" (3 in a row -> a tiny banana appears instead)
    ufoT -= dt;
    if (!ufo && ufoT <= 0) { const fromLeft = Math.random() < 0.5; ufo = { x: fromLeft ? -20 : Wd + 20, y: 18, v: fromLeft ? 60 : -60, banana: session.ufoStreak >= 3 }; ufoT = rand(15, 25); }
    if (ufo) { ufo.x += ufo.v * dt; if (ufo.x < -30 || ufo.x > Wd + 30) { if (ufo.banana) session.ufoStreak = 0; else session.ufoStreak = 0; ufo = null; } } // a missed UFO breaks the streak
    if (g.popup) { g.popup.t -= dt; if (g.popup.t <= 0) g.popup = null; }
  };
  const sprite = (c, x, y, k, frame) => {
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (k === 'wasp') { c.fillRect(-5, -3, 10, 6); c.fillRect(frame ? -8 : -7, -5, 3, 2); c.fillRect(frame ? 5 : 4, -5, 3, 2); c.fillStyle = '#000'; c.fillRect(-2, -1, 4, 2); }
    else if (k === 'sentinel') { c.fillRect(-6, -4, 12, 6); c.fillRect(-4, -6, 8, 2); c.fillRect(frame ? -6 : -5, 2, 3, 3); c.fillRect(frame ? 3 : 2, 2, 3, 3); c.fillStyle = '#fff'; c.fillRect(-1, -2, 2, 2); }
    else { c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); c.fillRect(-8, -1, 16, 2); c.fillStyle = '#fff'; c.fillRect(-1, -1, 2, 2); }
    c.restore();
  };
  g.draw = (c) => {
    c.fillStyle = '#03020a'; c.fillRect(0, 0, Wd, Ht);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,' + ((i * 37) % 10) / 20 + ')'; c.fillRect((i * 97) % Wd, (i * 53) % Ht, 1, 1); }
    const frame = Math.floor(performance.now() / 400) % 2;
    for (const i of inv) if (i.alive) { c.fillStyle = rowsInfo[i.r].c; sprite(c, i.x, i.y, rowsInfo[i.r].k, frame); }
    c.fillStyle = '#3cff8a'; for (const b of bunkers) if (b.alive) c.fillRect(b.x, b.y, 2, 2);
    if (ufo) { if (ufo.banana) { c.fillStyle = '#ffd200'; c.beginPath(); c.arc(ufo.x, ufo.y, 5, 0.3, 2.8); c.lineWidth = 3; c.strokeStyle = '#ffd200'; c.stroke(); } else { c.fillStyle = '#ff3355'; c.beginPath(); c.ellipse(ufo.x, ufo.y, 12, 4, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '5px monospace'; c.fillText('SYNOD', ufo.x - 8, ufo.y + 2); } }
    if (P.dead <= 0 || Math.floor(P.dead * 10) % 2) { c.fillStyle = '#18e7ff'; c.fillRect(P.x - 8, P.y - 2, 16, 5); c.fillRect(P.x - 1, P.y - 6, 2, 4); }
    c.fillStyle = '#fff'; if (bullet) c.fillRect(bullet.x - 0.5, bullet.y - 4, 1, 5);
    c.fillStyle = '#ff7a1a'; for (const b of bombs) c.fillRect(b.x - 1, b.y - 3, 2, 5);
    if (g.popup) { c.fillStyle = '#fff'; c.font = '8px monospace'; c.fillText(g.popup.s, g.popup.x - 8, g.popup.y); }
    hud(c, g.score, '♥'.repeat(Math.max(0, g.lives)));
    if (g.msgT > 0 || g.over) banner(c, g.msg);
  };
  return g;
}

function hud(c, score, right) { c.fillStyle = '#fff'; c.font = 'bold 9px monospace'; c.fillText('SCORE ' + score, 4, 10); c.textAlign = 'right'; c.fillText(right, Wd - 4, 10); c.textAlign = 'left'; }
function banner(c, msg) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, Ht / 2 - 18, Wd, 36); c.fillStyle = '#ffd6f6'; c.font = 'bold 20px monospace'; c.textAlign = 'center'; c.shadowColor = '#ff2bd6'; c.shadowBlur = 10; c.fillText(msg, Wd / 2, Ht / 2 + 7); c.shadowBlur = 0; c.textAlign = 'left'; }

// ------------------------------------------------------------ overlay controller
export const arcade = {
  active: false, kind: null, game: null, inMatch: false, rewardUsed: {}, onClose: null, raf: 0, last: 0, ended: false, plays: 0,
  init() {
    this.el = document.getElementById('arcade'); this.canvas = document.getElementById('arcade-canvas'); this.ctx = this.canvas.getContext('2d');
    this.canvas.width = Wd; this.canvas.height = Ht; this.ctx.imageSmoothingEnabled = false;
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const m = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire', Enter: 'fire' }[e.code];
      if (e.code === 'Escape') { this.close(); e.preventDefault(); return; }
      if (m) { e.preventDefault(); if (this.ended && m === 'fire') return; this.game.input(m, true); }
    });
    addEventListener('keyup', (e) => { if (!this.active) return; const m = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[e.code]; if (m) this.game.input(m, false); });
    // touch pad
    this.el.querySelectorAll('[data-pad]').forEach((b) => {
      const a = b.dataset.pad;
      const down = (e) => { e.preventDefault(); if (this.game) this.game.input(a, true); b.classList.add('down'); if (navigator.vibrate && G.settings.haptics) navigator.vibrate(5); };
      const up = (e) => { e.preventDefault(); if (this.game) this.game.input(a, false); b.classList.remove('down'); };
      b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up, { passive: false }); b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
    });
    // swipe on the screen (Neon Cycles) / drag (Invaders)
    let sx = 0, sy = 0;
    this.canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; if (this.kind === 'invaders') this.dragTo(t.clientX); e.preventDefault(); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; if (this.kind === 'invaders') { this.dragTo(t.clientX); } else { const dx = t.clientX - sx, dy = t.clientY - sy; if (Math.hypot(dx, dy) > 24) { this.game.input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); sx = t.clientX; sy = t.clientY; } } e.preventDefault(); }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => { if (this.kind === 'invaders') this.game.input('fire', true); e.preventDefault(); }, { passive: false });
    document.getElementById('arcade-exit').addEventListener('click', () => this.close());
    document.getElementById('arcade-retry').addEventListener('click', () => this.start(this.kind));
    addEventListener('resize', () => this.fit());
  },
  dragTo(clientX) { const r = this.canvas.getBoundingClientRect(); if (this.game.setDrag) this.game.setDrag((clientX - r.left) / r.width * Wd); },
  fit() {
    if (!this.active) return;
    const wrap = document.getElementById('arcade-screen'); const aw = innerWidth * (G.mobile ? 0.56 : 0.8), ah = innerHeight * 0.78;
    let s = Math.floor(Math.min(aw / Wd, ah / Ht)); if (s < 1) s = Math.min(aw / Wd, ah / Ht);
    this.canvas.style.width = Wd * s + 'px'; this.canvas.style.height = Ht * s + 'px'; wrap.style.width = Wd * s + 'px';
  },
  open(kind, { inMatch = false, onClose = null } = {}) {
    this.inMatch = inMatch; this.onClose = onClose; this.active = true; this.prevState = G.state; G.state = 'arcade';
    this.el.classList.remove('hidden'); this.el.dataset.kind = kind; this.start(kind); this.fit();
    this.last = performance.now(); cancelAnimationFrame(this.raf); const loop = (t) => { if (!this.active) return; const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.tick(dt); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop);
    audio.init();
  },
  start(kind) {
    this.kind = kind; this.game = kind === 'cycles' ? NeonCycles() : RoboInvaders(); this.ended = false; this.plays++;
    G.stats && G.stats.arcadeGames++;
    document.getElementById('arcade-title').textContent = this.game.name;
    document.getElementById('arcade-best').textContent = 'BEST ' + bestOf(kind) + ' · TARGET ' + AC[kind].target;
    document.getElementById('arcade-result').classList.add('hidden');
    this.el.querySelector('.pad-dirs').classList.toggle('updown', kind === 'cycles');
  },
  tick(dt) {
    const g = this.game; g.update(dt); g.draw(this.ctx);
    if (g.over && !this.ended) { this.ended = true; setTimeout(() => this.finish(), 900); }
  },
  finish() {
    if (!this.active) return;
    const g = this.game, kind = this.kind, target = AC[kind].target;
    const prevBest = bestOf(kind); addHs(kind, g.score);
    const res = document.getElementById('arcade-result'); res.classList.remove('hidden');
    const lines = [`<h3>${g.over ? 'GAME OVER' : ''}</h3>`, `<div class="big">${g.score}</div>`];
    if (g.score > prevBest && g.score > 0) { lines.push('<div class="gold">NEW PERSONAL BEST!</div>'); if (this.inMatch) { emit('arcadePB', AC.pbBonus); lines.push(`<div>+${AC.pbBonus} match score</div>`); } }
    const won = g.score >= target;
    if (won) { session.beat[kind] = true; lines.push(`<div class="gold">TARGET ${target} BEATEN</div>`); }
    else lines.push(`<div>Target: ${target}</div>`);
    const choice = document.getElementById('arcade-choice'); choice.innerHTML = '';
    if (won && this.inMatch && !this.rewardUsed[kind]) {
      lines.push('<div>Choose your reward:</div>');
      const mk = (label, r) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.onclick = () => { this.rewardUsed[kind] = true; emit('arcadeReward', r); choice.innerHTML = '<div class="gold">Reward claimed!</div>'; }; choice.appendChild(b); };
      mk('+50% AMMO (ALL)', 'ammo'); mk('+25 OVERRIDE', 'override');
    }
    if (session.beat.cycles && session.beat.invaders) emit('arcadeBananaRoute');
    document.getElementById('arcade-result-text').innerHTML = lines.join('');
    emit('arcadeResult', kind, g.score, won);
  },
  close() {
    if (!this.active) return;
    this.active = false; cancelAnimationFrame(this.raf); this.el.classList.add('hidden');
    G.state = this.prevState === 'arcade' ? 'menu' : this.prevState;
    if (this.onClose) this.onClose();
  },
  resetRewards() { this.rewardUsed = {}; },
  session,
  // test helpers
  debugScore(n) { if (this.game) this.game.score = n; },
  debugEnd() { if (this.game) { this.game.over = true; } },
};
