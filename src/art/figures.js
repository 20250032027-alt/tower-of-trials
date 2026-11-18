// The Trialist (player), the skeleton and every held weapon.
// Everything faces RIGHT; the game rotates it toward the aim direction.
//
// The body is built in layers so hands can really hold things:
//   body (cape + shoulders)  <  scarf (tinted with your rank colour)  <  sleeves  <  hood  <  weapon  <  gloves
// Sleeves and gloves are drawn at runtime (src/game/rig.js) from the shoulders to the grip points listed in HANDS.

import { Pix } from './pixel.js';

const OUT = '#14101f';

// ------------------------------------------------------------------ the Trialist
// A hooded climber: slate cloak, teal hood, bronze pauldrons, a satchel and a scarf whose colour is your rank.
const CLOAK = { base: '#2c4258', hi: '#46647e', lo: '#1a2a3b' };
const HOOD = { base: '#3f7280', hi: '#68a3ad', lo: '#264a58' };
const BRONZE = { base: '#b98a3e', hi: '#e6c06a', lo: '#7a5a22' };

export function playerBody() {
  const p = new Pix(20, 20);
  // cape falling behind the shoulders (left), ragged hem
  p.shaded(6.6, 10, 5.2, 6.4, CLOAK.base, CLOAK.hi, CLOAK.lo);
  for (const y of [5, 7, 9, 11, 13, 15]) p.set(1, y, null);
  p.set(2, 5, null); p.set(2, 15, null);
  p.line(3, 8, 9, 8, CLOAK.lo); p.line(3, 12, 9, 12, CLOAK.lo); // folds
  // satchel on the hip
  p.fillRect(3, 4, 4, 3, '#6b4a30'); p.fillRect(3, 4, 4, 1, '#8a6240'); p.set(5, 5, BRONZE.hi);
  p.set(3, 6, '#4a3220'); p.set(6, 6, '#4a3220'); // stitching on the flap
  p.line(7, 5, 12, 12, '#6b4a30'); p.line(7, 4, 12, 11, '#8a6240'); p.set(9, 8, BRONZE.hi); // satchel strap across the chest with a buckle
  p.set(8, 6, '#4a3220'); p.set(10, 9, '#4a3220');
  // shoulders: wide across, short front to back
  p.shaded(10.4, 10, 3.9, 7.5, CLOAK.base, CLOAK.hi, CLOAK.lo);
  // bronze pauldrons (the sleeves start here)
  for (const cy of [4.0, 16.0]) {
    p.ellipse(10.8, cy, 2.9, 1.9, (nx, ny) => (nx + ny < -0.35 ? BRONZE.hi : nx + ny > 0.55 ? BRONZE.lo : BRONZE.base));
  }
  p.outline(OUT);
  return p;
}

export function playerHood() {
  const p = new Pix(20, 20);
  // back peak of the hood
  p.fillRect(5, 9, 2, 3, HOOD.base); p.set(4, 10, HOOD.lo); p.set(5, 9, HOOD.hi); p.set(6, 9, HOOD.hi);
  p.set(4, 11, BRONZE.base); p.set(5, 11, BRONZE.hi); // a little bronze tie at the peak
  p.ellipse(10.6, 10, 4.1, 4.2, (nx, ny) => {
    if (nx > 0.3) { // the opening: deep shadow with a little face in it
      if (nx > 0.62 && Math.abs(ny) < 0.3) return '#e9bd8f';
      if (nx > 0.5 && Math.abs(ny) < 0.5) return '#7a4c34';
      return '#120c1e';
    }
    if (nx + ny < -0.5) return HOOD.hi;
    if (nx + ny > 0.6) return HOOD.lo;
    return HOOD.base;
  });
  p.outline(OUT);
  return p;
}

// grey on purpose: it is tinted with the rank colour at runtime
export function playerScarf() {
  const p = new Pix(20, 20);
  // collar around the neck (the hood sits on top of it)
  p.ellipse(9.8, 10, 5.4, 5.8, (nx, ny) => (nx + ny < -0.5 ? '#ffffff' : nx + ny > 0.5 ? '#8c8c8c' : '#d2d2d2'));
  // the knot and the long tail
  p.fillRect(4, 10, 3, 3, '#d2d2d2'); p.set(4, 10, '#ffffff'); p.set(5, 10, '#ffffff');
  p.line(4, 11, 0, 13, '#d2d2d2'); p.line(4, 12, 0, 14, '#a4a4a4'); p.line(4, 10, 0, 12, '#ffffff');
  p.fillRect(0, 12, 2, 3, '#d2d2d2'); p.set(0, 14, '#8c8c8c'); p.set(1, 14, '#8c8c8c');
  p.outline(OUT);
  return p;
}

