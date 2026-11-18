// Pixel-art icon set (16x16) for traits, skills, stats and UI, drawn from code.
// Every icon is a few shapes on a small grid; a shading pass gives each material a light top-left rim and a
// dark bottom-right rim, then everything gets the same dark outline. That keeps the whole set cohesive.
import { Pix } from './pixel.js';

const OUT = '#14101f';
// material: [base, light, dark]
export const MAT = {
  steel: ['#9aa6bd', '#e4ecfa', '#5e6a84'],
  iron: ['#707a92', '#aab4c8', '#41485e'],
  gold: ['#e0b04a', '#fff0a0', '#a8742a'],
  red: ['#d4414f', '#ff9a9a', '#8a2030'],
  blue: ['#4f8dff', '#c0e0ff', '#2a4a9a'],
  cyan: ['#4fd6c4', '#c8fff4', '#1f8a86'],
  green: ['#5fc86a', '#c0f5a8', '#2a7a3a'],
  purple: ['#a46bd6', '#e6c4ff', '#5a3a8a'],
  brown: ['#8a6240', '#c49868', '#4a3020'],
  bone: ['#e8dfc8', '#fffaf0', '#a89c80'],
  orange: ['#ff9a3a', '#ffd27a', '#b0501a'],
  white: ['#f3ead8', '#ffffff', '#b0a690'],
  dark: ['#3a3248', '#5a5070', '#1e1a28'],
  skin: ['#e8b890', '#ffdcb8', '#a8704c'],
  meat: ['#c8603a', '#f09a6a', '#8a3a20'],
};
const NAMES = Object.keys(MAT);

class Canvas {
  constructor() {
    this.g = Array.from({ length: 16 }, () => new Array(16).fill(0)); // material index + 1, 0 = empty
    this.flat = {}; // "x,y" -> hex, painted after shading (eyes, glints...)
  }
  put(x, y, m) { if (x >= 0 && x < 16 && y >= 0 && y < 16) this.g[y][x] = m == null ? 0 : NAMES.indexOf(m) + 1; }
  fill(test, m) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (test(x + 0.5, y + 0.5)) this.put(x, y, m); return this; }
  px(x, y, hex) { this.flat[x + ',' + y] = hex; return this; }
  erase(test) { return this.fill(test, null); }
  rect(x, y, w, h, m) { return this.fill((px, py) => px >= x && px < x + w && py >= y && py < y + h, m); }
  disc(cx, cy, r, m) { return this.fill((px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, m); }
  ring(cx, cy, r0, r1, m, gap) { // gap = [a0, a1] radians to leave open
    return this.fill((px, py) => {
      const d = Math.hypot(px - cx, py - cy);
      if (d < r0 || d > r1) return false;
      if (gap) { let a = Math.atan2(py - cy, px - cx); if (a < 0) a += Math.PI * 2; if (a >= gap[0] && a <= gap[1]) return false; }
      return true;
    }, m);
  }
  ellipse(cx, cy, rx, ry, m, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return this.fill((px, py) => { const dx = px - cx, dy = py - cy; const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v <= 1; }, m);
  }
  line(x0, y0, x1, y1, th, m) {
    return this.fill((px, py) => {
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
      let t = ((px - x0) * dx + (py - y0) * dy) / l2; t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)) <= th / 2;
    }, m);
  }
  poly(pts, m) {
    return this.fill((px, py) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, m);
  }
  path(pts, th, m) { for (let i = 0; i < pts.length - 1; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], th, m); return this; }
  heart(cx, cy, s, m) {
    this.disc(cx - 2.6 * s, cy - 1.8 * s, 3.1 * s, m).disc(cx + 2.6 * s, cy - 1.8 * s, 3.1 * s, m);
    return this.poly([[cx - 5.5 * s, cy - 0.6 * s], [cx + 5.5 * s, cy - 0.6 * s], [cx, cy + 5.6 * s]], m);
  }
  star(cx, cy, r, m, pts = 4, inner = 0.4) {
    const p = [];
    for (let i = 0; i < pts * 2; i++) { const a = (Math.PI * i) / pts - Math.PI / 2; const rr = i % 2 ? r * inner : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return this.poly(p, m);
  }

  // shading + outline -> Pix
  toPix() {
    const p = new Pix(16, 16);
    const at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : this.g[y][x]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const m = this.g[y][x];
      if (!m) continue;
      const lit = at(x, y - 1) !== m || at(x - 1, y) !== m;
      const dark = at(x, y + 1) !== m || at(x + 1, y) !== m;
      const mat = MAT[NAMES[m - 1]];
      p.set(x, y, lit && !dark ? mat[1] : dark && !lit ? mat[2] : mat[0]);
    }
    for (const k of Object.keys(this.flat)) { const [x, y] = k.split(',').map(Number); p.set(x, y, this.flat[k]); }
    return p.outline(OUT);
  }
}

