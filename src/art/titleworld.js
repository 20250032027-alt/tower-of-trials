// A tiny ray-caster for the title screen. For every pixel of a small virtual canvas it fires a ray from the camera
// (see logic/titlelayout.js) into a tapering, stepped tower, a paved plaza and a night sky, then shades the hit with a
// handful of palette steps + ordered dithering. Because every pixel is traced, the perspective is exact: the bricks,
// cornices, windows and flagstones all converge toward the sky, with no hand-bent sprites. Output is plain Pix buffers,
// shown at a whole-number zoom, so it still reads as pixel art.
import { Pix, noise } from './pixel.js';
import { TIERS, WORLD as Wd, towerR, tierBase, tierTop, TOWER_H, LANTERN_TOP, APEX_Y, project, rayDir } from '../logic/titlelayout.js';

const OUT = '#0d0a16';
const PHI0 = -Math.PI / 2;                                  // the gate faces the camera (-z)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP = (a) => a.map(rgb);
const ramp = (R, k, b) => {
  const n = R.length - 1;
  if (k <= 0) return R[0];
  if (k >= n) return R[n];
  const i = k | 0;
  return k - i > b ? R[i + 1] : R[i];
};
const fract = (v) => v - Math.floor(v);

const WALL = RAMP(['#15122a', '#25203f', '#38325a', '#4f4973', '#6c6690', '#8d88ae', '#bcb8d6']);
const SLATE = RAMP(['#10162a', '#1a2340', '#2a3a5e', '#42608e', '#6f92c0']);
const WOOD = RAMP(['#241810', '#3a2616', '#53341f', '#6a4328', '#8a5a34']);
const GROUND = RAMP(['#0c0914', '#15121f', '#211c33', '#2f2a48', '#413b5e', '#5a5478', '#7c769c']);
const TURF = RAMP(['#0a0812', '#100d1a', '#161226', '#1d1a30']);
const TEAL = RAMP(['#1d6a60', '#2aa898', '#4fe8cf', '#c8fff2']);
const LIT = RAMP(['#9a6a2a', '#ffb84a', '#ffd86a', '#fff3b0']);
const FOGC = rgb('#4a3568'), RUNE = rgb('#4fe8cf'), RUNE2 = rgb('#2aa898'), MOSS = rgb('#2c5a4c'), TORCHC = rgb('#ff9a3a');
const LDIR = (() => { const v = [0.73, 0.34, -0.58], l = Math.hypot(...v); return v.map((x) => x / l); })();

// ------------------------------------------------------------------ tables (the tower never changes)
const R = Array.from({ length: TIERS }, (_, i) => towerR(i));
const YB = Array.from({ length: TIERS }, (_, i) => tierBase(i));
const YT = Array.from({ length: TIERS }, (_, i) => tierTop(i));
const WALLTOP = YT.map((y) => y - Wd.LEDGE_H);
const SEGS = [];                                            // vertical cylinders: kind 1 = wall, 2 = cornice, 3 = plinth
SEGS.push({ r: Wd.R0 + 0.7, y0: 0, y1: 0.45, kind: 3, i: 0 });
for (let i = 0; i < TIERS; i++) {
  SEGS.push({ r: R[i], y0: Math.max(YB[i], 0.45), y1: WALLTOP[i], kind: 1, i });
  SEGS.push({ r: R[i] + Wd.LEDGE_OUT, y0: WALLTOP[i], y1: YT[i], kind: 2, i });
}
SEGS.push({ r: Wd.LANTERN_R, y0: TOWER_H, y1: TOWER_H + Wd.LANTERN_H, kind: 7, i: TIERS });
SEGS.push({ r: Wd.LANTERN_R + 0.45, y0: TOWER_H + Wd.LANTERN_H, y1: LANTERN_TOP, kind: 8, i: TIERS });
const ANN = R.map((r, i) => ({ y: WALLTOP[i], r0: r, r1: r + Wd.LEDGE_OUT, i }));   // undersides of the cornices
ANN.push({ y: TOWER_H + Wd.LANTERN_H, r0: Wd.LANTERN_R, r1: Wd.LANTERN_R + 0.45, i: TIERS });
const SPIRE_RB = Wd.LANTERN_R * 0.9, SPIRE_K = SPIRE_RB / Wd.SPIRE_H;

