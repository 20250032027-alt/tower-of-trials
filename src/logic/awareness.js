// How enemies notice the player. Pure functions (no Phaser) so they can be unit-tested.
//
// The rule is meant to feel fair and readable:
//   * An enemy only notices you when you are IN ITS ROOM and it has a clear line of sight to you,
//     or when you are almost touching it (it hears you, even through a pillar / around a corner).
//   * Noticing is not instant: a "?" fills up first, faster the closer you are, so walking in through a
//     door gives you a moment to react (back out, or pick the fight).
//   * Fighting is loud: anything attacking inside a room makes the rest of that room suspicious.
import { isWall } from './layout.js';

/** id of the room that contains world position (x, y), or null when standing in a corridor. */
export function roomAt(layout, x, y, ts) {
  const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
  for (const r of layout.rooms) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r.id;
  return null;
}

/** true when no wall tile lies on the straight line between two world points. */
export function hasLineOfSight(layout, x0, y0, x1, y1, ts) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (ts / 3)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + dx * t) / ts), ty = Math.floor((y0 + dy * t) / ts);
    if (tx < 0 || ty < 0 || tx >= layout.w || ty >= layout.h) return false;
    if (isWall(layout.tiles[ty * layout.w + tx])) return false;
  }
  return true;
}

/**
 * Suspicion gained per second (1.0 = notices). `sees` = same room + line of sight, `hears` = very close.
 * Far away in the room it takes about noticeTime; right next to the enemy it is about 3x faster.
 */
export function alertRate({ sees, hears, dist }, p) {
  if (!sees && !hears) return -p.calmRate;
  const near = Math.max(0.35, Math.min(1, dist / p.sightRange));
  const base = 1 / (p.noticeTime * near);
  return sees ? base : base * 0.6;
}
