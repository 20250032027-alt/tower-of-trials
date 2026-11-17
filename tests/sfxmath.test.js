import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVariantPicker, chainFreq, chainStep, CHAIN_MAX, panFor, distanceGain } from '../src/logic/sfxmath.js';

test('variant picker never repeats the same variant twice in a row', () => {
  const pick = makeVariantPicker();
  let prev = -1;
  for (let i = 0; i < 2000; i++) {
    const v = pick('sword', 3);
    assert.ok(v >= 0 && v < 3);
    assert.notEqual(v, prev);
    prev = v;
  }
});

test('variant picker uses every variant and tracks keys separately', () => {
  const pick = makeVariantPicker();
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pick('a', 4));
  assert.equal(seen.size, 4);
  assert.equal(pick('b', 1), 0);
});

test('variant picker still works with an adversarial random source', () => {
  const pick = makeVariantPicker(() => 0); // always proposes index 0
  const a = pick('x', 3), b = pick('x', 3), c = pick('x', 3);
  assert.notEqual(a, b);
  assert.notEqual(b, c);
});

test('pickup chain climbs, stays musical and is capped', () => {
  let last = 0;
  for (let s = 0; s <= CHAIN_MAX; s++) {
    const f = chainFreq(s);
    assert.ok(f > last, 'each note is higher than the last');
    last = f;
  }
  assert.equal(chainFreq(99), chainFreq(CHAIN_MAX));
  assert.ok(chainFreq(CHAIN_MAX) < 2600, 'never shrill');
  assert.equal(Math.round(chainFreq(0)), 523);
  assert.equal(Math.round(chainFreq(5) / chainFreq(0)), 2); // five notes up = one octave
});

test('pickup chain resets after a pause and caps at the top', () => {
  assert.equal(chainStep(null, 0), 0);
  assert.equal(chainStep(3, 0.2), 4);
  assert.equal(chainStep(3, 1.2), 0);
  assert.equal(chainStep(CHAIN_MAX, 0.1), CHAIN_MAX);
});

test('pan and distance behave', () => {
  assert.equal(panFor(0), 0);
  assert.ok(panFor(-500) === -0.8 && panFor(500) === 0.8);
  assert.equal(distanceGain(10), 1);
  assert.equal(distanceGain(1000), 0);
  assert.ok(distanceGain(100) > distanceGain(200));
  assert.equal(distanceGain(1000, 40, 340, 0.2), 0.2);
});

import { orbCountFor, splitXp } from '../src/logic/orbs.js';

test('xp orbs: count is bounded and shares add up exactly', () => {
  for (const total of [0, 1, 2, 9, 10, 23, 27, 60, 140, 5000]) {
    const n = orbCountFor(total);
    assert.ok(n >= 1 && n <= 6);
    const parts = splitXp(total, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    assert.ok(parts.length <= Math.max(1, total));
    assert.ok(parts.every((v) => v >= 0));
  }
  assert.deepEqual(splitXp(23, 3), [8, 8, 7]);
  assert.deepEqual(splitXp(3, 6), [1, 1, 1]); // never more orbs than XP
});