// ------------------------------------------------------------------ skeleton
export function skeletonBody() {
  const p = new Pix(20, 20);
  // rusty shoulder scraps
  p.ellipse(9, 4.3, 2.3, 1.6, '#7a5a3a');
  p.ellipse(9, 15.7, 2.3, 1.6, '#5e4429');
  // ribcage / shoulders (darker so the skull pops)
  p.shaded(9.5, 10, 4.2, 7.4, '#8f8870', '#b8b19a', '#5d5744');
  for (let x = 6; x <= 11; x += 2) p.line(x, 5, x, 15, '#4a4536'); // ribs
  p.line(3, 10, 11, 10, '#3a3628'); // spine
  p.ellipse(8.5, 4.4, 2.4, 1.5, (nx, ny) => (nx + ny < -0.3 ? '#9a7a52' : '#7a5a3a'));
  p.ellipse(8.5, 15.6, 2.4, 1.5, (nx, ny) => (nx + ny < -0.3 ? '#9a7a52' : '#7a5a3a'));
  // skull with dark rim
  p.ellipse(10.5, 10, 5.3, 5.3, '#241a2c');
  p.ellipse(10.5, 10, 4.5, 4.5, (nx, ny) => {
    if (Math.abs(ny) < 0.1 && nx < 0.3) return '#b9b19a'; // suture
    return nx + ny * 0.3 < -0.5 ? '#fbf7ea' : nx > 0.5 ? '#d8d1ba' : '#ece6d2';
  });
  // jaw / teeth poking forward
  p.fillRect(14, 8, 2, 5, '#ece6d2');
  p.set(15, 9, '#6a6250'); p.set(15, 11, '#6a6250');
  // glowing sockets
  p.fillRect(12, 6, 3, 3, '#241a2c');
  p.fillRect(12, 12, 3, 3, '#241a2c');
  p.fillRect(13, 7, 2, 1, '#ff5a44'); p.fillRect(13, 13, 2, 1, '#ff5a44');
  p.set(8, 8, '#b9b19a'); p.set(9, 7, '#b9b19a'); p.set(9, 6, '#8f8870'); // a crack across the skull
  p.set(14, 7, '#ffd0a0'); p.set(14, 13, '#ffd0a0');
  p.outline(OUT);
  return p;
}

// ------------------------------------------------------------------ weapons
// All drawn pointing right with the grip on the left. Each has a long enough grip for two hands (see HANDS).
const LEATHER = '#6b4a30', LEATHER_HI = '#8a6240', LEATHER_LO = '#4a3220';

export function sword() {
  const p = new Pix(28, 9);
  p.fillRect(0, 3, 6, 3, LEATHER); p.fillRect(0, 3, 6, 1, LEATHER_HI);
  p.set(2, 4, LEATHER_LO); p.set(4, 4, LEATHER_LO); p.set(2, 5, LEATHER_LO); p.set(4, 5, LEATHER_LO);
  p.fillRect(0, 3, 1, 3, BRONZE.base); p.set(0, 3, BRONZE.hi); // pommel
  p.fillRect(6, 0, 2, 9, BRONZE.base); p.set(6, 0, BRONZE.hi); p.set(6, 8, BRONZE.hi); p.set(7, 0, BRONZE.lo); p.set(7, 8, BRONZE.lo);
  p.fillRect(8, 3, 17, 3, '#aab4c8'); p.fillRect(8, 4, 17, 1, '#e8eefc'); p.fillRect(8, 5, 17, 1, '#8a96ae');
  p.set(25, 4, '#e8eefc'); p.set(25, 3, '#aab4c8'); p.set(25, 5, '#8a96ae'); p.set(26, 4, '#e8eefc');
  p.fillRect(8, 3, 17, 1, '#c7d0e4'); p.fillRect(10, 4, 10, 1, '#cfd8ea'); // fuller: a groove down the middle
  p.set(8, 4, '#5f6a82'); p.set(9, 4, '#7f8ba3'); // ricasso
  p.set(6, 4, '#6fb4ff'); p.set(0, 4, '#c0584a'); // guard gem and pommel stone
  p.outline(OUT);
  return p;
}

