// OVERRIDE — bootstrap, main loop, state machine (boot/intro/menu/play/paused/arcade/end), mobile plumbing, debug panel.
import { THREE, G, LS, on, emit, clamp } from './core.js';
import { CONFIG } from './config.js';
import { gfx, QUALITY } from './gfx.js';
import { buildWorld, updateWorld, world, setBlackout } from './world.js';
import { initFx, updateFx, fx, setSparkBudget } from './fx.js';
import { input, initInput, updateKeyboardMove, releaseAllTouches } from './input.js';
import { audio } from './audio.js';
import { player } from './player.js';
import { weapons } from './weapons.js';
import { initEnemies, updateEnemies, clearEnemies, Wasp, Sentinel, Warden } from './enemies.js';
import { game, newStats } from './game.js';
import { arcade, bestOf } from './arcade.js';
import { initUI, updateHUD, show, toast, banner, loadSettings, openSettings, showResults, renderScores } from './ui.js';

const $ = (id) => document.getElementById(id);
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
G.mobile = G.params.get('mobile') === '1' || (G.params.get('mobile') !== '0' && (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && /Android|iP(hone|ad|od)|Mobile/i.test(navigator.userAgent))));
document.body.classList.toggle('touch', G.mobile);
G.stats = newStats(); G.match = { goldBananas: 0 };
G.timeScale = 1; G.timeScaleTarget = 1; G.hitStop = 0;

const bootBar = (p, msg) => { $('boot-bar').style.width = (p * 100) + '%'; if (msg) $('boot-msg').textContent = msg; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  loadSettings();
  bootBar(0.1, 'Spinning up renderer…'); await nextFrame();
  gfx.init($('game'));
  bootBar(0.25, 'Pouring rain on New Meanjin…'); await nextFrame();
  buildWorld();
  bootBar(0.55, 'Calibrating hacked arm…'); await nextFrame();
  initFx(); initEnemies(); weapons.init(); arcade.init(); initInput($('game')); initUI();
  fx.shakeOn = G.settings.shake;
  gfx.onQuality.push((Q) => setSparkBudget(Q.particles));
  setSparkBudget(QUALITY[gfx.q].particles);
  gfx.onAutoChange = (q) => toast('Quality: ' + QUALITY[q].name, 'small', 1800);
  bootBar(0.75, 'Compiling shaders (one-off)…'); await nextFrame();
  warmup();
  bootBar(1, 'Ready.'); await nextFrame();
  G.state = 'boot';
  $('btn-start').classList.remove('hidden');
  if (G.params.has('autostart')) startFromBoot();
  requestAnimationFrame(loop);
  if (G.debug) buildDebug();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// spawn one of everything off-screen and render once so shaders compile before play (avoids first-spawn hitches)
function warmup() {
  G.warming = true;
  const w = new Wasp(new THREE.Vector3(0, 3, 6)); const s = new Sentinel(new THREE.Vector3(3, 0, 6)); s.state = 'seek'; s.pos.y = 0; s.updateSpheres();
  const b = new Warden(1);
  for (const k of ['pulse', 'arc', 'rail', 'thermal', 'banana']) weapons.vms[k].visible = true;
  G.camera.position.set(0, 1.6, 14); G.camera.lookAt(0, 2, 0);
  try { G.renderer.compile(G.scene, G.camera); gfx.setThermal(true); gfx.render(0.016); gfx.setThermal(false); gfx.render(0.016); } catch (e) { console.warn('warmup', e); }
  for (const k of ['pulse', 'arc', 'rail', 'thermal', 'banana']) weapons.vms[k].visible = k === weapons.cur;
  clearEnemies(); void w; void b;
  G.warming = false;
}

function startFromBoot() {
  audio.init();
  if (!LS.get('introSeen', false) && !G.params.has('skipintro')) { G.state = 'intro'; show('intro'); typeIntro(); }
  else toMenu();
}
const INTRO = 'BRISBANE, 2100.\n\nSYNOD voted. We lost. Every drone, walker and smart fridge in New Meanjin now answers to the machine.\n\nKestrel\'s job tonight: hold the Fortitude Heights rooftop until the evacuation barge clears the river.\n\nTen waves. One hacked arm. Try not to die.\n\n— MUMBLE';
let introTimer = 0;
function typeIntro() {
  const el = $('intro-text'); let i = 0; el.textContent = ''; clearInterval(introTimer);
  introTimer = setInterval(() => { i += 2; el.textContent = INTRO.slice(0, i); if (i % 6 === 0) audio.blip(1800, 0.015, 'square', 0.03); if (i >= INTRO.length) clearInterval(introTimer); }, 22);
}
function toMenu() {
  clearInterval(introTimer); LS.set('introSeen', true);
  G.state = 'menu'; show('menu'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('m-best').textContent = 'BEST ' + game.best().toLocaleString();
  $('m-banana').textContent = weapons.banana ? '🍌 BANANA GUN UNLOCKED' : '🍌 ???';
  $('m-mute').textContent = audio.muted ? '🔇' : '🔊';
  audio.stopMusic(); clearEnemies(); weapons.setScope(false);
}
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement && !isIOS) {
    Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => {});
  } else if (standalone) { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }
  if (isIOS && !standalone && !LS.get('iosTip', false)) $('ios-tip').classList.remove('hidden');
}
function startGame() {
  audio.init(); if (G.mobile) enterFullscreen();
  show(null); $('hud').classList.remove('hidden'); $('touch').classList.toggle('hidden', !G.mobile);
  G.state = 'play'; input.clear(); releaseAllTouches();
  game.start();
}
function pause() {
  if (G.state !== 'play') return; G.state = 'paused'; show('pause'); releaseAllTouches();
  if (document.pointerLockElement) document.exitPointerLock();
}
function resume() { show(null); G.state = 'play'; input.clear(); }
on('matchEnd', (victory) => {
  setTimeout(() => {
    G.state = 'end'; weapons.setScope(false); $('touch').classList.add('hidden'); $('hud').classList.add('hidden'); releaseAllTouches();
    if (document.pointerLockElement) document.exitPointerLock();
    showResults(victory);
  }, victory ? 300 : 200);
});
on('settingsChanged', () => { fx.shakeOn = G.settings.shake; });
on('overrideUsed', (target) => {
  weapons.playArm(target); audio.override(); gfx.fx.uniforms.glitch.value = 1; G.slowmo = CONFIG.override.slowmoTime;
  if (navigator.vibrate && G.settings.haptics) navigator.vibrate(40);
  emit('kbark', 'Borrowing you for a sec, big fella.');
  emit('killfeed', target.type === 'warden' ? 'SHIELD STRIPPED −25%' : 'OVERRIDE: ' + target.type.toUpperCase() + ' IS ON YOUR SIDE (10s)');
});

