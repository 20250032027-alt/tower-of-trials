// Skeleton Soldier + Training Dummy.

import Phaser from 'phaser';
import { ENEMIES } from '../data/enemies.js';
import { RANK_COLORS, rankOfLevel } from '../data/constants.js';
import { computeEnemyStats } from '../logic/stats.js';
import { enemyAttack, damageAfterMitigation } from '../logic/combat.js';
import { G } from './state.js';
import { sfx } from './sfx.js';
import { txt, hexToInt } from './text.js';
import { HandRig, LOOK, weaponPoint } from './rig.js';
import { alertRate } from '../logic/awareness.js';

const QUARTER = Math.PI / 4;
const snap = (a) => Math.round(a / QUARTER) * QUARTER;
const angDiff = (a, b) => Math.abs(Phaser.Math.Angle.Wrap(a - b));

// -------------------------------------------------------------- Dummy
export class Dummy {
  constructor(scene, x, y) {
    this.scene = scene;
    this.isDummy = true;
    this.alive = true;
    this.radius = 8;
    this.marked = false;
    this.stats = { maxHealth: 9999, defense: 0 };
    this.hp = 9999;
    this.shadow = scene.add.image(x, y + 5, 'shadow').setDepth(4);
    this.sprite = scene.physics.add.sprite(x, y, 'o_dummy').setDepth(9);
    this.sprite.body.setCircle(8, 3, 3).setImmovable(true);
    this.sprite.ref = this;
    this.hits = 0;
    this.total = 0;
    this.wobble = 0;
    this.label = txt(scene, x, y - 16, '', { size: 1, color: 0xf4e7b0, depth: 41, origin: [0.5, 1] });
    this.resetT = 0;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  hurt(damage, crit, from, knock, info) {
    const dealt = damageAfterMitigation(damage, 0, 0);
    this.hits += 1;
    this.total += dealt;
    this.wobble = 0.2;
    this.resetT = 3;
    this.scene.floatText(this.x + Phaser.Math.Between(-5, 5), this.y - 8, String(Math.round(dealt)), crit ? 0xffd84a : 0xffffff, crit ? 2 : 1);
    this.label.setText(`HITS ${this.hits}  TOTAL ${Math.round(this.total)}`);
    sfx('hit', { weapon: info && info.weapon, mat: 'wood', crit });
    this.scene.hitFx(this.x, this.y, from ? Math.atan2(this.y - from.y, this.x - from.x) : Math.random() * 6.28, crit);
    return dealt;
  }

  hurtTrue() {}

  update(dt) {
    if (this.wobble > 0) {
      this.wobble -= dt;
      this.sprite.setRotation(Math.sin(this.wobble * 60) * 0.18 * (this.wobble / 0.2));
    } else this.sprite.setRotation(0);
    if (this.resetT > 0) {
      this.resetT -= dt;
      if (this.resetT <= 0) { this.hits = 0; this.total = 0; this.label.setText(''); }
    }
  }
}

// ----------------------------------------------------------- Skeleton
export class Skeleton {
  constructor(scene, x, y, level, statMult, idx, room = null) {
    this.scene = scene;
    this.def = ENEMIES.skeleton_soldier;
    this.room = room;                 // the room it lives in: it notices you when you are in here
    this.home = { x, y };
    this.alert = 0;                   // 0..1 suspicion (the "?" fills up), 1 = it has noticed you
    this.sees = false; this.senseT = Math.random() * 0.12; this.lostT = 0;
    this.lastSeen = { x, y };
    this.cueKind = null; this.cueT = 0;
    this.idx = idx;
    this.level = level;
    this.rank = rankOfLevel(level);
    this.radius = 7;
    this.stats = computeEnemyStats(this.def, level, statMult);
    this.hp = this.stats.maxHealth;
    this.alive = true;
    this.marked = false;
    this.isDummy = false;

    this.shadow = scene.add.image(x, y + 4, 'shadow').setDepth(4);
    this.sprite = scene.physics.add.sprite(x, y, 'skeleton').setDepth(9);
    this.sprite.body.setCircle(6, 4, 4);
    this.sprite.ref = this;
    this.weapon = scene.add.image(x, y, 'w_sword').setDepth(9.5).setTint(0xc9a27a).setOrigin(0.1, 0.5);
    this.rig = new HandRig(scene, LOOK.bone, 9.2, 9.7);
    this.bar = scene.add.graphics().setDepth(40);
    this.lvText = txt(scene, x, y - 18, '', { size: 1, color: hexToInt(RANK_COLORS[this.rank]), depth: 41, origin: [0.5, 1] });
    this.markIcon = null;
    this.cue = scene.add.image(x, y, 'fx_wonder').setDepth(42).setVisible(false);

    this.state = 'idle';
    this.timer = Math.random() * 2;
    this.cooldown = 0.4 + Math.random() * 0.6;
    this.angle = Math.random() * Math.PI * 2;
    this.wander = new Phaser.Math.Vector2(0, 0);
    this.knock = new Phaser.Math.Vector2(0, 0);
    this.stagger = 0;
    this.flash = 0;
    this.barT = 0;
    this.swing = 0; // 0..1 strike animation progress (>0 while swinging)
    this.dead = false;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  // being hit, or a room-mate shouting, makes it notice you straight away
  aggro() {
    if (this.state === 'idle' || this.state === 'search') this.notice();
  }

  notice() {
    if (this.state === 'chase' || this.state === 'windup' || this.state === 'recover') return;
    this.state = 'chase'; this.timer = 0; this.alert = 1; this.lostT = 0;
    this.cueKind = 'alert'; this.cueT = 0.9;
    sfx('notice', { at: { x: this.x, y: this.y } });
    this.scene.alertAllies(this);
  }

  // can it see you right now? (inRoomOnly: idle guards only look inside their own room)
  look(player, dist, inRoomOnly) {
    const d = this.def, sc = this.scene;
    if (dist > d.sightRange) return false;
    if (inRoomOnly) {
      const here = sc.roomAt(player.sprite.x, player.sprite.y);
      if (this.room != null ? here !== this.room : dist > 110) return false;
    }
    return sc.hasLOS(this.x, this.y, player.sprite.x, player.sprite.y);
  }

  // builds suspicion while it sees / hears you, lets it fade otherwise
  sense(dt, player, dist) {
    const d = this.def;
    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.12; this.sees = this.look(player, dist, true); }
    this.alert = Math.max(0, Math.min(1, this.alert + alertRate({ sees: this.sees, hears: dist < d.earRange, dist }, d) * dt));
    if (this.alert > 0.25 && this.state === 'idle') this.scene.tip && this.scene.tip('aware', '"?" = unsure, "!" = spotted you. Walls hide you.');
    if (this.alert >= 1) this.notice();
  }