export function claymore() {
  const p = new Pix(38, 13);
  p.fillRect(0, 5, 8, 3, LEATHER); p.fillRect(0, 5, 8, 1, LEATHER_HI);
  for (const x of [2, 4, 6]) { p.set(x, 6, LEATHER_LO); p.set(x, 7, LEATHER_LO); }
  p.fillRect(0, 5, 1, 3, BRONZE.base); p.set(0, 5, BRONZE.hi);
  p.fillRect(8, 1, 2, 11, BRONZE.base); p.set(8, 1, BRONZE.hi); p.set(8, 11, BRONZE.hi); p.fillRect(9, 2, 1, 9, BRONZE.lo);
  p.fillRect(10, 4, 24, 5, '#9aa6bd'); p.fillRect(10, 6, 24, 1, '#e8eefc'); p.fillRect(10, 4, 24, 1, '#c7d0e4'); p.fillRect(10, 8, 24, 1, '#7a869e');
  p.fillRect(34, 5, 2, 3, '#aab4c8'); p.set(36, 6, '#e8eefc'); p.set(35, 6, '#e8eefc');
  p.fillRect(12, 6, 18, 1, '#c7d0e4'); p.fillRect(11, 5, 3, 1, '#7a869e'); // a deep fuller and the ricasso step
  p.set(8, 6, '#6fb4ff'); p.set(0, 6, '#c0584a'); p.set(9, 3, '#7a5a22'); p.set(9, 9, '#7a5a22'); // guard gem, pommel stone, rivets
  p.outline(OUT);
  return p;
}

export function spear() {
  const p = new Pix(32, 9);
  p.fillRect(0, 3, 24, 2, '#8a5a35'); p.fillRect(0, 3, 24, 1, '#a6713f');
  p.fillRect(4, 3, 8, 2, LEATHER); p.fillRect(4, 3, 8, 1, LEATHER_HI); // wrapped grip
  for (const x of [5, 7, 9, 11]) p.set(x, 4, LEATHER_LO);
  p.fillRect(13, 2, 1, 4, BRONZE.base); p.fillRect(21, 2, 2, 4, BRONZE.base); // bindings
  p.fillRect(22, 2, 2, 1, '#c0584a'); p.fillRect(22, 5, 2, 1, '#c0584a'); p.set(23, 1, '#8a2a24'); p.set(23, 6, '#8a2a24'); // red tassel
  p.ellipse(27, 4, 4.2, 2.4, (nx) => (nx > 0.2 ? '#e8eefc' : '#aab4c8')); // leaf head
  p.line(24, 4, 29, 4, '#7f8ba3'); // ridge down the head
  p.set(30, 4, '#e8eefc'); p.set(31, 4, '#aab4c8');
  p.outline(OUT);
  return p;
}

// no string baked in: it is drawn live so the drawing hand can pull it back
export function bow() {
  const p = new Pix(12, 26);
  const pts = [[3, 1], [6, 3], [8, 6], [9, 10], [9, 13], [9, 16], [8, 19], [6, 23], [3, 25]];
  for (let i = 0; i < pts.length - 1; i++) {
    p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#8a5a35');
    p.line(pts[i][0] - 1, pts[i][1], pts[i + 1][0] - 1, pts[i + 1][1], '#a6713f');
  }
  p.fillRect(8, 10, 2, 7, LEATHER); p.fillRect(8, 10, 1, 7, LEATHER_HI); // grip wrap
  p.set(8, 12, LEATHER_LO); p.set(8, 14, LEATHER_LO);
  p.set(9, 9, BRONZE.hi); p.set(9, 17, BRONZE.hi); // bronze collars above and below the grip
  p.set(7, 5, '#6b4a30'); p.set(7, 21, '#6b4a30'); // limb wraps
  p.set(3, 0, BRONZE.base); p.set(3, 26 - 1, BRONZE.base); // nocks
  p.outline(OUT);
  return p;
}

