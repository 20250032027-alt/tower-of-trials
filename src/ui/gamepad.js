// Controller support (browser Gamepad API, "standard" layout: Xbox / PlayStation / Switch Pro / Steam Deck / most others).
//
//  In the game:   left stick or D-pad = move       right stick = aim (idle: faces your target or where you walk)
//                 RT or X = attack (hold to Focus / Cast)    B or LT = dodge    A = use / open / read
//                 LB = skill wheel (tap to open, tap again to use; or hold, pick, release)    RB = Aura (Berserk)
//                 Y = swap weapon    R3 = lock-on on / off    Back = full map    Start = menu
//  Skill wheel:   left / right (D-pad, either stick) = scroll    A or LB = use    B = close
//  Menus:         D-pad or left stick = move the highlight    A = press    B or Start = close    LB / RB = change tab
//                 left / right on a slider = change it    right stick up / down = scroll the page
//
// One loop (requestAnimationFrame) reads the pad. In menus it drives the DOM highlight itself. In the game it only keeps
// the state fresh; PlayScene.readInput() asks for it through Pad.read().

import { G } from '../game/state.js';
import { sfx } from '../game/sfx.js';

const BTN = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home'];
const DEAD_MOVE = 0.2;
const DEAD_AIM = 0.3;
const FLICK = 0.6;       // a stick pushed past this counts as a "press" in that direction (menus, skill wheel)
const EDGE_LIFE = 300;   // ms a press waits for the game to pick it up

export const Pad = {
  inUse: false,          // the last thing the player touched was a controller
  connected: false,
  name: '',
  held: {},              // named buttons held right now
  lx: 0, ly: 0, rx: 0, ry: 0,
  _edge: {}, _edgeT: {},
  _rumbleUntil: 0, _rumbleMag: 0,
};

const now = () => performance.now();

function pickPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let best = null;
  for (const gp of list) {
    if (!gp || !gp.connected) continue;
    if (gp.mapping === 'standard') return gp;
    if (!best) best = gp;
  }
  return best;
}

// a radial dead zone that rescales, so the stick starts from zero just outside the zone
function stick(x, y, dead) {
  const m = Math.hypot(x, y);
  if (m < dead) return [0, 0, 0];
  const k = (Math.min(1, m) - dead) / (1 - dead) / m;
  return [x * k, y * k, Math.min(1, (m - dead) / (1 - dead))];
}

let lastAimAt = 0;
let prevHeld = {};
let prevFlick = {};
let lastUsedAt = 0;

function setInUse(on) {
  if (Pad.inUse === on) return;
  Pad.inUse = on;
  document.body.classList.toggle('padmode', on);
  if (on) lastUsedAt = now();
  relabel();
  if (!on) clearFocus();
  window.dispatchEvent(new Event('tower-pad'));
}

// the on-screen key hints say "RT" and "B" instead of "CLICK" and "SPACE" while a controller is in use
function relabel() {
  const on = Pad.inUse;
  const set = (sel, txt) => { const e = document.querySelector(sel); if (e) e.textContent = txt; };
  set('#skillbtn .k', on ? 'LB' : 'F');
  const al = document.querySelector('.aura .al b');
  if (al) al.textContent = on ? '[RB]' : '[R]';
}

function edge(name) { Pad._edge[name] = true; Pad._edgeT[name] = now(); }

