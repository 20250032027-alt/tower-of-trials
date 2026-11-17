import test from 'node:test';
import assert from 'node:assert/strict';
import { titleMetrics, litTiers, project, rayDir, TIERS, WORLD, towerR, tierBase, tierTop, TOWER_H, APEX_Y, HERO_POS } from '../src/logic/titlelayout.js';
import { renderWorld, renderSky, WINDOWS, doorRect, starField } from '../src/art/titleworld.js';
import { makeRng } from '../src/logic/rng.js';

const SIZES = [[844, 390], [390, 844], [1100, 640], [1366, 768], [390, 700], [320, 568], [1920, 1080], [600, 600], [2560, 1080]];

test('the zoom is a whole number and the picture always covers the screen', () => {
  for (const [w, h] of SIZES) {
    const m = titleMetrics(w, h);
    assert.ok(Number.isInteger(m.Z) && m.Z >= 2 && m.Z <= 6, `${w}x${h} Z=${m.Z}`);
    assert.ok(m.W * m.Z >= w && m.H * m.Z >= h);
  }
});

test('the whole composition fits: hero, gate and beacon are on screen at every size', () => {
  for (const [w, h] of SIZES) {
    const m = titleMetrics(w, h), pad = 4;
    for (const [name, p] of [['hero', m.hero], ['beacon', m.beacon], ['door foot', m.door.foot], ['door top', m.door.top]]) {
      assert.ok(p.x > pad && p.x < m.W - pad && p.y > pad && p.y < m.H - pad, `${w}x${h} ${name} at ${p.x.toFixed(1)},${p.y.toFixed(1)} of ${m.W}x${m.H}`);
    }
    assert.ok(m.beacon.y < m.door.top.y, 'the beacon is above the gate');
    assert.ok(m.hero.y > m.door.foot.y, 'the hero stands in front of the gate (lower on screen)');
    assert.ok(m.door.foot.y - m.door.top.y >= 14, `${w}x${h} the gate is big enough to read (${(m.door.foot.y - m.door.top.y).toFixed(1)}px)`);
  }
});

test('landscape puts the tower on the left (menu goes right); portrait keeps it near the middle with room for the logo', () => {
  const l = titleMetrics(844, 390), p = titleMetrics(390, 844);
  assert.ok(!l.portrait && l.hero.x < l.W * 0.4);
  assert.ok(p.portrait && Math.abs(p.hero.x - p.W / 2) < p.W * 0.1);
  assert.ok(p.beacon.y > p.H * 0.2, 'portrait leaves the top for the logo');
});

test('the camera is tilted: the Tower leans across the screen (a Dutch angle) instead of standing straight', () => {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const m = titleMetrics(w, h);
    assert.ok(Math.abs(m.cam.roll) > 0.1, 'rolled');
    assert.ok(Math.abs(m.beacon.x - m.hero.x) > m.W * 0.04, `${w}x${h}: the top is displaced sideways from the foot`);
  }
  const l = titleMetrics(844, 390);
  assert.ok(l.beacon.x > l.hero.x, 'in landscape it leans toward the menu side');
});

test('it is a low angle: the shaft converges (higher storeys are drawn narrower than their real width ratio)', () => {
  const m = titleMetrics(390, 844);
  const width = (i) => {
    const y = (tierBase(i) + tierTop(i)) / 2, r = towerR(i);
    const a = project(m.cam, -r, y, 0), b = project(m.cam, r, y, 0);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  assert.ok(width(10) < width(0) * 0.5, `top ${width(10).toFixed(1)}px vs base ${width(0).toFixed(1)}px`);
});

test('project() and rayDir() are inverses (the ray-caster and the sprites agree on where things are)', () => {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const m = titleMetrics(w, h), d = [0, 0, 0];
    for (const P of [[1.3, 7, -3], [-2, 12, 0], [0.5, 3, -9]]) {
      const s = project(m.cam, ...P);
      rayDir(m.cam, s.x, s.y, d);
      const t = (P[1] - WORLD.CAM_H) / d[1];
      assert.ok(Math.abs(d[0] * t - P[0]) < 1e-6 && Math.abs(-WORLD.CAM_D + d[2] * t - P[2]) < 1e-6);
    }
  }
});

