// What a skeleton leaves behind when it dies. In order: a dust puff and a few flecks of ash, a skull, two ribs and a thigh
// bone that tumble out along the killing blow and settle on the floor, small bone/rust bits that vanish quickly, the
// weapon clattering down beside it, a little heap of bones, and a teal soul wisp drifting up.
// Everything stays on whole pixels, and only the few "big" pieces stay on the floor (capped, oldest fade first) so a long
// fight never turns into a bone carpet.
import Phaser from 'phaser';
import { trajectory, planPieces, FPS } from '../logic/deathfx.js';
import { sfx } from './sfx.js';

const KEEP_MAX = 30;
const HALF_PI = Math.PI / 2;
const TEX = { skull: 'fx_skull', rib: 'fx_rib', femur: 'fx_femur', bit: 'fx_bone', rust: 'fx_rust' };

// put a piece on the "stays on the floor" list; it fades after `hold` ms, and the oldest go first if there are too many
function keep(scene, obj, hold, fade = 700) {
  const list = scene.floorBits;
  const drop = (o) => { const k = list.indexOf(o); if (k >= 0) list.splice(k, 1); scene.tweens.killTweensOf(o); if (o.scene) o.destroy(); };
  list.push(obj);
  while (list.length > KEEP_MAX) drop(list[0]);
  scene.tweens.add({ targets: obj, alpha: 0, delay: hold, duration: fade, onComplete: () => drop(obj) });
}

// play a precomputed trajectory back on an image (and its little shadow)
function fly(scene, img, shadow, x, y, tr, onDone) {
  const n = tr.length - 1;
  const snapped = Math.round(tr[n].rot / HALF_PI) * HALF_PI;
  scene.tweens.addCounter({
    from: 0, to: 1, duration: (tr.length / FPS) * 1000,
    onUpdate: (tw) => {
      if (!img.scene) return;
      const v = tw.getValue(), s = tr[Math.min(n, Math.floor(v * n))];
      // in the last stretch the piece turns to rest square to the pixel grid
      const rot = v > 0.85 ? Phaser.Math.Linear(s.rot, snapped, (v - 0.85) / 0.15) : s.rot;
      img.setPosition(Math.round(x + s.x), Math.round(y + s.y - s.z)).setRotation(rot);
      if (shadow) shadow.setPosition(Math.round(x + s.x), Math.round(y + s.y + 2)).setAlpha(Math.max(0.15, 0.5 - s.z / 160));
    },
    onComplete: () => { if (shadow) shadow.destroy(); if (img.scene) { img.setPosition(Math.round(x + tr[n].x), Math.round(y + tr[n].y)).setRotation(snapped); onDone(); } },
  });
}

/**
 * @param scene the PlayScene
 * @param weapon {key, x, y, rotation, scale, tint} the skeleton's weapon at the moment it died (or null)
 */
