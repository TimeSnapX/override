// OVERRIDE — HUD, toasts, banners, kill feed, barks/PA subtitles, menus, settings, results + awards.
import { G, LS, on, emit, clamp } from './core.js';
import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { gfx, QUALITY } from './gfx.js';
import { player } from './player.js';
import { weapons, ORDER } from './weapons.js';
import { game } from './game.js';
import { floatText, bark } from './fx.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);
export const ui = { lastBark: -99, barkKinds: {}, hudAcc: 0 };

export function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}
export function toast(text, cls = '', dur = 2600) {
  const t = document.createElement('div'); t.className = 'toast ' + cls; t.innerHTML = text; $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), dur);
}
let bannerTimer = 0;
export function banner(h1, h2 = '', dur = 2) {
  const b = $('banner'); b.querySelector('h1').textContent = h1; b.querySelector('h2').textContent = h2;
  b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), dur * 1000);
}
function killfeed(text) { const d = document.createElement('div'); d.textContent = text; $('killfeed').appendChild(d); while ($('killfeed').children.length > 3) $('killfeed').firstChild.remove(); setTimeout(() => d.remove(), 1400); }
let paTimer = 0;
function pa(text) { const p = $('pa'); p.textContent = '📢 SYNOD: ' + text; p.classList.remove('hidden'); clearTimeout(paTimer); paTimer = setTimeout(() => p.classList.add('hidden'), 4200); audio.blip(660, 0.08, 'sine', 0.06); audio.blip(880, 0.08, 'sine', 0.06); }
function kbark(text) { toast('🗨️ KESTREL: ' + text, 'small', 2400); }
function chirp() { for (let i = 0; i < 4; i++) audio._tone(0.05, { type: 'square', f: 300 + Math.random() * 900, g: 0.04, when: i * 0.05 }); }

export function initUI() {
  on('toast', (t, c) => toast(t, c));
  on('banner', (a, b, d) => banner(a, b, d));
  on('killfeed', killfeed);
  on('pa', pa); on('kbark', kbark);
  on('achievement', (t, d) => { toast(`<b>🏆 ${t}</b>${d}`, 'ach', 3600); audio.achievement(); });
  on('hitmarker', (type) => { const h = $('hitmarker'); h.className = ''; void h.offsetWidth; h.className = 'show ' + type; if (type === 'kill') audio.kill(); else audio.hit(type === 'weak'); });
  on('hurtDir', (a) => { const i = document.createElement('i'); i.style.transform = `rotate(${a}rad)`; $('dmgdir').appendChild(i); setTimeout(() => i.remove(), 900); });
  on('bark', (e, text, kind) => {
    if (G.warming || G.state !== 'play') return;
    const now = G.t; if (now - ui.lastBark < CONFIG.barkRate) return; if (now - (ui.barkKinds[kind] || -99) < CONFIG.barkPerType) return;
    ui.lastBark = now; ui.barkKinds[kind] = now;
    const p = e.center.clone(); p.y += (e.ringY || 1) * 0.6 + 0.6;
    floatText(p, text, 'bark' + (e.team === 'human' ? ' ally' : ''), 2.6, 0.25); chirp();
  });
  on('mult', (m, up) => { const el = $('mult'); el.textContent = '×' + m; el.classList.remove('bump'); void el.offsetWidth; if (up) el.classList.add('bump'); $('hud').classList.toggle('max', m >= 5); if (up && m > 1) killfeed(`MULTIPLIER ×${m}${m >= 5 ? ' MAX!' : ''}`); });
  on('overrideReady', () => { toast('🦩 OVERRIDE READY — ' + (G.mobile ? 'tap HACK' : 'press E'), 'small'); audio.blip(1600, 0.1, 'triangle', 0.1); });
  on('overrideFail', () => { const b = $('tb-override'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); });
  on('scope', (s) => { $('scope').classList.toggle('hidden', !s); $('crosshair').classList.toggle('hidden', s); $('tb-scope').classList.toggle('on', s); });
  on('bossSpawned', () => { if (!G.warming) $('boss').classList.remove('hidden'); });
  on('bossShieldDown', () => banner('SHIELD DOWN!', 'Hit the core — ×3 damage', 2));
  on('bossPhase3', () => banner('OVERCLOCK', 'Shield nodes are back!', 2.2));
  on('weaponChanged', (k) => { renderSlots(); $('tb-scope').classList.toggle('hidden', k !== 'thermal'); });
  // buttons
  $('btn-pause').addEventListener('click', () => input.edges.add('pause'));
  $('btn-ready').addEventListener('click', () => game.ready());
  bindSettings();
  // initials
  const letters = [...document.querySelectorAll('#initials .letters button')];
  letters.forEach((b) => b.addEventListener('click', () => { const c = b.textContent.charCodeAt(0); b.textContent = String.fromCharCode(c >= 90 ? 65 : c + 1); audio.ui(); }));
}

