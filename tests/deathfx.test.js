import test from 'node:test';
import assert from 'node:assert/strict';
import { trajectory, duration, planPieces, FPS } from '../src/logic/deathfx.js';

test('a thrown piece comes down, never goes below the floor, and stops', () => {
  const tr = trajectory({ vx: 60, vy: 10, vz: 150, spin: 10 });
  assert.ok(tr.length > 20 && tr.length < 1.6 * FPS, 'settles in under the cap');
  assert.ok(tr.every((s) => s.z >= 0));
  assert.ok(Math.max(...tr.map((s) => s.z)) > 20, 'it really leaves the ground');
  const last = tr[tr.length - 1];
  assert.equal(last.z, 0);
  assert.ok(last.x > 0, 'travels the way it was thrown');
});

test('it bounces: height rises again after the first landing, then smaller', () => {
  const tr = trajectory({ vx: 40, vz: 160 });
  const firstLand = tr.findIndex((s, i) => i > 3 && s.z === 0);
  const peak2 = Math.max(...tr.slice(firstLand + 1).map((s) => s.z));
  const peak1 = Math.max(...tr.slice(0, firstLand).map((s) => s.z));
  assert.ok(peak2 > 2 && peak2 < peak1 * 0.5, `second hop ${peak2} vs first ${peak1}`);
});

test('a weak throw still ends cleanly and duration is in seconds', () => {
  const tr = trajectory({ vx: 5, vz: 40 });
  assert.ok(duration(tr) < 1.2);
});

test('planned pieces: one skull, two ribs, a femur, a handful of bits, all launched along the blow', () => {
  let x = 7; const rand = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ps = planPieces(rand, 0);
  assert.equal(ps.filter((p) => p.kind === 'skull').length, 1);
  assert.equal(ps.filter((p) => p.kind === 'rib').length, 2);
  assert.equal(ps.filter((p) => p.kind === 'femur').length, 1);
  assert.equal(ps.filter((p) => p.kind === 'bit' || p.kind === 'rust').length, 5);
  assert.ok(ps.find((p) => p.kind === 'skull').vx > 0, 'skull goes the way the blow went (dir 0 = right)');
  for (const p of ps) assert.ok(p.vz > 0);
});