// ---------------------------------------------------------------- the per-frame read
function readState() {
  const gp = pickPad();
  if (!gp) {
    if (Pad.connected) { Pad.connected = false; setInUse(false); }
    Pad.held = {}; prevHeld = {}; Pad.lx = Pad.ly = Pad.rx = Pad.ry = 0;
    return null;
  }
  if (!Pad.connected) { Pad.connected = true; Pad.name = (gp.id || 'controller').replace(/\s*\(.*$/, '').slice(0, 28); }
  const held = {};
  for (let i = 0; i < BTN.length; i++) {
    const b = gp.buttons[i];
    if (b && (b.pressed || b.value > 0.5)) held[BTN[i]] = true;
  }
  const ax = gp.axes || [];
  const [lx, ly] = stick(ax[0] || 0, ax[1] || 0, DEAD_MOVE);
  const [rx, ry] = stick(ax[2] || 0, ax[3] || 0, DEAD_AIM);
  Pad.lx = lx; Pad.ly = ly; Pad.rx = rx; Pad.ry = ry;
  Pad.rt = gp.buttons[7] ? gp.buttons[7].value : 0;
  // button presses (edges)
  let activity = false;
  for (const n in held) if (!prevHeld[n]) { edge(n); activity = true; }
  // sticks pushed hard in a direction count as presses too: lstick_left ... rstick_down
  const flick = {
    sl: ax[0] < -FLICK, sr: ax[0] > FLICK, su: ax[1] < -FLICK, sd: ax[1] > FLICK,
    rl: ax[2] < -FLICK, rr: ax[2] > FLICK, ru: ax[3] < -FLICK, rd: ax[3] > FLICK,
  };
  for (const n in flick) if (flick[n] && !prevFlick[n]) { edge(n); activity = true; }
  prevHeld = held; prevFlick = flick;
  Pad.held = held;
  if (activity || Math.hypot(lx, ly) > 0.3 || Math.hypot(rx, ry) > 0.3) setInUse(true);
  return gp;
}

// the game asks for the pad's state once per frame: sticks, triggers, and the presses since last time
Pad.read = function read() {
  if (!Pad.inUse) return null;
  const t = now(), e = {};
  for (const n in Pad._edge) if (t - Pad._edgeT[n] < EDGE_LIFE) e[n] = true;
  Pad._edge = {}; Pad._edgeT = {};
  const aimNow = Math.hypot(Pad.rx, Pad.ry) > 0.05;
  if (aimNow) lastAimAt = t;
  return {
    e,
    mx: Pad.lx, my: Pad.ly,
    dx: (Pad.held.right ? 1 : 0) - (Pad.held.left ? 1 : 0),
    dy: (Pad.held.down ? 1 : 0) - (Pad.held.up ? 1 : 0),
    rx: Pad.rx, ry: Pad.ry,
    aimActive: aimNow,
    aim: Math.atan2(Pad.ry, Pad.rx),
    fire: !!(Pad.held.rt || Pad.held.x),
    skillsHeld: !!Pad.held.lb,
    // the skill wheel scrolls with left / right on the D-pad or either stick
    wheelStep: (e.left || e.sl || e.rl ? -1 : 0) + (e.right || e.sr || e.rr ? 1 : 0),
    sinceAim: t - lastAimAt, // ms since the right stick was last used
  };
};

// drop any waiting presses (used when a menu closes so the same press does not also act in the game)
Pad.flush = () => { Pad._edge = {}; Pad._edgeT = {}; };

// ---------------------------------------------------------------- rumble
Pad.rumble = function rumble(ms, strong = 0.5, weak = 0.3) {
  if (!Pad.inUse || G.settings.rumble === false) return;
  const t = now();
  if (t < Pad._rumbleUntil && Pad._rumbleMag >= strong) return; // something stronger is already playing
  const gp = pickPad();
  const act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
  if (!act) return;
  try {
    if (act.playEffect) act.playEffect('dual-rumble', { startDelay: 0, duration: Math.round(ms), strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
    else if (act.pulse) act.pulse(Math.min(1, strong), Math.round(ms));
    Pad._rumbleUntil = t + ms; Pad._rumbleMag = strong;
  } catch (e) { /* no vibration on this pad */ }
};

// ---------------------------------------------------------------- menu navigation (DOM)
const FOCUSABLE = 'button:not([disabled]), input[type="range"]:not([disabled])';
let focusEl = null, focusKey = '', focusPt = null;
let navHold = { dir: null, t: 0, rep: 0 };

function uiRoot() {
  const vis = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') ? e : null; };
  const d = vis('dialog'); if (d) return d;
  const m = vis('menu'); if (m) return m;
  const t = vis('title'); if (t && !t.classList.contains('leaving')) return t;
  return null;
}

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

const keyOf = (el) => (el ? [el.dataset.act || el.id || el.className, el.dataset.id || '', el.dataset.k || ''].join('|') : '');
const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function candidates(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(visible);
}

function setFocus(el, scroll = true) {
  if (focusEl && focusEl !== el) focusEl.classList.remove('padfocus');
  focusEl = el;
  if (!el) { focusKey = ''; return; }
  el.classList.add('padfocus');
  focusKey = keyOf(el);
  focusPt = centerOf(el);
  if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function clearFocus() {
  if (focusEl) focusEl.classList.remove('padfocus');
  focusEl = null; focusKey = '';
  document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus'));
  const h = document.getElementById('padhint'); if (h) h.classList.add('hidden');
}

// the menu is rebuilt whenever something changes, so find "the same" element again (same action + id, else the nearest one)
function refocus(root) {
  if (focusEl && root.contains(focusEl) && document.contains(focusEl)) return;
  const list = candidates(root);
  if (!list.length) { focusEl = null; return; }
  let pick = focusKey ? list.find((e) => keyOf(e) === focusKey) : null;
  if (!pick && focusPt) {
    let bd = Infinity;
    for (const e of list) { const c = centerOf(e), d = Math.hypot(c.x - focusPt.x, c.y - focusPt.y); if (d < bd) { bd = d; pick = e; } }
  }
  if (!pick) pick = root.querySelector('.tt-btn.primary') || root.querySelector('.tab.on') || list[0];
  setFocus(pick && visible(pick) ? pick : list[0], false);
}

function move(root, dir) {
  const list = candidates(root);
  if (!list.length) return;
  if (!focusEl || !list.includes(focusEl)) { refocus(root); return; }
  const a = centerOf(focusEl);
  const ar = focusEl.getBoundingClientRect();
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e === focusEl) continue;
    const r = e.getBoundingClientRect(), c = centerOf(e);
    const dx = c.x - a.x, dy = c.y - a.y;
    let main, side;
    if (dir === 'left') { main = -dx; side = Math.abs(dy); if (r.right > ar.left + 2 && main <= 0) continue; }
    else if (dir === 'right') { main = dx; side = Math.abs(dy); if (r.left < ar.right - 2 && main <= 0) continue; }
    else if (dir === 'up') { main = -dy; side = Math.abs(dx); if (r.bottom > ar.top + 2 && main <= 0) continue; }
    else { main = dy; side = Math.abs(dx); if (r.top < ar.bottom - 2 && main <= 0) continue; }
    if (main <= 1) continue;
    const score = main + side * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  if (best) { setFocus(best); sfx('tick', { dir: dir === 'left' || dir === 'up' ? -1 : 1 }); return true; }
  // nothing further that way: let a long page scroll instead
  const sc = root.querySelector('.content');
  if (sc && (dir === 'up' || dir === 'down')) sc.scrollTop += dir === 'down' ? 60 : -60;
  return false;
}

function adjustSlider(el, dir) {
  const min = +el.min || 0, max = +el.max || 100;
  const step = +el.step || Math.max(1, Math.round((max - min) / 40));
  const v = Math.max(min, Math.min(max, (+el.value || 0) + dir * step));
  if (v === +el.value) return;
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressFocus() {
  if (!focusEl || !document.contains(focusEl)) return;
  if (focusEl.tagName === 'INPUT') return;
  focusEl.click();
}

function switchTab(root, d) {
  const tabs = [...root.querySelectorAll('.tab[data-act="tab"]')];
  if (!tabs.length) return;
  const i = tabs.findIndex((t) => t.classList.contains('on'));
  const n = tabs[(i + d + tabs.length) % tabs.length];
  if (n) { n.click(); focusKey = keyOf(n); focusEl = null; focusPt = null; }
}

function hint(root) {
  let h = document.getElementById('padhint');
  if (!h) { h = document.createElement('div'); h.id = 'padhint'; document.body.appendChild(h); }
  const isMenu = root.id === 'menu', isTitle = root.id === 'title';
  h.innerHTML = isTitle ? '<b>A</b> SELECT' : isMenu ? '<b>A</b> SELECT <b>B</b> CLOSE <b>LB</b>/<b>RB</b> TABS <b>RS</b> SCROLL' : '<b>A</b> OK';
  h.classList.remove('hidden');
}

function driveMenu(root) {
  // 1. find / keep the highlighted element
  refocus(root);
  hint(root);
  const e = Pad._edge;
  const t = now();
  // 2. D-pad and left stick: one step per press, then auto-repeat while held
  const want = wantDir();
  if (want !== navHold.dir) { navHold = { dir: want, t, rep: 0 }; if (want) stepNav(root, want); }
  else if (want && t - navHold.t > 380 && t - navHold.rep > 95) { navHold.rep = t; stepNav(root, want); }
  // 3. right stick scrolls the page
  const sc = root.querySelector('.content');
  if (sc && Math.abs(Pad.ry) > 0.1) sc.scrollTop += Pad.ry * 14;
  // 4. buttons
  if (e.a) pressFocus();
  if (e.lb) switchTab(root, -1);
  if (e.rb) switchTab(root, 1);
  if (e.b || e.start) {
    const close = root.querySelector('[data-act="closeDialog"], [data-act="closeMenu"]');
    if (close) close.click();
  }
  Pad.flush();
}

function wantDir() {
  if (Pad.held.left) return 'left';
  if (Pad.held.right) return 'right';
  if (Pad.held.up) return 'up';
  if (Pad.held.down) return 'down';
  const ax = Pad.lx, ay = Pad.ly;
  if (Math.max(Math.abs(ax), Math.abs(ay)) < 0.55) return null;
  return Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
}

function stepNav(root, dir) {
  if (focusEl && focusEl.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) { adjustSlider(focusEl, dir === 'left' ? -1 : 1); return; }
  move(root, dir);
}

// ---------------------------------------------------------------- the loop
let started = false;
let wasUi = false;
function loop() {
  readState();
  const root = Pad.inUse ? uiRoot() : null;
  if (root) {
    driveMenu(root);
    wasUi = true;
  } else {
    if (wasUi) { wasUi = false; Pad.flush(); clearFocus(); }
    else if (document.getElementById('padhint')) document.getElementById('padhint').classList.add('hidden');
  }
  requestAnimationFrame(loop);
}

export function initGamepad() {
  if (started) return;
  started = true;
  G.rumble = Pad.rumble;
  window.addEventListener('gamepadconnected', (e) => {
    const nm = (e.gamepad && e.gamepad.id ? e.gamepad.id : 'controller').replace(/\s*\(.*$/, '').slice(0, 28);
    if (G.ui && G.ui.toast) G.ui.toast('CONTROLLER READY: ' + nm, 'good');
  });
  window.addEventListener('gamepaddisconnected', () => {
    if (G.ui && G.ui.toast) G.ui.toast('CONTROLLER DISCONNECTED', 'info');
    if (Pad.inUse) setInUse(false);
  });
  // the mouse, keyboard or a touch takes over again
  const back = () => { if (Pad.inUse && now() - lastUsedAt > 150) setInUse(false); };
  window.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) back(); }, { passive: true });
  window.addEventListener('mousedown', back, { passive: true });
  window.addEventListener('touchstart', back, { passive: true });
  window.addEventListener('keydown', back, { passive: true });
  requestAnimationFrame(loop);
}

if (typeof window !== 'undefined') window.__pad = Pad;