// string and bolt are drawn live (the string snaps forward when it fires, then is cranked back and a new bolt slides in)
export function crossbow() {
  const p = new Pix(24, 17);
  p.fillRect(0, 7, 18, 3, '#7a4a2a'); p.fillRect(0, 7, 18, 1, '#a6713f'); p.fillRect(0, 9, 18, 1, '#5a3a22'); // stock
  p.fillRect(0, 7, 1, 3, BRONZE.base);
  p.fillRect(2, 7, 5, 3, LEATHER); p.set(3, 8, LEATHER_LO); p.set(5, 8, LEATHER_LO); // grip wrap
  p.fillRect(9, 8, 13, 1, '#3a2616'); // the rail the bolt slides on
  p.fillRect(12, 6, 3, 5, BRONZE.base); p.set(12, 6, BRONZE.hi); p.set(14, 10, BRONZE.lo); // latch plate
  p.fillRect(14, 1, 3, 15, '#5a3a22'); p.fillRect(14, 1, 1, 15, '#7a4a2a'); // prod
  p.fillRect(14, 1, 3, 1, BRONZE.base); p.fillRect(14, 15, 3, 1, BRONZE.base); // limb tips
  p.fillRect(17, 5, 2, 7, BRONZE.base); p.set(17, 5, BRONZE.hi); p.set(18, 11, BRONZE.lo); // stirrup
  p.outline(OUT);
  return p;
}

export function pistol() {
  const p = new Pix(18, 9);
  p.fillRect(5, 3, 12, 3, '#59607a'); p.fillRect(5, 3, 12, 1, '#8b93b0'); p.fillRect(5, 5, 12, 1, '#454b62');
  p.fillRect(1, 2, 5, 5, '#6a3a22'); p.fillRect(1, 2, 5, 1, '#8a5a35'); p.set(3, 4, LEATHER_LO); p.set(3, 5, LEATHER_LO);
  p.fillRect(1, 2, 1, 5, BRONZE.base);
  p.set(16, 4, '#14101f'); p.set(8, 3, '#c9d0e4'); p.set(9, 3, '#c9d0e4'); // sight + ejection port
  p.fillRect(11, 3, 1, 3, BRONZE.base); p.fillRect(14, 3, 1, 3, BRONZE.base); p.set(11, 3, BRONZE.hi); p.set(14, 3, BRONZE.hi); // brass bands round the barrel
  p.set(6, 6, '#e6c06a'); p.set(5, 6, BRONZE.base); // trigger guard
  p.outline(OUT);
  return p;
}

// M4 carbine: polymer stock, rail with a red-dot sight, curved magazine, vented handguard
export function m4() {
  const p = new Pix(34, 11);
  const POLY = '#2c3140', POLY_HI = '#454c62', METAL = '#59607a', METAL_HI = '#8b93b0', METAL_LO = '#3b4254';
  p.fillRect(0, 3, 7, 5, POLY); p.fillRect(0, 3, 7, 1, POLY_HI); p.fillRect(0, 7, 2, 1, METAL_LO); // stock
  p.fillRect(6, 3, 15, 4, METAL_LO); p.fillRect(6, 3, 15, 1, METAL_HI); p.fillRect(6, 6, 15, 1, '#2a3040'); // receiver
  p.fillRect(8, 1, 8, 2, '#1c1f2b'); p.set(13, 1, '#ff5a44'); p.set(13, 2, '#ff8a6a'); p.fillRect(8, 2, 8, 1, METAL_LO); // red-dot sight on the rail
  p.fillRect(10, 7, 3, 4, POLY); p.set(10, 7, POLY_HI); p.set(10, 8, POLY_HI); // pistol grip
  p.fillRect(14, 7, 4, 4, '#1f2330'); p.fillRect(14, 7, 1, 4, POLY_HI); p.set(17, 10, '#14101f'); // magazine
  p.fillRect(21, 3, 8, 4, METAL); p.fillRect(21, 3, 8, 1, METAL_HI); // handguard
  for (const x of [23, 25, 27]) p.fillRect(x, 4, 1, 2, '#2a3040'); // vents
  p.fillRect(29, 4, 5, 2, '#454b62'); p.fillRect(31, 3, 3, 4, '#14101f'); p.set(33, 5, '#6a738f'); // barrel + muzzle brake
  p.set(7, 7, '#e6c06a'); p.set(8, 7, BRONZE.base); // trigger guard
  p.outline(OUT);
  return p;
}