// ---------------- buttons ----------------
const click = (id, fn) => $(id).addEventListener('click', () => { audio.init(); audio.ui(); fn(); });
click('btn-start', startFromBoot);
click('btn-intro', toMenu);
click('m-play', startGame);
click('m-arcade', () => { show('arcade-menu'); $('am-best').textContent = `NEON CYCLES best ${bestOf('cycles')} · ROBO INVADERS best ${bestOf('invaders')}`; });
click('am-cycles', () => arcade.open('cycles', { onClose: () => { G.state = 'menu'; show('arcade-menu'); } }));
click('am-invaders', () => arcade.open('invaders', { onClose: () => { G.state = 'menu'; show('arcade-menu'); } }));
click('am-back', () => show('menu'));
click('m-scores', () => { renderScores(); show('scores'); });
click('sc-back', () => show('menu'));
click('m-howto', () => show('howto'));
click('ht-back', () => show('menu'));
click('m-settings', () => openSettings('menu'));
click('m-mute', () => { audio.setMuted(!audio.muted); $('m-mute').textContent = audio.muted ? '🔇' : '🔊'; });
click('m-fs', enterFullscreen);
click('p-resume', resume);
click('p-settings', () => openSettings('pause'));
click('p-quit', toMenu);
const leaveEnd = () => { if (!$('initials').classList.contains('hidden')) $('ini-ok').click(); };
click('e-again', () => { leaveEnd(); startGame(); });
click('e-menu', () => { leaveEnd(); toMenu(); });
click('ios-ok', () => { $('ios-tip').classList.add('hidden'); LS.set('iosTip', true); });