/** Window slots per storey (angle from the gate's centreline, and the height range of the opening). */
export const WINDOWS = [];
for (let i = 0; i < TIERS; i++) {
  const angs = i === 0 ? [-1.38, -0.92, 0.92, 1.38] : i % 2 ? [-1.4, -0.84, -0.28, 0.28, 0.84, 1.4] : [-1.12, -0.56, 0, 0.56, 1.12];
  const y0 = i === 0 ? 3.6 : YB[i] + 0.6;
  for (const a of angs) WINDOWS.push({ id: WINDOWS.length, tier: i, a, y0, y1: y0 + (i === 0 ? 1.4 : 1.15), hw: 0.34 });
}

const wrapAng = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ------------------------------------------------------------------ the world pass
/**
 * Ray-cast tower + ground. Pixels that see only sky stay transparent.
 * @param o {x0,y0,x1,y1} region in picture px (default: whole picture plus the parallax margin), {door} 0..1 gate openness,
 *          {tint: false} to skip the outline (used for the gate frames)
 * @returns {{pix:Pix, windows:{x:number,y:number,w:number,tier:number,lit:boolean,next:boolean,vis:boolean}[]}}
 */
export function renderWorld(m, lit, o = {}) {
  const cam = m.cam, F = cam.F, CH = Wd.CAM_H, D = Wd.CAM_D;
  const x0 = o.x0 ?? -m.pad, y0 = o.y0 ?? 0, x1 = o.x1 ?? m.W + m.pad, y1 = o.y1 ?? m.H;
  const w = x1 - x0, h = y1 - y0, pix = new Pix(w, h), data = pix.data;
  const door = o.door || 0;
  const ids = new Int16Array(w * h).fill(-1);
  const d = [0, 0, 0];
  const torchX = Wd.DOOR_HW + 1.2, torchZ = -(Math.sqrt(R[0] * R[0] - torchX * torchX)) - 0.4;

  for (let py = 0; py < h; py++) {
    const sy = y0 + py;
    for (let px = 0; px < w; px++) {
      const sx = x0 + px;
      rayDir(cam, sx + 0.5, sy + 0.5, d);
      const dx = d[0], dy = d[1], dz = d[2];
      const bx = bay(sx, sy);

      // ---- nearest tower surface
      let bt = Infinity, kind = 0, ti = 0;
      if (dz > 0.0001) {
        const a = dx * dx + dz * dz, b = -D * dz;
        for (let s = 0; s < SEGS.length; s++) {
          const g = SEGS[s];
          const disc = b * b - a * (D * D - g.r * g.r);
          if (disc <= 0) continue;
          const t = (-b - Math.sqrt(disc)) / a;
          if (t <= 0 || t >= bt) continue;
          const y = CH + t * dy;
          if (y < g.y0 || y > g.y1) continue;
          bt = t; kind = g.kind; ti = g.i;
        }
        if (dy > 0.0001) {
          for (let n = 0; n < ANN.length; n++) {            // underside of each cornice
            const A2 = ANN[n], t = (A2.y - CH) / dy;
            if (t <= 0 || t >= bt) continue;
            const x = t * dx, z = -D + t * dz, rr = Math.sqrt(x * x + z * z);
            if (rr >= A2.r0 && rr <= A2.r1) { bt = t; kind = 4; ti = n; }
          }
          // slate spire (a cone)
          const A = APEX_Y - CH, k2 = SPIRE_K * SPIRE_K;
          const qa = dx * dx + dz * dz - k2 * dy * dy, qb = -2 * D * dz + 2 * k2 * A * dy, qc = D * D - k2 * A * A;
          const disc = qb * qb - 4 * qa * qc;
          if (disc > 0 && Math.abs(qa) > 1e-6) {
            const sq = Math.sqrt(disc);
            for (const t of [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)]) {
              if (t <= 0 || t >= bt) continue;
              const y = CH + t * dy;
              if (y >= LANTERN_TOP && y <= APEX_Y) { bt = t; kind = 5; break; }
            }
          }
        }
        if (dy < -0.0001) {                                  // top of the plinth ring
          const t = (0.45 - CH) / dy;
          if (t > 0 && t < bt) {
            const x = t * dx, z = -D + t * dz, rr = Math.sqrt(x * x + z * z);
            if (rr >= R[0] && rr <= Wd.R0 + 0.7) { bt = t; kind = 6; }
          }
        }
      }
      // ---- ground
      let tg = Infinity;
      if (dy < -0.0001) tg = -CH / dy;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      
      if (kind && bt < tg) {
        const t = bt, x = t * dx, z = -D + t * dz, y = CH + t * dy, fp = t / F;
        const haze = Math.min(1, Math.max(0, (t - 18) / 46)) * 0.42;
        let c = null, k = 3;
        if (kind === 1 || kind === 2 || kind === 3 || kind === 7 || kind === 8) {
          const r = kind === 1 ? R[ti] : kind === 2 ? R[ti] + Wd.LEDGE_OUT : kind === 3 ? Wd.R0 + 0.7 : kind === 7 ? Wd.LANTERN_R : Wd.LANTERN_R + 0.45;
          const nx = x / r, nz = z / r;
          const diff = Math.max(0, nx * LDIR[0] + nz * LDIR[2]) + 0.0;
          const a = wrapAng(Math.atan2(z, x) - PHI0), sOff = a * r;
          k = 0.7 + 3.9 * diff + 0.7 * (y / TOWER_H);
          const rim = -(dx * nx + dz * nz);                    // 1 = facing us, 0 = grazing the silhouette
          if (rim < 0.28 && diff > 0.35) k += 1.1;
          if (kind === 1) {
            const wt = WALLTOP[ti], rowH = 0.52, bw = 0.95;
            const row = Math.floor(y / rowH), rf = fract(y / rowH);
            const cf = fract(sOff / bw + (row & 1) * 0.5), col = Math.floor(sOff / bw + (row & 1) * 0.5);
            const hsh = noise(col, row, ti + 3);
            if (fp < 0.2) {
              if (rf < 0.14 || cf < 0.07) k -= 1.15; else k += (hsh - 0.5) * 1.1;
            } else if (fp < 0.42) k += (hsh - 0.5) * 0.9 - (rf < 0.2 ? 0.4 : 0);
            const under = wt - y;
            if (under < 1.0) k -= 1.7 * (1 - under / 1.0);   // shadow under the cornice
            if (ti > 0 && y - YB[ti] < 0.35) k -= 0.5;
            const sc = Math.floor(sOff / 0.42);
            if (noise(sc, ti, 17) > 0.86) k -= 0.8 * Math.min(1, (wt - y) / Wd.TIER_H);   // rain streaks
            if (ti === 0 && y < 1.1 && noise(Math.floor(sOff / 0.5), Math.floor(y / 0.4), 4) > 0.62 - y * 0.28) c = MOSS;
            // the gate
            if (ti === 0) c = gate(sOff, y, k, door, c, bx, fp);
            // windows
            if (!c || c === MOSS) {
              for (let wi = 0; wi < WINDOWS.length; wi++) {
                const W = WINDOWS[wi];
                if (W.tier !== ti) continue;
                const sw = wrapAng(a - W.a) * r;
                if (Math.abs(sw) > W.hw + 0.16) continue;
                const archBase = W.y1 - W.hw, inside = Math.abs(sw) <= W.hw && y >= W.y0 && (y <= archBase || sw * sw + (y - archBase) * (y - archBase) <= W.hw * W.hw);
                if (inside) {
                  const isLit = ti < lit;
                  if (isLit) {
                    const g = 1 - Math.hypot(sw / W.hw, (y - (W.y0 + W.y1) / 2) / 0.9) * 0.9;
                    c = Math.abs(sw) < 0.045 || (y > W.y0 + 0.55 && y < W.y0 + 0.66) ? LIT[0] : ramp(LIT, 1 + g * 2.2, bx);
                  } else c = y < W.y0 + 0.32 && Math.abs(sw) < 0.2 ? rgb('#2a2750') : rgb('#0f0c20');
                  ids[py * w + px] = W.id;
                } else if (Math.abs(sw) <= W.hw + 0.16 && y >= W.y0 - 0.2 && (y <= archBase + W.hw + 0.14)) {
                  c = y < W.y0 ? ramp(WALL, k + 1.3, bx) : ramp(WALL, k - 1.6, bx);   // sill lit, jambs in shadow
                }
                if (c && c !== MOSS) break;
              }
            }
          } else if (kind === 7) {                           // lantern room: stone piers around glowing teal arches
            let teal = false;
            for (const aa of [-1.0, -0.33, 0.33, 1.0]) {
              const sw = wrapAng(a - aa) * r, ab = TOWER_H + 1.95;
              if (Math.abs(sw) < 0.3 && y > TOWER_H + 0.55 && (y < ab || sw * sw + (y - ab) * (y - ab) < 0.09)) { teal = true; c = ramp(TEAL, 1.2 + (1 - Math.abs(sw) / 0.3) * 2, bx); break; }
            }
            if (!teal) { if (fract(y / 0.5) < 0.12) k -= 0.8; c = ramp(WALL, k + 0.4, bx); }
          } else if (kind === 8) {
            k += fract(y / 0.35) < 0.3 ? 1.1 : -0.3;
          } else if (kind === 2) {                           // cornice: pale lip on top, corbel shadow beneath
            const e = YT[ti] - y;
            k += e < 0.1 ? 1.2 : e > 0.24 ? -0.8 : 0.2;
            const cf = fract(sOff / 0.7);
            if (cf < 0.12) k -= 0.7;
          } else {                                          // plinth
            k = 0.2 + 3.2 * diff;
            if (fract(y / 0.45) < 0.2) k -= 0.8;
            const cf = fract(sOff / 1.1); if (cf < 0.08) k -= 0.8;
          }
          if (!c) c = ramp(WALL, k - haze * 2.4, bx);
        } else if (kind === 4) {                            // cornice underside: dark, with corbel blocks
          const rr = Math.sqrt(x * x + z * z), a = wrapAng(Math.atan2(z, x) - PHI0), A2 = ANN[ti];
          k = 0.9 + (noise(Math.floor(a * rr / 0.7), ti, 9) - 0.5) * 0.9;
          if (rr - A2.r0 < 0.12) k -= 0.6;
          c = ramp(WALL, k - haze * 2.4, bx);
        } else if (kind === 5) {                            // spire
          const ang = Math.atan2(z, x), rr = Math.sqrt(x * x + z * z);
          const nx = x / rr, nz = z / rr;
          const diff = Math.max(0, (nx * LDIR[0] + nz * LDIR[2]) * 0.8 + 0.25);
          k = 0.5 + 3.2 * diff;
          if (fract(y / 0.8) < 0.14) k -= 1;
          if (fract(ang / 0.35 + Math.floor(y / 0.8) * 0.5) < 0.05) k -= 0.7;
          c = ramp(SLATE, k - haze * 2, bx);
        } else {                                            // plinth ring top
          const rr = Math.sqrt(x * x + z * z), a = wrapAng(Math.atan2(z, x) - PHI0);
          k = 3.4 + (noise(Math.floor(a * rr / 0.9), 1, 2) - 0.5) * 0.8;
          c = ramp(WALL, k, bx);
        }
        cr = c[0]; cg = c[1]; cb = c[2]; ca = 255;
      } else if (tg < Infinity) {
        const x = tg * dx, z = -D + tg * dz;
        const c = ground(x, z, tg, dy, F, bx, torchX, torchZ);
        cr = c[0]; cg = c[1]; cb = c[2]; ca = 255;
      }
      const i = (py * w + px) * 4;
      data[i] = cr; data[i + 1] = cg; data[i + 2] = cb; data[i + 3] = ca;
    }
  }
  // where the glowing windows are on screen (for the soft light around them), and whether the camera can see each one
  const windows = WINDOWS.map((W) => {
    const r = R[W.tier], phi = PHI0 + W.a, yc = (W.y0 + W.y1) / 2;
    const P = project(cam, r * Math.cos(phi), yc, r * Math.sin(phi));
    const ix = Math.round(P.x) - x0, iy = Math.round(P.y) - y0;
    const vis = ix >= 0 && iy >= 0 && ix < w && iy < h && ids[iy * w + ix] === W.id;
    return { x: P.x, y: P.y, w: (W.hw * 2) * F / P.z, tier: W.tier, lit: W.tier < lit, next: W.tier === lit, vis };
  });
  if (!o.noOutline) pix.outline(OUT);
  return { pix, windows };
}

