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