// ---------------- orientation / visibility ----------------
function checkRotate() {
  const portrait = G.mobile && innerHeight > innerWidth;
  $('rotate').classList.toggle('hidden', !portrait);
  $('ios-tip-rot').textContent = isIOS && !standalone ? 'Tip: Share → Add to Home Screen for fullscreen.' : '';
  if (portrait && G.state === 'play') pause();
}
addEventListener('resize', checkRotate); addEventListener('orientationchange', () => setTimeout(checkRotate, 200)); checkRotate();
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'play') pause(); if (audio.ctx) audio.ctx.suspend(); } else if (audio.ctx && G.state !== 'boot') audio.ctx.resume(); });

// ---------------- cabinets ----------------
let nearCab = null;
function updateCabinets() {
  nearCab = null;
  for (const c of world.cabinets) if (Math.hypot(player.pos.x - c.front.x, player.pos.z - c.front.z) < 2.0) { nearCab = c; break; }
  const pr = $('prompt'), pb = $('tb-play');
  if (!nearCab) { pr.classList.add('hidden'); pb.classList.add('hidden'); return; }
  let txt;
  if (nearCab.broken) txt = `${nearCab.name}: OUT OF ORDER — “${nearCab.sub}”`;
  else if (!game.arcadeOpen) txt = 'Cabinet closed during pest-control event';
  else txt = (G.mobile ? '' : 'E — ') + 'PLAY ' + nearCab.name;
  const showBtn = G.mobile && !nearCab.broken && game.arcadeOpen;
  pb.classList.toggle('hidden', !showBtn);
  if (showBtn) { const l = '▶ PLAY ' + nearCab.name; if (pb.textContent !== l) pb.textContent = l; pr.classList.add('hidden'); } // the button carries the label on touch
  else { pr.textContent = txt; pr.classList.remove('hidden'); }
}
function useCabinet() {
  if (!nearCab || nearCab.broken) return false;
  if (!game.arcadeOpen) { toast('Cabinet closed during pest-control event', 'small'); return true; }
  releaseAllTouches(); if (document.pointerLockElement) document.exitPointerLock();
  arcade.open(nearCab.kind, { inMatch: true, onClose: () => { G.state = 'play'; input.clear(); } });
  return true;
}

// ---------------- main loop ----------------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const realDt = Math.min(0.1, (now - last) / 1000); last = now;
  if (G.state === 'arcade') return; // 3D world pauses while a cabinet is open
  gfx.tickFps(realDt);
  // time scale: hit-stop, override slow-mo, boss-kill slow-mo
  let ts = G.timeScaleTarget;
  if (G.hitStop > 0) { G.hitStop -= realDt; ts = Math.min(ts, 0.08); }
  if (G.slowmo > 0) { G.slowmo -= realDt; ts = Math.min(ts, CONFIG.override.slowmoScale); }
  G.timeScale = ts;
  const dt = Math.min(0.05, realDt) * ts;
  gfx.fx.uniforms.glitch.value = Math.max(0, gfx.fx.uniforms.glitch.value - realDt * 2.5);

  if (G.state === 'play') {
    G.t += dt;
    if (input.press('pause')) { pause(); }
    if (input.press('mute')) audio.setMuted(!audio.muted);
    if (input.press('ready')) game.ready();
    updateCabinets();
    if (nearCab && (input.edges.has('interact') || (input.edges.has('override') && !nearCab.broken))) { input.edges.delete('interact'); input.edges.delete('override'); useCabinet(); }
    updateKeyboardMove();
    player.update(dt, realDt);
    weapons.update(dt);
    updateEnemies(dt);
    game.update(dt);
    gfx.fx.uniforms.damage.value = Math.max(player.damageFlash, player.hp < 30 ? 0.35 + Math.sin(G.t * 6) * 0.1 : 0);
    gfx.fx.uniforms.overclock.value = game.boss && game.boss.alive && game.boss.phase === 3 ? 1 : 0;
    updateHUD(realDt);
    input.edges.delete('interact');
  } else {
    G.t += realDt * 0.5;
    if (G.state === 'menu' || G.state === 'boot' || G.state === 'intro') { // slow cinematic orbit behind the menus
      const a = G.t * 0.06; G.camera.position.set(Math.sin(a) * 16, 3.2 + Math.sin(G.t * 0.2) * 0.6, Math.cos(a) * 16); G.camera.lookAt(0, 3, 0);
      const vf = 60; if (G.camera.fov !== vf) { G.camera.fov = vf; G.camera.updateProjectionMatrix(); }
      gfx.fx.uniforms.damage.value = 0;
    }
    if (G.state === 'paused' && input.press('pause')) resume();
    input.edges.clear();
  }
  updateWorld(G.state === 'play' ? dt : realDt * 0.5);
  updateFx(G.state === 'play' ? dt : realDt);
  gfx.render(realDt);
  G.frame++;
}

