// OVERRIDE — ALL tunable numbers live here (mirrors the GDD "OVERRIDE — Game Design Document" v1.0).
export const CONFIG = {
  version: '1.0.0',
  player: {
    health: 100, regenRate: 8, regenDelay: 4, armourMax: 50, armourAbsorb: 0.6,
    speed: 7.5, accelTime: 0.08, decelTime: 0.06, airControl: 0.7,
    jumpHeight: 1.3, gravity: 24, coyote: 0.12, jumpBuffer: 0.1,
    fovDesktop: 80, fovMobile: 85, eyeHeight: 1.62, radius: 0.35, headBob: 0.03,
    dash: { speed: 14, time: 0.18, charges: 2, recharge: 2.5, iframes: 0.1, fovPunch: 6 },
  },
  override: {
    max: 100, perKill: 4, perWeakKill: 8, perDamage: 1 / 50, arcadeWin: 25, pickup: 15,
    range: 30, duration: 10, dmgBonus: 1.25, selfDestructRadius: 4, selfDestructDamage: 120,
    slowmoTime: 0.3, slowmoScale: 0.4, wardenShieldStrip: 0.25,
  },
  pickups: { dropChance: 0.25, ammoFrac: 0.5, med: 35, armour: 25, shard: 15, chip: 250, chipCombo: 1 },
  weapons: {
    pulse:   { slot: 1, name: 'Pulse Rifle', dmg: 14, weakMult: 1.8, rate: 10, mag: 36, reserve: 216, reload: 1.6, spreadHip: 0.8, spreadMin: 0.3, bloomReset: 0.3, range: 120, color: 0x46e8ff, recoil: 0.010, kick: 0.05 },
    arc:     { slot: 2, name: 'Arc Shotgun', dmg: 9, pellets: 9, rate: 1.4, mag: 6, reserve: 36, reloadPerShell: 0.45, cone: 7, falloff: 18, chainRange: 3, chainDmg: 15, color: 0xb36bff, recoil: 0.06, kick: 0.16, weakMult: 1.5 },
    rail:    { slot: 3, name: 'Rail Lance', dmgMin: 40, dmgMax: 140, charge: 1.0, cooldown: 0.6, mag: 8, reserve: 40, reload: 2.0, pierce: 4, pierceFalloff: 0.15, color: 0x7fd4ff, recoil: 0.05, kick: 0.2, weakMult: 2 },
    thermal: { slot: 4, name: 'Thermal Rail', dmgMin: 60, dmgMax: 220, charge: 1.5, cooldown: 1.1, mag: 5, reserve: 25, reload: 2.4, zoom: 2.5, penetrate: 1.5, penetrateMult: 0.7, color: 0xff6a3d, recoil: 0.07, kick: 0.25, weakMult: 2 },
    banana:  { slot: 5, name: 'Banana Gun', dmg: 35, burst: 60, radius: 3.5, rate: 2, mag: 12, reserve: 60, regen: 3, reload: 1.2, speed: 28, bounces: 3, restitution: 0.6, fuse: 2.5, slip: 2, peelLife: 8, color: 0xffe14a, recoil: 0.03, kick: 0.1, bonus: 77 },
  },
  swapTime: 0.25,
  aimAssist: { cone: 6, slowdown: 0.2 },
  enemies: {
    wasp: { hp: 30, speed: 11, sting: 6, stingCd: 1.2, weakMult: 2, telegraph: 0.4, orbitMin: 6, orbitMax: 10, score: 100 },
    sentinel: { hp: 260, speed: 2.6, bolt: 12, burst: 3, burstCd: 2.2, stomp: 25, stompRange: 2.5, coreMult: 2.5, plateMult: 0.5, coreOpenAfter: 80, coreOpenTime: 3, laserTelegraph: 0.6, score: 400, eliteHp: 1.5, eliteScore: 2 },
    warden: { hp: 3000, shield: 1200, nodeHp: 300, nodeShield: 400, speed: 3.2, mortar: 20, mortarWarn: 1.2, laser: 15, coreMult: 3, summonEvery: 20, phase3At: 0.35, phase3Shield: 600, phase3Nodes: 2, phase3Speed: 1.4, sentinelEvery: 25, score: 5000 },
    boltSpeed: 26, hpScalePerWave: 0.05, killPlaneY: -20,
    attackTokens: { wasp: 2, sentinel: 2 },
  },
  waves: [
    { wasps: 6, sentinels: 0, max: 6 },
    { wasps: 10, sentinels: 0, max: 8 },
    { wasps: 8, sentinels: 1, max: 8 },
    { wasps: 12, sentinels: 2, max: 10 },
    { wasps: 10, sentinels: 3, max: 10 },
    { wasps: 16, sentinels: 3, elites: 1, max: 12 },
    { wasps: 18, sentinels: 4, max: 12, glitch: true },
    { wasps: 20, sentinels: 5, max: 14, blackout: 20 },
    { wasps: 24, sentinels: 4, elites: 2, max: 14 },
    { boss: true, wasps: 4, max: 10 },
  ],
  countdown: 4, breatherAfter: [3, 6, 9], breather: 20, preGame: 20, // breathers are longer than the GDD's 8 s so the arcade is reachable (see README)
  scoring: {
    weakKillBonus: 0.5, multiWindow: 1.5, multi: { 2: 200, 3: 500, 4: 1000 }, pierceKill: 150, minionKill: 100, matrix: 150,
    noDamageWave: 1000, waveClear: 500, comboTime: 3.0, comboTiers: [[35, 5], [20, 4], [10, 3], [5, 2], [0, 1]], comboDamageLoss: 0.25,
  },
  arcade: {
    cycles: { grid: [40, 30], speed: 8, speedStep: 0.5, speedMax: 16, orb: 10, round: 100, target: 250 },
    invaders: { cols: 11, rows: 5, target: 1500, lives: 3 },
    pbBonus: 500,
  },
  bananaArcadeRoute: 'beat both cabinet targets in one session',
  barkRate: 2.5, barkPerType: 6,
};
