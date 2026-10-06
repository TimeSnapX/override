// OVERRIDE — unified input: virtual joystick + drag-look + buttons on touch; WASD + pointer lock on desktop.
import { G, clamp, LS } from './core.js';

export const input = {
  move: { x: 0, y: 0 }, lookDX: 0, lookDY: 0,
  held: {}, edges: new Set(), keys: {}, locked: false,
  sens: LS.get('sens', 1.0),
  press(name) { if (this.edges.has(name)) { this.edges.delete(name); return true; } return false; },
  consumeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return r; },
  clear() { this.edges.clear(); this.lookDX = this.lookDY = 0; },
  isFire() { return !!(this.held.fire || this.held.mouse0); },
};

const touches = new Map();
let joyId = null, joyOrigin = null;
const JOY_R = 60;

function setupTouch() {
  const layer = document.getElementById('touch');
  const base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
  const showJoy = (x, y) => { base.style.display = 'block'; base.style.left = x + 'px'; base.style.top = y + 'px'; knob.style.transform = 'translate(-50%,-50%)'; };
  const start = (e) => {
    if (G.state !== 'play') return;
    for (const t of e.changedTouches) {
      const btnEl = t.target.closest && t.target.closest('[data-btn]');
      if (btnEl) {
        const b = btnEl.dataset.btn; input.held[b] = true; input.edges.add(b); btnEl.classList.add('down');
        touches.set(t.identifier, { kind: 'btn', btn: b, el: btnEl, x: t.clientX, y: t.clientY });
        if (navigator.vibrate && b !== 'fire') navigator.vibrate(8);
      } else if (t.clientX < innerWidth * 0.42 && joyId === null) {
        joyId = t.identifier; joyOrigin = { x: t.clientX, y: t.clientY }; showJoy(t.clientX, t.clientY);
        touches.set(t.identifier, { kind: 'joy' });
      } else {
        touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    }
    e.preventDefault();
  };
  const move = (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      if (s.kind === 'joy') {
        let dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y; const d = Math.hypot(dx, dy);
        if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
        input.move.x = dx / JOY_R; input.move.y = -dy / JOY_R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (s.kind === 'look' || (s.kind === 'btn' && s.btn === 'fire')) {
        const k = 0.0042 * input.sens;
        input.lookDX += (t.clientX - s.x) * k; input.lookDY += (t.clientY - s.y) * k; s.x = t.clientX; s.y = t.clientY;
      }
    }
    e.preventDefault();
  };
  const end = (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      if (s.kind === 'joy') { joyId = null; input.move.x = input.move.y = 0; base.style.display = 'none'; }
      if (s.kind === 'btn') { input.held[s.btn] = false; s.el.classList.remove('down'); }
      touches.delete(t.identifier);
    }
    e.preventDefault();
  };
  layer.addEventListener('touchstart', start, { passive: false });
  layer.addEventListener('touchmove', move, { passive: false });
  layer.addEventListener('touchend', end, { passive: false });
  layer.addEventListener('touchcancel', end, { passive: false });
}
export function releaseAllTouches() {
  touches.clear(); joyId = null; input.move.x = input.move.y = 0; input.held = {};
  const base = document.getElementById('joy-base'); if (base) base.style.display = 'none';
  document.querySelectorAll('[data-btn].down').forEach((b) => b.classList.remove('down'));
}

const KEYMAP = { KeyR: 'reload', KeyQ: 'swap', ShiftLeft: 'dash', ShiftRight: 'dash', Space: 'jump', KeyE: 'override', KeyF: 'interact', KeyZ: 'scope', KeyC: 'scope', Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5', Escape: 'pause', KeyP: 'pause', KeyM: 'mute', Enter: 'ready' };
function setupDesktop(canvas) {
  addEventListener('keydown', (e) => {
    if (G.state === 'arcade') return;
    input.keys[e.code] = true;
    const a = KEYMAP[e.code]; if (a && !e.repeat) input.edges.add(a);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.state === 'play') e.preventDefault();
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('blur', () => { input.keys = {}; input.held = {}; });
  canvas.addEventListener('mousedown', (e) => {
    if (G.state !== 'play') return;
    if (!input.locked && !G.params.has('nolock') && !G.mobile) { canvas.requestPointerLock?.(); }
    if (e.button === 0) input.held.mouse0 = true;
    if (e.button === 2) input.edges.add('scope');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.held.mouse0 = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (G.state === 'play') input.edges.add(e.deltaY > 0 ? 'swap' : 'swapPrev'); }, { passive: true });
  addEventListener('mousemove', (e) => {
    if (!input.locked || G.state !== 'play') return;
    const k = 0.0022 * input.sens; input.lookDX += e.movementX * k; input.lookDY += e.movementY * k;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked && G.state === 'play' && !G.mobile && !G.params.has('nolock')) input.edges.add('pause');
  });
}

export function updateKeyboardMove() {
  if (G.mobile && joyId !== null) return;
  const k = input.keys;
  let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  if (x || y || !G.mobile) { const l = Math.hypot(x, y) || 1; if (joyId === null) { input.move.x = x / l; input.move.y = y / l; } }
}

export function initInput(canvas) { setupTouch(); setupDesktop(canvas); }
export { clamp };