function renderSlots() {
  const el = $('w-slots'); el.innerHTML = '';
  ORDER.forEach((k, i) => { if (!weapons.available(k)) return; const s = document.createElement('i'); s.textContent = (i + 1) + ' ' + CONFIG.weapons[k].name.split(' ')[0].toUpperCase(); if (k === weapons.cur) s.className = 'on'; if (k === 'banana') s.classList.add('banana'); el.appendChild(s); });
}

const _last = {};
const set = (id, v, prop = 'textContent') => { if (_last[id + prop] !== v) { _last[id + prop] = v; $(id)[prop] = v; } };
const style = (id, k, v) => { if (_last[id + k] !== v) { _last[id + k] = v; $(id).style[k] = v; } };
export function updateHUD(dt) {
  ui.hudAcc += dt; const full = ui.hudAcc > 0.066; if (full) ui.hudAcc = 0;
  // fast items every frame
  const h = weapons.hud();
  style('charge-ring', 'strokeDashoffset', (150.8 * (1 - h.charge)).toFixed(1));
  const sp = weapons.cur === 'arc' ? 18 : weapons.cur === 'pulse' ? (weapons.streak >= 3 ? 5 : 8) : 4;
  $('crosshair').style.setProperty('--sp', (sp + (G.t - weapons.lastShot < 0.1 ? 4 : 0)) + 'px');
  $('crosshair').classList.toggle('on-target', weapons.overTarget);
  if (!full) return;
  set('hp-text', Math.ceil(player.hp) + '');
  style('hp-fill', 'width', clamp(player.hp, 0, 100) + '%');
  $('hp-fill').parentElement.classList.toggle('low', player.hp < 30);
  style('ar-fill', 'width', (player.armour / CONFIG.player.armourMax * 100) + '%');
  set('score', game.score.toLocaleString());
  set('best', 'BEST ' + Math.max(game.best(), game.score).toLocaleString());
  style('mult-ring', 'strokeDashoffset', (119.4 * (1 - clamp(game.comboT / CONFIG.scoring.comboTime, 0, 1))).toFixed(1));
  const ovr = player.override / CONFIG.override.max;
  style('ovr-fill', 'width', (ovr * 100) + '%'); set('ovr-pct', Math.floor(ovr * 100) + '%');
  $('ovr').classList.toggle('full', ovr >= 1); $('tb-override').classList.toggle('full', ovr >= 1);
  style('tb-ovr-ring', 'strokeDashoffset', (125.7 * (1 - ovr)).toFixed(1));
  const pips = $('dash-pips').children; for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('off', i >= player.dashCharges);
  set('w-name', h.name.toUpperCase() + (h.reloading ? ' · RELOADING' : ''));
  set('w-mag', h.mag + ''); set('w-res', h.reserve + ''); $('w-ammo').classList.toggle('low', h.mag <= Math.ceil(h.max * 0.25));
  // wave / phase
  const ph = game.phase;
  let wl = ph === 'pregame' ? 'GET READY' : ph === 'breather' ? 'BREATHER' : ph === 'countdown' ? `WAVE ${game.wave + 1} IN ${Math.ceil(game.phaseT)}` : `WAVE ${game.wave}/10`;
  set('wave-label', wl);
  const hostile = G.enemies.filter((e) => e.alive && e.team === 'synod' && e.type !== 'node').length + game.queue.reduce((a, q) => a + (q.n || 1), 0);
  set('enemies-label', ph === 'wave' || ph === 'boss' ? `${hostile} MACHINES REMAINING` : ph === 'pregame' || ph === 'breather' ? `NEXT WAVE IN ${Math.ceil(game.phaseT)}s` : '');
  const rdy = ph === 'pregame' || ph === 'breather'; $('btn-ready').classList.toggle('hidden', !rdy); if (rdy) set('ready-t', Math.ceil(game.phaseT) + 's');
  if (game.boss) {
    const b = game.boss; style('boss-fill', 'width', (b.alive ? b.hp / b.maxHp * 100 : 0) + '%'); style('boss-shield', 'width', (b.shield / b.shieldMax * 100) + '%');
    if (!b.alive) $('boss').classList.add('hidden');
  } else $('boss').classList.add('hidden');
  if (weapons.scoped) set('range', weapons.rangeText);
  if (G.settings.showFps) { $('fps').classList.remove('hidden'); set('fps', `${Math.round(gfx.fps || 0)} fps · ${QUALITY[gfx.q].name}${gfx.auto ? ' (auto)' : ''}`); } else $('fps').classList.add('hidden');
  renderSlotsIfChanged();
}
let _slotKey = '';
function renderSlotsIfChanged() { const k = weapons.cur + weapons.banana; if (k !== _slotKey) { _slotKey = k; renderSlots(); } }

