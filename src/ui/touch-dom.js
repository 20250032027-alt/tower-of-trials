// On-screen touch controls (DOM, so buttons are big, crisp and independent of the game zoom).
//  - floating MOVE stick: touch anywhere on the left side and drag
//  - ATTACK button: hold to attack. A plain hold auto-aims at the nearest enemy; drag the thumb to aim yourself
//  - DODGE / USE / AURA / SWAP / MENU buttons
// Skill buttons live in the HUD (they also work with a mouse) and report through Controls.

import { Controls } from './controls.js';
import { glyph } from './icons.js';
import { G } from '../game/state.js';

const R = 56; // stick radius in css px
const DEAD = 0.12;
const AIM_DRAG = 22; // px of drag before the thumb takes over aiming

export function createTouchPad(buttonIcon) {
  const pad = document.getElementById('pad');
  pad.innerHTML = `
    <div id="movezone"><i class="mhint">MOVE</i></div>
    <div id="stick"><i class="sbase"></i><i class="sknob"></i></div>
    <div id="aimline"></div>
    <button class="pbtn big" id="b-atk" data-btn="atk"><img class="gl" alt="" src="${glyph('attack')}"><span>ATTACK</span></button>
    <button class="pbtn" id="b-dodge" data-btn="dodge"><img class="gl" alt="" src="${glyph('dodge')}"><span>DODGE</span></button>
    <button class="pbtn use hidden" id="b-use" data-btn="use"><img class="gl" alt="" src="${glyph('use')}"><span>USE</span></button>
    <div id="use-cap" class="hidden"></div>
    <button class="pbtn sm" id="b-berserk" data-btn="berserk"><img class="gl" alt="" src="${glyph('aura')}"><span>AURA</span></button>
    <button class="pbtn sm" id="b-swap" data-btn="swap"><img class="gl" alt="" src=""><span>SWAP</span></button>
    <button class="pbtn" id="b-menu" data-btn="menu"><img class="gl" alt="" src="${glyph('menu')}"><span>MENU</span></button>`;

  const $zone = pad.querySelector('#movezone');
  const $stick = pad.querySelector('#stick');
  const $base = pad.querySelector('.sbase');
  const $knob = pad.querySelector('.sknob');
  const $atk = pad.querySelector('#b-atk');
  const $aimline = pad.querySelector('#aimline');

  const st = {
    moveId: null, base: { x: 0, y: 0 }, mx: 0, my: 0,
    atkId: null, atkDrag: null, // {angle} when the thumb dragged far enough
    held: {},
  };

  const rectCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  // ---- move stick
  function showStick(x, y) {
    $stick.classList.add('on');
    $stick.style.left = x + 'px'; $stick.style.top = y + 'px';
    $knob.style.transform = 'translate(-50%,-50%)';
  }
  function moveStick(e) {
    const dx = e.clientX - st.base.x, dy = e.clientY - st.base.y;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / R);
    const ang = Math.atan2(dy, dx);
    $knob.style.transform = `translate(calc(-50% + ${Math.cos(ang) * Math.min(d, R)}px), calc(-50% + ${Math.sin(ang) * Math.min(d, R)}px))`;
    if (k < DEAD) { st.mx = 0; st.my = 0; return; }
    const m = (k - DEAD) / (1 - DEAD);
    st.mx = Math.cos(ang) * m; st.my = Math.sin(ang) * m;
  }
  $zone.addEventListener('pointerdown', (e) => {
    if (st.moveId != null) return;
    e.preventDefault();
    st.moveId = e.pointerId;
    $zone.classList.add('busy');
    $zone.setPointerCapture(e.pointerId);
    // keep the whole stick on screen
    const rz = $zone.getBoundingClientRect();
    st.base = { x: Math.min(Math.max(e.clientX, rz.left + R + 10), rz.right - R - 10), y: Math.min(Math.max(e.clientY, rz.top + R + 10), rz.bottom - R - 10) };
    showStick(st.base.x, st.base.y);
    moveStick(e);
  });
  $zone.addEventListener('pointermove', (e) => { if (e.pointerId === st.moveId) moveStick(e); });
  const endMove = (e) => {
    if (e.pointerId !== st.moveId) return;
    st.moveId = null; st.mx = 0; st.my = 0;
    $zone.classList.remove('busy');
    $stick.classList.remove('on');
  };
  $zone.addEventListener('pointerup', endMove);
  $zone.addEventListener('pointercancel', endMove);

  // ---- attack button (hold; drag to aim)
  function atkMove(e) {
    const c = rectCenter($atk);
    const dx = e.clientX - c.x, dy = e.clientY - c.y;
    if (Math.hypot(dx, dy) > AIM_DRAG) {
      st.atkDrag = { angle: Math.atan2(dy, dx) };
      $aimline.classList.add('on');
      $aimline.style.left = c.x + 'px'; $aimline.style.top = c.y + 'px';
      $aimline.style.transform = `rotate(${st.atkDrag.angle}rad)`;
    } else { st.atkDrag = null; $aimline.classList.remove('on'); }
  }
  $atk.addEventListener('pointerdown', (e) => {
    if (st.atkId != null) return;
    e.preventDefault();
    st.atkId = e.pointerId; st.atkDrag = null;
    $atk.setPointerCapture(e.pointerId);
    $atk.classList.add('down');
    atkMove(e);
  });
  $atk.addEventListener('pointermove', (e) => { if (e.pointerId === st.atkId) atkMove(e); });
  const endAtk = (e) => {
    if (e.pointerId !== st.atkId) return;
    st.atkId = null; st.atkDrag = null;
    $atk.classList.remove('down');
    $aimline.classList.remove('on');
  };
  $atk.addEventListener('pointerup', endAtk);
  $atk.addEventListener('pointercancel', endAtk);

  // ---- tap buttons
  pad.querySelectorAll('.pbtn[data-btn]').forEach((b) => {
    if (b.id === 'b-atk') return;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      Controls.press(b.dataset.btn);
    });
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });

  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- labels fade once a button has been used a few times (the glyph is enough by then)
  const flags = () => (G.profile && G.profile.flags) || {};
  const LEARN_AT = 8;
  const refreshLearned = () => pad.querySelectorAll('.pbtn[data-btn]').forEach((b) => b.classList.toggle('learned', (flags()['btn_' + b.dataset.btn] || 0) >= LEARN_AT));
  pad.addEventListener('pointerdown', (e) => {
    lastTouch = performance.now();
    const b = e.target.closest && e.target.closest('.pbtn[data-btn]');
    if (b) { const f = flags(), k = 'btn_' + b.dataset.btn; f[k] = (f[k] || 0) + 1; if (f[k] === LEARN_AT) b.classList.add('learned'); }
  }, true);
  document.addEventListener('pointerdown', () => { lastTouch = performance.now(); }, true);
  let lastTouch = performance.now();
  setInterval(() => {
    const b = document.body;
    b.classList.toggle('calm', !b.classList.contains('fighting') && performance.now() - lastTouch > 3500);
  }, 300);

  // ---- thumb arc: ATTACK in the corner, everything else on arcs around it (closest = most used)
  const gl = (size) => Math.max(24, Math.round((size * 0.42) / 12) * 12) + 'px'; // glyphs are 12px art: whole-number scale only
  let capX = 0, capB = 6;
  function placeCap() {
    const cap = pad.querySelector('#use-cap');
    if (cap.classList.contains('hidden')) return;
    const w = cap.getBoundingClientRect().width || 120;
    cap.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, capX - w / 2))) + 'px';
    cap.style.right = 'auto';
    cap.style.bottom = `calc(${capB}px + env(safe-area-inset-bottom, 0px))`;
  }
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.max(0.8, Math.min(1.25, Math.min(vw, vh) / 390));
    const D = { atk: Math.round(108 * s), dodge: Math.round(72 * s), use: Math.round(80 * s), sm: Math.round(54 * s), skill: Math.round(56 * s) };
    const ra = D.atk / 2;
    const cxr = ra + 22 * s, cyb = ra + 18 * s;          // ATTACK centre, measured from the right / bottom edge
    const rIn = ra + D.dodge / 2 + 10 * s, rOut = rIn + 70 * s;
    const rad = (deg) => (deg * Math.PI) / 180;
    const put = (el, size, r, deg) => {
      if (!el) return;
      const cr = cxr + r * Math.cos(rad(deg)), cb = cyb + r * Math.sin(rad(deg));
      el.style.setProperty('--sz', size + 'px'); el.style.setProperty('--gl', gl(size));
      el.style.right = `calc(${Math.round(cr - size / 2)}px + env(safe-area-inset-right, 0px))`;
      el.style.bottom = `calc(${Math.round(cb - size / 2)}px + env(safe-area-inset-bottom, 0px))`;
      el.style.left = 'auto'; el.style.top = 'auto';
    };
    put(pad.querySelector('#b-atk'), D.atk, 0, 0);
    put(pad.querySelector('#b-dodge'), D.dodge, rIn, 10);
    put(pad.querySelector('#b-berserk'), D.sm, rIn, 64);
    put(pad.querySelector('#b-swap'), D.sm, rIn, 108);
    const rUse = rOut + 58 * s;
    put(pad.querySelector('#b-use'), D.use, rUse, 0);
    // caption sits under the USE disc (nothing else lives down there), centred on it but kept on screen
    capX = vw - (cxr + rUse); capB = Math.max(6, Math.round(cyb - D.use / 2 - 20));
    placeCap();
    const touch = document.body.classList.contains('touch');
    document.querySelectorAll('.skill').forEach((el) => {
      if (touch) put(el, D.skill, rOut, [14, 36, 58][+el.dataset.slot] ?? 58);
      else { ['right', 'bottom', 'left', 'top'].forEach((k) => { el.style[k] = ''; }); el.style.removeProperty('--sz'); el.style.removeProperty('--gl'); }
    });
    document.getElementById('b-menu') && document.getElementById('b-menu').style.setProperty('--sz', Math.round(48 * s) + 'px');
    refreshLearned();
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));
  window.addEventListener('tower-layout', layout);
  layout();

  return {
    get active() { return document.body.classList.contains('touch'); },
    get aiming() { return st.atkId != null; },
    // returns movement + aim + fire for this frame; scene passes in a function that finds the nearest target angle
    poll(autoAimAngle, fallbackAngle) {
      const out = { mx: st.mx, my: st.my, aim: null, fire: false };
      if (st.atkId != null) {
        out.fire = true;
        if (st.atkDrag) out.aim = st.atkDrag.angle;
        else {
          const a = autoAimAngle();
          if (a != null) out.aim = a;
          else if (st.mx || st.my) out.aim = Math.atan2(st.my, st.mx);
          else out.aim = fallbackAngle;
        }
      }
      return out;
    },
    setUse(caption) {
      const b = pad.querySelector('#b-use');
      const show = !!caption;
      b.classList.toggle('hidden', !show);
      const cap = pad.querySelector('#use-cap');
      cap.classList.toggle('hidden', !show);
      if (show && cap.textContent !== caption) cap.textContent = caption;
      if (show) placeCap();
    },
    setWeaponIcon(src) {
      const img = pad.querySelector('#b-swap img');
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    },
    setBerserk({ visible, state }) {
      const b = pad.querySelector('#b-berserk');
      b.style.visibility = visible ? 'visible' : 'hidden';
      b.dataset.state = state || '';
    },
    layout,
    reset() { st.moveId = null; st.mx = 0; st.my = 0; st.atkId = null; st.atkDrag = null; $stick.classList.remove('on'); $aimline.classList.remove('on'); $atk.classList.remove('down'); },
  };
}
