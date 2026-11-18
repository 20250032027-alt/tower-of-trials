// All character / weapon / object / effect art, drawn from code.
// Everything is "really top-down": characters are drawn FACING RIGHT and the
// game rotates them toward the aim direction. You only see head + shoulders.

import { Pix, noise } from './pixel.js';

const OUT = '#14101f'; // outline colour used everywhere

// ----------------------------------------------------------- characters
export function shadow() {
  const p = new Pix(18, 10);
  p.ellipse(9, 5, 8, 4, '#00000066');
  return p;
}

// ----------------------------------------------------------- weapons
// All drawn pointing right, with the grip at the left.
// ----------------------------------------------------------- projectiles
export function arrow() {
  const p = new Pix(11, 5);
  p.fillRect(1, 2, 8, 1, '#a6713f');
  p.fillRect(8, 1, 3, 3, '#aab4c8'); p.set(10, 2, '#e8eefc');
  p.set(0, 1, '#c0584a'); p.set(0, 3, '#c0584a'); p.set(1, 1, '#c0584a'); p.set(1, 3, '#c0584a');
  return p;
}
export function bolt() {
  const p = new Pix(9, 5);
  p.fillRect(0, 2, 6, 1, '#7a4a2a');
  p.fillRect(6, 1, 3, 3, '#aab4c8'); p.set(8, 2, '#e8eefc');
  p.set(0, 1, '#59607a'); p.set(0, 3, '#59607a');
  return p;
}
export function bullet() {
  const p = new Pix(7, 3);
  p.fillRect(0, 1, 5, 1, '#ffe27a');
  p.fillRect(4, 0, 3, 3, '#fff3b0');
  return p;
}
function orb(size, core, mid, edge) {
  const p = new Pix(size, size);
  const c = (size - 1) / 2 + 0.5;
  p.ellipse(c, c, size / 2, size / 2, (nx, ny) => {
    const d = Math.hypot(nx, ny);
    return d < 0.35 ? core : d < 0.7 ? mid : edge;
  });
  return p;
}
export const manaBolt = () => orb(9, '#ffffff', '#c8d8ff', '#6f8fff');
export const manaOrb = () => orb(15, '#ffffff', '#d6c4ff', '#8f64f0');
export const enemyBolt = () => orb(7, '#fff0d0', '#ff9a5a', '#c04020');

// Spells follow the blessing: leaf-spoked sprout, four-point star, blue hex crystal, ringed void. Three sizes each
// (bolt 9, orb 15, big 21) so a charged shot is a bigger picture, never a scaled-up one.
const SPELL_PAL = {
  none: ['#ffffff', '#c8d8ff', '#6f8fff'],
  natural: ['#f4ffec', '#8fe6a0', '#2f8a4a'],
  divine: ['#ffffff', '#fff2b0', '#e0b84a'],
  arcane: ['#ffffff', '#b8dcff', '#3f7fe0'],
  extraplanar: ['#e9c8ff', '#9a64f0', '#3a1466'],
};
export function spell(type, size) {
  const [core, mid, edge] = SPELL_PAL[type] || SPELL_PAL.none;
  const p = new Pix(size, size);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - h, dy = y + 0.5 - h;
      const nx = dx / h, ny = dy / h;
      const r = Math.hypot(nx, ny);
      let d = null; // 0 = centre .. 1 = rim, null = empty
      if (type === 'natural') {
        const arm = Math.abs(Math.abs(dx) - Math.abs(dy)) < (size > 12 ? 1.5 : 1.1) && r < 1.0 && r > 0.5; // four leaf spokes on the diagonals
        if (r < 0.66) d = r / 0.66 * 0.9; else if (arm) d = 0.95;
      } else if (type === 'divine') {
        if (Math.pow(Math.abs(nx), 0.62) + Math.pow(Math.abs(ny), 0.62) <= 1) d = (Math.abs(nx) + Math.abs(ny)) * 0.8;
      } else if (type === 'arcane') {
        const hex = Math.max(Math.abs(nx) * 0.87 + Math.abs(ny) * 0.5, Math.abs(ny));
        if (hex <= 1) d = hex;
      } else if (type === 'extraplanar') {
        const a = Math.atan2(dy, dx);
        const gap = r > 0.62 && a > 0.3 && a < 1.1; // a bite out of the ring: it reads as swirling
        if (r <= 1 && !gap) d = r;
      } else if (r <= 1) d = r;
      if (d == null) continue;
      let c = d < 0.35 ? core : d < 0.7 ? mid : edge;
      if (type === 'extraplanar') c = r < 0.4 ? '#14061f' : r < 0.62 ? '#5a2aa8' : (nx + ny < 0 ? mid : edge);
      p.set(x, y, c);
    }
  }
  if (type === 'extraplanar') p.set(Math.floor(h) - 1, Math.floor(h) - 1, '#e9c8ff'); // glint in the dark
  return p;
}