// ------------------------------------------------------------------ blessings
// The four kinds of Mana are blessings of a Constellation. Each has its own colours and a glyph, and the book, the staff,
// the spells and the Trialist's own look all follow it (see BLESS_LOOK).
export const BLESS = {
  none: { main: '#6b3a8a', hi: '#b07cf0', lo: '#3b1466', glow: '#f0c8ff', trim: '#b98a3e', spell: '#9fb4ff' },
  natural: { main: '#2f7a4a', hi: '#6ed48a', lo: '#1b4a2c', glow: '#d6ffe4', trim: '#a6713f', spell: '#6ed48a' },
  divine: { main: '#c9a24a', hi: '#fff2b0', lo: '#7a5a12', glow: '#ffffff', trim: '#fff2b0', spell: '#ffe27a' },
  arcane: { main: '#2f5fb8', hi: '#8fc4ff', lo: '#1d3f8f', glow: '#e0f0ff', trim: '#c9d0e4', spell: '#6fb4ff' },
  extraplanar: { main: '#4a1d7a', hi: '#c27bff', lo: '#240d40', glow: '#f0d8ff', trim: '#8f64f0', spell: '#c27bff' },
};
export const BLESS_TYPES = ['none', 'natural', 'divine', 'arcane', 'extraplanar'];

// a 5x5 glyph centred on (cx, cy): sprout / cross / rune diamond / eye
function glyph(p, type, cx, cy, c, glow) {
  const dots = {
    natural: [[0, 0], [0, 1], [0, 2], [-1, -1], [1, -1], [-2, -2], [2, -2], [0, -2]],
    divine: [[0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, -1], [1, -1], [-2, -2], [2, -2], [-2, 2], [2, 2]],
    arcane: [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]],
    extraplanar: [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 1], [0, 1], [1, 1]],
    none: [[0, -1], [-1, 0], [1, 0], [0, 1]],
  }[type];
  for (const [dx, dy] of dots) p.set(cx + dx, cy + dy, c);
  p.set(cx, cy, glow);
}

/** The spell book, open, pages fluttering (frame 0 flat, 1 right page lifting, 2 left page lifting). */
export function book(type = 'none', frame = 0) {
  const B = BLESS[type] || BLESS.none;
  const p = new Pix(14, 16);
  p.fillRect(0, 1, 14, 14, B.main); // cover
  p.fillRect(0, 1, 14, 1, B.hi); p.fillRect(0, 14, 14, 1, B.lo); p.fillRect(13, 1, 1, 14, B.lo); // cover edge light
  p.fillRect(1, 2, 12, 12, '#f1e8cf'); // pages
  p.fillRect(1, 12, 12, 2, '#d9ceb0'); // page stack thickness
  p.line(7, 2, 7, 13, '#b9ac86'); // spine crease
  for (let y = 4; y < 13; y += 2) p.line(2, y, 6, y, '#9a8e68');
  glyph(p, type, 10, 8, B.main === BLESS.none.main && type === 'none' ? '#7a5aa0' : B.main, B.hi); // the page's illumination
  if (type !== 'none') { p.set(10, 5, B.hi); p.set(10, 11, B.hi); } // little sparks above and below the glyph
  p.fillRect(0, 7, 2, 2, B.trim); p.set(0, 7, '#ffffff'); // clasp
  if (frame === 1) { // right page rises
    p.fillRect(8, 2, 5, 2, B.main); p.fillRect(8, 3, 5, 1, '#fff7de'); p.fillRect(12, 4, 1, 8, '#b9ac86');
  } else if (frame === 2) { // left page rises
    p.fillRect(1, 2, 5, 2, B.main); p.fillRect(1, 3, 5, 1, '#fff7de'); p.fillRect(1, 4, 1, 8, '#b9ac86');
  }
  p.outline(OUT);
  return p;
}

