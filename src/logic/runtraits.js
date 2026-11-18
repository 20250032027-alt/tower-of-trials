// Skills are dealt fresh every run (new game, a fall, leaving a dungeon). The deal favours the low ranks:
// pick a rank first (weighted), then a random trait of that rank that has not been dealt yet.

import { TRAITS } from '../data/traits.js';
import { TRAIT_SLOTS } from '../data/constants.js';

export const RUN_RANK_WEIGHT = { F: 55, E: 20, D: 12, C: 7, B: 3.5, A: 2, S: 0.5 }; // [PLACEHOLDER]

/** Roll `n` different traits (never a secret one, never one in `exclude`). Returns trait ids. */
export function rollRunTraits(rng, n = TRAIT_SLOTS, exclude = []) {
  const pool = TRAITS.filter((t) => !t.secret && !exclude.includes(t.id));
  const picked = [];
  for (let i = 0; i < n; i++) {
    const left = pool.filter((t) => !picked.includes(t.id));
    if (!left.length) break;
    const ranks = Object.keys(RUN_RANK_WEIGHT).filter((r) => left.some((t) => t.rank === r));
    let x = rng.next() * ranks.reduce((s, r) => s + RUN_RANK_WEIGHT[r], 0);
    let rank = ranks[ranks.length - 1];
    for (const r of ranks) { x -= RUN_RANK_WEIGHT[r]; if (x < 0) { rank = r; break; } }
    const of = left.filter((t) => t.rank === rank);
    picked.push(of[Math.floor(rng.next() * of.length)].id);
  }
  return picked;
}