// ----------------------------------------------------------- effects
function crescent(size, r0, r1, half, tail) {
  const p = new Pix(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (Math.abs(a) > half) continue;
      // crescent: thick in the middle of the sweep, thin at the ends
      const t = 1 - Math.abs(a) / half;
      const inner = r0 + (r1 - r0) * (1 - t) * 0.8;
      const outer = r1 + tail * (t - 1) * 0;
      if (r >= inner && r <= outer) {
        const edge = (r - inner) / Math.max(1, outer - inner);
        p.set(x, y, edge > 0.7 ? '#ffffff' : edge > 0.3 ? '#dfe9ff' : '#9fb4e6');
      }
    }
  }
  return p;
}
export const slashSmall = () => crescent(64, 12, 29, 0.95, 0);
export const slashLarge = () => crescent(84, 14, 38, 1.2, 0);
export function thrust() {
  const p = new Pix(60, 9);
  for (let x = 0; x < 60; x++) {
    const w = Math.max(1, Math.round(4 * (x / 60)));
    for (let y = 4 - w; y <= 4 + w; y++) p.set(x, y, Math.abs(y - 4) <= w * 0.4 ? '#ffffff' : '#9fb4e6');
  }
  return p;
}
export function spark() {
  return Pix.fromRows(
    ['....#....', '....#....', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '....#....', '....#....'],
    { '#': '#ffffff' },
  );
}
export const bit = (c) => new Pix(3, 3).fillRect(0, 0, 3, 3, c);
export const dot = () => new Pix(2, 2).fillRect(0, 0, 2, 2, '#ffffff');
// a thin speed streak (brightest in the middle), a muzzle flash that points right, and a spent brass casing
export function streak() {
  return Pix.fromRows(['.aa#####aa.'], { '#': '#ffffff', a: '#a8a8a8' });
}
export function muzzle() {
  return Pix.fromRows(
    ['..a......', '.aoa..a..', 'aoo#ooooa', '.aoa..a..', '..a......'],
    { '#': '#ffffff', o: '#ffd070', a: '#d9742a' },
  );
}
export function casing() {
  return Pix.fromRows(['yy', 'bb'], { y: '#f0d27a', b: '#b38a2e' });
}

export function reticle() {
  const p = new Pix(26, 26);
  const c = '#ff5a44';
  for (const [x0, y0, sx, sy] of [[1, 1, 1, 1], [24, 1, -1, 1], [1, 24, 1, -1], [24, 24, -1, -1]]) {
    for (let i = 0; i < 5; i++) { p.set(x0 + sx * i, y0, c); p.set(x0, y0 + sy * i, c); }
  }
  return p;
}
export function markIcon() {
  return Pix.fromRows(
    ['...###...', '..#####..', '.#######.', '##.###.##', '#########', '.#.###.#.', '..#...#..', '...###...'],
    { '#': '#ff5a44' },
  ).outline(OUT);
}
export function healOrb() {
  const p = new Pix(9, 9);
  p.ellipse(4.5, 4.5, 4, 4, (nx, ny) => (Math.hypot(nx, ny) < 0.5 ? '#eafff0' : '#4fd37a'));
  p.fillRect(4, 2, 1, 5, '#14101f'); p.fillRect(2, 4, 5, 1, '#14101f');
  p.set(4, 4, '#ffffff');
  return p;
}
export function glow() {
  const p = new Pix(48, 48);
  p.ellipse(24, 24, 24, 24, (nx, ny) => {
    const d = Math.hypot(nx, ny);
    const a = Math.round(Math.max(0, 1 - d) ** 2 * 120);
    return [255, 190, 110, a];
  });
  return p;
}

