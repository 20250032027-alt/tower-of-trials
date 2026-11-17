// Tilesets (one image per theme). 6 tiles of 16x16 in a row:
//  0,1,2 floor variants   3 wall edge   4 deep wall   5 cracked wall

import { Pix, noise, shade, parseColor } from './pixel.js';

export const THEMES = {
  // warm tower stone laid in long running-bond slabs, bronze inlay and teal rune light
  trial: {
    name: 'Trial Hall', style: 'bond',
    floor: '#54473b', floorHi: '#65564a', grout: '#30271f',
    wall: '#a08a6c', wallHi: '#cbb28e', wallLo: '#6c5845', deep: '#120d0a', accent: '#4fd6c4', trim: '#c9a24a',
    fog: 0x100b08, torch: 0x9fc8ff,
  },
  // rough round cobbles, bone chips and moss
  crypt: {
    name: 'Catacombs', style: 'cobble',
    floor: '#4b4a42', floorHi: '#5d5c51', grout: '#242420',
    wall: '#6b6a58', wallHi: '#908e77', wallLo: '#3e3d33', deep: '#10110f', accent: '#6f9a4a',
    fog: 0x0a0a08,
  },
  // chequered slate with gold inlay
  vault: {
    name: 'Forgotten Vault', style: 'check',
    floor: '#473f55', floorHi: '#574d68', grout: '#2a2434',
    wall: '#6e5f84', wallHi: '#9684b0', wallLo: '#41384f', deep: '#140e1c', accent: '#e0b84a', trim: '#e0b84a',
    fog: 0x0c0912,
  },
  // cracked obsidian with glowing seams
  rift: {
    name: 'Rift', style: 'cobble',
    floor: '#2c2145', floorHi: '#3b2d5c', grout: '#7a2fa8',
    wall: '#55307a', wallHi: '#8a4fc0', wallLo: '#2f1a47', deep: '#0d0716', accent: '#ff4fd0',
    fog: 0x07040e, torch: 0xc060ff,
  },
  // ---- floors 2-10 [PLACEHOLDER palettes] ----------------------------------------------
  ossuary: { name: 'Ossuary', style: 'cobble', floor: '#5a5446', floorHi: '#6e6757', grout: '#2a261e', wall: '#8f8870', wallHi: '#bbb394', wallLo: '#5a5440', deep: '#11100c', accent: '#d8cfa8', fog: 0x0b0a07, torch: 0xffc060 },
  cistern: { name: 'Drowned Cistern', style: 'bond', floor: '#3b4b50', floorHi: '#4a5f65', grout: '#1c2a2e', wall: '#5f7f82', wallHi: '#8fb5b2', wallLo: '#35494c', deep: '#0a1214', accent: '#4fd6c4', trim: '#7fe0d0', fog: 0x070f11, torch: 0x6fe0d0 },
  foundry: { name: 'Rust Foundry', style: 'check', floor: '#4d3a32', floorHi: '#5f483d', grout: '#2a1c17', wall: '#7a4a3a', wallHi: '#b0705a', wallLo: '#47281f', deep: '#140a07', accent: '#ff8a3a', trim: '#d08a4a', fog: 0x0f0806, torch: 0xff8a3a },
  archive: { name: 'Ashen Archive', style: 'bond', floor: '#4a4644', floorHi: '#5c5754', grout: '#262322', wall: '#78726c', wallHi: '#aaa39a', wallLo: '#47423e', deep: '#100e0d', accent: '#c9a24a', trim: '#c9a24a', fog: 0x0c0a09, torch: 0xffb050 },
  frost: { name: 'Frostbound Halls', style: 'check', floor: '#4a5a70', floorHi: '#5d7088', grout: '#26303f', wall: '#8aa4c4', wallHi: '#cfe4ff', wallLo: '#566b88', deep: '#0b1018', accent: '#9fe8ff', fog: 0x080c14, torch: 0x9fe8ff },
  overgrown: { name: 'Overgrown Keep', style: 'cobble', floor: '#3f4a36', floorHi: '#4f5c44', grout: '#1d2418', wall: '#5f7a48', wallHi: '#8fb26a', wallLo: '#344628', deep: '#0b100a', accent: '#c0e060', fog: 0x070b06, torch: 0xc0e060 },
  ember: { name: 'Ember Citadel', style: 'cobble', floor: '#3a2a2a', floorHi: '#4c3636', grout: '#a03a18', wall: '#5a3a3a', wallHi: '#8a5a4a', wallLo: '#2e1c1c', deep: '#0f0707', accent: '#ff6a2a', fog: 0x0d0505, torch: 0xff6a2a },
  starlit: { name: 'Starlit Gallery', style: 'check', floor: '#2f3358', floorHi: '#3f4575', grout: '#181b33', wall: '#4f5a9a', wallHi: '#8a96e0', wallLo: '#2c3262', deep: '#080a18', accent: '#ffe27a', trim: '#cfd8ff', fog: 0x05060f, torch: 0xcfd8ff },
  summit: { name: 'The Summit', style: 'bond', floor: '#6a6a76', floorHi: '#8484a0', grout: '#3a3a48', wall: '#b8b8cc', wallHi: '#f0f0ff', wallLo: '#7a7a92', deep: '#14141c', accent: '#e0b84a', trim: '#e0b84a', fog: 0x0a0a10, torch: 0xffe9a0 },
};


