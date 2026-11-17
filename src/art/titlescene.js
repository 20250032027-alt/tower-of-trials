// Sprites and small procedural pieces for the title-screen vista: drifting clouds, mist, a dead tree, the skeleton guards,
// the hero and the bats. (The Tower, the ground and the sky are ray-cast in titleworld.js.) Everything is drawn small and
// shown at a whole-number zoom, in the same palette family and with the same dark outline as the in-game art.
import { Pix, noise } from './pixel.js';

const OUT = '#0d0a16';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// ------------------------------------------------------------------ clouds & fog
export function makeCloud(w, h, seed) {
  const p = new Pix(w, h), base = h - 3;
  const ph = [noise(1, 1, seed) * 6.28, noise(2, 1, seed) * 6.28, noise(3, 1, seed) * 6.28];
  for (let x = 0; x < w; x++) {
    const e = Math.min(1, Math.min(x, w - 1 - x) / (w * 0.24)), fade = e * e * (3 - 2 * e);
    const prof = 0.5 + 0.28 * Math.sin(x * 0.21 + ph[0]) + 0.2 * Math.sin(x * 0.47 + ph[1]) + 0.12 * Math.sin(x * 0.93 + ph[2]);
    const top = Math.round(base - Math.max(0.6, prof * fade * (h - 3)));
    for (let y = top; y <= base; y++) {
      const dy = y - top;
      p.set(x, y, dy === 0 ? '#5d4d84' : dy < 2 ? '#4d3d6e' : y >= base ? '#8a4f74' : y >= base - 1 ? '#5a3f6a' : '#2b2247');   // lit rim on top, warm glow underneath
    }
    if (bayer(x, base + 1) < 0.45) p.set(x, base + 1, '#6a3f66');
  }
  return p;
}
/** Seamless horizontally; denser toward the bottom. Drawn pale and drifted slowly in front of the ground. */
export function makeFog(w, h, seed) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = (noise(Math.floor(x / 3) % Math.ceil(w / 3), y, seed) + noise(Math.floor(x / 7) % Math.ceil(w / 7), y + 40, seed)) / 2;
    const dens = ((y + 1) / h) ** 1.4 * 0.85 * (0.45 + n);
    if (dens > bayer(x, y)) p.set(x, y, '#a89ccb88');
  }
  return p;
}

/** A bare, wind-bent tree in near-black, for the corners. */
export function makeDeadTree(h, seed, flip = false) {
  const w = Math.round(h * 0.8), p = new Pix(w, h);
  const bx = flip ? w - Math.round(w * 0.3) : Math.round(w * 0.3);
  const limb = (x, y, len, ang, depth) => {
    if (len < 2 || depth > 4) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    p.line(x, y, x2, y2, '#0b0812');
    if (depth < 2) p.line(x + 1, y, x2 + 1, y2, '#0b0812');
    const k = noise(Math.round(x), Math.round(y), seed);
    limb(x2, y2, len * 0.72, ang - 0.5 - k * 0.5, depth + 1);
    limb(x2, y2, len * 0.66, ang + 0.4 + k * 0.5, depth + 1);
  };
  p.fillRect(bx - 1, Math.round(h * 0.45), 3, h - Math.round(h * 0.45), '#0b0812');
  limb(bx, Math.round(h * 0.5), h * 0.34, -Math.PI / 2 + (flip ? 0.25 : -0.25), 0);
  limb(bx, Math.round(h * 0.62), h * 0.24, flip ? -2.4 : -0.74, 1);
  return p;
}

