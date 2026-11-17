import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOfLevel, MANA_CIRCLE_CHANCE, BERSERK } from '../src/data/constants.js';
import { computeStats, traitPassives, computeEnemyStats } from '../src/logic/stats.js';
import { Berserk } from '../src/logic/berserk.js';
import { focusTick } from '../src/logic/focus.js';
import { rollManaCircles } from '../src/logic/mana.js';
import { makeRng } from '../src/logic/rng.js';
import { TRAITS } from '../src/data/traits.js';
import { ENEMIES } from '../src/data/enemies.js';
import { createProfile, addXp } from '../src/logic/progression.js';
import { playerAttack, damageAfterMitigation } from '../src/logic/combat.js';
import { WEAPONS } from '../src/data/weapons.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('level rank boundaries (sheet)', () => {
  const cases = { 1: 'F', 10: 'F', 11: 'E', 30: 'E', 31: 'D', 49: 'D', 50: 'C', 79: 'C', 80: 'B', 99: 'B', 100: 'A', 150: 'A', 151: 'S', 400: 'S' };
  for (const [lv, r] of Object.entries(cases)) assert.equal(rankOfLevel(+lv), r, 'level ' + lv);
});

test('player base stats at level 1 (sheet)', () => {
  const s = computeStats({ level: 1 });
  near(s.maxHealth, 100); near(s.defense, 10); near(s.maxStamina, 100); near(s.maxMana, 0);
  near(s.critRate, 0.15); near(s.critDamage, 1.25); near(s.moveSpeed, 1);
  near(s.dodgeCooldown, 1.5); near(s.dodgeStamina, 0.25);
  near(s.regen.health.combat, 0); near(s.regen.health.out, 0.01);
  near(s.regen.stamina.combat, 0.05); near(s.regen.stamina.out, 0.15);
  near(s.regen.mana.combat, 0.05); near(s.regen.mana.out, 0.05);
});

test('level growth: +5% basic, +1% criticals per level', () => {
  const s = computeStats({ level: 11 });
  near(s.maxHealth, 150); near(s.maxStamina, 150);
  near(s.critRate, 0.15 * 1.1); near(s.critDamage, 1.25 * 1.1);
});

test('trait passives stack', () => {
  const p = traitPassives(['iron_body', 'second_wind']);
  const s = computeStats({ level: 1, passives: p });
  near(s.maxHealth, 100 * (1 + 0.25 + 0.15));
  near(s.defense, 10 * 1.1);
});

test('mana needs a circle', () => {
  assert.equal(computeStats({ level: 1, manaCircles: 0, passives: traitPassives(['mana_reserve']) }).maxMana, 0);
  near(computeStats({ level: 1, manaCircles: 2, passives: traitPassives(['mana_reserve']) }).maxMana, 240);
});

test('every trait: unique id, locked skills are null, secret = ???', () => {
  const ids = new Set();
  for (const t of TRAITS) {
    assert.ok(!ids.has(t.id)); ids.add(t.id);
    if (t.secret) assert.equal(t.effects, '???');
    if (t.skill) { assert.ok(t.skill.cooldown > 0); assert.ok(t.skill.kind); }
  }
  assert.equal(TRAITS.length, 10 + 4 + 4 + 4 + 4 + 4 + 4);
});

test('berserk: cores, drain, decay, regen (sheet table)', () => {
  const b = new Berserk();
  assert.equal(b.cores, 4);
  assert.ok(b.activate());
  near(b.force, 0.75);
  // 30 seconds at 2.5%/s drains 75% -> decay
  for (let i = 0; i < 29.9 * 60; i++) b.update(1 / 60);
  assert.ok(b.active);
  for (let i = 0; i < 0.3 * 60; i++) b.update(1 / 60);
  assert.ok(b.decay && !b.active);
  // decay penalties present
  assert.equal(b.getMods().moveSpeed, BERSERK.decay.moveSpeed);
  // 15s later a core is back -> decay ends -> exhaustion
  for (let i = 0; i < 15.2 * 60; i++) b.update(1 / 60);
  assert.ok(!b.decay);
  assert.ok(b.exhaustion > 0);
});

test('berserk: four quick activations drain everything', () => {
  const b = new Berserk();
  for (let i = 0; i < 3; i++) { assert.ok(b.activate()); b.deactivate(); }
  near(b.force, 0.25);
  b.activate(); // 4th
  assert.ok(b.decay);
  near(b.force, 0);
});

test('berserk: skill activation ends at its time cap with exhaustion', () => {
  const b = new Berserk();
  b.activate({ damage: 0.15 }, 15);
  for (let i = 0; i < 15.1 * 60; i++) b.update(1 / 60);
  assert.ok(!b.active && !b.decay);
  assert.ok(b.exhaustion > 0);
});

test('focus: 2.5s to 100%, stamina only above 150%', () => {
  let f = 0;
  for (let i = 0; i < 150; i++) f = focusTick(f, 1 / 60, 1).focus;
  near(f, 1.0, 1e-3);
  const t = focusTick(1.5, 0.25, 1); // +10% focus
  near(t.focus, 1.6, 1e-6);
  near(t.staminaFrac, 0.05, 1e-6);
  assert.equal(focusTick(1.0, 0.5, 1).staminaFrac, 0);
  // cannot pass 150% without stamina
  near(focusTick(1.49, 2, 1, 1, false).focus, 1.5, 1e-9);
});

test('mana circle chances match the sheet table', () => {
  const rng = makeRng(42);
  for (const rank of ['F', 'C', 'S']) {
    let one = 0, two = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) { const c = rollManaCircles(rank, rng); if (c === 1) one++; if (c === 2) two++; }
    near(one / N, MANA_CIRCLE_CHANCE[rank].one, 0.015);
    near(two / N, MANA_CIRCLE_CHANCE[rank].two, 0.015);
  }
});

test('xp / level up / adaptive growth', () => {
  const p = createProfile();
  p.traits = ['adaptive_growth'];
  const rng = makeRng(3);
  const r = addXp(p, 100000, 1, rng);
  assert.equal(p.level, 50);
  assert.ok(r.adaptive.length === 49);
  assert.ok(Object.values(p.extra).reduce((a, b) => a + b, 0) > 4.8);
  const q = createProfile();
  addXp(q, 44, 1.25, rng); // quick learner style: 55 xp -> level 2
  assert.equal(q.level, 2);
});

test('skeleton soldier stats (sheet)', () => {
  const e = computeEnemyStats(ENEMIES.skeleton_soldier, 1);
  near(e.defense / e.maxHealth, 0.2);
  near(e.critRate, 0.1); near(e.critDamage, 1.25);
  const e11 = computeEnemyStats(ENEMIES.skeleton_soldier, 11);
  near(e11.maxHealth / e.maxHealth, 1.5);
});

test('damage pipeline sanity', () => {
  const s = computeStats({ level: 1 });
  const rng = makeRng(1);
  let total = 0, crits = 0; const N = 5000;
  for (let i = 0; i < N; i++) { const a = playerAttack({ weapon: WEAPONS.training_sword, stats: s, rng }); total += a.damage; if (a.crit) crits++; }
  near(crits / N, 0.15, 0.02);
  assert.ok(total / N > 12 && total / N < 15);
  assert.ok(damageAfterMitigation(100, 100, 0) === 50);
});