const mix = (a, b, k) => {
  const pa = parseColor(a), pb = parseColor(b);
  return '#' + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * k).toString(16).padStart(2, '0')).join('');
};

// slabs 16 wide laid in running bond (every other row shifted by half), 3 variants
function bondFloor(t, variant, seed) {
  const p = new Pix(16, 16);
  p.fillRect(0, 0, 16, 16, t.floor);
  for (const [y0, jx] of [[0, 15], [8, 7]]) {
    // two slabs per row (the joint is at jx), each with its own tone
    const toneA = (noise(jx, y0, seed + variant * 7) - 0.5) * 14;
    for (let y = y0; y < y0 + 7; y++) {
      for (let x = 0; x < 16; x++) {
        const left = x <= jx ? 0 : 1;
        const tone = left ? -toneA : toneA;
        let c = tone > 3 ? mix(t.floor, t.floorHi, 0.5) : tone < -3 ? mix(t.floor, t.grout, 0.22) : t.floor;
        const n = noise(x, y, seed + variant * 17);
        if (n > 0.93) c = t.floorHi; else if (n < 0.07) c = mix(t.floor, t.grout, 0.3);
        if (y === y0) c = mix(c, '#ffffff', 0.08);       // lit top edge
        if (y === y0 + 6) c = mix(c, t.grout, 0.35);     // shaded bottom edge
        p.set(x, y, c);
      }
    }
    p.line(0, y0 + 7, 15, y0 + 7, t.grout);              // mortar between rows
    p.line(jx, y0, jx, y0 + 6, t.grout);                 // joint inside the row
  }
  if (variant === 1) { // hairline crack
    p.line(3, 2, 6, 5, t.grout); p.line(6, 5, 6, 9, t.grout); p.line(6, 9, 10, 11, t.grout); p.line(6, 9, 4, 13, t.grout);
  }
  if (variant === 2) { // a small rune circle inlaid in the slab
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 3.3 && d < 4.6) p.set(x, y, mix(t.floor, t.accent, 0.3));
      else if (d < 1.2) p.set(x, y, mix(t.floor, t.accent, 0.5));
    }
  }
  return p;
}

// rough cobbles: nearest-seed cells on a wrapping 16x16 so tiles join seamlessly
function cobbleFloor(t, variant, seed) {
  const p = new Pix(16, 16);
  const pts = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    pts.push({ x: (i + 0.5) * 16 / 3 + (noise(i, j, seed + 3) - 0.5) * 3.2, y: (j + 0.5) * 16 / 3 + (noise(i, j, seed + 5) - 0.5) * 3.2, tone: (noise(i, j, seed + 11 + variant * 5) - 0.5) * 16 });
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d1 = 99, d2 = 99, near = null;
    for (const q of pts) {
      for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
        const d = Math.hypot(x + 0.5 - (q.x + ox), y + 0.5 - (q.y + oy));
        if (d < d1) { d2 = d1; d1 = d; near = { q, ox, oy }; } else if (d < d2) d2 = d;
      }
    }
    if (d2 - d1 < 1.25) { p.set(x, y, t.grout); continue; }
    const q = near.q;
    let c = q.tone > 3 ? mix(t.floor, t.floorHi, 0.55) : q.tone < -3 ? mix(t.floor, t.grout, 0.25) : t.floor;
    const lx = x + 0.5 - (q.x + near.ox), ly = y + 0.5 - (q.y + near.oy);
    if (lx + ly < -2.2) c = mix(c, '#ffffff', 0.09);
    else if (lx + ly > 2.6) c = mix(c, '#000000', 0.16);
    const n = noise(x, y, seed + variant * 17);
    if (n > 0.95) c = t.floorHi;
    p.set(x, y, c);
  }
  if (variant === 2) {
    if (t.accent === '#6f9a4a') { // bones + moss
      p.set(4, 5, '#cfc8b0'); p.set(5, 5, '#cfc8b0'); p.set(6, 5, '#9b937c'); p.set(5, 6, '#9b937c');
      p.set(10, 11, '#cfc8b0'); p.set(11, 11, '#cfc8b0'); p.set(10, 12, '#9b937c');
      for (const [x, y] of [[12, 3], [13, 3], [12, 4]]) p.set(x, y, '#4f6b3a');
    } else { // glowing seams
      p.line(2, 12, 6, 8, t.accent); p.line(6, 8, 9, 9, '#a22fa0'); p.line(9, 9, 13, 4, t.accent);
    }
  }
  return p;
}