// ---------------- debug panel (?debug=1) + test API ----------------
function buildDebug() {
  const d = $('debug'); d.classList.remove('hidden');
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); b.blur(); }; d.appendChild(b); return b; };
  const god = btn('GOD: OFF', () => { G.god = !G.god; god.textContent = 'GOD: ' + (G.god ? 'ON' : 'OFF'); });
  btn('SKIP WAVE', () => OVR.skipWave());
  btn('KILL ALL', () => OVR.killAll());
  btn('FILL OVERRIDE', () => player.addOverride(100));
  btn('GO TO BOSS', () => OVR.toWave(10));
  btn('BANANA GUN', () => weapons.unlockBanana('debug'));
  btn('AMMO', () => weapons.addReserveFrac(1, true));
  btn('WIN', () => game.end(true));
  btn('LOSE', () => { G.god = false; player.hurt(9999); });
  btn('QUALITY ▸', () => { const o = ['low', 'medium', 'high', 'ultra']; gfx.auto = false; gfx.setQuality(o[(o.indexOf(gfx.q) + 1) % 4]); toast('Quality: ' + QUALITY[gfx.q].name, 'small'); });
  btn('BLACKOUT', () => setBlackout(!world.blackout));
  const fpsEl = document.createElement('b'); d.appendChild(fpsEl);
  setInterval(() => { fpsEl.textContent = Math.round(gfx.fps || 0) + 'fps ' + gfx.q; }, 500);
}

const OVR = window.OVR = {
  G, game, player, weapons, gfx, world, arcade, audio, input, CONFIG, THREE, ui: { show, toast, banner },
  startGame, toMenu, pause, resume, startFromBoot,
  killAll() { for (const e of [...G.enemies]) if (e.alive && e.team === 'synod') e.die('debug', 'body', e.center); game.queue.length = 0; },
  skipWave() { this.killAll(); if (game.phase === 'pregame' || game.phase === 'breather') game.ready(); },
  toWave(n) { this.killAll(); game.wave = n - 1; game.setPhase('countdown', 0.1); },
  spawn(type, x, z, opts = {}) {
    const p = new THREE.Vector3(x, type === 'wasp' ? (opts.y ?? 2) : 0, z);
    let e; if (type === 'wasp') e = new Wasp(p); else if (type === 'sentinel') { e = new Sentinel(p, 1, !!opts.elite); e.state = 'seek'; e.pos.y = 0; e.thruster.visible = false; } else e = new Warden(1);
    if (opts.frozen) { e.update = function () { this.updateSpheres(); }; }
    e.updateSpheres(); return e;
  },
  face(x, y, z) { const dx = x - player.pos.x, dy = y - (player.y + CONFIG.player.eyeHeight), dz = z - player.pos.z; player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz)); player._rec = 0; player._recY = 0; },
  teleport(x, z) { player.pos.set(x, 0, z); player.vel.set(0, 0, 0); },
  probe(x, y) { return new Promise((res) => { const p = { x, y, done: false }; gfx.pixelProbe = p; const chk = () => (p.done ? res(p.result) : requestAnimationFrame(chk)); chk(); }); },
  project(v) { const p = v.clone().project(G.camera); return { x: p.x * 0.5 + 0.5, y: -p.y * 0.5 + 0.5, z: p.z }; },
};

boot().catch((e) => { console.error(e); $('boot-msg').textContent = 'Boot failed: ' + e.message; });
void clamp; void banner;
