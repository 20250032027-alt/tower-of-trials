import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollRunTraits, RUN_RANK_WEIGHT } from '../src/logic/runtraits.js';
import { makeRng } from '../src/logic/rng.js';
import { TRAIT_BY_ID } from '../src/data/traits.js';

test('a deal is ONE non-secret trait (several can still be asked for)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 300; i++) {
    const ids = rollRunTraits(rng);
    assert.equal(ids.length, 1);
    for (const id of ids) assert.ok(TRAIT_BY_ID[id] && !TRAIT_BY_ID[id].secret);
    const three = rollRunTraits(rng, 3);
    assert.equal(new Set(three).size, 3);
  }
});

test('a reroll never repeats the traits you had', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 200; i++) {
    const a = rollRunTraits(rng);
    const b = rollRunTraits(rng, 3, a);
    assert.ok(b.every((id) => !a.includes(id)));
  }
});

test('low ranks come up far more than high ranks', () => {
  const rng = makeRng(3);
  const n = { F: 0, S: 0 };
  for (let i = 0; i < 2000; i++) for (const id of rollRunTraits(rng)) { const r = TRAIT_BY_ID[id].rank; if (r in n) n[r]++; }
  assert.ok(n.F > n.S * 20, JSON.stringify(n));
  assert.ok(RUN_RANK_WEIGHT.F > RUN_RANK_WEIGHT.S);
});

test('magic traits turn up in a fair share of deals (so a mage run is possible)', () => {
  const rng = makeRng(5);
  let magic = 0;
  for (let i = 0; i < 1000; i++) if (rollRunTraits(rng).some((id) => TRAIT_BY_ID[id].type === 'Magic')) magic++;
  assert.ok(magic > 80 && magic < 450, String(magic)); // one trait per deal now, so fewer deals include a Magic one
});
