// XP orbs. A kill spills a few gold orbs that hop out, settle, bob, then fly to you when you get close
// (or after a few seconds on their own, so XP is never lost and never a chore to collect).
// Each pickup plays one note of a rising chain, pulses the XP bar and adds its share of the XP.
import { G } from './state.js';
import { sfx } from './sfx.js';
import { splitXp, orbCountFor } from '../logic/orbs.js';
import { chainStep } from '../logic/sfxmath.js';

const GRAVITY = 420;
const MAX_ORBS = 36;
const MAGNET_AFTER = 0.55;   // seconds the orbs just sit there so you can see them spill
const MAGNET_RANGE = 66;     // px
const AUTO_HOME_AFTER = 3.4; // after this every orb flies to you
const rnd = (a, b) => a + Math.random() * (b - a);

export class XpOrbs {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.chain = { step: null, t: -99 };
  }

  get count() { return this.list.length; }
  get pending() { return this.list.reduce((a, o) => a + o.v, 0); }

  // spill `total` XP as orbs from (x, y). `dir` (radians) biases the spray away from the hit.
  spawn(x, y, total, dir = null) {
    if (total <= 0) return;
    const room = Math.max(1, MAX_ORBS - this.list.length);
    const values = splitXp(total, Math.min(orbCountFor(total), room));
    values.forEach((v, i) => {
      const a = dir == null ? rnd(0, Math.PI * 2) : dir + rnd(-1.1, 1.1);
      const sp = rnd(34, 78);
      const img = this.scene.add.image(Math.round(x), Math.round(y), 'fx_orb_0').setDepth(8.6);
      const sh = this.scene.add.image(Math.round(x), Math.round(y) + 3, 'fx_orb_sh').setDepth(3.6);
      this.list.push({
        v, x, y, h: 5, vh: rnd(80, 125), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        age: 0, state: 'fly', bounces: 0, speed: 0, trailT: 0, phase: rnd(0, 6) + i, img, sh,
      });
    });
  }

  solidAt(x, y) {
    const L = this.scene.layer;
    if (!L) return false;
    const t = L.getTileAtWorldXY(x, y);
    return !!(t && t.collides);
  }

  update(dt, player) {
    const px = player.sprite.x, py = player.sprite.y;
    for (const o of this.list) {
      o.age += dt;
      if (o.state === 'fly') {
        const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt;
        if (!this.solidAt(nx, o.y)) o.x = nx; else o.vx *= -0.3;
        if (!this.solidAt(o.x, ny)) o.y = ny; else o.vy *= -0.3;
        const damp = Math.max(0, 1 - dt * 3.2);
        o.vx *= damp; o.vy *= damp;
        o.vh -= GRAVITY * dt; o.h += o.vh * dt;
        if (o.h <= 0) {
          o.h = 0;
          if (Math.abs(o.vh) > 45 && o.bounces < 2) { o.vh = -o.vh * 0.42; o.bounces++; o.vx *= 0.6; o.vy *= 0.6; } else { o.vh = 0; o.state = 'rest'; }
        }
      } else if (o.state === 'rest') {
        o.h = 2 + Math.round(1.5 + 1.5 * Math.sin(o.age * 4 + o.phase)); // gentle bob, whole pixels only
        const d = Math.hypot(px - o.x, py - o.y);
        if (o.age > MAGNET_AFTER && (d < MAGNET_RANGE || o.age > AUTO_HOME_AFTER)) { o.state = 'home'; o.speed = 70; }
      } else { // home: accelerate toward the player
        o.speed = Math.min(380, o.speed + 1000 * dt);
        const dx = px - o.x, dy = py - o.y, d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, o.speed * dt);
        o.x += (dx / d) * step; o.y += (dy / d) * step;
        o.h += (5 - o.h) * Math.min(1, dt * 10);
        o.trailT -= dt;
        if (o.trailT <= 0) { o.trailT = 0.04; this.trail(o); }
        if (d < 8) { o.done = true; this.collect(o); }
      }
      if (!o.done) {
        o.img.setPosition(Math.round(o.x), Math.round(o.y - o.h));
        o.img.setTexture('fx_orb_' + (Math.floor(o.age * 7 + o.phase) % 3));
        o.sh.setPosition(Math.round(o.x), Math.round(o.y) + 3).setAlpha(o.h > 8 ? 0.5 : 1);
      }
    }
    if (this.list.some((o) => o.done)) this.list = this.list.filter((o) => !o.done);
  }

  trail(o) {
    const sc = this.scene;
    const d = sc.add.image(Math.round(o.x), Math.round(o.y - o.h), 'fx_dot').setDepth(8.4).setTint(0xf0c040);
    sc.tweens.add({ targets: d, alpha: 0, duration: 170, onComplete: () => d.destroy() });
  }

  collect(o) {
    const sc = this.scene;
    const now = sc.time.now / 1000;
    const step = chainStep(this.chain.step, now - this.chain.t);
    this.chain = { step, t: now };
    sfx('xp', { step });
    sc.gainXp(o.v);
    G.hud.pulseXp && G.hud.pulseXp(Math.round(o.v * sc.player.stats.expRate), step);
    // tiny pop where it lands on you
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rnd(0, 1);
      const s = sc.add.image(Math.round(o.x), Math.round(o.y - o.h), 'fx_dot').setDepth(14).setTint(0xffe9a0);
      sc.tweens.add({ targets: s, x: s.x + Math.cos(a) * 7, y: s.y + Math.sin(a) * 7, alpha: 0, duration: 190, onComplete: () => s.destroy() });
    }
    o.img.destroy(); o.sh.destroy();
  }

  // credit everything still on the floor right away (leaving the room, clearing it, falling)
  flush() {
    const total = this.pending;
    for (const o of this.list) { o.img.destroy(); o.sh.destroy(); }
    this.list = [];
    if (total > 0) this.scene.gainXp(total);
    return total;
  }

  destroy() {
    for (const o of this.list) { o.img.destroy(); o.sh.destroy(); }
    this.list = [];
  }
}