// ----------------------------------------------------------- world objects
export function dummy() {
  const p = new Pix(22, 22);
  p.ellipse(11, 11, 8, 8, '#8a6a48');
  p.ellipse(11, 11, 7, 7, '#a98458');
  p.ellipse(11, 11, 6, 6, '#d8c89a');
  p.ellipse(11, 11, 4.2, 4.2, '#b8453a');
  p.ellipse(11, 11, 2.2, 2.2, '#f1e6c4');
  p.line(3, 11, 19, 11, '#6a4a30'); // cross arms
  p.set(11, 11, '#b8453a');
  p.outline(OUT);
  return p;
}
export function chest(open = false) {
  const p = new Pix(18, 16);
  p.fillRect(1, 3, 16, 11, '#7a4a2a');
  p.fillRect(1, 3, 16, 2, '#a6713f');
  p.fillRect(1, 12, 16, 2, '#5a3418');
  p.fillRect(5, 3, 2, 11, '#59607a'); p.fillRect(11, 3, 2, 11, '#59607a');
  if (open) {
    p.fillRect(2, 5, 14, 7, '#2a1a10');
    for (let i = 0; i < 9; i++) p.set(3 + ((i * 5) % 12), 6 + ((i * 3) % 5), '#ffd84a');
    p.fillRect(1, 1, 16, 2, '#a6713f');
  } else {
    p.fillRect(8, 7, 2, 3, '#ffd84a');
  }
  p.outline(OUT);
  return p;
}
export function sign() {
  // a small stone stele with a glowing rune (instead of a wooden board)
  const p = new Pix(16, 16);
  p.fillRect(3, 2, 10, 11, '#8a7a68');
  p.fillRect(3, 2, 10, 1, '#b3a58f'); p.fillRect(3, 12, 10, 1, '#5e5144');
  p.fillRect(4, 1, 8, 1, '#8a7a68'); p.fillRect(5, 0, 6, 1, '#8a7a68');
  p.set(3, 2, null); p.set(12, 2, null);
  for (const [x, y] of [[6, 5], [7, 5], [8, 5], [9, 5], [7, 6], [8, 7], [7, 8], [8, 9]]) p.set(x, y, '#4fd6c4');
  p.set(6, 9, '#2c7f78'); p.set(9, 9, '#2c7f78');
  p.fillRect(2, 13, 12, 2, '#5e5144'); p.fillRect(2, 13, 12, 1, '#7a6c5a');
  p.outline(OUT);
  return p;
}
export function altar(hue) {
  const p = new Pix(26, 26);
  const [dark, mid, light] = hue;
  p.ellipse(13, 13, 12, 12, '#3c3a48');
  p.ellipse(13, 13, 11, 11, '#5c5a6c');
  p.ellipse(13, 13, 9.5, 9.5, '#454357');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.fillRect(Math.round(13 + Math.cos(a) * 8) - 1, Math.round(13 + Math.sin(a) * 8) - 1, 2, 2, i % 2 ? mid : light);
  }
  p.ellipse(13, 13, 5, 5, dark);
  p.ellipse(13, 13, 3.5, 3.5, mid);
  p.ellipse(13, 13, 1.8, 1.8, light);
  p.outline(OUT);
  return p;
}

// animated swirl portal (4 frames)
export function portalFrame(size, frame, pal, locked = false) {
  const p = new Pix(size, size);
  const c = size / 2;
  const R = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      if (r > R) continue;
      const a = Math.atan2(dy, dx);
      const swirl = 0.5 + 0.5 * Math.sin(a * 3 + frame * (Math.PI / 2) + r * 0.7);
      let col;
      if (r > R - 2) col = locked ? '#6b6878' : swirl > 0.5 ? pal[2] : pal[1];
      else if (r > R - 5) col = locked ? '#4a4858' : swirl > 0.6 ? pal[2] : swirl > 0.25 ? pal[1] : pal[0];
      else col = locked ? '#26242f' : swirl > 0.82 ? pal[2] : swirl > 0.5 ? pal[1] : pal[0];
      p.set(x, y, col);
    }
  }
  p.outline(OUT);
  return p;
}