const drawn = (fn) => { const c = new Canvas(); fn(c); return c; };
const A = Math.PI / 180;

// ================================================================= the icons
const ART = {
  // ---------------------------------------------------------------- basic / F-rank
  iron_body: (c) => {
    c.poly([[3, 3.4], [5.8, 2], [8, 3.6], [10.2, 2], [13, 3.4], [12.6, 8.6], [11, 11.4], [8, 14.2], [5, 11.4], [3.4, 8.6]], 'steel');
    c.rect(7.2, 4, 1.6, 8.4, 'gold').rect(4.6, 6.6, 6.8, 1.4, 'gold');
    c.px(4, 4, '#ffffff');
  },
  swift_wind: (c) => {
    c.rect(5.6, 3, 3.8, 7, 'brown').rect(5.2, 2.4, 4.6, 1.8, 'bone');
    c.poly([[5.6, 9], [9.4, 9], [9.8, 10.8], [13.6, 11.8], [13.6, 14], [4.6, 14], [4.6, 11]], 'brown');
    c.rect(4.6, 13, 9, 1.2, 'dark');
    c.poly([[5.4, 5.2], [2.8, 3.2], [0.8, 3.6], [2.2, 5.2], [0.4, 6.2], [2.4, 7.2], [1, 8.6], [5.4, 9]], 'white');
  },
  battle_instinct: (c) => {
    c.line(2.6, 2.6, 10.4, 10.4, 1.7, 'steel').line(13.4, 2.6, 5.6, 10.4, 1.7, 'steel');
    c.line(9, 12, 12.6, 8.4, 1.6, 'gold').line(7, 12, 3.4, 8.4, 1.6, 'gold');
    c.line(10.6, 10.6, 13.4, 13.4, 1.7, 'brown').line(5.4, 10.6, 2.6, 13.4, 1.7, 'brown');
  },
  marker: (c) => {
    c.disc(8, 6.4, 4.7, 'red').poly([[3.7, 8], [12.3, 8], [8, 14.6]], 'red');
    c.disc(8, 6.4, 1.9, 'white');
  },
  lightweight: (c) => {
    c.ellipse(8, 8, 6.9, 3.1, 'white', -45 * A);
    c.line(2.6, 13.4, 12.8, 3.2, 0.9, 'bone');
    c.line(4.6, 8.6, 7.2, 11.4, 0.9, 'bone').line(8.2, 5, 10.6, 7.6, 0.9, 'bone');
    c.px(13, 3, '#cfe4ff');
  },
  fast_recovery: (c) => {
    c.heart(8, 6.8, 1, 'red');
    c.rect(7, 4.8, 2, 6, 'white').rect(5, 6.8, 6, 2, 'white');
  },
  quick_learner: (c) => {
    c.poly([[0.8, 5.4], [7.8, 6.2], [7.8, 14.2], [0.8, 13.4]], 'brown').poly([[8.2, 6.2], [15.2, 5.4], [15.2, 13.4], [8.2, 14.2]], 'brown');
    c.poly([[1.6, 4.4], [4.8, 3.4], [7.8, 5], [7.8, 12.6], [4.8, 11.4], [1.6, 12.2]], 'white').poly([[8.2, 5], [11.2, 3.4], [14.4, 4.4], [14.4, 12.2], [11.2, 11.4], [8.2, 12.6]], 'white');
    for (const [x, y] of [[3, 6], [4, 6], [5, 6], [3, 8], [4, 8], [3, 10], [4, 10], [5, 10], [10, 6], [11, 6], [12, 6], [11, 8], [12, 8], [10, 10], [11, 10]]) c.px(x, y, '#8a6240');
    c.star(13.2, 1.8, 2, 'gold', 4, 0.4);
  },
  mana_reserve: (c) => {
    c.disc(8, 10, 4.9, 'blue').rect(6.4, 3.6, 3.2, 4.4, 'steel').rect(6, 2, 4, 1.8, 'brown');
    c.erase((x, y) => y < 7.4 && y > 3.6 && (x < 6.4 || x > 9.6));
    c.rect(4.2, 9, 7.6, 1.2, 'cyan');
    c.px(5, 8, '#ffffff').px(5, 9, '#ffffff');
  },
  regression: (c) => {
    c.ring(8, 8, 4.2, 6.2, 'purple', [195 * A, 255 * A]);
    c.poly([[2.8, 2.4], [7.4, 2.4], [5, 6.2]], 'purple');
    c.rect(7.4, 5, 1.2, 3.6, 'white').rect(7.4, 7.6, 3.2, 1.2, 'white');
  },
  glutton: (c) => {
    c.ellipse(6.6, 6.4, 5.2, 4.2, 'meat', -40 * A);
    c.ellipse(5.2, 4.8, 2.2, 1.2, 'orange', -40 * A);
    c.line(8.8, 8.6, 12.8, 12.6, 1.8, 'bone').disc(12.6, 11.4, 1.5, 'bone').disc(11.4, 12.8, 1.5, 'bone');
  },
  // ---------------------------------------------------------------- E / D rank
  strong_endurance: (c) => {
    c.rect(3.5, 7.2, 9, 1.8, 'iron');
    c.rect(1.6, 4.6, 2.6, 7, 'dark').rect(11.8, 4.6, 2.6, 7, 'dark');
    c.rect(4.2, 5.6, 1.8, 5, 'steel').rect(10, 5.6, 1.8, 5, 'steel');
  },
  focused_mind: (c) => {
    c.rect(5.6, 9.6, 4.8, 4.6, 'bone');
    c.disc(8, 6.6, 2.7, 'orange').poly([[8, 0.8], [5.2, 6.4], [10.8, 6.4]], 'orange');
    c.ellipse(8, 7.6, 1.2, 1.9, 'gold');
    c.px(8, 9, '#14101f').px(8, 8, '#14101f').px(6, 11, '#ffffff');
  },
  iron_will: (c) => {
    c.disc(8, 7.4, 5.4, 'steel').rect(2.6, 7.4, 10.8, 6.2, 'steel');
    c.rect(4.4, 8, 7.2, 1.6, 'dark').rect(7.4, 9.4, 1.4, 4, 'dark');
    c.poly([[8, 0.4], [9.4, 3], [6.6, 3]], 'red');
  },
  focus_shot: (c) => {
    c.ring(9.4, 6.6, 2.7, 4.6, 'red').disc(9.4, 6.6, 1.2, 'red');
    c.line(1.8, 14.2, 8.6, 7.4, 1.2, 'bone');
    c.line(1.4, 11.4, 3.4, 13.4, 1.1, 'white').line(2.6, 10.2, 4.6, 12.2, 1.1, 'white');
    c.px(9, 6, '#ffffff');
  },
  mana_surge: (c) => {
    c.poly([[9.8, 1], [3.6, 9], [7.4, 9], [5.8, 15], [12.6, 6.4], [8.8, 6.4]], 'blue');
    c.px(8, 4, '#ffffff').px(7, 6, '#c0e0ff');
  },
  second_wind: (c) => {
    c.path([[3, 5.4], [10.4, 5.4]], 1.5, 'cyan').path([[5.6, 11.4], [12.4, 11.4]], 1.5, 'cyan');
    c.ring(10.6, 7.6, 2.3, 3.7, 'cyan', [20 * A, 130 * A]);
    c.ring(12, 11.4, 1.4, 2.6, 'cyan', [250 * A, 330 * A]);
    c.path([[2, 8.4], [8.6, 8.4]], 1.5, 'white');
  },
  // ---------------------------------------------------------------- C rank
  bloodlust: (c) => {
    c.disc(8, 9.6, 4.8, 'red').poly([[8, 1.2], [3.5, 9], [12.5, 9]], 'red');
    c.rect(5.2, 8.6, 1.6, 2.4, 'red');
    c.px(5, 10, '#ffc0c0').px(5, 11, '#ffc0c0').px(6, 12, '#ffc0c0');
  },
  keen_senses: (c) => {
    c.ellipse(8, 10.4, 3.7, 3.1, 'green');
    c.disc(3.8, 6.4, 1.7, 'green').disc(6.6, 3.8, 1.8, 'green').disc(9.8, 3.8, 1.8, 'green').disc(12.4, 6.4, 1.7, 'green');
    c.px(6, 9, '#c0f5a8');
  },
  false_predation: (c) => {
    c.ellipse(8, 6.6, 5.6, 5, 'purple').rect(4.8, 10, 6.4, 3.4, 'purple');
    c.ellipse(5.4, 6.4, 1.7, 1.2, 'dark', -20 * A).ellipse(10.6, 6.4, 1.7, 1.2, 'dark', 20 * A);
    c.px(5, 6, '#ff5a8a').px(10, 6, '#ff5a8a');
    c.rect(5.8, 11, 1.2, 2.2, 'bone').rect(9, 11, 1.2, 2.2, 'bone').rect(7.4, 10.6, 1.2, 1.6, 'bone');
  },
  // ---------------------------------------------------------------- B rank
  eagle_eye: (c) => {
    c.ellipse(8, 9, 6.4, 3.6, 'white');
    c.disc(8, 9, 2.8, 'gold');
    c.px(8, 8, '#14101f').px(8, 9, '#14101f').px(7, 9, '#14101f').px(7, 8, '#14101f').px(9, 8, '#ffffff');
    c.poly([[1.4, 5], [14.6, 3.4], [11.4, 7.2], [4.2, 7]], 'orange');
  },
  arcane_affinity: (c) => {
    c.ring(8, 8, 5.2, 6.6, 'purple');
    c.star(8, 8, 4.6, 'purple', 4, 0.32);
    c.disc(8, 8, 1.4, 'white');
  },
  lucky_constellation: (c) => {
    c.path([[3, 12.4], [6.2, 6.4], [10, 9.4], [12.8, 3.6]], 0.9, 'blue');
    for (const [x, y, r] of [[3, 12.4, 1.9], [6.2, 6.4, 2.1], [10, 9.4, 1.8], [12.8, 3.6, 2.3]]) c.star(x, y, r + 0.7, 'gold', 4, 0.4);
    c.px(13, 12, '#fff0a0').px(2, 3, '#fff0a0').px(2, 4, '#fff0a0').px(1, 3, '#fff0a0').px(3, 3, '#fff0a0');
  },
  // ---------------------------------------------------------------- A rank
  blood_fangs: (c) => {
    c.rect(2.4, 2.4, 11.2, 2.2, 'red');
    c.poly([[3.4, 4.4], [7.2, 4.4], [5.2, 11.4]], 'bone').poly([[8.8, 4.4], [12.6, 4.4], [10.8, 11.4]], 'bone');
    c.disc(5.2, 13.2, 1.1, 'red').disc(10.8, 13.4, 1.1, 'red');
    c.rect(4.8, 11.4, 0.8, 1, 'red').rect(10.4, 11.6, 0.8, 1, 'red');
  },
  fake_mana_heart: (c) => {
    c.heart(8, 6.6, 1.05, 'blue');
    c.star(8, 7.6, 3, 'cyan', 4, 0.3);
    c.px(8, 7, '#ffffff').px(5, 4, '#e0f4ff').px(4, 5, '#e0f4ff');
  },
  adaptive_growth: (c) => {
    c.rect(3.4, 12.6, 9.2, 2.2, 'brown');
    c.line(8, 12.8, 8, 6.2, 1.3, 'green');
    c.ellipse(5, 6, 3.2, 1.8, 'green', 38 * A).ellipse(11, 4.8, 3.4, 1.8, 'green', -38 * A);
    c.px(12, 1, '#ffe27a').px(12, 2, '#ffe27a').px(11, 1, '#ffe27a').px(13, 1, '#ffe27a');
  },
  // ---------------------------------------------------------------- S rank
  precision_aim: (c) => {
    c.ring(8, 8, 4.4, 5.8, 'gold');
    c.rect(7.4, 1.2, 1.2, 4.4, 'gold').rect(7.4, 10.4, 1.2, 4.4, 'gold').rect(1.2, 7.4, 4.4, 1.2, 'gold').rect(10.4, 7.4, 4.4, 1.2, 'gold');
    c.disc(8, 8, 1.3, 'red');
  },
  weapon_prodigy: (c) => {
    c.poly([[8, 0.8], [9.6, 3], [9.6, 9.4], [6.4, 9.4], [6.4, 3]], 'steel');
    c.rect(4.2, 9.4, 7.6, 1.8, 'gold').rect(7, 11.2, 2, 2.6, 'brown').disc(8, 14.2, 1.1, 'gold');
    c.star(12.6, 4.2, 2.4, 'gold', 4, 0.35).star(3.4, 6, 1.8, 'gold', 4, 0.35);
  },
  // ---------------------------------------------------------------- the rest of the ranks
  predators_eye: (c) => {
    c.ellipse(8, 8.6, 6.6, 3.9, 'orange');
    c.ellipse(8, 8.6, 2.5, 3.6, 'gold');
    c.rect(7.4, 5.6, 1.2, 6, 'dark');
    c.poly([[1, 4.4], [8, 2.2], [15, 4.4], [8, 4]], 'red');
    c.px(9, 7, '#ffffff');
  },
  berserkers_fury: (c) => {
    c.poly([[8, 0.8], [11, 4.4], [10.4, 2.6], [13.4, 6.6], [12.8, 11.4], [8, 14.8], [3.2, 11.4], [2.6, 6.6], [5.6, 2.6], [5, 4.4]], 'red');
    c.poly([[8, 5.4], [10.4, 8.4], [9.8, 11.8], [8, 13], [6.2, 11.8], [5.6, 8.4]], 'orange');
    c.poly([[8, 8], [9.2, 10], [8, 12], [6.8, 10]], 'gold');
    c.px(6, 4, '#ffc0c0');
  },
  berserkers_wrath: (c) => {
    c.disc(8, 8, 5.4, 'steel').rect(2.6, 8, 10.8, 4.4, 'steel');
    c.poly([[2.6, 7], [0.8, 2], [5, 5]], 'red').poly([[13.4, 7], [15.2, 2], [11, 5]], 'red');
    c.rect(4.2, 7.2, 3, 1.6, 'red').rect(8.8, 7.2, 3, 1.6, 'red');
    c.rect(7.4, 9.4, 1.2, 3.6, 'dark');
    c.px(5, 4, '#ffffff');
  },
  guardians_door: (c) => {
    c.rect(2.6, 5.4, 10.8, 9, 'iron').ellipse(8, 5.6, 5.4, 4.2, 'iron');
    c.rect(4, 6.2, 8, 8.2, 'brown').ellipse(8, 6.4, 4, 3.4, 'brown');
    c.rect(7.6, 3.4, 0.8, 11, 'dark');
    c.disc(6.2, 10.4, 0.8, 'gold').disc(9.8, 10.4, 0.8, 'gold');
    c.rect(2.6, 14, 10.8, 1.2, 'steel');
  },
  rangers_aim: (c) => {
    c.ring(8, 8, 5, 6.4, 'green').ring(8, 8, 2.2, 3.4, 'green');
    c.line(1.4, 14.6, 9.4, 6.6, 1.1, 'bone');
    c.poly([[9, 8.2], [11.2, 4.8], [7.4, 6.6]], 'steel');
    c.line(1.2, 11.6, 3.4, 13.8, 1.1, 'red').line(2.8, 10.2, 4.8, 12.2, 1.1, 'red');
    c.px(8, 8, '#ffffff');
  },
  warriors_rage: (c) => {
    c.poly([[8, 0.6], [9.8, 2.8], [9.8, 9.6], [6.2, 9.6], [6.2, 2.8]], 'steel');
    c.rect(4, 9.6, 8, 1.8, 'gold').rect(7, 11.4, 2, 2.8, 'brown').disc(8, 14.6, 1, 'gold');
    c.poly([[3.6, 12], [1.6, 8], [3, 8.6], [2.6, 4.6], [5.4, 9]], 'red').poly([[12.4, 12], [14.4, 8], [13, 8.6], [13.4, 4.6], [10.6, 9]], 'red');
    c.px(7, 3, '#ffffff');
  },
  geminis_blessing: (c) => {
    c.path([[4.6, 8], [11.4, 8]], 0.9, 'white');
    c.star(4.6, 8, 4.4, 'gold', 4, 0.36).star(11.4, 8, 4.4, 'purple', 4, 0.36);
    c.disc(4.6, 8, 1.2, 'white').disc(11.4, 8, 1.2, 'white');
    c.px(8, 3, '#fff0a0').px(8, 13, '#e6c4ff');
  },

  // ---------------------------------------------------------------- stats & misc
  s_hp: (c) => { c.heart(8, 7, 1.1, 'red'); c.px(4, 5, '#ffc0c0').px(4, 6, '#ffc0c0'); },
  s_stamina: (c) => {
    c.poly([[2, 3], [5, 3], [9.6, 8], [5, 13], [2, 13], [6.6, 8]], 'green');
    c.poly([[8, 3], [11, 3], [14.6, 8], [11, 13], [8, 13], [11.6, 8]], 'green');
  },
  s_mana: (c) => { c.disc(8, 10, 4.6, 'blue').poly([[8, 1.6], [3.6, 9.6], [12.4, 9.6]], 'blue'); c.px(5, 10, '#ffffff').px(5, 11, '#ffffff'); },
  s_damage: (c) => {
    c.line(3, 13, 12, 4, 1.8, 'steel').poly([[10.6, 2.4], [13.8, 2.2], [13.6, 5.4]], 'steel');
    c.line(3.6, 9, 7, 12.4, 1.6, 'gold').line(3.2, 12.8, 1.8, 14.2, 1.8, 'brown');
  },
  s_defense: (c) => {
    c.poly([[2.6, 2.6], [8, 1.4], [13.4, 2.6], [13, 8.6], [8, 14.6], [3, 8.6]], 'steel');
    c.poly([[8, 3.2], [11.6, 4], [11.2, 8], [8, 12]], 'blue').px(5, 4, '#ffffff');
  },
  s_speed: (c) => { ART.swift_wind(c); },
  s_crit: (c) => { c.star(8, 8, 6.8, 'gold', 8, 0.42); c.disc(8, 8, 1.8, 'orange'); },
  s_critdmg: (c) => { c.star(8, 8, 6.8, 'red', 8, 0.42); c.disc(8, 8, 2, 'orange'); },
  s_focus: (c) => { c.ring(8, 8, 2.6, 4.2, 'cyan').ring(8, 8, 5.6, 6.8, 'cyan', [20 * A, 70 * A]).ring(8, 8, 5.6, 6.8, 'cyan', [200 * A, 250 * A]); c.disc(8, 8, 1, 'white'); },
  s_xp: (c) => { c.poly([[8, 1.4], [13.4, 6], [8, 14.6], [2.6, 6]], 'gold'); c.poly([[8, 1.4], [13.4, 6], [8, 6]], 'gold'); c.px(5, 5, '#ffffff'); },
  s_kills: (c) => {
    c.ellipse(8, 6.8, 5.2, 4.8, 'bone').rect(5, 10, 6, 3.4, 'bone');
    c.ellipse(5.6, 7, 1.6, 1.8, 'dark').ellipse(10.4, 7, 1.6, 1.8, 'dark');
    c.rect(7.4, 9, 1.2, 1.4, 'dark').px(6, 12, '#14101f').px(8, 12, '#14101f').px(10, 12, '#14101f');
  },
  s_level: (c) => { c.poly([[8, 1.6], [14, 8.2], [10.4, 8.2], [10.4, 14], [5.6, 14], [5.6, 8.2], [2, 8.2]], 'gold'); },
  s_time: (c) => { c.disc(8, 8, 6, 'white').disc(8, 8, 4.6, 'dark'); c.rect(7.4, 4, 1.2, 4.6, 'white').rect(7.4, 7.6, 3.4, 1.2, 'white'); },
  s_lock: (c) => { c.ring(8, 6, 2.6, 4, 'iron').rect(3.6, 7, 8.8, 7, 'gold'); c.rect(7.2, 9, 1.6, 3, 'dark'); },
  s_stairs: (c) => { c.rect(2, 11, 4, 3, 'steel').rect(5, 8, 4, 6, 'steel').rect(8, 5, 4, 9, 'steel').rect(11, 2, 3.4, 12, 'steel'); },
  s_chest: (c) => { c.rect(2, 6, 12, 8, 'brown').ellipse(8, 6.4, 6, 3.4, 'brown'); c.rect(2, 8.4, 12, 1.4, 'gold').rect(7, 7.4, 2, 3.4, 'gold'); },
  s_portal: (c) => { c.ellipse(8, 8, 4.6, 6.8, 'purple'); c.ellipse(8, 8, 2.4, 4.6, 'blue'); c.px(7, 5, '#ffffff'); },
  // type badges (trait categories)
  t_basic: (c) => { c.disc(8, 8, 5.6, 'steel'); c.disc(8, 8, 2.6, 'white'); },
  t_melee: (c) => { ART.battle_instinct(c); },
  t_ranger: (c) => {
    c.ring(2, 8, 6.7, 8.1, 'brown', [65 * A, 295 * A]);
    c.line(5.2, 1.6, 5.2, 14.4, 0.8, 'bone').line(5.2, 8, 14, 8, 1, 'bone').poly([[15, 8], [12.4, 6.2], [12.4, 9.8]], 'steel');
  },
  t_magic: (c) => { c.star(8, 8, 6.6, 'purple', 4, 0.34); c.disc(8, 8, 1.6, 'white'); },
  t_secret: (c) => {
    c.ring(8, 5.4, 2.2, 3.7, 'iron');
    c.ellipse(8, 11.6, 5.4, 3.6, 'dark');
    c.px(8, 11, '#c0c0e0').px(8, 12, '#c0c0e0');
  },
};

const cache = {};
export const ICON_KEYS = Object.keys(ART);
export function iconPix(key) {
  if (!cache[key]) {
    if (!ART[key]) return null;
    cache[key] = drawn(ART[key]).toPix();
  }
  return cache[key];
}
