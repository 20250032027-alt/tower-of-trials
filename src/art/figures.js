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
  p.outline(OUT);
  return p;
}

export function spear() {
  const p = new Pix(44, 10);
  p.fillRect(0, 4, 32, 2, '#8a5a35'); p.fillRect(0, 4, 32, 1, '#a6713f');
  p.fillRect(5, 4, 11, 2, LEATHER); p.fillRect(5, 4, 11, 1, LEATHER_HI); // wrapped grip
  for (const x of [7, 9, 11, 13]) p.set(x, 5, LEATHER_LO);
  p.fillRect(17, 3, 1, 4, BRONZE.base); p.fillRect(28, 3, 2, 4, BRONZE.base); // bindings
  p.ellipse(36, 5, 5.4, 2.8, (nx) => (nx > 0.2 ? '#e8eefc' : '#aab4c8')); // leaf head
  p.set(40, 4, '#e8eefc'); p.set(41, 5, '#aab4c8'); p.set(42, 5, '#e8eefc');
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
  p.set(3, 0, BRONZE.base); p.set(3, 26 - 1, BRONZE.base); // nocks
  p.outline(OUT);
  return p;
}

export function crossbow() {
  const p = new Pix(24, 17);
  p.fillRect(0, 7, 18, 3, '#7a4a2a'); p.fillRect(0, 7, 18, 1, '#a6713f'); // stock
  p.fillRect(0, 7, 1, 3, BRONZE.base);
  p.fillRect(2, 7, 5, 3, LEATHER); p.set(3, 8, LEATHER_LO); p.set(5, 8, LEATHER_LO); // grip wrap
  p.fillRect(14, 1, 3, 15, '#5a3a22'); p.fillRect(14, 1, 1, 15, '#7a4a2a'); // prod
  p.line(15, 1, 8, 8, '#e8e2cc'); p.line(15, 15, 8, 8, '#e8e2cc'); // string
  p.fillRect(9, 8, 14, 1, '#aab4c8'); // loaded bolt
  p.set(23, 8, '#e8eefc'); p.set(9, 8, '#c0584a');
  p.outline(OUT);
  return p;
}

export function pistol() {
  const p = new Pix(18, 9);
  p.fillRect(5, 3, 12, 3, '#59607a'); p.fillRect(5, 3, 12, 1, '#8b93b0'); p.fillRect(5, 5, 12, 1, '#454b62');
  p.fillRect(1, 2, 5, 5, '#6a3a22'); p.fillRect(1, 2, 5, 1, '#8a5a35'); p.set(3, 4, LEATHER_LO); p.set(3, 5, LEATHER_LO);
  p.fillRect(1, 2, 1, 5, BRONZE.base);
  p.set(16, 4, '#14101f'); p.set(8, 3, '#c9d0e4'); p.set(9, 3, '#c9d0e4'); // sight + ejection port
  p.outline(OUT);
  return p;
}

export function book() {
  const p = new Pix(14, 16);
  p.fillRect(0, 1, 14, 14, '#6b3a8a'); // cover
  p.fillRect(1, 2, 12, 12, '#f1e8cf'); // pages
  p.line(7, 2, 7, 13, '#b9ac86'); // spine crease
  for (let y = 4; y < 13; y += 2) { p.line(2, y, 6, y, '#9a8e68'); p.line(8, y, 12, y, '#9a8e68'); }
  p.fillRect(0, 7, 2, 2, BRONZE.base);
  p.outline(OUT);
  return p;
}

export function staff() {
  const p = new Pix(34, 10);
  p.fillRect(0, 4, 26, 2, '#7a4a2a'); p.fillRect(0, 4, 26, 1, '#a6713f');
  p.fillRect(4, 4, 12, 2, LEATHER); p.fillRect(4, 4, 12, 1, LEATHER_HI);
  for (const x of [6, 8, 10, 12, 14]) p.set(x, 5, LEATHER_LO);
  p.fillRect(17, 3, 1, 4, BRONZE.base); p.fillRect(2, 3, 1, 4, BRONZE.base);
  p.ellipse(29.5, 5, 3.6, 3.6, (nx, ny) => (nx + ny < -0.4 ? '#e2ccff' : nx + ny > 0.6 ? '#7a3fc0' : '#b07cf0'));
  p.fillRect(25, 3, 2, 5, BRONZE.base);
  p.outline(OUT);
  return p;
}

// Where the hands go, in weapon-image pixels (x right, y down): [rear hand, front hand].
// `grip` is the image x the weapon turns around (its origin), `hold` how far in front of the body centre that sits.
// One-handed weapons list a single hand; the other hand rests at `rest` ([forward, sideways] from the body centre).
// `lat` shifts the weapon sideways towards the working hand.
export const HANDS = {
  w_sword:    { hands: [[2.5, 4.5]], grip: 3, hold: 9.5, lat: 2, rest: [6, -5.5] },
  w_claymore: { hands: [[2.5, 6.5], [5.5, 6.5]], grip: 4, hold: 10 },
  w_spear:    { hands: [[7.5, 5], [13, 5]], grip: 10, hold: 8.5 },
  w_bow:      { hands: [[8.5, 13], [3, 13]], grip: 8.5, hold: 10.5 },
  w_crossbow: { hands: [[3.5, 8.5], [7, 8.5]], grip: 3.5, hold: 8.5 },
  w_pistol:   { hands: [[2.5, 4.5], [5.5, 4.5]], grip: 3, hold: 9.5 },
  w_book:     { hands: [[3, 2], [3, 14]], grip: 7, hold: 12 },
  w_staff:    { hands: [[6, 5], [12.5, 5]], grip: 9, hold: 8.5 },
};