/** The staff; the head follows the blessing. 34x10, grip left. */
export function staff(type = 'none') {
  const B = BLESS[type] || BLESS.none;
  const p = new Pix(34, 10);
  p.fillRect(0, 4, 26, 2, '#7a4a2a'); p.fillRect(0, 4, 26, 1, '#a6713f');
  p.fillRect(4, 4, 12, 2, LEATHER); p.fillRect(4, 4, 12, 1, LEATHER_HI);
  for (const x of [6, 8, 10, 12, 14]) p.set(x, 5, LEATHER_LO);
  p.fillRect(17, 3, 1, 4, BRONZE.base); p.fillRect(2, 3, 1, 4, BRONZE.base);
  const orb = (cx, cy, r, c0, c1, c2) => p.ellipse(cx, cy, r, r, (nx, ny) => (nx + ny < -0.4 ? c0 : nx + ny > 0.6 ? c2 : c1));
  if (type === 'natural') {
    for (let x = 18; x < 25; x += 2) { p.set(x, 3, B.main); p.set(x + 1, 6, B.hi); } // vine wrapped round the shaft
    p.fillRect(23, 3, 5, 1, B.main); p.fillRect(23, 6, 5, 1, B.main); p.set(27, 2, B.hi); p.set(27, 7, B.hi); // two leaf prongs
    p.fillRect(26, 1, 4, 1, B.lo); p.fillRect(26, 8, 4, 1, B.lo); p.fillRect(28, 2, 2, 1, B.hi); p.fillRect(28, 7, 2, 1, B.hi);
    orb(29.5, 5, 3.4, '#e4ffe9', '#6ed48a', '#2f7a4a');
  } else if (type === 'divine') {
    p.fillRect(23, 3, 3, 4, B.main); p.fillRect(23, 3, 3, 1, B.hi);
    p.ellipse(29, 5, 4.6, 4.6, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.72 ? (nx + ny < -0.3 ? '#fff7c8' : '#d8a93a') : null; }); // golden halo
    orb(29, 5, 2.2, '#ffffff', '#fff2b0', '#e0b84a');
    p.set(25, 1, '#fff7c8'); p.set(25, 8, '#fff7c8'); p.set(24, 0, '#fff7c8'); p.set(24, 9, '#fff7c8'); // small wings
  } else if (type === 'arcane') {
    for (const x of [19, 21, 23]) p.fillRect(x, 3, 1, 4, B.hi); // rune bands
    p.fillRect(23, 3, 3, 4, B.lo); p.fillRect(23, 3, 3, 1, B.hi);
    // crystal: a tall diamond
    for (let dx = -4; dx <= 4; dx++) { const h = 4 - Math.abs(dx); for (let dy = -h; dy <= h; dy++) p.set(30 + dx, 5 + dy, dx + dy < -1 ? '#e0f0ff' : dx + dy > 2 ? B.lo : B.hi); }
    p.set(27, 1, '#e0f0ff'); p.set(27, 8, '#e0f0ff'); p.set(33, 1, B.hi); p.set(33, 8, B.hi); // loose shards
  } else if (type === 'extraplanar') {
    p.fillRect(23, 2, 4, 1, B.lo); p.fillRect(23, 7, 4, 1, B.lo); p.fillRect(26, 1, 3, 1, B.main); p.fillRect(26, 8, 3, 1, B.main); // curled claws
    p.ellipse(29.5, 5, 4.2, 4.2, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.78 ? (nx + ny < -0.2 ? '#f0d8ff' : '#8f64f0') : null; }); // ring around the void
    p.ellipse(29.5, 5, 2.6, 2.6, '#12061f'); p.set(29, 4, '#c27bff'); p.set(30, 5, '#8f64f0');
    p.set(33, 1, '#f0d8ff'); p.set(24, 8, '#c27bff');
  } else {
    p.fillRect(25, 3, 2, 5, BRONZE.base);
    orb(29.5, 5, 3.6, '#e2ccff', '#b07cf0', '#7a3fc0');
  }
  if (type !== 'none' && type !== 'natural' && type !== 'arcane') p.fillRect(25, 3, 1, 4, BRONZE.base);
  p.outline(OUT);
  return p;
}