// ---- tiny figures (virtual-pixel sprites)
const FIG = { k: '#241a2c', w: '#ece6d2', h: '#fbf7ea', s: '#b9b19a', d: '#4a4536', r: '#ff5a44', p: '#6b4a30', M: '#e9f0ff', m: '#aab4c8' };
/** A skeleton guard leaning on a spear (front view). */
export function makeGuard() {
  return Pix.fromRows([
    '........M',
    '........m',
    '..kkkk..p',
    '.kwhhwk.p',
    '.kwrwrk.p',
    '.kwwwwk.p',
    '..kwdw..p',
    '..sdwds.p',
    '.swdsdws.',
    '..sdwds.p',
    '..swdws.p',
    '...sws..p',
    '..sw.ws.p',
    '..sw.ws.p',
    '.kkk.kkk.',
  ], FIG).outline(OUT);
}
const HERO = { k: '#241a2c', b: '#2f4a66', B: '#4a6a8c', t: '#3fc9b0', T: '#8ff5e0', n: '#6b4a30', g: '#c9c3b8', l: '#1a1626' };
/** The Trialist seen from behind, looking up at the Tower. frame 0/1 = scarf fluttering. */
export function makeHeroBack(frame = 0) {
  const p = Pix.fromRows([
    '..kkkk....',
    '.kbBBbk...',
    '.kbBbbk...',
    '.kbbbbk...',
    '..kttk....',
    '.kbbtbbk.g',
    'kbBbbbbbkg',
    'kbbbbbbbk.',
    'kbbnnnbbk.',
    '.kbbbbbk..',
    '.kbbkbbk..',
    '..kl.lk...',
    '..kk.kk...',
  ], HERO);
  // scarf tail streaming to the right, two flutter poses
  const tail = frame % 2 ? [[4, 4], [5, 4], [6, 3], [7, 3]] : [[4, 4], [5, 5], [6, 5], [7, 6]];
  tail.forEach(([x, y], i) => p.set(x, y, i === tail.length - 1 ? '#8ff5e0' : '#3fc9b0'));
  return p.outline(OUT);
}
export function makeBat(frame) {
  return Pix.fromRows(frame % 2 ? ['k...k', 'kk.kk', '.kkk.'] : ['..k..', '.kkk.', 'k...k'], { k: '#0b0812' });
}
export const px1 = () => new Pix(1, 1).set(0, 0, '#ffffff');
export const starBig = () => Pix.fromRows(['.a.', 'aWa', '.a.'], { W: '#ffffff', a: '#ffffff66' });
export const shadowBlob = (w) => new Pix(w, 2).fillRect(1, 0, w - 2, 1, '#00000066').fillRect(0, 1, w, 1, '#00000044');

// ------------------------------------------------------------------ storm: heavy clouds, lightning, crows
/** A big, dark, puffy storm cloud: overlapping domes with a flat, ragged underside. `lit` draws the same silhouette in
 *  storm-flash colours, to fade in over the dark one when lightning strikes. */
export function makeStormCloud(w, h, seed, lit = false) {
  const p = new Pix(w, h), base = h - 5;
  const C = lit ? { rim: '#f4f7ff', hi: '#c4d0f6', mid: '#8f9eda', low: '#6672b6', base: '#4e5a9c' } : { rim: '#5a4e80', hi: '#43396a', mid: '#2b2246', low: '#1d1734', base: '#140f26' };
  const mask = new Uint8Array(w * h);
  const puffs = [];
  const n = Math.max(5, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, mid = 1 - Math.abs(u - 0.5) * 2;                    // taller in the middle
    const r = Math.max(3, Math.round((3 + noise(i, 1, seed) * 4 + mid * (h - 9) * 0.45)));
    puffs.push({ x: Math.round(w * (0.06 + 0.88 * u)), y: Math.round(base - r * (0.45 + noise(i, 2, seed) * 0.35)), r });
  }
  for (let y = 0; y <= base; y++) for (let x = 0; x < w; x++) {
    for (const q of puffs) if ((x - q.x) ** 2 + ((y - q.y) * 1.15) ** 2 <= q.r * q.r) { mask[y * w + x] = 1; break; }
  }
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    let up = 0; while (up < 4 && on(x, y - 1 - up)) up++;
    let lf = 0; while (lf < 2 && on(x - 1 - lf, y)) lf++;
    const below = on(x, y + 1) ? 0 : 1;
    const dn = y > base - 2;
    p.set(x, y, dn ? C.base : up === 0 || (lf === 0 && up < 2) ? C.rim : up < 2 || (up < 4 && bayer(x, y) < 0.45) ? C.hi : below ? C.low : y > base - 5 ? C.low : C.mid);
  }
  for (let x = 2; x < w - 2; x++) for (let k = 1; k <= 3; k++) if (on(x, base) && bayer(x, base + k) < (0.55 / k) * (0.5 + noise(Math.floor(x / 2), k, seed))) p.set(x, Math.min(h - 1, base + k), C.low);
  return p;
}