/** The gate: stone arch ring, two plank doors that swing inward as `open` goes 0 -> 1, warm light inside. */
function gate(sOff, y, k, open, cur, bx, fp) {
  const HW = Wd.DOOR_HW, top = Wd.DOOR_H, arch = top - HW;
  const rad = (e) => (y <= arch ? Math.abs(sOff) <= HW + e : sOff * sOff + (y - arch) * (y - arch) <= (HW + e) * (HW + e));
  if (!rad(0.3)) return cur;
  if (!rad(0)) {                                            // voussoir ring around the opening
    const ang = Math.atan2(y - arch, sOff);
    const st = y > arch ? Math.floor(ang / 0.34) : Math.floor(y / 0.5);
    return ramp(WALL, k + 1.1 - (st & 1 ? 1.2 : 0), bx);
  }
  const x = sOff / HW, ax = Math.abs(x);
  const leafW = 1 - 0.86 * open;
  if (ax > 1 - leafW) {                                     // a door leaf
    const plank = Math.floor((sOff + 5) / 0.3);
    let kk = 1.3 + (plank & 1 ? 0.5 : 0) + (noise(plank, Math.floor(y / 0.9), 3) - 0.5) * 0.7 + (x > 0 ? 0.5 : 0) - open * 0.6;
    if (Math.abs(y - top * 0.28) < 0.1 || Math.abs(y - top * 0.72) < 0.1) return rgb('#2b2630');
    if (fract((sOff + 5) / 0.3) < 0.09) kk -= 1;
    if (ax > 0.9 && Math.abs(fract(y / 0.9) - 0.5) < 0.06) return rgb('#aab4c8');   // rivets
    if (Math.abs(x) < 1 - leafW + 0.06 && Math.abs(y - top * 0.5) < 0.2) return rgb('#aab4c8');   // ring handle
    if (y < 0.16 && open < 0.05) return rgb('#ffb84a');       // light under the closed door
    return ramp(WOOD, kk, bx);
  }
  const g = 1 - Math.hypot(x * 0.9, (y - top * 0.55) / (top * 0.75));    // the hall behind: warm, brightest in the middle
  return ramp(LIT, 0.7 + Math.max(0, g) * 3.1, bx);
}

