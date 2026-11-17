import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/world.js';
import { ENEMIES } from '../src/data/enemies.js';
import { buildLayout } from '../src/logic/layout.js';
import { roomAt, hasLineOfSight, alertRate } from '../src/logic/awareness.js';
import { hashString } from '../src/logic/rng.js';

const TS = 16;
const dun = DUNGEONS.main || Object.values(DUNGEONS).find((d) => d.layout && d.layout.rooms.length > 3);
const L = buildLayout(dun.layout, hashString(dun.id || 'main'));
const centre = (r) => ({ x: (r.x + r.w / 2) * TS, y: (r.y + r.h / 2) * TS });

test('every enemy lives in a room and room lookup finds it', () => {
  for (const e of L.enemies) {
    assert.ok(e.room, 'enemy has a room id');
    assert.equal(roomAt(L, (e.x + 0.5) * TS, (e.y + 0.5) * TS, TS), e.room);
  }
});

test('corridor positions belong to no room', () => {
  // somewhere between two rooms on the first link there is floor outside any room box
  let found = false;
  for (let y = 0; y < L.h && !found; y++) for (let x = 0; x < L.w; x++) {
    if (L.tiles[y * L.w + x] <= 2 && roomAt(L, (x + 0.5) * TS, (y + 0.5) * TS, TS) === null) { found = true; break; }
  }
  assert.ok(found, 'dungeon has corridor tiles');
});

test('line of sight is blocked by walls, clear inside a room', () => {
  const r = L.rooms[0];
  const c = centre(r);
  assert.ok(hasLineOfSight(L, c.x - 8, c.y, c.x + 8, c.y, TS));
  // straight through the dungeon from one room to a far one must cross rock
  const far = L.rooms[L.rooms.length - 1];
  const f = centre(far);
  assert.equal(hasLineOfSight(L, c.x, c.y, f.x, f.y, TS), false);
});

test('suspicion builds faster when closer, fades when it cannot sense you', () => {
  const d = ENEMIES.skeleton_soldier;
  const near = alertRate({ sees: true, hears: false, dist: 30 }, d);
  const far = alertRate({ sees: true, hears: false, dist: 200 }, d);
  assert.ok(near > far && far > 0);
  assert.ok(far < 1.5, 'far away it takes about a second to notice');
  assert.ok(alertRate({ sees: false, hears: false, dist: 90 }, d) < 0);
  assert.ok(alertRate({ sees: false, hears: true, dist: 20 }, d) > 0, 'hears you right beside it');
});