/** A jagged lightning bolt (hangs from the top row). Returns the picture; `ox` is where the strike's top sits horizontally. */
export function makeBolt(len, seed) {
  const w = Math.max(14, Math.round(len * 0.7)), p = new Pix(w, len + 2), ox = Math.round(w * 0.4);
  const rnd = (k) => noise(k, seed, 9);
  const draw = (x0, y0, steps, drift, depth) => {
    let x = x0, y = y0, d = drift;
    for (let i = 0; i < steps && y < len; i++) {
      const nx = x + d + Math.round((rnd(i * 7 + depth * 31) - 0.5) * 3), ny = y + 2 + Math.floor(rnd(i * 5 + depth * 17) * 3);
      for (let yy = y; yy <= ny; yy++) {
        const xx = Math.round(x + (nx - x) * (yy - y) / Math.max(1, ny - y));
        p.set(xx - 1, yy, '#8aa2ffaa'); p.set(xx + 1, yy, '#8aa2ffaa');
      }
      x = nx; y = ny;
      if (depth === 0 && i > 3 && i % 6 === 3) draw(x, y, Math.round(steps * 0.35), d > 0 ? -1 : 1, depth + 1);
    }
  };
  draw(ox, 0, Math.round(len / 3.2), 0, 0);
  // second pass: white core over the halo
  let x = ox, y = 0, i = 0;
  while (y < len && i < len) { const nx = x + Math.round((rnd(i * 7) - 0.5) * 3), ny = y + 2 + Math.floor(rnd(i * 5) * 3); p.line(x, y, nx, ny, '#ffffff'); x = nx; y = ny; i++; }
  return { pix: p, ox };
}

/** A crow in flight, seen from the side/below: 0 = wings up, 1 = wings down. */
export function makeCrow(frame) {
  return Pix.fromRows(frame % 2 ? ['..kkk..', '.kkkkk.', 'kk.k.kk', 'k.....k'] : ['k.....k', 'kk...kk', '.kkkkk.', '..kkk..'], { k: '#1d1533' });
}

// ---- the march on the far ridge
const MARCH = { k: '#0f0b18', w: '#d8d0bc', o: '#ffb04a' };
/** A tiny skeleton soldier in silhouette. kind 0 = spear, 1 = lantern bearer, 2 = bare; frame = walking pose. */
export function makeMarcher(frame, kind) {
  const legs = [frame % 2 ? '..k...' : '.k.k..', '.k.k..'];
  const rows = kind === 2
    ? ['......', '......', '.ww...', '.ww...', '.kkk..', '.kkk..', '.kkk..', ...legs]
    : [kind === 1 ? '....o.' : '....k.', '....k.', '.ww.k.', '.ww.k.', '.kkkk.', '.kkk..', '.kkk..', ...legs];
  return Pix.fromRows(rows, MARCH);
}
/** A broken watchtower on the far ridge with one lit window. */
export function makeRuin() {
  return Pix.fromRows([
    '..k.kk..k.......',
    '..kkkkkkkk......',
    '..kkkkkkkk..k...',
    '..kkkkkkkk.kk...',
    '..kkkwkkkk.kk...',
    '..kkkkkkkkkkk...',
    '..kkkkkkkkkkkk..',
    '..kkkkwkkkkkkk..',
    '..kkkkkkkkkkkkk.',
    '.kkkkkkkkkkkkkk.',
    '.kkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkkk',
  ], { k: '#150f24', w: '#ff9a3a' });
}
/** A gravestone / cross / broken pillar of height h (virtual px), lit from the upper left. */
export function makeGrave(h, kind) {
  const w = Math.max(3, Math.round(h * (kind === 1 ? 0.8 : 0.66))), p = new Pix(w, h);
  const L = '#7a6aa2', M = '#4d4068', D = '#2c2243', V = '#2f5a50';
  if (kind === 1) {                                           // cross
    const t = Math.max(1, Math.round(h / 6)), cx = Math.floor((w - t) / 2), by = Math.max(1, Math.round(h * 0.28));
    p.fillRect(cx, 0, t, h, M); p.fillRect(0, by, w, t, M);
    p.fillRect(cx, 0, 1, h, L); p.fillRect(0, by, w, 1, L); p.fillRect(cx + t - 1, by + 1, 1, h - by - 1, D);
  } else {
    for (let y = 0; y < h; y++) {
      const inset = kind === 0 && y < 2 ? (y === 0 ? 1 : 0) : kind === 2 && y < 2 ? (y === 0 ? 1 : 0) + (y % 2) : 0;
      for (let x = inset; x < w - inset; x++) p.set(x, y, x === inset ? L : x >= w - 1 - inset ? D : M);
    }
    if (kind === 0 && h >= 8) { p.fillRect(Math.floor(w / 2), 2, 1, 3, D); p.fillRect(Math.floor(w / 2) - 1, 3, 3, 1, D); }   // a tiny carved cross
    if (kind === 2) for (let x = 0; x < w; x++) if (x % 2 === 0) p.set(x, 0, null);               // jagged, broken top
  }
  for (let x = 0; x < w; x++) if (bayer(x, h) < 0.4) p.set(x, h - 1, V);                         // moss at the foot
  return new Pix(w + 2, h + 2).blit(p, 1, 1).outline(OUT);
}
