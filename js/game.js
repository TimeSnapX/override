// OVERRIDE — match flow: pre-game, countdowns, waves, breathers, boss, scoring/combos, awards, high scores.
import { THREE, G, rand, randi, pick, clamp, LS, on, emit, ARENA } from './core.js';
import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { player } from './player.js';
import { weapons } from './weapons.js';
import { world, setBlackout } from './world.js';
import { Wasp, Sentinel, Warden, spawnPickup, randomPickupKind, clearEnemies } from './enemies.js';
import { floatText, bark, explosion } from './fx.js';
import { arcade } from './arcade.js';

const SC = CONFIG.scoring;
const SKY_LANES = [new THREE.Vector3(-36, 8, -12), new THREE.Vector3(34, 9, 10), new THREE.Vector3(8, 10, 36), new THREE.Vector3(-10, 9, -36)];

export function newStats() {
  return { shots: 0, hits: 0, kills: 0, waspKills: 0, sentinelKills: 0, coreKills: 0, bananaKills: 0, thermalWallKills: 0, overrides: 0, minionBest: 0, matrix: 0,
    dashes: 0, noDamageWaves: 0, lowHpDamage: 0, maxPierce: 0, arcadeGames: 0, maxMult: 1, bestCombo: 0, damageDealt: 0, damageTaken: 0, waveDamage: 0,
    goldBananas: 0, slips: 0, pickups: 0, weaponShots: {}, time: 0, distSum: 0, distN: 0, diedToWaspWave1: false, lastHitBy: null };
}