// slate squares with a thin groove and gold inlay
function checkFloor(t, variant, seed) {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
    let c = dark ? t.floor : t.floorHi;
    const n = noise(x, y, seed + variant * 13);
    if (n > 0.93) c = mix(c, '#ffffff', 0.1); else if (n < 0.06) c = mix(c, '#000000', 0.12);
    if (x % 8 === 7 || y % 8 === 7) c = t.grout;
    p.set(x, y, c);
  }
  if (variant === 1) p.line(3, 3, 7, 6, t.grout);
  if (variant === 2) { // gold inlay diamond
    for (const [x, y] of [[4, 2], [3, 3], [5, 3], [4, 4], [11, 10], [10, 11], [12, 11], [11, 12]]) p.set(x, y, t.accent);
  }
  return p;
}

function floorTile(t, variant, seed) {
  return t.style === 'bond' ? bondFloor(t, variant, seed) : t.style === 'check' ? checkFloor(t, variant, seed) : cobbleFloor(t, variant, seed);
}

function wallEdgeTile(t, seed) {
  const p = new Pix(16, 16);
  p.fillRect(0, 0, 16, 16, t.wall);
  // brick pattern
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (noise(x, y, seed) > 0.9) p.set(x, y, shade(t.wall, 10));
    if (noise(x, y, seed + 9) < 0.06) p.set(x, y, shade(t.wall, -12));
  }
  p.line(0, 0, 15, 0, t.wallHi); p.line(0, 8, 15, 8, t.wallLo);
  p.line(5, 1, 5, 7, t.wallLo); p.line(12, 9, 12, 15, t.wallLo);
  p.line(0, 1, 15, 1, shade(t.wallHi, -25)); p.line(0, 9, 15, 9, shade(t.wallHi, -25));
  p.line(0, 14, 15, 14, t.wallLo); p.line(0, 15, 15, 15, shade(t.deep, 8)); // front lip
  if (t.trim) for (let x = 0; x < 16; x++) if (x % 4 !== 3) { p.set(x, 11, t.trim); p.set(x, 12, mix(t.trim, '#000000', 0.35)); } // inlaid bronze band
  return p;
}

function wallDeepTile(t, seed) {
  const p = new Pix(16, 16);
  p.fillRect(0, 0, 16, 16, t.deep);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (noise(x, y, seed + 4) > 0.93) p.set(x, y, shade(t.deep, 9));
  }
  p.line(0, 8, 15, 8, shade(t.deep, 5)); p.line(5, 0, 5, 7, shade(t.deep, 5)); p.line(12, 9, 12, 15, shade(t.deep, 5));
  return p;
}

function crackTile(t, seed) {
  const p = wallEdgeTile(t, seed);
  p.line(7, 0, 5, 5, '#14101f'); p.line(5, 5, 9, 9, '#14101f'); p.line(9, 9, 6, 15, '#14101f');
  p.line(8, 0, 6, 5, '#f6d878'); p.line(6, 5, 10, 9, '#f6d878');
  p.set(6, 11, '#f6d878');
  return p;
}

export function buildTileset(themeId) {
  const t = THEMES[themeId];
  const seed = themeId.length * 31;
  const sheet = new Pix(16 * 6, 16);
  const tiles = [
    floorTile(t, 0, seed), floorTile(t, 1, seed), floorTile(t, 2, seed),
    wallEdgeTile(t, seed), wallDeepTile(t, seed), crackTile(t, seed),
  ];
  tiles.forEach((tile, i) => sheet.blit(tile, i * 16, 0));
  return sheet;
}
