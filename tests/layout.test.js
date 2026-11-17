import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOORS, DUNGEONS } from '../src/data/world.js';
import { buildLayout, reachableFrom, generateRandomDef, isWall, pickRiftSpot } from '../src/logic/layout.js';
import { makeRng, hashString } from '../src/logic/rng.js';

function checkLayout(name, L, { allowUnreachable = () => false } = {}) {
  const seen = reachableFrom(L, L.spawn.x, L.spawn.y);
  const ok = (x, y) => seen[y * L.w + x] === 1;
  assert.ok(!isWall(L.tiles[L.spawn.y * L.w + L.spawn.x]), name + ' spawn in wall');
  for (const e of L.enemies) assert.ok(ok(e.x, e.y), `${name}: enemy at ${e.x},${e.y} unreachable`);
  for (const o of L.objects) {
    assert.ok(!isWall(L.tiles[o.y * L.w + o.x]), `${name}: ${o.type} at ${o.x},${o.y} inside wall`);
    if (!allowUnreachable(o)) assert.ok(ok(o.x, o.y), `${name}: ${o.type} at ${o.x},${o.y} unreachable`);
  }
}

test('floor layouts: everything reachable (hidden vault sealed by crack)', () => {
  for (const f of Object.values(FLOORS)) {
    const L = buildLayout(f.layout, hashString(f.id));
    checkLayout(f.id, L, { allowUnreachable: (o) => o.hidden });
    if (f.id === 'floor1') {
      const vault = L.objects.find((o) => o.hidden);
      assert.ok(vault, 'vault portal exists');
      const seen = reachableFrom(L, L.spawn.x, L.spawn.y);
      assert.equal(seen[vault.y * L.w + vault.x], 0, 'vault must be sealed');
      // open the crack -> vault becomes reachable
      const c = L.cracks[0];
      L.tiles[c.y * L.w + c.x] = 0;
      const seen2 = reachableFrom(L, L.spawn.x, L.spawn.y);
      assert.equal(seen2[vault.y * L.w + vault.x], 1, 'vault reachable after crack');
    }
  }
});

test('preset dungeons: everything reachable, enemy counts sane', () => {
  for (const d of Object.values(DUNGEONS)) {
    if (!d.layout) continue;
    const L = buildLayout(d.layout, hashString(d.id));
    checkLayout(d.id, L);
    const want = d.layout.rooms.reduce((a, r) => a + (r.enemies || 0), 0);
    assert.equal(L.enemies.length, want, d.id + ' enemy count');
    assert.ok(L.objects.some((o) => o.type === 'exit'), d.id + ' has an exit');
  }
});

test('random dungeons: 300 seeds all connected', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const def = generateRandomDef(seed * 7919);
    assert.ok(def.rooms.length >= 5, 'enough rooms for seed ' + seed);
    const L = buildLayout(def, seed);
    checkLayout('random#' + seed, L);
    assert.ok(L.enemies.length >= 8);
    const rift = pickRiftSpot(L, makeRng(seed));
    assert.ok(!isWall(L.tiles[rift.y * L.w + rift.x]));
  }
});