// ---------------- settings ----------------
export const DEFAULT_SETTINGS = { autoFire: false, aimAssist: true, haptics: true, sens: 1, invertY: false, fov: 0, headBob: true, shake: true, showFps: false, damageNumbers: true };
export function loadSettings() { G.settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {})); input.sens = G.settings.sens; }
function saveSettings() { LS.set('settings', G.settings); input.sens = G.settings.sens; }
let settingsBack = 'menu';
export function openSettings(back) {
  settingsBack = back; show('settings');
  $('s-quality').value = gfx.auto ? 'auto' : gfx.q;
  $('s-sens').value = G.settings.sens; $('s-fov').value = G.settings.fov || (G.mobile ? CONFIG.player.fovMobile : CONFIG.player.fovDesktop);
  $('s-invert').checked = G.settings.invertY; $('s-assist').checked = G.settings.aimAssist; $('s-autofire').checked = G.settings.autoFire;
  $('s-haptics').checked = G.settings.haptics; $('s-bob').checked = G.settings.headBob; $('s-shake').checked = G.settings.shake; $('s-dmgnum').checked = G.settings.damageNumbers;
  $('s-fps').checked = G.settings.showFps; $('s-sound').checked = !audio.muted;
  info();
}
function info() { $('s-info').textContent = `Renderer: ${QUALITY[gfx.q].name}${gfx.auto ? ' (auto)' : ''} · ${Math.round(innerWidth * gfx.pr)}×${Math.round(innerHeight * gfx.pr)} px · DPR ${(window.devicePixelRatio || 1).toFixed(2)}`; }
function bindSettings() {
  $('s-quality').addEventListener('change', (e) => { const v = e.target.value; if (v === 'auto') { gfx.setAuto(true); } else { gfx.auto = false; gfx.setQuality(v); } info(); });
  const chk = (id, key, fn) => $(id).addEventListener('change', (e) => { G.settings[key] = e.target.checked; saveSettings(); fn && fn(); });
  chk('s-invert', 'invertY'); chk('s-assist', 'aimAssist'); chk('s-autofire', 'autoFire'); chk('s-haptics', 'haptics'); chk('s-bob', 'headBob');
  chk('s-shake', 'shake', () => emit('settingsChanged')); chk('s-dmgnum', 'damageNumbers'); chk('s-fps', 'showFps');
  $('s-sound').addEventListener('change', (e) => { audio.setMuted(!e.target.checked); emit('settingsChanged'); });
  $('s-sens').addEventListener('input', (e) => { G.settings.sens = +e.target.value; saveSettings(); });
  $('s-fov').addEventListener('input', (e) => { G.settings.fov = +e.target.value; saveSettings(); });
  $('s-back').addEventListener('click', () => { audio.ui(); show(settingsBack); });
}

// ---------------- results ----------------
export function showResults(victory) {
  const s = G.stats; const el = $('end'); el.classList.toggle('defeat', !victory);
  $('end-title').textContent = victory ? 'ROOFTOP HELD' : 'KESTREL DOWN';
  $('end-sub').textContent = victory ? 'The evacuation barge clears the river. SYNOD files a strongly worded complaint.' : '"' + bark('defeat') + '" — SYNOD';
  const best = game.best(); const isNew = game.score > best;
  $('end-score').innerHTML = game.score.toLocaleString() + (isNew && game.score > 0 ? '<span class="nh">NEW HIGH SCORE!</span>' : '');
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  $('end-stats').innerHTML = `<span>WAVE <b>${game.wave}</b></span><span>KILLS <b>${s.kills}</b></span><span>ACCURACY <b>${acc}%</b></span><span>BEST COMBO <b>${s.bestCombo}</b></span><span>TIME <b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b></span>`;
  $('awards').innerHTML = game.awards(victory).map((a, i) => `<div class="award" style="animation-delay:${0.2 + i * 0.15}s"><div class="ic">${a.icon}</div><div class="t">${a.title}</div><div class="d">${a.desc}</div></div>`).join('');
  const q = game.qualifies(game.score); $('initials').classList.toggle('hidden', !q);
  const ini = LS.get('initials', 'KES'); document.querySelectorAll('#initials .letters button').forEach((b, i) => { b.textContent = ini[i] || 'A'; });
  // auto-save straight away with the last-used initials so a score is never lost; SAVE just renames the entry
  let entry = null;
  if (q) { game.saveHigh(ini); entry = game.highScores().find((r) => r.score === game.score && r.initials === ini.toUpperCase().slice(0, 3)) || null; }
  $('ini-ok').onclick = () => {
    const ni = [...document.querySelectorAll('#initials .letters button')].map((b) => b.textContent).join('');
    const t = game.highScores(); const e = entry && t.find((r) => r.score === entry.score && r.initials === entry.initials && r.date === entry.date);
    if (e) { e.initials = ni; LS.set('highscores', t); } else game.saveHigh(ni);
    $('initials').classList.add('hidden'); toast('Score saved — ' + ni, 'gold'); LS.set('initials', ni);
  };
  show('end');
}
export function renderScores() {
  const t = game.highScores();
  $('scores-list').innerHTML = t.length ? t.map((r, i) => `<div><span>${i + 1}.</span><span>${r.initials}</span><span>${r.score.toLocaleString()}</span><span>W${r.wave}</span></div>`).join('') : '<p class="small">No scores yet. Go save Brisbane.</p>';
}