  update(dt, player) {
    if (!this.alive) return;
    const s = this.sprite;
    const d = this.def;
    const dx = player.sprite.x - s.x, dy = player.sprite.y - s.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.barT > 0) this.barT -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / 0.16);

    let vx = 0, vy = 0;
    if (this.stagger > 0) {
      this.stagger -= dt;
      vx = this.knock.x; vy = this.knock.y;
      this.knock.scale(Math.max(0, 1 - dt * 7));
    } else if (player.dead) {
      this.state = 'idle';
    } else {
      switch (this.state) {
        case 'idle': {
          this.sense(dt, player, dist);
          if (this.state !== 'idle') break;
          if (this.alert > 0.25) { this.angle = toPlayer; break; }   // something is off: stop and stare
          this.timer -= dt;
          if (this.timer <= 0) {
            this.timer = 1 + Math.random() * 2.5;
            const hd = Math.hypot(this.home.x - s.x, this.home.y - s.y);
            if (Math.random() < 0.55 || hd > 44) {
              const a = hd > 44 ? Math.atan2(this.home.y - s.y, this.home.x - s.x) : Math.random() * Math.PI * 2;
              this.wander.set(Math.cos(a) * 18, Math.sin(a) * 18);
              this.angle = a;
            } else this.wander.set(0, 0);
          }
          vx = this.wander.x; vy = this.wander.y;
          break;
        }
        case 'chase': {
          this.angle = toPlayer;
          this.senseT -= dt;
          if (this.senseT <= 0) { this.senseT = 0.12; this.sees = this.look(player, dist, false); }
          if (this.sees) { this.lostT = 0; this.lastSeen.x = player.sprite.x; this.lastSeen.y = player.sprite.y; } else this.lostT += dt;
          if (dist > d.loseRange || this.lostT > d.loseTime) {
            this.state = 'search'; this.timer = d.searchTime; this.alert = 0.4; this.cueKind = 'wonder'; this.cueT = 0.6;
            break;
          }
          if (dist < d.attackRange - 3 && this.cooldown <= 0) {
            this.state = 'windup';
            this.timer = d.windup;
            sfx('windup', { at: { x: this.x, y: this.y } });
            break;
          }
          if (dist > d.attackRange - 6) {
            vx = Math.cos(toPlayer) * d.moveSpeed;
            vy = Math.sin(toPlayer) * d.moveSpeed;
            this.stepT = (this.stepT || 0) - dt;     // you can hear them coming: soft bone clatter, louder when close
            if (this.stepT <= 0) { this.stepT = 0.3; sfx('erattle', { at: { x: this.x, y: this.y } }); }
          }
          break;
        }
        case 'search': {
          // lost you: walk to where it last saw you, look around, then go back to its post
          this.timer -= dt;
          const lx = this.lastSeen.x - s.x, ly = this.lastSeen.y - s.y;
          if (Math.hypot(lx, ly) > 8) {
            this.angle = Math.atan2(ly, lx);
            vx = Math.cos(this.angle) * d.moveSpeed * 0.6; vy = Math.sin(this.angle) * d.moveSpeed * 0.6;
          } else this.angle += dt * 2.2;
          this.sense(dt, player, dist);
          if (this.state === 'search' && this.timer <= 0) { this.state = 'idle'; this.alert = 0; this.timer = 0.5; }
          break;
        }
        case 'windup': {
          this.timer -= dt;
          if (this.timer > d.windup * 0.35) this.angle = toPlayer; // aim, then commit
          if (this.timer <= 0) {
            this.strike(player);
            this.state = 'recover';
            this.timer = 0.4;
            this.cooldown = d.cooldown;
          }
          break;
        }
        case 'recover': {
          this.timer -= dt;
          if (this.timer <= 0) this.state = 'chase';
          break;
        }
        default: break;
      }
    }
    s.setVelocity(vx, vy);
    this.draw(dt, dist);
  }

  strike(player) {
    const d = this.def;
    const reach = d.attackRange + 8;
    this.swing = 1;
    sfx('eswing', { at: { x: this.x, y: this.y } });
    this.scene.slashFx(this.sprite.x, this.sprite.y, this.angle, reach, 0xff8a5a, 1);
    const dx = player.sprite.x - this.sprite.x, dy = player.sprite.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    if (dist <= reach + 4 && angDiff(ang, this.angle) <= Phaser.Math.DegToRad(d.attackArcDeg) / 2) {
      const atk = enemyAttack({ enemyStats: this.stats, rng: G.rng });
      player.takeHit(atk.damage, atk.crit, this);
    }
  }

  draw(dt, distToPlayer) {
    const s = this.sprite;
    this.shadow.setPosition(s.x, s.y + 5);
    s.setRotation(snap(this.angle));
    // flash white when hit, pulse when winding up
    if (this.flash > 0) s.setTint(0xff9090);
    else if (this.state === 'windup') s.setTint(Math.floor(this.timer * 22) % 2 ? 0xffd0a0 : 0xffffff);
    else s.clearTint();

    // sword: rests at the side, raises in windup, sweeps on strike
    let a = this.angle + 0.9;
    if (this.state === 'windup') a = this.angle - 1.3 - (1 - this.timer / this.def.windup) * 0.3;
    if (this.swing > 0) a = this.angle + Phaser.Math.Linear(1.0, -1.1, this.swing);
    const hx = s.x + Math.cos(this.angle) * 6 + Math.cos(this.angle + 1.57) * 4;
    const hy = s.y + Math.sin(this.angle) * 6 + Math.sin(this.angle + 1.57) * 4;
    this.weapon.setPosition(hx, hy).setRotation(a);
    this.weapon.setTint(this.state === 'windup' ? 0xffb080 : 0xc9a27a);
    // bony hands: one grips the sword, the other hangs at the hip
    const sn = snap(this.angle), sca = Math.cos(sn), ssa = Math.sin(sn);
    const sw = this.weapon;
    const grip = weaponPoint(2, 4.5, sw.x, sw.y, sw.rotation, sw.originX * sw.width, sw.height, sw.scaleX);
    this.rig.draw(s.x, s.y, sn, [grip, { x: s.x + sca * 3 + ssa * 4.5, y: s.y + ssa * 3 - sca * 4.5 }], { flash: this.flash > 0 });

    // awareness cue: "?" while it is unsure or searching, "!" the moment it has noticed you
    let cue = null, ca = 1;
    if (this.cueT > 0) { this.cueT -= dt; cue = this.cueKind; }
    else if (this.state === 'search') cue = 'wonder';
    else if (this.state === 'idle' && this.alert > 0.25) { cue = 'wonder'; ca = 0.45 + this.alert * 0.55; }
    if (cue) this.cue.setTexture(cue === 'alert' ? 'fx_alert' : 'fx_wonder').setAlpha(ca).setPosition(Math.round(s.x), Math.round(s.y - 20 - (Math.sin(performance.now() / 110) > 0 ? 1 : 0))).setVisible(true);
    else this.cue.setVisible(false);

    // health bar + level
    const showBar = this.barT > 0 || this.marked;
    this.bar.clear();
    this.lvText.setVisible(this.marked);
    if (showBar) {
      // slim bar, one dark pixel of edge, no plate behind it
      const w = 16, x = Math.round(s.x - w / 2), y = Math.round(s.y - 14);
      this.bar.fillStyle(0x14101f, 1).fillRect(x - 1, y - 1, w + 2, 4);
      this.bar.fillStyle(0x4a1a22, 1).fillRect(x, y, w, 2);
      this.bar.fillStyle(0xd4414f, 1).fillRect(x, y, Math.max(0, Math.round(w * (this.hp / this.stats.maxHealth))), 2);
      if (this.marked) this.lvText.setPosition(s.x, y - 2).setText('L' + this.level);
    }
    if (this.marked) {
      if (!this.markIcon) this.markIcon = this.scene.add.image(0, 0, 'fx_mark').setDepth(41);
      this.markIcon.setVisible(true).setPosition(s.x, s.y - 24 + Math.sin(performance.now() / 200) * 1.5);
    } else if (this.markIcon) this.markIcon.setVisible(false);
  }

  hurt(damage, crit, from, knockForce = 60, info) {
    if (!this.alive) return 0;
    const dealt = damageAfterMitigation(damage, this.stats.defense, 0);
    this.hp -= dealt;
    this.flash = 0.12;
    this.barT = 3;
    this.aggro();
    if (this.state === 'idle') this.state = 'chase';
    if (from && knockForce > 0) {
      const a = Math.atan2(this.y - from.y, this.x - from.x);
      this.knock.set(Math.cos(a) * knockForce * (1 - this.def.knockbackResist), Math.sin(a) * knockForce * (1 - this.def.knockbackResist));
      this.stagger = 0.12 + Math.min(0.22, knockForce / 700);
      if (this.state === 'windup' && knockForce > 100) { this.state = 'recover'; this.timer = 0.4; } // heavy hits break the swing
    }
    this.scene.floatText(this.x + Phaser.Math.Between(-4, 4), this.y - 10, String(Math.round(dealt)), crit ? 0xffd84a : 0xffffff, crit ? 2 : 1);
    sfx('hit', { weapon: info && info.weapon, mat: 'bone', crit, at: { x: this.x, y: this.y } });
    this.lastHitAngle = from ? Math.atan2(this.y - from.y, this.x - from.x) : null;
    this.scene.hitFx(this.x, this.y, this.lastHitAngle == null ? Math.random() * 6.28 : this.lastHitAngle, crit);
    if (this.hp <= 0) this.die(crit);
    return dealt;
  }

  // damage that ignores defense (lifesteal skill)
  hurtTrue(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this.barT = 3;
    if (this.hp <= 0) this.die();
  }

  die(crit = false) {
    if (!this.alive) return;
    this.alive = false;
    sfx('kill', { at: { x: this.x, y: this.y } });
    const w = this.weapon;
    this.scene.deathFx(this.x, this.y, this.lastHitAngle, crit, { key: w.texture.key, x: w.x, y: w.y, rotation: w.rotation, scale: w.scaleX, tint: 0xc9a27a });
    this.scene.killFx(this.x, this.y, crit);
    this.scene.onEnemyKilled(this);
    this.sprite.destroy();
    this.shadow.destroy();
    this.weapon.destroy();
    this.rig.destroy();
    this.bar.destroy();
    this.lvText.destroy();
    this.cue.destroy();
    if (this.markIcon) this.markIcon.destroy();
  }
}