export function torchFrame(frame) {
  const p = new Pix(10, 12);
  p.fillRect(4, 6, 2, 6, '#5a3a22');
  p.fillRect(3, 5, 4, 2, '#59607a');
  const f = frame ? 1 : 0;
  p.ellipse(5, 3, 2.5, 3 + f * 0.6, '#ff9a3a');
  p.ellipse(5, 3.4, 1.5, 2 + f * 0.5, '#ffe27a');
  p.set(5, 3, '#ffffff');
  p.outline(OUT);
  return p;
}

export function ring(size, color) {
  const p = new Pix(size, size);
  const c = size / 2;
  p.ellipse(c, c, c, c, (nx, ny) => (Math.hypot(nx, ny) > 0.82 ? color : null));
  return p;
}

export function pixelBox(w, h, fill, border) {
  const p = new Pix(w, h);
  p.fillRect(0, 0, w, h, fill);
  p.rect(0, 0, w, h, border);
  return p;
}

// a little pseudo-random bone scatter used by tiles
export function boneBits(p, x, y, seed) {
  for (let i = 0; i < 3; i++) {
    const bx = x + Math.floor(noise(i, seed, 3) * 10);
    const by = y + Math.floor(noise(seed, i, 5) * 10);
    p.set(bx, by, '#cfc8b0'); p.set(bx + 1, by, '#9b937c');
  }
}

export function cross() {
  const p = new Pix(11, 11);
  for (const [x, y] of [[5, 1], [5, 2], [5, 3], [5, 7], [5, 8], [5, 9], [1, 5], [2, 5], [3, 5], [7, 5], [8, 5], [9, 5]]) p.set(x, y, '#ffffff');
  p.set(5, 5, '#ff5a44');
  p.outline(OUT);
  return p;
}

export function vignette(w, h, rgb = [6, 4, 14], maxA = 190, inner = 0.55) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w - 0.5, ny = (y + 0.5) / h - 0.5;
      const d = Math.hypot(nx * 1.15, ny * 1.35) / 0.62;
      const a = Math.max(0, Math.min(1, (d - inner) / 0.6)) ** 1.5;
      if (a > 0) p.data.set([rgb[0], rgb[1], rgb[2], Math.round(a * maxA)], (y * w + x) * 4);
    }
  }
  return p;
}

// ----------------------------------------------------------- guide pointer + rings (always drawn 1:1 on the world pixel grid)
// Goal pointer: an arrow rasterised straight onto a 23x23 grid for each of 16 directions, so it is never
// rotated or scaled after the fact (that is what made the old one look blurry / a different pixel size).
export function pointer(i, n = 16) {
  const S = 23, c = S / 2, SS = 4;
  const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 4x4 samples per pixel; a pixel is "ink" when at least half of it is covered, which keeps every angle clean
      let hit = 0, lit = 0, dark = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const dx = x + (sx + 0.5) / SS - c, dy = y + (sy + 0.5) / SS - c;
        const lx = dx * ca + dy * sa;
        const ly = -dx * sa + dy * ca;
        // a solid dart (tip forward, notched back): it stays chunky and readable at every angle
        const body = lx >= -6.5 && lx <= 9.5 && Math.abs(ly) <= (9.5 - lx) * 0.4;
        const notch = lx < -1.5 && Math.abs(ly) < (-1.5 - lx) * 0.85;
        if (!body || notch) continue;
        hit++;
        if (ly < -1.2) lit++; else if (ly > 1.6) dark++;
      }
      if (hit < SS * SS / 2) continue;
      p.set(x, y, lit > hit * 0.5 ? '#fff0a8' : dark > hit * 0.5 ? '#d29a2c' : '#ffd24a');
    }
  }
  return p.outline('#120d0a');
}

