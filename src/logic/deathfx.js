// Pure maths for bits that fly out of a dying enemy and settle on the floor (no Phaser, so it can be unit-tested).
// A piece launches with a ground velocity (vx, vy), an upward velocity vz and a spin; gravity pulls it down, it bounces,
// loses energy on every bounce and skids to a stop. We simulate it once up front and the scene just plays the samples back.

export const FPS = 60;

/**
 * @returns {{ x:number, y:number, z:number, rot:number }[]}  one sample per 1/60 s (offsets from the start; z = height)
 */
export function trajectory({ vx = 0, vy = 0, vz = 120, spin = 0, bounce = 0.42, gravity = 520, skid = 0.72, maxSeconds = 1.6 } = {}) {
  const dt = 1 / FPS, out = [];
  let x = 0, y = 0, z = 0.01, rot = 0, vzz = vz;
  for (let i = 0; i < maxSeconds * FPS; i++) {
    vzz -= gravity * dt;
    z += vzz * dt;
    x += vx * dt; y += vy * dt; rot += spin * dt;
    if (z <= 0) {
      z = 0;
      if (Math.abs(vzz) > 28) { vzz = -vzz * bounce; vx *= skid; vy *= skid; spin *= 0.55; }   // bounce, losing speed
      else { vzz = 0; vx *= 0.82; vy *= 0.82; spin *= 0.7; }                                   // rolling to a stop
    }
    out.push({ x, y, z, rot });
    if (z === 0 && vzz === 0 && Math.hypot(vx, vy) < 3 && Math.abs(spin) < 0.4) break;
  }
  return out;
}

/** Flight time in seconds of a trajectory. */
export const duration = (tr) => tr.length / FPS;

/** The pieces a skeleton throws, as launch params. `dir` is the way the killing blow travelled (null = any direction). */
export function planPieces(rand, dir) {
  const aim = (spread) => (dir == null ? rand() * Math.PI * 2 : dir + (rand() - 0.5) * spread);
  const mk = (kind, speed, hop, spin, spread) => {
    const a = aim(spread), sp = speed[0] + rand() * (speed[1] - speed[0]);
    return { kind, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: hop[0] + rand() * (hop[1] - hop[0]), spin: (rand() - 0.5) * spin };
  };
  return [
    mk('skull', [48, 78], [120, 170], 14, 1.0),
    mk('rib', [34, 64], [90, 130], 18, 1.8),
    mk('rib', [30, 60], [90, 130], 18, 2.4),
    mk('femur', [38, 70], [95, 140], 14, 1.8),
    ...Array.from({ length: 5 }, () => mk(rand() < 0.35 ? 'rust' : 'bit', [36, 100], [70, 150], 16, 2.4)),
  ];
}