/** Ground colour at world (x, z): paved plaza, flagstone path, a teal rune circle, turf; torchlight near the gate; mist far away. */
function ground(x, z, t, dy, F, bx, tx, tz) {
  const rr = Math.sqrt(x * x + z * z);
  const fp = t / (F * Math.max(0.09, -dy));                 // size of a pixel along the ground
  let k, c = null;
  const ax = Math.abs(x), onPath = ax < 1.7 && z < 0;
  if (rr < 9) {
    const row = Math.floor(z / 0.85), cf = fract((x + (row & 1) * 0.42) / 0.85), rf = fract(z / 0.85);
    const col = Math.floor((x + (row & 1) * 0.42) / 0.85);
    k = 2.1 + (noise(col, row, 7) - 0.5) * 1.8;
    if (fp < 0.6 && (cf < 0.09 || rf < 0.13)) k -= 1.2;
    if (rr > 8.55) k += 1.0;                                // lighter kerb ring
    if (onPath) { k += 0.5; if (fp < 0.7 && fract(z / 1.3) < 0.1) k -= 0.9; }
    const a = wrapAng(Math.atan2(z, x));
    const seg = fract(a / (Math.PI * 2) * 28);
    if (rr > 6.55 && rr < 6.85 && seg > 0.22) c = seg > 0.5 && fp < 0.6 ? RUNE : RUNE2;   // rune circle, in dashes
    else if (rr > 6.2 && rr < 6.28) c = RUNE2;
  } else if (onPath) {                                      // path continuing out toward the camera
    const row = Math.floor(z / 1.3), col = Math.floor((x + (row & 1) * 0.5) / 0.9);
    k = 2.0 + (noise(col, row, 5) - 0.5) * 1.6;
    if (fp < 0.7 && (fract((x + (row & 1) * 0.5) / 0.9) < 0.1 || fract(z / 1.3) < 0.12)) k -= 1.1;
    if (ax > 1.45) k -= 0.9;
  } else {
    const n = noise(Math.floor(x / 0.55), Math.floor(z / 0.55), 3);
    k = 1.0 + n * 0.7;
    if (n > 0.965 && fp < 0.55) c = rgb('#1d3a36');
    else if (n < 0.04 && fp < 0.55) c = rgb('#2f2a48');
    const tf = ramp(TURF, k - 0.4, bx);
    if (!c) c = tf;
    if (c === tf) k = -1;
  }
  // torchlight pooling by the gate
  let warm = 0;
  for (const sg of [-1, 1]) { const ddx = x - sg * tx, ddz = z - tz, q = 1 / (1 + (ddx * ddx + ddz * ddz) / 7); warm += q; }
  if (k >= 0 && !c) { k += warm * 2.2 + (rr < 9 ? 0 : 0); c = ramp(GROUND, k, bx); }
  else if (!c) c = ramp(TURF, 1 + warm * 3, bx);
  if (warm > 0.18 && bay(Math.floor(x * 3), Math.floor(z * 3)) < warm * 0.9 && c !== RUNE && c !== RUNE2) c = ramp(GROUND, (k < 0 ? 2 : k) + 1.5 + warm * 1.5, bx);
  // mist toward the horizon (dithered, so the palette stays small)
  const f = Math.min(1, Math.max(0, (t - 20) / 90));
  if (f * 0.95 > bx) c = FOGC;
  if (t > 160) c = FOGC;
  return c;
}