export const game = {
  phase: 'pregame', phaseT: 0, wave: 0, queue: [], score: 0, combo: 0, comboT: 0, mult: 1, multiKills: [], boss: null, spawnT: 0,
  blackoutT: 0, victoryT: 0, ended: false,

  start() {
    clearEnemies(); player.reset(); weapons.reset(); arcade.resetRewards();
    G.stats = newStats(); G.match = { goldBananas: 0 };
    for (const b of world.bananas) { b.found = false; b.mesh.visible = true; }
    this.score = 0; this.combo = 0; this.comboT = 0; this.mult = 1; this.multiKills = []; this.wave = 0; this.boss = null; this.ended = false;
    world.glitchHolos = false; setBlackout(false);
    this.setPhase('pregame', CONFIG.preGame);
    emit('banner', 'HOLD THE ROOFTOP', 'Arcade corner is open until wave 1 — tap READY when you are', 3.5);
    audio.startMusic(); audio.music.intensity = 0;
  },
  setPhase(p, t = 0) { this.phase = p; this.phaseT = t; emit('phase', p, t); },
  get arcadeOpen() { return this.phase === 'pregame' || this.phase === 'breather'; },
  ready() { if (this.phase === 'pregame' || this.phase === 'breather') this.setPhase('countdown', CONFIG.countdown), this.announce(); },
  announce() { emit('banner', `WAVE ${this.wave + 1}`, this.wave + 1 === 10 ? 'THE WARDEN APPROACHES' : 'INCOMING!', CONFIG.countdown - 0.5); audio.waveStart(); },

  startWave(n) {
    this.wave = n; const cfg = CONFIG.waves[n - 1]; G.stats.waveDamage = 0;
    const q = [];
    let w = cfg.wasps || 0; while (w > 0) { const s = Math.min(w, randi(4, 8)); q.push({ t: 'swarm', n: s }); w -= s; }
    for (let i = 0; i < (cfg.sentinels || 0); i++) q.splice(randi(1, q.length), 0, { t: 'sentinel' });
    for (let i = 0; i < (cfg.elites || 0); i++) q.splice(randi(1, q.length), 0, { t: 'elite' });
    if (cfg.boss) { q.unshift({ t: 'boss' }); }
    this.queue = q; this.maxAlive = cfg.max; this.spawnT = 0.5;
    this.setPhase(cfg.boss ? 'boss' : 'wave');
    emit('pa', bark('paWave'));
    world.glitchHolos = !!cfg.glitch;
    if (cfg.blackout) { this.blackoutT = cfg.blackout; setBlackout(true); emit('toast', 'BLACKOUT — the Thermal Rail sees in the dark', 'small'); }
    if (n === 5) world.flashT = 0.45;
    audio.music.intensity = n >= 7 ? 2 : 1;
  },
  hpScale() { return 1 + CONFIG.enemies.hpScalePerWave * (this.wave - 1); },
  hostileAlive() { let n = 0; for (const e of G.enemies) if (e.alive && e.team === 'synod' && e.type !== 'node') n += e.type === 'swarm' ? 0 : 1; return n; },
  pickPad() {
    const pads = world.spawnPads.filter((p) => p.distanceTo(player.pos) > 12);
    const fwd = player.forward(new THREE.Vector3()); fwd.y = 0; fwd.normalize();
    const hidden = pads.filter((p) => { const d = p.clone().sub(player.pos).setY(0).normalize(); return d.dot(fwd) < 0.3; });
    return (hidden.length ? pick(hidden) : pick(pads.length ? pads : world.spawnPads)).clone();
  },
  spawn(item) {
    const hs = this.hpScale();
    if (item.t === 'swarm') {
      const lane = pick(SKY_LANES);
      for (let i = 0; i < item.n; i++) { const w = new Wasp(lane.clone().add(new THREE.Vector3(rand(-3, 3), rand(-1, 2), rand(-3, 3))), hs); if (i === 0 && Math.random() < 0.5) w.say(bark('waspSpawn'), 'waspSpawn'); }
    } else if (item.t === 'sentinel' || item.t === 'elite') {
      const p = this.pickPad(); new Sentinel(p, hs, item.t === 'elite');
    } else if (item.t === 'boss') {
      this.boss = new Warden(1); emit('banner', 'WARDEN UNIT', 'Destroy the shield nodes!', 3);
    }
  },
  update(dt) {
    G.stats.time += dt;
    // combo timer
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this.updateMult(); } }
    this.multiKills = this.multiKills.filter((t) => G.t - t < SC.multiWindow);
    // nearest-enemy distance tracking (Most Cowardly)
    let nd = 1e9; for (const e of G.enemies) if (e.alive && e.team === 'synod') nd = Math.min(nd, e.pos.distanceTo(player.pos));
    if (nd < 1e8) { G.stats.distSum += nd * dt; G.stats.distN += dt; }
    if (this.blackoutT > 0) { this.blackoutT -= dt; if (this.blackoutT <= 0) setBlackout(false); }
    if (this.phaseT > 0 && !(arcade.active)) this.phaseT -= dt;
    switch (this.phase) {
      case 'pregame': case 'breather':
        if (this.phaseT <= 0) { this.setPhase('countdown', CONFIG.countdown); this.announce(); }
        break;
      case 'countdown':
        if (this.phaseT <= 0) this.startWave(this.wave + 1);
        break;
      case 'wave': case 'boss': {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.queue.length) {
          const next = this.queue[0]; const need = next.t === 'swarm' ? next.n : 1;
          if (this.hostileAlive() + need <= this.maxAlive || next.t === 'boss') { this.spawn(this.queue.shift()); this.spawnT = next.t === 'swarm' ? 2.5 : 1.2; } else this.spawnT = 0.5;
        }
        // last wasp bark
        if (!this._lastBarked) { const ws = G.enemies.filter((e) => e.alive && e.type === 'wasp' && e.team === 'synod'); if (ws.length === 1 && !this.queue.some((q) => q.t === 'swarm') && this.hostileAlive() === 1) { ws[0].say("Uh. Guys? …Guys?", 'waspLast'); this._lastBarked = true; } }
        if (this.phase === 'wave' && !this.queue.length && this.hostileAlive() === 0) this.waveCleared();
        if (this.phase === 'boss' && this.boss && !this.boss.alive && !this.victoryT) { this.victoryT = 3.2; G.timeScaleTarget = 0.3; emit('banner', 'WARDEN DECOMMISSIONED', 'ROOFTOP HELD', 3); this.addScore(SC.waveClear * this.wave, null, 'WAVE CLEAR'); }
        if (this.victoryT > 0) { this.victoryT -= dt / Math.max(0.3, G.timeScale); if (this.victoryT <= 0) this.end(true); }
        break;
      }
    }
  },
  waveCleared() {
    this._lastBarked = false;
    const bonus = SC.waveClear * this.wave; this.addScore(bonus, null, null, true);
    let sub = `+${bonus} WAVE BONUS`;
    if (G.stats.waveDamage <= 0) { this.addScore(SC.noDamageWave, null, null, true); G.stats.noDamageWaves++; sub += ` · +${SC.noDamageWave} UNTOUCHED`; }
    emit('banner', `WAVE ${this.wave} CLEARED`, sub, 2.5); audio.waveClear();
    world.glitchHolos = false; setBlackout(false); this.blackoutT = 0;
    if (CONFIG.breatherAfter.includes(this.wave)) {
      this.setPhase('breather', CONFIG.breather); arcade.resetRewards();
      for (let i = 0; i < 3; i++) spawnPickup(['ammo', 'med', 'armour'][i], new THREE.Vector3(rand(-6, 6), 0, rand(-4, 8)));
      setTimeout(() => emit('toast', 'BREATHER — arcade corner open (south-west). Tap READY to continue.', 'small'), 2600);
    } else { this.setPhase('countdown', CONFIG.countdown); setTimeout(() => this.announce(), 50); }
  },
  updateMult() { let m = 1; for (const [n, k] of SC.comboTiers) if (this.combo >= n) { m = k; break; } if (m !== this.mult) { const up = m > this.mult; this.mult = m; emit('mult', m, up); if (m >= 5) G.stats.maxMult = 5; G.stats.maxMult = Math.max(G.stats.maxMult, m); audio.music.intensity = m >= 5 ? 3 : Math.max(1, audio.music.intensity); } },
  addScore(base, pos, label, raw = false) {
    const pts = Math.round(raw ? base : base * this.mult); this.score += pts;
    if (pos) floatText(pos, `+${pts}${label ? ' ' + label : ''}${!raw && this.mult > 1 ? ' ×' + this.mult : ''}`, 'score', 1.1, 1.3);
    emit('score', this.score, pts, label);
    return pts;
  },
  onKill(e, info) {
    if (e.type === 'node' && info.weapon === 'synod') return;
    if (e.team === 'human') return; // our own minion died
    const s = G.stats; s.kills++;
    const C = CONFIG.enemies;
    let base = e.score || (e.type === 'node' ? 250 : C[e.type] ? C[e.type].score : 100);
    const labels = [];
    if (info.weak) { base *= 1 + SC.weakKillBonus; labels.push(e.type === 'sentinel' ? 'CORE KILL' : 'CRIT'); }
    if (info.weapon === 'minion') { base += SC.minionKill; labels.push('MINION'); }
    if (info.weapon === 'banana') { base += CONFIG.weapons.banana.bonus; s.bananaKills++; labels.push('BANANA\'D'); }
    if (info.through && info.weapon === 'thermal') { s.thermalWallKills++; labels.push('WALLBANG'); }
    if (e.type === 'wasp') s.waspKills++;
    if (e.type === 'sentinel') { s.sentinelKills++; if (info.weak) s.coreKills++; }
    if (info.weapon !== 'minion' && info.weapon !== 'synod') player.addOverride(info.weak ? CONFIG.override.perWeakKill : CONFIG.override.perKill);
    this.combo++; s.bestCombo = Math.max(s.bestCombo, this.combo); this.comboT = SC.comboTime; this.updateMult();
    this.addScore(base, info.point.clone().setY(info.point.y + 0.6), labels[0] || '');
    // multi-kills
    this.multiKills.push(G.t); const mk = this.multiKills.length;
    if (mk >= 2) { const b = SC.multi[Math.min(4, mk)]; const name = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'MEGA KILL' }[Math.min(4, mk)]; this.addScore(b, null, null, true); emit('killfeed', `${name} +${b}`); if (mk === 3) emit('kbark', bark('kMulti')); }
    emit('killfeed', `+${Math.round(base * this.mult)} ${labels.join(' ')}${this.mult > 1 ? ' ×' + this.mult : ''}`.trim());
    // pickups
    if (e.type !== 'node' && e.type !== 'warden' && Math.random() < CONFIG.pickups.dropChance) spawnPickup(randomPickupKind(), e.pos.clone());
    G.hitStop = 0.04;
  },
  onPickup(kind) {
    const P = CONFIG.pickups; G.stats.pickups++;
    if (kind === 'ammo') weapons.addReserveFrac(P.ammoFrac);
    if (kind === 'med') player.heal(P.med);
    if (kind === 'armour') player.addArmour(P.armour);
    if (kind === 'shard') player.addOverride(P.shard);
    if (kind === 'chip') { this.addScore(P.chip, null, null, true); this.comboT += P.chipCombo; }
  },
  onPlayerHurt() { if (this.combo > 0) { this.combo = Math.floor(this.combo * (1 - SC.comboDamageLoss)); this.updateMult(); } },

  awards(victory) {
    const s = G.stats, acc = s.shots ? s.hits / s.shots : 0, avgDist = s.distN ? s.distSum / s.distN : 0;
    const A = [];
    const add = (cond, icon, title, desc) => { if (cond) A.push({ icon, title, desc }); };
    add(acc >= 0.6 && s.shots >= 20, '🎯', 'Most Accurate', `${Math.round(acc * 100)}% accuracy`);
    add(acc < 0.2 && s.shots >= 1000, '🌧️', 'Spray and Pray', `${s.shots} shots, ${Math.round(acc * 100)}% hit`);
    add(s.bananaKills >= 10, '🍌', 'Banana Enthusiast', `${s.bananaKills} banana kills`);
    add(s.goldBananas >= 3, '🥷', 'Fruit Ninja', 'Found all 3 golden bananas');
    add(s.coreKills >= 15, '💛', 'Core Values', `${s.coreKills} Sentinel core kills`);
    add(s.waspKills >= 100, '🪰', 'Pest Control', `${s.waspKills} Wasps swatted`);
    add(s.overrides >= 5, '🦾', 'Hostile Takeover', `${s.overrides} Overrides`);
    add(s.minionBest >= 3, '👔', 'Middle Management', `A minion scored ${s.minionBest} kills`);
    add(s.matrix >= 10, '🕶️', 'Matrix Enthusiast', `${s.matrix} Matrix'd dodges`);
    add(s.dashes >= 100, '🐕', 'Dash Hound', `${s.dashes} dashes`);
    add(s.noDamageWaves >= 3, '✨', 'Untouchable', `${s.noDamageWaves} flawless waves`);
    add(s.lowHpDamage >= 500, '💥', 'Glass Cannon', `${Math.round(s.lowHpDamage)} damage dealt under 25 HP`);
    add(s.maxPierce >= 4, '🍸', 'Pierce Brosnan', '4-enemy Rail Lance pierce');
    add(s.thermalWallKills >= 20, '👀', 'Peeping Tom', `${s.thermalWallKills} kills through walls`);
    add(s.arcadeGames >= 3, '🕹️', 'Arcade Rat', `${s.arcadeGames} cabinet games`);
    add(s.maxMult >= 5, '🔥', 'Combo Breaker', 'Hit the 5× MAX multiplier');
    add(avgDist > 18, '🐔', 'Most Cowardly', `Avg ${avgDist.toFixed(0)} m from the nearest machine`);
    add(s.diedToWaspWave1, '🧊', 'Smart Fridge Sympathiser', 'Died to a Wasp on wave 1');
    add(player.stillTime >= 30, '🛋️', 'Couch Potato', `Stood still for ${Math.round(player.stillTime)} s`);
    add(s.time >= 300 || A.length < 3, '☔', 'Brisbane Local', `Survived ${Math.floor(s.time / 60)}m ${Math.floor(s.time % 60)}s in the rain`);
    if (A.length < 3) A.push({ icon: '🏅', title: 'Participation Trophy', desc: 'You were definitely there' });
    if (A.length < 3) A.push({ icon: '🦩', title: 'Ibis Whisperer', desc: `${s.pickups} pickups scavenged` });
    return A.slice(0, 5);
  },
  highScores() { return LS.get('highscores', []); },
  qualifies(score) { const t = this.highScores(); return score > 0 && (t.length < 10 || score > t[t.length - 1].score); },
  saveHigh(initials) {
    const t = this.highScores(); t.push({ score: this.score, wave: this.wave, combo: G.stats.bestCombo, initials: (initials || 'KES').toUpperCase().slice(0, 3), date: new Date().toISOString().slice(0, 10) });
    t.sort((a, b) => b.score - a.score); t.length = Math.min(10, t.length); LS.set('highscores', t); LS.set('best', t[0].score); return t;
  },
  best() { return LS.get('best', 0); },
  end(victory) {
    if (this.ended) return; this.ended = true; G.timeScaleTarget = 1;
    audio.music.intensity = 0;
    emit('matchEnd', victory);
  },
};