// 1px pixel-circle (radius r), used for the pulse when something levels up / opens and for the goal marker.
export function pixelRing(r, color, dark = null) {
  const S = Math.ceil(r * 2) + 5, c = S / 2;
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d >= r - 0.5 && d < r + 0.5) p.set(x, y, color);
      else if (dark && ((d >= r - 1.5 && d < r - 0.5) || (d >= r + 0.5 && d < r + 1.5))) p.set(x, y, dark);
    }
  }
  return p;
}

// awareness cues above an enemy's head
export function cueAlert() {
  return Pix.fromRows(['..##..', '.####.', '.####.', '.####.', '..##..', '..##..', '......', '..##..', '..##..'], { '#': '#ff5a3c' }).outline('#120d0a');
}
export function cueWonder() {
  return Pix.fromRows(['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..', '..##..'], { '#': '#ffd24a' }).outline('#120d0a');
}

// ----------------------------------------------------------- XP orbs (gold, to match the gold XP bar) + extra juice bits
// Three frames so the highlight twinkles as the orb bobs.
const ORB_MAP = { '#': '#14101f', o: '#f0c040', d: '#b9741c', l: '#ffe9a0', w: '#ffffff' };
const ORB_FRAMES = [
  ['..###..', '.#lwo#.', '#lwooo#', '#ooood#', '#ooddd#', '.#ddd#.', '..###..'],
  ['..###..', '.#low#.', '#loooo#', '#ooood#', '#ooddd#', '.#ddd#.', '..###..'],
  ['..###..', '.#llo#.', '#llooo#', '#loood#', '#ooddd#', '.#ddd#.', '..###..'],
];
export function xpOrb(frame = 0) { return Pix.fromRows(ORB_FRAMES[frame % ORB_FRAMES.length], ORB_MAP); }
export function orbShadow() {
  return Pix.fromRows(['.###.', '#####'], { '#': '#0a061266' });
}
export function boneChunk() {
  return Pix.fromRows(['.ww.', 'wwww', '.ss.'], { w: '#e2dcc6', s: '#a89f86' });
}

// ---- what a skeleton leaves behind (same bone colours as the skeleton sprite)
const BONE_MAP = { '#': '#241a2c', h: '#fbf7ea', w: '#ece6d2', s: '#b9b19a', d: '#8f8870', k: '#241a2c' };
export function skull() {
  return Pix.fromRows([
    '..####..',
    '.#hhww#.',
    '#hwwwws#',
    '#wkkwkk#',
    '#wkkwkk#',
    '#wwwwss#',
    '.#wkwk#.',
    '..####..',
  ], BONE_MAP);
}
export function rib() {
  return Pix.fromRows(['..hwww..', '.hs..ws.', 'hs....ws', 'ws.....s'], BONE_MAP);
}
export function femur() {
  return Pix.fromRows(['hw.....wh', '.wwwwwwss', 'ws.....ws'], BONE_MAP);
}
// the little heap a skeleton collapses into (ribs, a few vertebrae, a dark smudge under it)
export function bonePile() {
  return Pix.fromRows([
    '...hw..h.w...',
    '.hws.hwsw.hw.',
    'wswshwsshws.s',
    '.sdsdwsdsdsd.',
    '..kdkkdkdkk..',
  ], { ...BONE_MAP, k: '#3a3045' });
}
// a soul leaving: a small teal wisp with a flicking tail (hero-scarf teal, so it reads as "his" mana, not a spooky green)
export function soulWisp(frame = 0) {
  const rows = frame % 2
    ? ['.ttt.', 'thwtt', 'tthtt', '.ttt.', '..td.', '..d..']
    : ['.ttt.', 'thwtt', 'tthtt', '.ttt.', '.dt..', '..d..'];
  return Pix.fromRows(rows, { t: '#6ff0d6', h: '#f2fffb', w: '#ffffff', d: '#2f9a8e' });
}
export function dustPuff() {
  return Pix.fromRows(['.hhh.', 'hhhhh', 'hhhhh', 'hhhhh', '.hhh.'], { h: '#d6cfb8' });
}
