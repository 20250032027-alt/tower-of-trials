// Exports the title-screen vista for the Godot port: the ray-cast sky / ranges / Tower / paving as PNG layers, the little
// sprites (graves, guards, hero, bats, crows, clouds, mist...), and godot/data/title.json with every placement.
// The picture is made at the web game's 960x540 size (virtual 240x135, zoom 4); Godot shows it at 2x in its 480x270 view.
// Called from export.mjs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleMetrics, project, rayDir, WORLD, towerR, BEACON_POS, APEX_Y, TIERS } from '../../src/logic/titlelayout.js';
import * as A from '../../src/art/titlescene.js';
import * as W from '../../src/art/titleworld.js';
import { Pix } from '../../src/art/pixel.js';
import { makeRng } from '../../src/logic/rng.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const PHI0 = -Math.PI / 2;

export function exportTitle({ out, png, mk }) {
  const dir = join(out, 'assets/title');
  mk(dir);
  const files = {};
  const put = (key, pix) => { writeFileSync(join(dir, key + '.png'), png(pix.w, pix.h, pix.data)); files[key] = [pix.w, pix.h]; return key; };

  const m = titleMetrics(960, 540), { Z, pad, cam } = m;
  if (m.W !== 240 || m.H !== 135 || Z !== 4) throw new Error(`title metrics changed: ${m.W}x${m.H} z${Z}`);
  const rng = makeRng(20260601);
  const horizon = project(cam, 0, WORLD.CAM_H, 5000).y;
  const X = (x) => x + pad;
  const at = (x, y, z) => { const p = project(cam, x, y, z); return { x: p.x + pad, y: p.y, z: p.z }; };
  const groundAt = (sx, sy) => {
    const d = rayDir(cam, sx + 0.5, sy + 0.5, [0, 0, 0]);
    if (d[1] > -0.02) return null;
    const t = WORLD.CAM_H / -d[1];
    return { x: d[0] * t, z: d[2] * t - WORLD.CAM_D, t };
  };
  const T = { W: m.W, H: m.H, pad, Z, horizon, moon: m.moon, tilt: Math.tan(cam.roll), roll: cam.roll, cam: { F: cam.F, sp: cam.sp, cp: cam.cp, sr: cam.sr, cr: cam.cr, tx: cam.tx, ty: cam.ty }, CAM_H: WORLD.CAM_H, CAM_D: WORLD.CAM_D, APEX_Y, R0: towerR(0), HERO_R: towerR(0) + WORLD.HERO_Z, DOOR_H: WORLD.DOOR_H, DOOR_HW: WORLD.DOOR_HW, TIERS };

  // ---- sky, ranges
  put('sky', W.renderSky(m, 0));
  const farPix = W.renderSky(m, 1);
  put('far', farPix); put('near', W.renderSky(m, 2));
  const ridge = [];
  for (let x = 0; x < m.W + pad * 2; x++) { let y = 0; while (y < m.H && !farPix.solid(x, y)) y++; ridge.push(y); }
  T.ridge = ridge;
  put('px', A.px1()); put('star_big', A.starBig());
  T.stars = W.starField(m, rng).map((s) => ({ x: X(s.x) - (s.big ? 1 : 0), y: s.y - (s.big ? 1 : 0), big: s.big, c: s.c, ph: s.ph, sp: s.sp }));
  T.clouds = [[44, 9, 0.62, 3.2], [66, 11, 0.8, 2.1], [30, 7, 0.9, 4.2]].map(([w, h, yy, sp], i) => {
    const by = Math.round(Math.max(6, horizon * yy) - 9), x0 = rng.int(0, m.W);
    return { key: put('cloud' + i, A.makeCloud(w, h, 40 + i)), w, by, x: x0, sp };
  });
  rng.next(); // shooting-star timer in the web version
  T.storm = [[0.44, 0.19, 0.012, -1.7], [0.3, 0.14, 0.03, -2.6], [0.24, 0.16, 0.2, -1.2], [0.36, 0.2, 0.34, -2.1]].map(([wf, hf, yf, sp], i) => {
    const w = Math.max(40, Math.round(m.W * wf)), h = Math.max(14, Math.min(30, Math.round(m.H * hf)));
    const x0 = Math.round(m.W * (0.04 + 0.28 * i) + rng.int(-6, 6)), by = Math.round(m.H * yf);
    return { dark: put('storm' + i, A.makeStormCloud(w, h, 11 + i * 5)), lit: put('storml' + i, A.makeStormCloud(w, h, 11 + i * 5, true)), w, h, x: x0, by, sp };
  });
  rng.next(); // lightning timer
  const boltLen = Math.round(m.H * 0.6);
  T.bolts = [1, 2, 3, 4, 5].map((n) => { const b = A.makeBolt(boltLen, 1 + n); return { key: put('bolt' + n, b.pix), ox: b.ox, len: boltLen }; });

  // ---- ruin + the march along the far ridge
  put('ruin', A.makeRuin());
  const rx = Math.round(m.W * 0.6) + pad;
  T.ruin = { x: rx, y: ridge[rx + 8] - 11, gx: rx + 5.5, gy: ridge[rx + 8] - 7 };
  for (const k of [0, 1, 2]) for (const f of [0, 1]) put(`march${k}${f}`, A.makeMarcher(f, k));
  const N = 10, gap = 13;
  T.march = { x: m.W * 0.56 + pad, gap, sp: 3.2, units: Array.from({ length: N }, (_, i) => {
    const kind = i % 3 === 1 ? 1 : i % 3 === 0 ? 0 : 2;
    return { kind, ph: rng.next() * 3, off: i * gap + rng.int(-2, 2) };
  }) };

  // ---- the tower + paving, one picture per count of lit storeys (windows are lit one storey per cleared dungeon)
  let w0;
  for (let n = 0; n <= TIERS; n++) { const r = W.renderWorld(m, n); put('world' + n, r.pix); if (n === 0) w0 = r; }
  T.windows = w0.windows.map((w) => ({ x: X(w.x), y: w.y, w: w.w, tier: w.tier, vis: w.vis }));
  for (const w of w0.windows) if ((w.lit || w.next) && w.vis) rng.next();

  // ---- graveyard
  const gr = () => rng.next(), graves = [], tried = [];
  for (let i = 0; i < 400 && graves.length < 30; i++) {
    const sx = m.W * (0.43 + gr() * 0.56), sy = horizon + 6 + gr() * (m.H - horizon - 12);
    const g = groundAt(sx, sy);
    if (!g) continue;
    const kind = Math.floor(gr() * 3), hw = 1.0 + gr() * 0.9, h = Math.round(cam.F * hw / g.t);
    if (h < 4 || h > 24) continue;
    if (Math.abs(g.x) < 4.4 && g.z < 0) continue;
    if (tried.some((q) => Math.hypot((q.x - sx) * 1.0, (q.y - sy) * 1.7) < Math.max(9, h * 1.2))) continue;
    if (sx < m.W * 0.44 || sy < horizon + 4) continue;
    tried.push({ x: sx, y: sy });
    graves.push({ x: sx, y: sy, h, kind });
  }
  graves.sort((a, b) => a.y - b.y);
  const made = new Set();
  T.graves = graves.map((g) => {
    const key = `grave${g.kind}_${g.h}`;
    if (!made.has(key)) { made.add(key); put(key, A.makeGrave(g.h, g.kind)); }
    const w = Math.max(3, Math.round(g.h * (g.kind === 1 ? 0.8 : 0.66))) + 2, sw2 = Math.round(w * 1.5), sk = `gshadow${sw2}`;
    if (!made.has(sk)) { made.add(sk); put(sk, A.shadowBlob(sw2)); }
    return { x: Math.round(X(g.x)) - Math.round(w / 2), y: Math.round(g.y) - g.h - 1, key, sx: Math.round(X(g.x)) - Math.round(sw2 / 2), sy: Math.round(g.y) - 1, skey: sk, h: g.h, cx: X(g.x), fy: g.y };
  });

  // ---- the gate
  const R0 = towerR(0), tOff = WORLD.DOOR_HW + 1.2;
  T.torches = [-1, 1].map((sd) => {
    const phi = PHI0 + sd * tOff / R0, P = at(R0 * Math.cos(phi), 2.7, R0 * Math.sin(phi));
    return { x: Math.round(P.x) - 6, y: Math.round(P.y) - 7, hx: P.x, hy: P.y - 4, ph: rng.next() * 6 };
  });
  const sp = W.renderSpill(m);
  put('spill', sp.pix); T.spill = { x: sp.x + pad, y: sp.y };
  put('guard', A.makeGuard()); put('shadow9', A.shadowBlob(9));
  T.guards = [-1, 1].map((sd, i) => {
    const gx = sd * 4.5, gz = -Math.sqrt(R0 * R0 - gx * gx) - 0.9, P = at(gx, 0, gz), top = Math.round(P.y) - 16;
    return { x: Math.round(P.x) - 5, y: top, sx: Math.round(P.x) - 4.5 + 0.5, sy: Math.round(P.y) - 1, flip: sd < 0, ex: Math.round(P.x) - 5 + 4.5, ey: top + 5.5, ph: i * 1.7 };
  });
  put('hero0', A.makeHeroBack(0)); put('hero1', A.makeHeroBack(1));
  const hp = at(1.15, 0, -(R0 + WORLD.HERO_Z));
  T.hero = { x: Math.round(hp.x) - 6, y: Math.round(hp.y) - 14, sx: Math.round(hp.x) - 4.5, sy: Math.round(hp.y) - 1 };
  const dr = W.doorRect(m);
  T.door = { x: dr.x0 + pad, y: dr.y0, n: 6 };
  for (let i = 1; i <= 6; i++) put('door' + i, W.renderWorld(m, 0, { x0: dr.x0, y0: dr.y0, x1: dr.x1, y1: dr.y1, door: i / 6, noOutline: true }).pix);
  const mid = at(0, WORLD.DOOR_H * 0.5, -R0);
  T.doorMid = { x: mid.x, y: mid.y };

  // ---- bats, crows, trees, mist
  put('bat0', A.makeBat(0)); put('bat1', A.makeBat(1)); put('crow0', A.makeCrow(0)); put('crow1', A.makeCrow(1));
  const th = Math.round(m.H * 0.3), th2 = Math.round(m.H * 0.24);
  put('treeL', A.makeDeadTree(th, 4)); put('treeR', A.makeDeadTree(th2, 8, true));
  T.trees = [{ key: 'treeL', x: X(-2), y: m.H - th - 1 }, { key: 'treeR', x: X(m.W - Math.round(th2 * 0.8) + 2), y: m.H - th2 }];
  const fw = m.W + pad * 2;
  T.fw = fw;
  T.fogs = [
    { y: Math.round(horizon) - 8, a: 0.4, sp: 2.2, seed: 1, h: 16, L: 'fore' },
    { y: m.H - 13, a: 0.45, sp: -1.8, seed: 2, h: 14, L: 'fore' },
    { y: Math.round(horizon) + 4, a: 0.38, sp: -3.4, seed: 3, h: 20, L: 'back' },
    { y: Math.round(horizon * 0.8 + m.H * 0.18), a: 0.3, sp: 4.6, seed: 4, h: 22, L: 'back' },
  ].map((f, i) => ({ ...f, key: put('fog' + i, A.makeFog(fw, f.h, f.seed)) }));

  // ---- beacon: a dithered shaft climbing the Tower's axis, and the gem
  const b = m.beacon, far = project(cam, 0, 5000, 0), bp = new Pix(m.W + pad * 2, m.H);
  const x0 = b.x, y0 = b.y, len = Math.max(1, y0 * 0.75), dxdy = (far.x - x0) / (far.y - y0);
  for (let y = Math.floor(y0) - 3; y >= 0; y--) {
    const u = (y0 - y) / len, a = Math.max(0, 1 - u) ** 1.7, x = Math.round(x0 + dxdy * (y - y0)) + pad;
    if (a * 1.05 > BAYER[((y & 3) << 2) | (x & 3)]) bp.set(x, y, '#9ff8e8');
    if (a * 0.55 > BAYER[(((y + 2) & 3) << 2) | ((x + 1) & 3)]) { bp.set(x - 1, y, '#4fe8cf'); bp.set(x + 1, y, '#4fe8cf'); }
  }
  put('beam', bp);
  put('gem', Pix.fromRows(['..T..', '.TWT.', 'TWWWT', '.TWT.', '..T..'], { T: '#6ff0d6', W: '#f2fffb' }));
  T.beacon = { x: b.x + pad, y: b.y };
  T.files = files;
  writeFileSync(join(out, 'data/title.json'), JSON.stringify(T) + '\n');
  return Object.keys(files).length;
}