/** What the blessing adds to the Trialist's look, drawn over the hood (20x20, same frame as the hood). */
export function blessTrim(type) {
  const B = BLESS[type];
  const p = new Pix(20, 20);
  if (!B || type === 'none') return p;
  const ring = (r, steps, c, c2, skip = 0) => { // dots on a circle round the hood
    for (let i = 0; i < steps; i++) {
      if (skip && i % skip === 0) continue;
      const a = (i / steps) * Math.PI * 2;
      p.set(Math.round(10.6 + Math.cos(a) * r), Math.round(10 + Math.sin(a) * r), i % 2 ? c : c2);
    }
  };
  if (type === 'natural') { // a sprig and two leaves tucked into the hood peak
    p.set(4, 10, '#2f7a4a'); p.set(3, 9, '#6ed48a'); p.set(3, 11, '#6ed48a'); p.set(2, 8, '#2f7a4a'); p.set(2, 12, '#2f7a4a'); p.set(3, 10, '#d6ffe4');
    p.set(9, 5, '#6ed48a'); p.set(10, 4, '#2f7a4a'); p.set(9, 15, '#6ed48a'); p.set(10, 16, '#2f7a4a'); // leaves over the shoulders
  } else if (type === 'divine') { // a thin halo of gold light round the head
    ring(6.1, 20, '#fff2b0', '#e0b84a', 4);
    p.set(5, 10, '#ffffff'); p.set(4, 10, '#fff2b0'); // a gold clasp at the peak
  } else if (type === 'arcane') { // blue rune marks and a crystal at the peak
    ring(5.7, 12, '#8fc4ff', '#e0f0ff', 3);
    p.set(4, 9, '#8fc4ff'); p.set(4, 10, '#e0f0ff'); p.set(4, 11, '#8fc4ff'); p.set(3, 10, '#2f5fb8');
  } else if (type === 'extraplanar') { // a void gem and drifting violet flecks
    p.set(4, 10, '#c27bff'); p.set(3, 10, '#240d40'); p.set(4, 9, '#8f64f0'); p.set(4, 11, '#8f64f0');
    p.set(8, 4, '#c27bff'); p.set(14, 5, '#8f64f0'); p.set(15, 15, '#c27bff'); p.set(7, 16, '#8f64f0');
  }
  return p;
}

/** A faint circle on the ground under a blessed Trialist. `frame` 0/1 are turned half a step so it ticks round. */
export function sigil(type, frame = 0) {
  const B = BLESS[type];
  const p = new Pix(44, 44);
  if (!B || type === 'none') return p;
  const c = 21.5, R = 19;
  const dot = (a, r, col) => p.set(Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), col);
  const n = { natural: 8, divine: 4, arcane: 6, extraplanar: 5 }[type];
  const off = frame * (Math.PI / n);
  for (let i = 0; i < 72; i++) if (i % 2 === 0) dot((i / 72) * Math.PI * 2, R, B.hi); // dotted ring
  for (let i = 0; i < 48; i++) if (i % 3 === 0) dot((i / 48) * Math.PI * 2, R - 5, B.main);
  for (let k = 0; k < n; k++) {
    const a = off + (k / n) * Math.PI * 2 - Math.PI / 2;
    for (let r = R - 4; r <= R + 1; r++) dot(a, r, k % 2 ? B.hi : B.glow); // spokes between the rings
    if (type === 'divine') for (let r = 3; r < R - 5; r += 2) dot(a, r, B.hi); // rays to the middle
    if (type === 'natural') { dot(a + 0.12, R + 2, B.hi); dot(a - 0.12, R + 2, B.hi); } // leaf ticks
    if (type === 'arcane') { dot(a + 0.2, R - 5, B.glow); dot(a - 0.2, R - 5, B.glow); } // hex corners
    if (type === 'extraplanar') { dot(a, R + 3, B.glow); dot(a, 4 + (k % 2) * 3, B.hi); } // pinpricks
  }
  return p;
}

// Where the hands go, in weapon-image pixels (x right, y down): [rear hand, front hand].
// `grip` is the image x the weapon turns around (its origin), `hold` how far in front of the body centre that sits.
// One-handed weapons list a single hand; the other hand rests at `rest` ([forward, sideways] from the body centre).
// `lat` shifts the weapon sideways towards the working hand.
export const HANDS = {
  w_sword:    { hands: [[2.5, 4.5]], grip: 3, hold: 9.5, lat: 2, rest: [6, -5.5] },
  w_claymore: { hands: [[2.5, 6.5], [5.5, 6.5]], grip: 4, hold: 10 },
  w_spear:    { hands: [[5.5, 4], [10, 4]], grip: 7, hold: 8.5 },
  w_bow:      { hands: [[8.5, 13], [3, 13]], grip: 8.5, hold: 10.5 },
  w_crossbow: { hands: [[3.5, 8.5], [7, 8.5]], grip: 3.5, hold: 8.5 },
  w_pistol:   { hands: [[2.5, 4.5], [5.5, 4.5]], grip: 3, hold: 9.5 },
  w_m4:       { hands: [[11, 7.5], [23, 5.5]], grip: 11, hold: 8, tip: 22 },
  w_book:     { hands: [[3, 2], [3, 14]], grip: 7, hold: 12 },
  w_staff:    { hands: [], grip: 17, hold: 8 }, // floats: turns about its middle, nothing is gripped
};