test('the tower is built from exactly 11 storeys that narrow as they climb', () => {
  assert.equal(TIERS, 11);
  let prev = Infinity;
  for (let i = 0; i < TIERS; i++) { assert.ok(towerR(i) < prev); prev = towerR(i); if (i) assert.ok(Math.abs(tierBase(i) - tierTop(i - 1)) < 1e-9); }
  assert.equal(TOWER_H, tierTop(TIERS - 1));
  assert.ok(APEX_Y > TOWER_H);
  assert.ok(HERO_POS[2] < -towerR(0), 'the hero stands outside the wall');
});

test('windows light up with progress: one storey per cleared dungeon, capped at 11', () => {
  assert.equal(litTiers(null), 0);
  assert.equal(litTiers({}), 0);
  assert.equal(litTiers({ cleared_trial: true, tutMoved: true }), 1);
  assert.equal(litTiers({ cleared_trial: true, cleared_main: true, cleared_bone_hall: false }), 2);
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['cleared_d' + i, true]));
  assert.equal(litTiers(many), 11);
});

test('the ray-caster draws a solid tower with a gate, lit windows for progress and transparent sky', () => {
  const m = titleMetrics(390, 844);
  const { pix, windows } = renderWorld(m, 3);
  const at = (x, y) => pix.data[((Math.round(y)) * pix.w + Math.round(x + m.pad)) * 4 + 3];
  assert.equal(at(m.hero.x, m.hero.y), 255, 'the paving is solid');
  assert.equal(at(m.door.foot.x, (m.door.foot.y + m.door.top.y) / 2), 255, 'the gate is solid');
  assert.equal(at(m.W * 0.08, m.H * 0.1), 0, 'the sky is left transparent');
  assert.equal(windows.length, WINDOWS.length);
  const lit = windows.filter((w) => w.lit), next = windows.filter((w) => w.next);
  assert.ok(lit.length > 0 && lit.every((w) => w.tier < 3));
  assert.ok(next.every((w) => w.tier === 3));
  assert.ok(windows.some((w) => w.lit && w.vis), 'some lit windows are visible to the camera');
  const none = renderWorld(m, 0).windows;
  assert.equal(none.filter((w) => w.lit).length, 0);
});

test('the gate frames: an open gate shows warm light where the doors were', () => {
  const m = titleMetrics(390, 844), r = doorRect(m);
  const closed = renderWorld(m, 0, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, door: 0, noOutline: true }).pix;
  const open = renderWorld(m, 0, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, door: 1, noOutline: true }).pix;
  const cx = Math.round(m.door.foot.x - r.x0), cy = Math.round((m.door.foot.y + m.door.top.y) / 2 - r.y0), i = (cy * closed.w + cx) * 4;
  assert.ok(closed.data[i] < 140 && open.data[i] > 200, `closed r=${closed.data[i]}, open r=${open.data[i]}`);
  assert.equal(closed.data[i + 3], 255);
});

test('sky layers and the star field are deterministic and keep stars off the horizon and the moon', () => {
  const m = titleMetrics(844, 390);
  const sky = renderSky(m, 0), far = renderSky(m, 1);
  assert.equal(sky.w, m.W + m.pad * 2);
  assert.ok(sky.data[3] === 255, 'the sky is opaque');
  assert.ok(far.data.some((v, i) => i % 4 === 3 && v === 0) && far.data.some((v, i) => i % 4 === 3 && v === 255), 'mountains cover only part of the picture');
  const a = starField(m, makeRng(5)), b = starField(m, makeRng(5));
  assert.deepEqual(a, b);
  assert.ok(a.length > 20);
  for (const s of a) assert.ok(Math.hypot(s.x - m.moon.x, s.y - m.moon.y) >= m.moon.r * 1.9);
});
