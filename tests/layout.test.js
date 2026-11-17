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

// ---------------------------------------------------------------- the whole tower (Floors 2-10 are generated)
import { TOWER, RIFT_OF, dungeonsOf } from '../src/data/world.js';
import { THEMES } from '../src/art/tiles.js';

test('tower: all 11 floors exist and are playable', () => {
  assert.equal(TOWER.length, 11);
  for (const f of TOWER) { assert.ok(FLOORS[f.id], f.id + ' has a layout'); assert.ok(f.playable, f.id + ' playable'); }
});

test('every floor 1-10 follows the sheet: 1 main, 3-6 presets, randomized, hidden, double', () => {
  for (let n = 1; n <= 10; n++) {
    const id = 'floor' + n;
    const ds = dungeonsOf(id);
    const count = (k) => ds.filter((d) => d.kind === k).length;
    assert.equal(count('main'), 1, id + ' main');
    assert.ok(count('preset') >= 3 && count('preset') <= 6, `${id} presets ${count('preset')}`);
    assert.ok(count('random') >= 2, id + ' randomized');
    assert.ok(count('hidden') >= 1, id + ' hidden');
    assert.ok(count('double') >= 1 || RIFT_OF[id], id + ' double');
    assert.ok(DUNGEONS[RIFT_OF[id]] && DUNGEONS[RIFT_OF[id]].kind === 'double', id + ' rift exists');
    for (const d of ds) assert.ok(THEMES[d.theme], `${d.id} theme ${d.theme}`);
  }
});

test('floor hubs: every dungeon has a portal, stairs line up, vault is sealed until the crack breaks', () => {
  for (let n = 1; n <= 10; n++) {
    const f = FLOORS['floor' + n];
    const L = buildLayout(f.layout, hashString(f.id));
    const ds = dungeonsOf(f.id);
    const portalTo = new Set(L.objects.filter((o) => o.type === 'portal').map((o) => o.to.id));
    for (const d of ds) if (d.kind !== 'double') assert.ok(portalTo.has(d.id), `${f.id}: no portal to ${d.id}`);
    const main = DUNGEONS[f.mainId];
    assert.equal(main.clearFlag, f.id + 'Cleared');
    const up = L.objects.find((o) => o.type === 'portal' && o.to.id === 'floor' + (n + 1));
    if (n < 10) { assert.ok(up, f.id + ' stairs up'); assert.equal(up.requires, f.id + 'Cleared'); }
    const down = L.objects.find((o) => o.type === 'portal' && o.to.type === 'floor' && o.to.arriveAtStairs);
    assert.ok(down, f.id + ' stairs down');
    const vault = L.objects.find((o) => o.hidden);
    assert.ok(vault && vault.to.id === f.hiddenId, f.id + ' vault');
    const seen = reachableFrom(L, L.spawn.x, L.spawn.y);
    assert.equal(seen[vault.y * L.w + vault.x], 0, f.id + ' vault sealed');
    const c = L.cracks[0];
    L.tiles[c.y * L.w + c.x] = 0;
    assert.equal(reachableFrom(L, L.spawn.x, L.spawn.y)[vault.y * L.w + vault.x], 1, f.id + ' vault opens');
  }
});

test('floors 2-10 get steadily harder: more enemies and ranks that never go down', () => {
  const order = 'FEDCBAS';
  let lastRank = 0, lastEnemies = 0;
  for (let n = 1; n <= 10; n++) {
    const main = DUNGEONS[FLOORS['floor' + n].mainId];
    const r = order.indexOf(main.rank);
    assert.ok(r >= lastRank, 'rank never drops at floor ' + n);
    lastRank = r;
    const L = buildLayout(main.layout, hashString(main.id));
    if (n >= 2) assert.ok(L.enemies.length >= 40, `main dungeon of floor ${n} has a real fight (${L.enemies.length})`);
    lastEnemies = L.enemies.length;
  }
  assert.ok(lastEnemies > 0);
});