export function playDeath(scene, x, y, dir, crit, weapon) {
  const rand = Math.random;
  x = Math.round(x); y = Math.round(y);

  // --- dust puff: grey puffs spread, grow and fade
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.8, d = 3 + rand() * 6;
    const p = scene.add.image(x + Math.round(Math.cos(a) * 2), y + 3, 'fx_puff').setDepth(6).setAlpha(0.5).setScale(1);
    scene.tweens.add({
      targets: p, x: x + Math.round(Math.cos(a) * d), y: y + 3 + Math.round(Math.sin(a) * d * 0.5) - 3, alpha: 0, scale: 1.5 + rand() * 0.6,
      duration: 380 + rand() * 160, ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
    });
  }

  // --- ash: tiny grey flecks fall slowly
  for (let i = 0; i < 6; i++) {
    const a = scene.add.image(x + Math.round((rand() - 0.5) * 12), y - 2 - Math.round(rand() * 6), 'fx_dot').setDepth(11).setTint(i % 2 ? 0x8f8870 : 0x5d5744).setAlpha(0.9);
    scene.tweens.add({ targets: a, x: a.x + Math.round((rand() - 0.2) * 14), y: a.y + 6 + Math.round(rand() * 8), alpha: 0, delay: rand() * 160, duration: 700 + rand() * 600, ease: 'Sine.easeIn', onComplete: () => a.destroy() });
  }

  // --- the pieces
  for (const p of planPieces(rand, dir)) {
    const tr = trajectory(p);
    const img = scene.add.image(x, y, TEX[p.kind]).setDepth(10);
    const big = p.kind === 'skull' || p.kind === 'rib' || p.kind === 'femur';
    const shadow = big ? scene.add.image(x, y + 2, 'fx_orb_sh').setDepth(3.3).setAlpha(0.5) : null;
    fly(scene, img, shadow, x, y, tr, () => {
      if (big) { img.setDepth(3.4); keep(scene, img, 3200 + rand() * 1200); } else scene.tweens.add({ targets: img, alpha: 0, delay: 250, duration: 500, onComplete: () => img.destroy() });
    });
  }

  // --- the weapon hops out and clatters down
  if (weapon) {
    const w = scene.add.image(weapon.x, weapon.y, weapon.key).setDepth(9.6).setOrigin(0.1, 0.5).setRotation(weapon.rotation).setScale(weapon.scale || 1);
    if (weapon.tint != null) w.setTint(weapon.tint);
    const a = (dir == null ? rand() * Math.PI * 2 : dir) + (rand() - 0.5) * 2.4;
    const tr = trajectory({ vx: Math.cos(a) * 34, vy: Math.sin(a) * 24, vz: 100, spin: (rand() < 0.5 ? -1 : 1) * (7 + rand() * 6), bounce: 0.3 });
    const landMs = (tr.findIndex((s, i) => i > 3 && s.z === 0) / FPS) * 1000;
    scene.time.delayedCall(Math.max(120, landMs), () => sfx('erattle', { at: { x: weapon.x + tr[tr.length - 1].x, y: weapon.y + tr[tr.length - 1].y }, vol: 0.55 }));
    fly(scene, w, null, weapon.x, weapon.y, tr, () => { w.setDepth(3.35); keep(scene, w, 3000 + rand() * 1000, 800); });
  }

  // --- the heap it collapses into (pops in just after the bones land)
  const pile = scene.add.image(x, y + 3, 'fx_pile').setDepth(3.2).setAlpha(0);
  scene.tweens.add({ targets: pile, alpha: 0.95, delay: 220, duration: 120, onComplete: () => keep(scene, pile, 5200, 1200) });

  // --- the soul: a teal wisp drifting up with a faint wobble and a short fading trail
  const soul = scene.add.image(x, y - 4, 'fx_soul_0').setDepth(15);
  const halo = scene.add.image(x, y - 4, 'fx_glow').setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setTint(0x4fe8cf).setScale(0.8).setAlpha(0.6);
  let frame = 0, lastTrail = 0;
  const rise = 24 + rand() * 6, sway = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 2), life = 1150 + rand() * 250;
  scene.tweens.addCounter({
    from: 0, to: 1, duration: life, ease: 'Sine.easeOut',
    onUpdate: (tw) => {
      const v = tw.getValue(), ms = v * life;
      const px = x + Math.round(Math.sin(v * Math.PI * 2) * sway), py = y - 4 - Math.round(rise * v);
      soul.setPosition(px, py).setAlpha(v < 0.55 ? 1 : 1 - (v - 0.55) / 0.45);
      halo.setPosition(px, py).setAlpha(soul.alpha * 0.5);
      const f = Math.floor(ms / 140) % 2;
      if (f !== frame) { frame = f; soul.setTexture('fx_soul_' + f); }
      if (ms - lastTrail > 110 && v < 0.8) {
        lastTrail = ms;
        const t = scene.add.image(px, py + 4, 'fx_dot').setDepth(14).setTint(0x6ff0d6).setAlpha(0.7);
        scene.tweens.add({ targets: t, alpha: 0, y: t.y + 3, duration: 300, onComplete: () => t.destroy() });
      }
    },
    onComplete: () => { soul.destroy(); halo.destroy(); },
  });
}
