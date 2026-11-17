// The animated vista behind the title menu: a low-angle, tilted (Dutch angle) view up the Tower. The sky, the Tower and the
// paving are ray-cast once into pixel buffers (art/titleworld.js); this file adds the living parts on top - parallax,
// twinkling stars, a blood moon, storm clouds with lightning and thunder, crows crossing the sky, a skeleton march on the
// far ridge, a graveyard with wisps and watching eyes, torches, lit windows, a beacon beam, skeleton guards, the hero, bats that
// orbit the spire (passing behind and in front of it), rolling mist, ash and embers. `enter()` plays the "gate opens, camera
// pushes in" sequence.
import Phaser from 'phaser';
import { titleMetrics, litTiers, project, rayDir, WORLD, towerR, BEACON_POS, APEX_Y } from '../logic/titlelayout.js';
import * as A from '../art/titlescene.js';
import * as W from '../art/titleworld.js';
import { Pix } from '../art/pixel.js';
import { makeRng } from '../logic/rng.js';
import { loadProfile } from '../logic/progression.js';
import { sfx } from '../game/sfx.js';
import { music } from '../game/music.js';

const AMP = { sky: 1.4, far: 3, near: 5, back: 8, stage: 8, fore: 13 };
const DEPTH = { sky: 0, far: 2, near: 4, back: 5, stage: 6, fore: 8 };
const PHI0 = -Math.PI / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const makeRngLocal = (rng) => () => rng.next();
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class TitleBackdrop {
  constructor(scene) {
    this.s = scene;
    this.keys = []; this.objs = []; this.tweens = [];
    this.t = 0; this.px = 0; this.entering = false;
    this.calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.build();
    this.onResize = () => { if (!this.entering) this.build(); };
    scene.scale.on('resize', this.onResize);
  }

  tex(key, pix) {
    const s = this.s;
    if (s.textures.exists(key)) s.textures.remove(key);
    s.textures.addCanvas(key, pix.toCanvas());
    this.keys.push(key);
    return key;
  }
  clear() {
    for (const t of this.tweens) if (t && t.stop) t.stop();
    this.tweens = [];
    for (const o of this.objs) if (o && o.destroy) o.destroy();
    this.objs = [];
    for (const k of this.keys) if (this.s.textures.exists(k)) this.s.textures.remove(k);
    this.keys = [];
  }

  /** Where the ground is under picture point (sx, sy) (unpadded): its range along the ray, or null above the horizon. */
  groundAt(sx, sy) {
    const d = rayDir(this.m.cam, sx + 0.5, sy + 0.5, [0, 0, 0]);
    if (d[1] > -0.02) return null;
    const t = WORLD.CAM_H / -d[1];
    return { x: d[0] * t, z: d[2] * t - WORLD.CAM_D, t };
  }

  /** A point of the world on the picture, in padded layer coordinates. */
  at(x, y, z) { const p = project(this.m.cam, x, y, z); return { x: p.x + this.m.pad, y: p.y, z: p.z }; }

  // ------------------------------------------------------------------ build
  build() {
    const s = this.s;
    this.clear();
    const sw = s.scale.width, sh = s.scale.height;
    const m = this.m = titleMetrics(sw, sh), Z = m.Z, pad = m.pad, cam = m.cam;
    const rng = makeRng(20260601);
    const lit = litTiers((loadProfile() || {}).flags);
    s.cameras.main.setZoom(1).setRotation(0).setScroll(0, 0).setBackgroundColor(0x0a0814);
    s.cameras.main.resetFX && s.cameras.main.resetFX();

    const C = {};
    for (const k of Object.keys(DEPTH)) { C[k] = s.add.container(0, 0).setDepth(DEPTH[k]); this.objs.push(C[k]); }
    this.C = C;
    const add = (layer, key, x, y, o = {}) => {
      const im = s.add.image(x * Z, y * Z, key).setOrigin(o.ox == null ? 0 : o.ox, o.oy == null ? 0 : o.oy).setScale(o.sx == null ? Z : o.sx, o.sy == null ? Z : o.sy);
      if (o.add) im.setBlendMode(Phaser.BlendModes.ADD);
      if (o.tint != null) im.setTint(o.tint);
      if (o.alpha != null) im.setAlpha(o.alpha);
      if (o.flip) im.setFlipX(true);
      C[layer].add(im);
      return im;
    };
    this.add = add;
    const X = (x) => x + pad;                              // picture x -> padded layer x
    const horizon = project(cam, 0, WORLD.CAM_H, 5000).y;    // where the sky meets the land on the picture
    this.horizonY = horizon;

    // ---- sky, stars, clouds, ranges
    add('sky', this.tex('tt_sky', W.renderSky(m, 0)), 0, 0);
    this.tex('tt_px', A.px1()); this.tex('tt_star_big', A.starBig());
    this.stars = W.starField(m, rng).map((st) => ({ ...st, im: add('sky', st.big ? 'tt_star_big' : 'tt_px', X(st.x) - (st.big ? 1 : 0), st.y - (st.big ? 1 : 0), { tint: parseInt(st.c.slice(1), 16) }) }));
    this.tilt = Math.tan(cam.roll);                        // clouds drift along the tilted horizon
    this.clouds = [[44, 9, 0.62, 3.2], [66, 11, 0.8, 2.1], [30, 7, 0.9, 4.2]].map(([w, h, yy, sp], i) => {
      const by = Math.round(Math.max(6, horizon * yy) - 9), x0 = rng.int(0, m.W);
      return { im: add('sky', this.tex('tt_cloud' + i, A.makeCloud(w, h, 40 + i)), x0, by, { alpha: 0.85 }), w, sp, by, x: x0 };
    });
    this.shoot = { next: 2.5 + rng.next() * 4 };
    // the blood moon breathes: a wide red halo that swells and shrinks, very slowly
    const mr = m.moon.r, mg = Z * (mr * 6.4) / 48;
    this.moonGlow = add('sky', 'fx_glow', X(m.moon.x), m.moon.y, { ox: 0.5, oy: 0.5, sx: mg, sy: mg, add: true, tint: 0xff2a22, alpha: 0.2, mg });

    // storm clouds massing in the open sky, with a lit twin of each that fades in when lightning strikes
    this.storm = [[0.44, 0.19, 0.012, -1.7], [0.3, 0.14, 0.03, -2.6], [0.24, 0.16, 0.2, -1.2], [0.36, 0.2, 0.34, -2.1]].map(([wf, hf, yf, sp], i) => {
      const w = Math.max(40, Math.round(m.W * wf)), h = Math.max(14, Math.min(30, Math.round(m.H * hf)));
      const dark = this.tex('tt_storm' + i, A.makeStormCloud(w, h, 11 + i * 5)), litK = this.tex('tt_storml' + i, A.makeStormCloud(w, h, 11 + i * 5, true));
      const x0 = Math.round(m.W * (0.04 + 0.28 * i) + rng.int(-6, 6)), by = Math.round(m.H * yf);
      return { im: add('sky', dark, x0, by), lit: add('sky', litK, x0, by, { alpha: 0 }), w, h, sp, by, x: x0 };
    });
    this.bolt = { im: null, t: 99, next: this.calm ? 1e9 : 3.4 + rng.next() * 2.2, n: 0 };
    this.flashIm = s.add.image(0, 0, 'tt_px').setOrigin(0, 0).setDisplaySize(sw, sh).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8aa0ff).setAlpha(0).setDepth(15);
    this.objs.push(this.flashIm);

    const farPix = W.renderSky(m, 1);
    add('far', this.tex('tt_mtn0', farPix), 0, 0);
    add('near', this.tex('tt_mtn1', W.renderSky(m, 2)), 0, 0);
    // where the far ridge is, column by column, so things can stand on it
    const ridge = new Int16Array(m.W + m.pad * 2);
    for (let x = 0; x < ridge.length; x++) { let y = 0; while (y < m.H && !farPix.solid(x, y)) y++; ridge[x] = y; }
    this.ridge = ridge;
    // a broken watchtower with one lit window, and a slow column of skeletons with lanterns marching toward the Tower
    this.tex('tt_ruin', A.makeRuin());
    const rx = Math.round(m.W * 0.6) + m.pad;
    add('far', 'tt_ruin', rx, ridge[rx + 8] - 11);
    this.ruinGlow = add('far', 'fx_glow', rx + 5.5, ridge[rx + 8] - 7, { ox: 0.5, oy: 0.5, sx: Z * 0.5, sy: Z * 0.5, add: true, tint: 0xff8a30, alpha: 0.4 });
    for (const k of [0, 1, 2]) for (const f of [0, 1]) this.tex(`tt_march${k}${f}`, A.makeMarcher(f, k));
    const N = m.portrait ? 6 : 10, gap = m.portrait ? 12 : 13;
    this.march = { x: m.W * (m.portrait ? 0.62 : 0.56) + m.pad, gap, sp: 3.2, units: Array.from({ length: N }, (_, i) => {
      const kind = i % 3 === 1 ? 1 : i % 3 === 0 ? 0 : 2;
      return { im: add('far', `tt_march${kind}0`, 0, 0), kind, ph: rng.next() * 3, glow: kind === 1 ? add('far', 'fx_glow', 0, 0, { ox: 0.5, oy: 0.5, sx: Z * 0.2, sy: Z * 0.2, add: true, tint: 0xffa040, alpha: 0.7 }) : null, off: i * gap + rng.int(-2, 2) };
    }) };

    // ---- the ray-cast tower + paving
    const world = W.renderWorld(m, lit);
    this.world = world;
    this.worldIm = add('stage', this.tex('tt_world', world.pix), 0, 0);
    // beacon beam: a thin dithered shaft of light climbing the Tower's own axis toward the zenith
    this.beacon = this.buildBeacon(add, X);

    // lit-window glow (only windows the camera can actually see)
    this.glows = world.windows.filter((w) => (w.lit || w.next) && w.vis).map((w) => {
      const d = Math.max(5, w.w * 2.6 + 4), sc = Z * d / 48;
      return { w, im: add('stage', 'fx_glow', X(w.x), w.y, { ox: 0.5, oy: 0.5, sx: sc, sy: sc, add: true, tint: w.lit ? 0xffc860 : 0xffd890, alpha: 0 }), ph: rng.next() * 6 };
    });

    // ---- the graveyard on the open ground to the right: stones, crosses and broken pillars standing on the ground plane
    // (sizes are whole-pixel sprites picked by distance, never scaled), soul-flames hovering over a few, red eyes in the dark
    this.graves = []; this.wisps = [];
    {
      const tried = [], gr = makeRngLocal(rng);
      const cache = new Map();
      for (let i = 0; i < 400 && this.graves.length < (m.portrait ? 16 : 30); i++) {
        const sx = m.W * (m.portrait ? 0.04 + gr() * 0.92 : 0.43 + gr() * 0.56), sy = horizon + 6 + gr() * (m.H - horizon - 12);
        const g = this.groundAt(sx, sy);
        if (!g) continue;
        const kind = Math.floor(gr() * 3), hw = 1.0 + gr() * 0.9, h = Math.round(cam.F * hw / g.t);
        if (h < 4 || h > (m.portrait ? 18 : 24)) continue;
        if (Math.abs(g.x) < 4.4 && g.z < 0) continue;        // keep the path to the gate clear
        if (tried.some((q) => Math.hypot((q.x - sx) * 1.0, (q.y - sy) * 1.7) < Math.max(9, h * 1.2))) continue;
        if (!m.portrait && (sx < m.W * 0.44 || (sy < horizon + 4))) continue;
        if (m.portrait && sy > m.H * 0.9) continue;
        tried.push({ x: sx, y: sy });
        const key = `tt_grave${kind}_${h}`;
        if (!cache.has(key)) cache.set(key, this.tex(key, A.makeGrave(h, kind)));
        this.graves.push({ x: sx, y: sy, h, kind, key });
      }
      this.graves.sort((a, b) => a.y - b.y);
      for (const g of this.graves) {
        const w = Math.max(3, Math.round(g.h * (g.kind === 1 ? 0.8 : 0.66))) + 2;
        const sw2 = Math.round(w * 1.5), sk = `tt_gshadow${sw2}`;
        if (!cache.has(sk)) cache.set(sk, this.tex(sk, A.shadowBlob(sw2)));
        add('stage', sk, Math.round(X(g.x)) - Math.round(sw2 / 2), Math.round(g.y) - 1);
        add('stage', g.key, Math.round(X(g.x)) - Math.round(w / 2), Math.round(g.y) - g.h - 1);
      }
      this.tex('tt_wisp', A.px1());
      const picks = this.graves.filter((g, i) => g.h >= 6 && i % 3 === 0).slice(0, m.portrait ? 3 : 6);
      this.wisps = picks.map((g) => ({
        x: X(g.x), y: g.y - g.h - 5, ph: gr() * 6.28,
        halo: add('stage', 'fx_glow', 0, 0, { ox: 0.5, oy: 0.5, sx: Z * 0.34, sy: Z * 0.34, add: true, tint: 0x6ff0d6, alpha: 0.5 }),
        core: add('stage', 'tt_wisp', 0, 0, { tint: 0xd8fff6 }),
      }));
      // pairs of red eyes that open and close out in the dark
      this.eyes = Array.from({ length: m.portrait ? 3 : 5 }, (_, i) => ({
        a: add('stage', 'tt_wisp', 0, 0, { tint: 0xff3a30, alpha: 0 }), b: add('stage', 'tt_wisp', 0, 0, { tint: 0xff3a30, alpha: 0 }),
        halo: add('stage', 'fx_glow', 0, 0, { ox: 0.5, oy: 0.5, sx: Z * 0.2, sy: Z * 0.2, add: true, tint: 0xff2a20, alpha: 0 }),
        t: gr() * 6, open: false, x: 0, y: 0, i,
      }));
    }

    // ---- the gate: torches either side, light on the steps, guards, the hero
    const R0 = towerR(0), tOff = WORLD.DOOR_HW + 1.2;
    this.torches = [-1, 1].map((sd) => {
      const phi = PHI0 + sd * tOff / R0, P = this.at(R0 * Math.cos(phi), 2.7, R0 * Math.sin(phi));
      const im = add('stage', 'o_torch_0', Math.round(P.x) - 6, Math.round(P.y) - 7);
      const halo = add('stage', 'fx_glow', P.x, P.y - 4, { ox: 0.5, oy: 0.5, sx: Z * 0.62, sy: Z * 0.62, add: true, tint: 0xff9a3a, alpha: 0.6 });
      return { im, halo, x: P.x, y: P.y - 4, ph: rng.next() * 6, nextEmber: rng.next() };
    });
    const sp = W.renderSpill(m);
    this.spill = add('stage', this.tex('tt_spill', sp.pix), sp.x + pad, sp.y, { add: true, alpha: 0 });

    this.tex('tt_guard', A.makeGuard()); this.tex('tt_shadow', A.shadowBlob(9));
    this.guards = [-1, 1].map((sd, i) => {
      const gx = sd * 4.5, gz = -Math.sqrt(R0 * R0 - gx * gx) - 0.9, P = this.at(gx, 0, gz);
      add('stage', 'tt_shadow', Math.round(P.x) - 4.5 + 0.5, Math.round(P.y) - 1);
      const gyTop = Math.round(P.y) - 16;
      const im = add('stage', 'tt_guard', Math.round(P.x) - 5, gyTop, { flip: sd < 0 });
      const eye = add('stage', 'fx_glow', Math.round(P.x) - 5 + (sd < 0 ? 4.5 : 4.5), gyTop + 5.5, { ox: 0.5, oy: 0.5, sx: Z * 0.13, sy: Z * 0.13, add: true, tint: 0xff4a3a, alpha: 0.5 });
      return { im, eye, y: gyTop, ph: i * 1.7 };
    });
    this.tex('tt_hero0', A.makeHeroBack(0)); this.tex('tt_hero1', A.makeHeroBack(1));
    const hp = this.at(1.15, 0, -(R0 + WORLD.HERO_Z));        // a little off the centreline, so the gate stays in view
    add('stage', 'tt_shadow', Math.round(hp.x) - 4.5, Math.round(hp.y) - 1);
    this.hero = { im: add('stage', 'tt_hero0', Math.round(hp.x) - 6, Math.round(hp.y) - 14), y: Math.round(hp.y) - 14, frame: 0 };

    // ---- bats orbit the crown in 3D: they swing behind the spire (back layer) and in front of it (stage layer)
    this.tex('tt_bat0', A.makeBat(0)); this.tex('tt_bat1', A.makeBat(1));
    this.bats = [0, 1, 2, 3].map((i) => ({ im: add('stage', 'tt_bat0', 0, 0), rad: 7.5 + (i % 3) * 1.6, yy: APEX_Y - 11 + i * 2.4, sp: 0.5 + i * 0.13, ph: i * 1.7, f: 0, layer: 'stage' }));

    // ---- a flock of crows now and then crosses the sky (in front of the moon, behind the Tower)
    this.tex('tt_crow0', A.makeCrow(0)); this.tex('tt_crow1', A.makeCrow(1));
    this.flock = { next: 4.5, crows: Array.from({ length: 8 }, (_, i) => ({ im: add('back', 'tt_crow0', 0, 0, { alpha: 0 }), i, on: false, f: 0 })), x: 0, y: 0, dir: -1, live: false };

    // ---- foreground: dead trees framing the corners, mist, motes
    const th = Math.round(m.H * 0.3);
    add('fore', this.tex('tt_treeL', A.makeDeadTree(th, 4)), X(-2), m.H - th - 1);
    const th2 = Math.round(m.H * 0.24);
    add('fore', this.tex('tt_treeR', A.makeDeadTree(th2, 8, true)), X(m.W - Math.round(th2 * 0.8) + 2), m.H - th2);
    const fw = m.W + m.pad * 2;
    this.fogs = [
      { y: Math.round(horizon) - 8, a: 0.4, sp: 2.2, seed: 1, h: 16, L: 'fore' },
      { y: m.H - 13, a: 0.45, sp: -1.8, seed: 2, h: 14, L: 'fore' },
      { y: Math.round(horizon) + 4, a: 0.38, sp: -3.4, seed: 3, h: 20, L: 'back' },     // two more banks roll through behind the Tower
      { y: Math.round(horizon * 0.8 + m.H * 0.18), a: 0.3, sp: 4.6, seed: 4, h: 22, L: 'back' },
    ].map((f, i) => {
      const k = this.tex('tt_fog' + i, A.makeFog(fw, f.h, f.seed));
      return { ...f, a1: add(f.L, k, 0, f.y, { alpha: f.a }), a2: add(f.L, k, fw, f.y, { alpha: f.a }), x: 0, fw };
    });
    this.pool = Array.from({ length: 96 }, () => { const im = add('fore', 'tt_px', 0, 0, { alpha: 0 }); return { im, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, ember: false }; });
    this.moteT = 0;

    const vg = s.add.image(sw / 2, sh / 2, 'fx_vignette').setDisplaySize(sw * 1.04, sh * 1.04).setDepth(20).setAlpha(0.6);
    this.objs.push(vg);
    this.shiftLayers(0);
  }

  buildBeacon(add, X) {
    const m = this.m, Z = m.Z, b = m.beacon;
    const far = project(m.cam, 0, 5000, 0);                // the vanishing point of "straight up"
    const w = m.W + m.pad * 2, h = m.H, p = new Pix(w, h);
    const x0 = b.x, y0 = b.y, len = Math.max(1, y0 * 0.75);
    const dxdy = (far.x - x0) / (far.y - y0);              // screen x change per screen y (negative y = up)
    for (let y = Math.floor(y0) - 3; y >= 0; y--) {
      const u = (y0 - y) / len, a = Math.max(0, 1 - u) ** 1.7;
      const x = Math.round(x0 + dxdy * (y - y0)) + m.pad;
      if (a * 1.05 > BAYER[((y & 3) << 2) | (x & 3)]) p.set(x, y, '#9ff8e8');
      if (a * 0.55 > BAYER[(((y + 2) & 3) << 2) | ((x + 1) & 3)]) { p.set(x - 1, y, '#4fe8cf'); p.set(x + 1, y, '#4fe8cf'); }
    }
    this.tex('tt_beam', p);
    const beam = add('stage', 'tt_beam', 0, 0, { add: true, alpha: 0.7 });
    const gx = b.x + m.pad, gy = b.y;
    this.tex('tt_gem', Pix.fromRows(['..T..', '.TWT.', 'TWWWT', '.TWT.', '..T..'], { T: '#6ff0d6', W: '#f2fffb' }));
    const gem = add('stage', 'tt_gem', Math.round(gx) - 2, Math.round(gy) - 2);
    return {
      beam, gem,
      glow: add('stage', 'fx_glow', gx, gy, { ox: 0.5, oy: 0.5, sx: Z * 0.5, sy: Z * 0.5, add: true, tint: 0x4fe8cf, alpha: 0.6 }),
      ring: add('stage', 'fx_ring', gx, gy, { ox: 0.5, oy: 0.5, sx: 0, sy: 0, add: true, tint: 0x6ff0d6, alpha: 0 }),
      next: 1.5,
    };
  }

  // ------------------------------------------------------------------ per frame
  shiftLayers(px) {
    const { Z, pad } = this.m;
    for (const k of Object.keys(AMP)) this.C[k].x = (-pad + Math.round(px * AMP[k])) * Z;
  }

  spawn(x, y, vx, vy, life, color, ember) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    Object.assign(p, { x, y, vx, vy, life, max: life, ember });
    p.im.setTint(color);
  }

  update(time, delta) {
    if (!this.m) return;
    const dt = Math.min(0.05, delta / 1000), Z = this.m.Z, m = this.m;
    this.t += dt;
    const t = this.t;

    // parallax: follows the pointer / finger, with a slow idle drift so it is never dead still
    if (!this.entering && !this.calm) {
      const ptr = this.s.input.activePointer;
      const moved = ptr && (ptr.x || ptr.y);
      const target = (moved ? clamp((ptr.x / this.s.scale.width - 0.5) * 2, -1, 1) : 0) + Math.sin(t * 0.21) * 0.28;
      this.px += (target - this.px) * Math.min(1, dt * 2.4);
      this.shiftLayers(this.px);
    }

    // moon breathes; storm clouds drift; lightning; crows; the march on the ridge; wisps and eyes
    this.moonGlow.setAlpha(0.2 + 0.07 * Math.sin(t * 0.7));
    this.ruinGlow.setAlpha(0.32 + 0.1 * Math.sin(t * 5.3) + 0.06 * Math.sin(t * 13));
    this.updateStorm(dt);
    this.updateFlock(dt);
    this.updateMarch(dt);
    this.updateGround(dt);
    for (const st of this.stars) st.im.setAlpha(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph)));
    // clouds drift along the tilted horizon and wrap
    for (const c of this.clouds) {
      c.x += c.sp * dt;
      if (c.x > m.W + m.pad * 2) c.x = -c.w;
      c.im.setPosition(Math.round(c.x) * Z, Math.round(c.by + this.tilt * (c.x - m.W / 2)) * Z);
    }
    // shooting star now and then
    this.shoot.next -= dt;
    if (this.shoot.next <= 0 && !this.entering) {
      this.shoot.next = 8 + Math.random() * 9;
      const x0 = m.W * (0.15 + Math.random() * 0.7) + m.pad, y0 = 3 + Math.random() * this.horizonY * 0.3;
      for (let i = 0; i < 9; i++) {
        const peak = 0.95 - i * 0.09;
        const im = this.add('sky', 'tt_px', Math.round(x0 - i * 2.4), Math.round(y0 - i * 1.2), { tint: 0xffffff, alpha: 0 });
        this.tweens.push(this.s.tweens.add({ targets: im, alpha: 0, delay: (8 - i) * 30, duration: 300, onStart: () => im.setAlpha(peak), onComplete: () => im.destroy() }));
      }
    }
    for (const f of this.fogs) {
      f.x += f.sp * dt;
      if (f.x > f.fw) f.x -= f.fw; if (f.x < -f.fw) f.x += f.fw;
      f.a1.x = Math.round(f.x) * Z; f.a2.x = (Math.round(f.x) + f.fw * Math.sign(f.sp || 1) * -1) * Z;
    }

    // torches: flame frames, flickering halos, embers
    for (const q of this.torches) {
      q.im.setTexture(Math.floor(t * 6 + q.ph) % 2 ? 'o_torch_1' : 'o_torch_0');
      q.halo.setAlpha(this.entering ? 0.85 : 0.5 + 0.18 * Math.sin(t * 9 + q.ph) + 0.08 * Math.sin(t * 23 + q.ph * 3));
      q.nextEmber -= dt;
      if (q.nextEmber <= 0) { q.nextEmber = 0.16 + Math.random() * 0.3; this.spawn(q.x + (Math.random() - 0.5) * 2, q.y - 2, (Math.random() - 0.5) * 5, -(7 + Math.random() * 8), 0.8 + Math.random() * 0.9, Math.random() < 0.5 ? 0xff9a3c : 0xffd86a, true); }
    }
    for (const g of this.glows) {
      g.im.setAlpha(g.w.lit ? 0.42 + 0.12 * Math.sin(t * 2.3 + g.ph) + 0.06 * Math.sin(t * 7.1 + g.ph * 2) : 0.1 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.7 + g.ph)));
    }
    // beacon pulse + ring, beam shimmer
    const b = this.beacon;
    b.glow.setAlpha(0.45 + 0.25 * Math.sin(t * 2));
    b.beam.setAlpha(0.55 + 0.2 * Math.sin(t * 1.3));
    b.gem.setTint(Math.sin(t * 6) > 0.7 ? 0xffffff : 0xffffff);
    b.next -= dt;
    if (b.next <= 0) {
      b.next = 4;
      b.ring.setScale(Z * 0.1).setAlpha(0.7);
      this.tweens.push(this.s.tweens.add({ targets: b.ring, scaleX: Z * 0.9, scaleY: Z * 0.9, alpha: 0, duration: 1600, ease: 'Sine.easeOut' }));
    }
    for (const g of this.guards) {
      g.im.y = (g.y + (Math.sin(t * 1.5 + g.ph) > 0.55 ? 1 : 0)) * Z;
      if (!this.flare) g.eye.setAlpha(0.35 + 0.2 * Math.sin(t * 3 + g.ph));
    }
    const hf = Math.floor(t * 3.2) % 2;
    if (hf !== this.hero.frame) { this.hero.frame = hf; this.hero.im.setTexture('tt_hero' + hf); }
    // bats: a 3D orbit round the Tower's axis, projected through the same camera
    for (const bt of this.bats) {
      const a = t * bt.sp + bt.ph, wx = Math.cos(a) * bt.rad, wz = Math.sin(a) * bt.rad, wy = bt.yy + Math.sin(a * 2.3) * 1.3;
      const P = this.at(wx, wy, wz), back = wz > 0;
      const layer = back ? 'back' : 'stage';
      if (layer !== bt.layer) { bt.layer = layer; bt.im.parentContainer && bt.im.parentContainer.remove(bt.im); this.C[layer].add(bt.im); }
      bt.im.setPosition(Math.round(P.x - 2.5) * Z, Math.round(P.y - 1.5) * Z).setFlipX(Math.cos(a) * -1 > 0);
      const f = Math.floor(t * 9 + bt.ph * 3) % 2;
      if (f !== bt.f) { bt.f = f; bt.im.setTexture('tt_bat' + f); }
    }
    // particles: embers from the torches, teal soul motes rising from the paving
    this.moteT -= dt;
    if (this.moteT <= 0) { this.moteT = 0.35 + Math.random() * 0.5; this.spawn(Math.random() * m.W + m.pad, this.horizonY + 6 + Math.random() * (m.H - this.horizonY - 6) * 0.9, (Math.random() - 0.5) * 3, -(3 + Math.random() * 4), 3 + Math.random() * 3, Math.random() < 0.7 ? 0x6ff0d6 : 0x9fb4ff, false); }
    // ash and cinders blown across the whole picture on a steady wind, toward the Tower
    this.ashT = (this.ashT || 0) - dt;
    if (this.ashT <= 0) {
      this.ashT = 0.07 + Math.random() * 0.12;
      const warm = Math.random() < 0.22;
      this.spawn(Math.random() * (m.W + m.pad) + m.pad * 0.5, Math.random() * m.H * 0.75, -(9 + Math.random() * 11), 1.5 + Math.random() * 4.5, 5 + Math.random() * 5, warm ? 0xff8a3c : 0xb9aebd, false);
    }
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx += Math.sin(t * 3 + p.y) * 0.4 * dt;
      const k = p.life / p.max;
      const parent = p.ember ? this.C.stage : this.C.fore;
      if (p.im.parentContainer !== parent) { p.im.parentContainer && p.im.parentContainer.remove(p.im); parent.add(p.im); }
      p.im.setPosition(Math.round(p.x) * Z, Math.round(p.y) * Z).setAlpha(p.life > 0 ? (p.ember ? k : Math.min(1, k * 2, (1 - k) * 4) * 0.75) : 0);
    }
  }

  // ------------------------------------------------------------------ the storm
  updateStorm(dt) {
    const m = this.m, Z = m.Z, span = m.W + m.pad * 2;
    for (const c of this.storm) {
      c.x += c.sp * dt;
      if (c.x < -c.w) c.x = span + 4;
      c.cy = Math.round(c.by + this.tilt * (c.x - m.W / 2) * 0.5);
      c.im.setPosition(Math.round(c.x) * Z, c.cy * Z); c.lit.setPosition(Math.round(c.x) * Z, c.cy * Z);
    }
    const b = this.bolt;
    if (this.calm || this.entering) return;
    if (!b.im && !b.soft) {
      b.next -= dt;
      if (b.next <= 0) this.strike();
      return;
    }
    b.t += dt;
    const tt = b.t;
    const f1 = tt < 0.05 ? tt / 0.05 : Math.exp(-(tt - 0.05) * 7);                  // one soft flash, then a weaker after-flicker
    const f2 = tt > 0.26 ? 0.5 * Math.min(1, (tt - 0.26) / 0.03) * Math.exp(-(tt - 0.29) * 9) : 0;
    const fl = Math.max(f1, f2) * (b.soft ? 0.45 : 1);
    this.flashIm.setAlpha(b.soft ? 0 : 0.13 * fl);
    for (const c of this.storm) c.lit.setAlpha(Math.min(0.95, fl * 1.1));
    if (b.im) b.im.setAlpha(tt < 0.08 ? 1 : tt < 0.13 ? 0.3 : tt < 0.28 ? 0.95 : tt < 0.42 ? 0.95 * (1 - (tt - 0.28) / 0.14) : 0);
    if (tt > 1.3) {
      if (b.im) { b.im.destroy(); b.im = null; }
      b.soft = false; this.flashIm.setAlpha(0);
      for (const c of this.storm) c.lit.setAlpha(0);
      b.next = 7 + Math.random() * 8;
    }
  }

  /** A bolt falls from one of the clouds that is over the open sky; the thunder arrives a moment later. */
  strike(forceBolt) {
    const m = this.m, Z = m.Z, b = this.bolt;
    const vis = this.storm.filter((c) => { const cx = c.x + c.w / 2 - m.pad; return cx > m.W * 0.25 && cx < m.W * 0.97; });
    const c = vis.length ? vis[Math.floor(Math.random() * vis.length)] : this.storm[0];
    b.t = 0; b.soft = !forceBolt && Math.random() < 0.22;
    if (!b.soft) {
      const bx = Math.round(c.x + c.w * (0.3 + Math.random() * 0.4)), y0 = c.cy + c.h - 5;
      const ground = this.ridge[Math.max(0, Math.min(this.ridge.length - 1, bx))] || m.H * 0.6;
      const len = Math.max(14, Math.min(Math.round(m.H * 0.6), ground - y0 - 1 - Math.floor(Math.random() * 5)));
      const bolt = A.makeBolt(len, 1 + (b.n = (b.n || 0) + 1));
      const key = this.tex('tt_bolt', bolt.pix);
      b.im = this.add('sky', key, bx - bolt.ox, y0, { alpha: 0 });
    }
    const delay = (0.45 + Math.random() * 1.1) * 1000;
    this.s.time.delayedCall(delay, () => { if (!this.entering) sfx('thunder', { vol: b.soft ? 0.45 : 0.9 }); });
  }

  // ------------------------------------------------------------------ crows
  updateFlock(dt) {
    const m = this.m, Z = m.Z, fk = this.flock, t = this.t, span = m.W + m.pad * 2;
    if (!fk.live) {
      fk.next -= dt;
      if (fk.next > 0 || this.entering) return;
      fk.live = true; fk.dir = Math.random() < 0.8 ? -1 : 1;
      fk.x = fk.dir < 0 ? span + 14 : -14;
      fk.y = Math.random() < 0.55 ? m.moon.y + (Math.random() - 0.5) * m.moon.r * 1.5 : m.H * (0.32 + Math.random() * 0.2);   // across the moon, or low over the dusk glow, where they show
      fk.n = 5 + Math.floor(Math.random() * 4);
      fk.crows.forEach((c, i) => { c.dx = i * (3.5 + Math.random() * 3.5); c.dy = (Math.random() - 0.5) * 11 + Math.abs(i - fk.n / 2) * 0.6; c.on = i < fk.n; });
    }
    fk.x += fk.dir * 26 * dt;
    let any = false;
    for (const c of fk.crows) {
      if (!c.on) { c.im.setAlpha(0); continue; }
      const cx = fk.x - fk.dir * c.dx, cy = fk.y + c.dy + Math.sin(t * 1.6 + c.i) * 1.5 + (span / 2 - fk.x) * 0.02 * fk.dir;
      const f = Math.floor(t * 7 + c.i * 0.9) % 2;
      if (f !== c.f) { c.f = f; c.im.setTexture('tt_crow' + f); }
      c.im.setPosition(Math.round(cx - 3) * Z, Math.round(cy) * Z).setAlpha(1);
      if (cx > -16 && cx < span + 16) any = true;
    }
    if (!any && (fk.dir < 0 ? fk.x < span * 0.5 : fk.x > span * 0.5)) { fk.live = false; fk.next = 9 + Math.random() * 12; for (const c of fk.crows) c.im.setAlpha(0); }
  }

  // ------------------------------------------------------------------ the march on the far ridge
  updateMarch(dt) {
    const m = this.m, Z = m.Z, mc = this.march, t = this.t, R = this.ridge;
    mc.x -= mc.sp * dt;
    const last = mc.units[mc.units.length - 1].off;
    if (mc.x + last < -14) mc.x = m.W + m.pad + 12;   // (the column is long: it starts mid-picture, then loops from the right edge)
    for (const u of mc.units) {
      const xi = Math.round(mc.x + u.off);
      const vis = xi > 3 && xi < R.length - 3;
      u.im.setVisible(vis); if (u.glow) u.glow.setVisible(vis);
      if (!vis) continue;
      const f = Math.floor(t * 2.4 + u.ph) % 2, top = R[xi] - 8 + (f ? 0 : 1);
      u.im.setTexture(`tt_march${u.kind}${f}`).setPosition((xi - 3) * Z, top * Z);
      if (u.glow) u.glow.setPosition((xi + 1.5) * Z, (top + 0.5) * Z).setAlpha(0.55 + 0.2 * Math.sin(t * 8 + u.ph * 5));
    }
  }

  // ------------------------------------------------------------------ wisps over the graves, eyes in the dark
  updateGround(dt) {
    const m = this.m, Z = m.Z, t = this.t;
    for (const w of this.wisps) {
      const x = w.x + Math.sin(t * 0.9 + w.ph) * 1.6, y = w.y + Math.sin(t * 1.3 + w.ph * 2) * 1.8 - (Math.sin(t * 0.37 + w.ph) > 0.6 ? 1 : 0);
      w.core.setPosition(Math.round(x) * Z, Math.round(y) * Z).setAlpha(0.7 + 0.3 * Math.sin(t * 6 + w.ph));
      w.halo.setPosition(x * Z, y * Z).setAlpha(0.32 + 0.2 * Math.sin(t * 3.1 + w.ph));
    }
    for (const e of this.eyes) {
      e.t -= dt;
      if (e.t <= 0) {
        if (!e.open) {
          for (let k = 0; k < 20 && !e.open; k++) {
            const sx = m.W * (m.portrait ? Math.random() : Math.random() < 0.25 ? 0.02 + Math.random() * 0.14 : 0.46 + Math.random() * 0.5), sy = this.horizonY + 10 + Math.random() * (m.H - this.horizonY - 16);
            if (this.groundAt(sx, sy)) { e.x = Math.round(sx) + m.pad; e.y = Math.round(sy); e.open = true; e.age = 0; e.t = 2 + Math.random() * 2.5; }
          }
          if (!e.open) e.t = 1;
        } else { e.open = false; e.t = 3 + Math.random() * 6; }
      }
      const gap = e.y > m.H * 0.8 ? 4 : 3;
      let a = 0;
      if (e.open) { e.age += dt; a = Math.min(1, e.age / 0.3) * (e.t < 0.3 ? e.t / 0.3 : 1); if (Math.abs(e.age - 1.1) < 0.07) a = 0; }
      e.a.setPosition(e.x * Z, e.y * Z).setAlpha(a); e.b.setPosition((e.x + gap) * Z, e.y * Z).setAlpha(a);
      e.halo.setPosition((e.x + gap / 2 + 0.5) * Z, (e.y + 0.5) * Z).setAlpha(a * 0.55);
    }
  }

  // ------------------------------------------------------------------ the start sequence
  /** Guards flare, the gate swings open frame by frame, the camera pushes into the light (and levels out), then white and `done()`. */
  enter(done) {
    const s = this.s, m = this.m, Z = m.Z, cam = s.cameras.main, pad = m.pad;
    this.entering = true; this.flare = true;
    this.flashIm.setAlpha(0);
    music.stinger('start');
    sfx('crumble', { vol: 0.8 });
    for (const g of this.guards) this.tweens.push(s.tweens.add({ targets: g.eye, alpha: 1, scaleX: Z * 0.4, scaleY: Z * 0.4, duration: 380, ease: 'Cubic.easeOut' }));
    if (!this.calm) cam.shake(520, 0.0016);

    // the gate: pre-draw a few frames of the doors swinging inward and swap them in
    const r = W.doorRect(m), lit = litTiers((loadProfile() || {}).flags), N = 6;
    const frames = [];
    for (let i = 1; i <= N; i++) frames.push(this.tex('tt_door' + i, W.renderWorld(m, lit, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, door: i / N, noOutline: true }).pix));
    const door = this.add('stage', frames[0], r.x0 + pad, r.y0, { alpha: 0 });
    this.C.stage.moveTo(door, this.C.stage.getIndex(this.worldIm) + 1);   // behind the guards and the hero, in front of the wall
    frames.forEach((k, i) => s.time.delayedCall(340 + i * 120, () => { door.setTexture(k).setAlpha(1); if (i === 0) sfx('portal', { vol: 0.7 }); }));
    this.tweens.push(s.tweens.add({ targets: this.spill, alpha: 0.9, duration: 800, delay: 480 }));

    // push in on the gate
    const mid = this.at(0, WORLD.DOOR_H * 0.5, -towerR(0));
    const gx = this.C.stage.x + mid.x * Z, gy = this.C.stage.y + mid.y * Z;
    const dur = this.calm ? 500 : 1350, t0 = this.calm ? 200 : 520;
    s.time.delayedCall(t0, () => {
      cam.pan(gx, gy, dur, 'Cubic.easeIn');
      cam.zoomTo(this.calm ? 1.2 : 3.4, dur, 'Cubic.easeIn');
      if (!this.calm) this.tweens.push(s.tweens.add({ targets: cam, rotation: -m.cam.roll * 0.9, duration: dur, ease: 'Sine.easeInOut' }));   // the world rights itself as you step inside
    });
    s.time.delayedCall(t0 + dur - 280, () => cam.fadeOut(300, 255, 244, 214));
    s.time.delayedCall(t0 + dur + 60, () => done());
  }

  destroy() {
    this.s.scale.off('resize', this.onResize);
    this.clear();
  }
}