// ------------------------------------------------------------------ the gate frames (door swinging open)
export function doorRect(m) {
  const pts = [];
  const r0 = R[0], a = Wd.DOOR_HW / r0 + 0.3 / r0;
  for (const sg of [-1, 1]) for (const yy of [0, Wd.DOOR_H - Wd.DOOR_HW, Wd.DOOR_H + 0.3]) {
    const phi = PHI0 + sg * a; pts.push(project(m.cam, r0 * Math.cos(phi), yy, r0 * Math.sin(phi)));
  }
  pts.push(project(m.cam, 0, Wd.DOOR_H + 0.3, -r0));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - 2, x1 = Math.ceil(Math.max(...xs)) + 2, y0 = Math.floor(Math.min(...ys)) - 2, y1 = Math.ceil(Math.max(...ys)) + 2;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Warm light from the open gate lying on the paving in front of it (drawn additively). */
export function renderSpill(m) {
  const cam = m.cam, CH = Wd.CAM_H, D = Wd.CAM_D, LEN = 8, d = [0, 0, 0];
  const pts = [];
  for (const zd of [0, LEN]) for (const sg of [-1, 1]) {
    const hw = Wd.DOOR_HW + 0.6 + zd * 0.3;
    pts.push(project(cam, sg * hw, 0, -R[0] - zd));
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1, y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
  const p = new Pix(x1 - x0, y1 - y0);
  for (let py = 0; py < p.h; py++) for (let px = 0; px < p.w; px++) {
    const sx = x0 + px, sy = y0 + py;
    rayDir(cam, sx + 0.5, sy + 0.5, d);
    if (d[1] > -0.0001) continue;
    const t = -CH / d[1], x = t * d[0], z = -D + t * d[2], zd = -z - R[0];
    if (zd < 0 || zd > LEN) continue;
    const hw = Wd.DOOR_HW + 0.6 + zd * 0.3, q = Math.abs(x) / hw;
    if (q > 1) continue;
    const a = (1 - zd / LEN) ** 1.15 * (1 - q * q);
    if (a * 0.95 > bay(sx, sy)) p.set(px, py, '#ffd86aff');
  }
  return { pix: p, x: x0, y: y0 };
}

// ------------------------------------------------------------------ sky and distant ranges
const SKYC = ['#0c0a1a', '#14102a', '#201838', '#33244f', '#503466', '#7a4a72', '#b4687a', '#e8946e'].map((h) => [...rgb(h), 255]);
const mixc = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255);

/** Layer 0 = dusk gradient + moon; layers 1 and 2 = far / near mountain silhouettes on the horizon (transparent above them). */
export function renderSky(m, layer) {
  const cam = m.cam, w = m.W + m.pad * 2, h = m.H, p = new Pix(w, h), d = [0, 0, 0];
  const ph = [noise(1, layer, 7) * 6.28, noise(2, layer, 7) * 6.28, noise(3, layer, 7) * 6.28];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    rayDir(cam, x - m.pad + 0.5, y + 0.5, d);
    const e = Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180 / Math.PI;
    if (layer === 0) {
      const t = Math.min(1, Math.max(0, 1 - (e + 4) / 54)) ** 1.55;
      const f = t * (SKYC.length - 1), i = Math.min(SKYC.length - 2, Math.floor(f));
      p.set(x, y, f - i > bay(x, y) ? SKYC[i + 1] : SKYC[i]);
    } else {
      const az = Math.atan2(d[0], d[2]);
      const q = Math.floor(az * 40) / 40;
      const ridge = (layer === 1 ? 3.2 : 1.6) + (layer === 1 ? 5.5 : 3.6) * (0.5 + 0.34 * Math.sin(q * 4.1 + ph[0]) + 0.2 * Math.sin(q * 10 + ph[1]) + 0.1 * Math.sin(q * 25 + ph[2]));
      if (e > ridge) continue;
      const rim = e > ridge - 0.9 || (e > ridge - 1.8 && bay(x, y) < 0.45);
      p.set(x, y, layer === 1 ? (rim ? '#6a4a80' : e > ridge - 3 && bay(x, y) < 0.5 ? '#4a3568' : '#33254f') : (rim ? '#3c2d58' : e > ridge - 2.5 && bay(x, y) < 0.5 ? '#271e42' : '#1c1532'));
    }
  }
  if (layer === 0) {                                        // moon with a dithered halo and craters
    const mx = m.moon.x + m.pad, my = m.moon.y, r = m.moon.r;
    for (let y = Math.max(0, my - r * 3); y < Math.min(h, my + r * 3); y++) for (let x = Math.max(0, mx - r * 3); x < Math.min(w, mx + r * 3); x++) {
      const dd = Math.hypot(x - mx, y - my);
      if (dd <= r || dd > r * 2.8) continue;
      const a = (1 - (dd - r) / (r * 1.8)) ** 2 * 0.55;
      if (a > bay(x, y)) { const c = p.get(x, y); p.set(x, y, mixc(c, [150, 170, 230], 0.34)); }
    }
    p.ellipse(mx, my, r, r, (nx, ny) => { const dd = nx * 0.6 - ny * 0.2; return dd > 0.5 ? '#cfc9b4' : dd > 0.05 ? '#e6e0cc' : '#f4f0e0'; });
    for (const [dx, dy, rr] of [[-0.32, -0.2, 0.2], [0.28, 0.25, 0.26], [-0.1, 0.42, 0.14], [0.38, -0.3, 0.12]]) p.ellipse(mx + dx * r, my + dy * r, Math.max(1, rr * r), Math.max(1, rr * r), '#c7c1ab');
  }
  return p;
}

/** Star positions (picture px) that are well above the horizon and clear of the moon. */
export function starField(m, rng) {
  const n = Math.min(170, Math.round(m.W * m.H / 220)), out = [], d = [0, 0, 0];
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    const x = rng.int(0, m.W - 1), y = rng.int(0, m.H - 1);
    if (Math.hypot(x - m.moon.x, y - m.moon.y) < m.moon.r * 1.9) continue;
    rayDir(m.cam, x + 0.5, y + 0.5, d);
    const e = Math.asin(d[1]) * 180 / Math.PI;
    if (e < 6 || (e < 22 && rng.next() < 0.6)) continue;
    out.push({ x, y, big: rng.next() < 0.14, c: ['#ffffff', '#cfd8ff', '#ffe9a8', '#ffffff'][rng.int(0, 3)], ph: rng.next() * 6.28, sp: 0.6 + rng.next() * 1.6 });
  }
  return out;
}