// wiring
on('enemyKilled', (e, info) => game.onKill(e, info));
on('pickup', (k) => game.onPickup(k));
on('playerHurt', () => game.onPlayerHurt());
on('matrix', () => { G.stats.matrix++; game.addScore(SC.matrix, null, null, true); emit('killfeed', "MATRIX'D +" + SC.matrix); });
on('pierceKills', (n) => { game.addScore(SC.pierceKill * (n - 1), null, null, true); emit('killfeed', `PIERCE ×${n} +${SC.pierceKill * (n - 1)}`); });
on('arcadeReward', (r) => { if (r === 'ammo') weapons.addReserveFrac(0.5, true); else player.addOverride(CONFIG.override.arcadeWin); emit('toast', r === 'ammo' ? '+50% AMMO (ALL WEAPONS)' : '+25 OVERRIDE', 'small'); });
on('arcadePB', (n) => { if (G.state === 'arcade' || G.state === 'play') game.addScore(n, null, null, true); });
on('arcadeBananaRoute', () => weapons.unlockBanana('beat both cabinet targets'));
on('bossSummon', (kind, n) => { if (kind === 'wasps') game.spawn({ t: 'swarm', n }); else game.spawn({ t: 'sentinel' }); });
on('playerDied', () => { if (game.wave === 1 && G.stats.lastHitBy === 'wasp') G.stats.diedToWaspWave1 = true; setTimeout(() => game.end(false), 1400); });
on('minionExpired', () => {});
void explosion; void clamp; void ARENA;
