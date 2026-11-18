// Skeleton Soldier + Training Dummy.

import Phaser from 'phaser';
import { ENEMIES } from '../data/enemies.js';
import { RANK_COLORS, rankOfLevel } from '../data/constants.js';
import { computeEnemyStats } from '../logic/stats.js';
import { enemyAttack, damageAfterMitigation } from '../logic/combat.js';
import { G, shakeCam } from './state.js';
import { sfx } from './sfx.js';
import { T } from '../data/tuning.js';
import { txt, hexToInt } from './text.js';
import { HandRig, LOOK, weaponPoint } from './rig.js';
import { alertRate } from '../logic/awareness.js';

const QUARTER = Math.PI / 4;
const snap = (a) => Math.round(a / QUARTER) * QUARTER;
const angDiff = (a, b) => Math.abs(Phaser.Math.Angle.Wrap(a - b));
// weapon image width and the x of its grip: the weapon turns about that point
const WEAPON_GRIP = { w_sword: [28, 2.8], w_claymore: [38, 4], w_spear: [32, 7], w_bow: [12, 8.5], w_staff: [34, 17] };

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
  constructor(scene, x, y, level, statMult, idx, room = null, defId = 'skeleton_soldier') {
    this.scene = scene;
    this.def = ENEMIES[defId] || ENEMIES.skeleton_soldier;
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
    this.stats.maxHealth *= T('enemyHp'); this.stats.defense *= T('enemyHp'); // tuning panel
    this.hp = this.stats.maxHealth;
    this.alive = true;
    this.marked = false;
    this.isDummy = false;

    this.shadow = scene.add.image(x, y + 4, 'shadow').setDepth(4);
    this.sprite = scene.physics.add.sprite(x, y, 'skeleton').setDepth(9);
    this.sprite.body.setCircle(6, 4, 4);
    this.sprite.ref = this;
    const wg = WEAPON_GRIP[this.def.wkey] || WEAPON_GRIP.w_sword;
    this.weapon = scene.add.image(x, y, this.def.wkey).setDepth(9.5).setTint(this.def.wtint).setOrigin(wg[1] / wg[0], 0.5);
    this.sprite.setTint(this.def.tint);
    if (this.def.style === 'bow') this.nock = scene.add.image(x, y, 'p_arrow').setDepth(9.6).setTint(this.def.ranged.tint).setVisible(false);
    if (this.def.style === 'staff') this.orbGlow = scene.add.image(x, y, 'fx_glow').setDepth(9.7).setBlendMode(Phaser.BlendModes.ADD).setTint(0xb48aff).setVisible(false);
    this.rig = new HandRig(scene, LOOK.bone, 9.2, 9.7);
    this.bar = scene.add.graphics().setDepth(40);
    this.tele = scene.add.graphics().setDepth(11.5); // the archer's aim line
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
    this.walkPh = Math.random() * 6.28; this.tt = Math.random() * 10; this.hitT = 0; this.hitA = 0;
    this.lunge = new Phaser.Math.Vector2(0, 0); this.stepSide = 1; this.stepD = 0;
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
          if (d.ranged) { // archers and mages keep their distance, strafe, and shoot when they can see you
            const R = d.ranged, inSight = this.sees && dist <= R.range;
            if (inSight && this.cooldown <= 0) { this.state = 'windup'; this.timer = d.windup; sfx(d.style === 'staff' ? 'magewind' : 'windup', { at: { x: this.x, y: this.y } }); break; }
            this.strafeT = (this.strafeT || 0) - dt;
            if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.6; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
            if (dist < R.keep) { vx = -Math.cos(toPlayer) * d.moveSpeed * 0.9; vy = -Math.sin(toPlayer) * d.moveSpeed * 0.9; } // too close: back away
            else if (!inSight || dist > R.range * 0.85) { vx = Math.cos(toPlayer) * d.moveSpeed; vy = Math.sin(toPlayer) * d.moveSpeed; } // out of sight or range: close in
            else { vx = -Math.sin(toPlayer) * d.moveSpeed * 0.35 * this.strafeDir; vy = Math.cos(toPlayer) * d.moveSpeed * 0.35 * this.strafeDir; } // in range: circle
            this.stepT = (this.stepT || 0) - dt;
            if ((vx || vy) && this.stepT <= 0) { this.stepT = 0.3; sfx('erattle', { at: { x: this.x, y: this.y } }); }
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
          if (this.timer > d.windup * 0.35) { this.angle = toPlayer; if (!d.ranged) { vx = -Math.cos(toPlayer) * 14; vy = -Math.sin(toPlayer) * 14; } } // rears back, then commits
          if (this.timer <= 0) {
            if (d.ranged) this.fire(player); else this.strike(player);
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
    if (this.stagger <= 0 && this.lunge.lengthSq() > 4) { // the step forward that goes into a swing
      vx += this.lunge.x; vy += this.lunge.y;
      this.lunge.scale(Math.max(0, 1 - dt * 9));
    }
    s.setVelocity(vx, vy);
    // gait: the sword and hands rock with each step, and a puff of dust now and then
    const spd = Math.hypot(vx, vy);
    this.tt += dt;
    if (spd > 12) {
      this.walkPh += spd * dt / 9;
      this.stepD += spd * dt;
      if (this.stepD > 22) {
        this.stepD = 0; this.stepSide = -this.stepSide;
        if (spd > 40) this.scene.stepDust(this.x, this.y, vx, vy, this.stepSide);
        if (d.style === 'heavy' && spd > 40 && dist < 120) { // a brute's footfall is felt
          this.scene.stepDust(this.x, this.y, vx, vy, -this.stepSide);
          shakeCam(this.scene, 50, 0.0012 * (1 - dist / 140));
        }
      }
    } else this.walkPh = Math.round(this.walkPh / Math.PI) * Math.PI;
    this.gait = Math.min(1, spd / 50);
    if (this.hitT > 0) this.hitT = Math.max(0, this.hitT - dt);
    this.draw(dt, dist);
  }

  strike(player) {
    const d = this.def;
    const reach = d.attackRange + 8;
    this.swing = 1;
    this.lunge.set(Math.cos(this.angle) * 80, Math.sin(this.angle) * 80);
    sfx('eswing', { at: { x: this.x, y: this.y } });
    this.scene.slashFx(this.sprite.x, this.sprite.y, this.angle, reach, 0xff8a5a, 1, d.style === 'spear' ? 'thrust' : d.style === 'heavy' ? 'large' : 'small');
    if (d.style === 'heavy') { // the claymore comes down on the floor: shockwave, rubble and a rumble
      const gx = this.x + Math.cos(this.angle) * reach * 0.75, gy = this.y + Math.sin(this.angle) * reach * 0.75;
      this.scene.shockwave(gx, gy, 0xcfc8b0, 0.45);
      sfx('slam', { at: { x: this.x, y: this.y } });
      const pd = Math.hypot(player.sprite.x - this.x, player.sprite.y - this.y);
      if (pd < 170) shakeCam(this.scene, 110, 0.0042 * (1.15 - pd / 200));
    } else if (d.style === 'spear') { // the lancer drives forward: speed lines and a scuff
      this.scene.speedStreak(this.x, this.y, this.angle);
      this.scene.startDust(this.x, this.y, Math.cos(this.angle), Math.sin(this.angle));
    }
    const dx = player.sprite.x - this.sprite.x, dy = player.sprite.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    if (dist <= reach + 4 && angDiff(ang, this.angle) <= Phaser.Math.DegToRad(d.attackArcDeg) / 2) {
      const atk = enemyAttack({ enemyStats: this.stats, rng: G.rng });
      player.takeHit(atk.damage * T('enemyDmg'), atk.crit, this);
    }
  }

  // archers and mages: the shot leaves the bow / the head of the staff and flies straight; it is dodgeable (dodge roll = no hit)
  fire(player) {
    const d = this.def, R = d.ranged;
    const o = this.muzzle || { x: this.x, y: this.y };
    const a = Math.atan2(player.sprite.y - o.y, player.sprite.x - o.x) + (Math.random() - 0.5) * 0.12;
    const atk = enemyAttack({ enemyStats: this.stats, rng: G.rng });
    this.scene.enemyShoot(o.x, o.y, a, R.speed, R.shot === 'arrow' ? 'p_arrow' : 'p_enemy', R.tint, atk.damage * T('enemyDmg'), atk.crit, d.style === 'staff' ? 0xb48aff : 0xe8e0cc);
    this.swing = 1; // the bow springs forward / the staff jerks
    this.recoilT = 0.14;
    this.scene.muzzleFlash(o.x, o.y, a, d.style === 'staff' ? 0xb48aff : 0xe8e0cc, d.style === 'staff' ? 0.9 : 0.4);
    if (d.style === 'staff') this.scene.ringFx(o.x, o.y, 0xb48aff, 2);
    sfx(d.style === 'staff' ? 'cast' : 'shoot', { weapon: d.style === 'staff' ? 'training_mage_book' : 'training_bow', at: { x: this.x, y: this.y } });
  }

  draw(dt, distToPlayer) {
    const s = this.sprite, d = this.def;
    this.shadow.setPosition(s.x, s.y + 5);
    s.setRotation(snap(this.angle));
    // flash white when hit, pulse when winding up
    if (this.flash > 0) s.setTint(0xff9090);
    else if (this.state === 'windup') s.setTint(Math.floor(this.timer * 22) % 2 ? 0xffd0a0 : 0xffffff);
    else s.setTint(d.tint);

    // weapon: each variety holds and swings its own (sword / claymore sweep, spear thrusts, bow draws, staff is raised)
    const st = d.style, sw = this.weapon;
    const sn = snap(this.angle), sca = Math.cos(sn), ssa = Math.sin(sn);
    const prog = this.state === 'windup' ? 1 - this.timer / d.windup : 0; // how far the wind-up has got
    const rk = this.hitT > 0 ? this.hitT / 0.18 : 0; // a blow rattles it: the weapon shakes in its hand and is knocked back
    const gait = this.gait || 0;
    const idle = Math.sin(this.tt * 1.6) * 0.04 + Math.sin(this.walkPh) * 0.1 * gait;
    const bobv = (Math.sin(this.tt * 2) > 0.5 ? 0.5 : 0) + Math.sin(this.walkPh) * 0.6 * gait - Math.cos(this.hitA) * rk * 2;
    const kx = Math.cos(this.hitA) * rk * 2, ky = Math.sin(this.hitA) * rk * 2;
    const fwd = (len, lat) => ({ x: s.x + Math.cos(this.angle) * len - Math.sin(this.angle) * lat, y: s.y + Math.sin(this.angle) * len + Math.cos(this.angle) * lat });
    const wp = (hx2, hy2) => weaponPoint(hx2, hy2, sw.x, sw.y, sw.rotation, sw.originX * sw.width, sw.height, sw.scaleX);
    const hip = { x: s.x + sca * (3 - Math.sin(this.walkPh) * gait * 1.4) + ssa * 4.5, y: s.y + ssa * (3 - Math.sin(this.walkPh) * gait * 1.4) - sca * 4.5 };
    let hands;
    this.muzzle = null;
    if (st === 'sword' || st === 'heavy') {
      const big = st === 'heavy';
      let a = this.angle + (big ? 1.1 : 0.9);
      if (this.state === 'windup') a = this.angle - (big ? 1.7 : 1.3) - prog * 0.3;
      if (this.swing > 0) a = this.angle + Phaser.Math.Linear(big ? 1.3 : 1.0, big ? -1.4 : -1.1, this.swing);
      else if (this.state !== 'windup') a += idle;
      if (rk > 0) a += Math.sin(this.hitT * 70) * 0.3 * rk;
      const p0 = fwd(6 + bobv, 4);
      sw.setPosition(p0.x + kx, p0.y + ky).setRotation(a);
      hands = big ? [wp(2.5, 6.5), wp(5.5, 6.5)] : [wp(2, 4.5), hip];
    } else if (st === 'spear') {
      let push = 0;
      if (this.state === 'windup') push = -5 * (1 - (1 - prog) * (1 - prog));
      if (this.swing > 0) push = 11 * this.swing;
      const a = this.angle + (this.swing > 0 || this.state === 'windup' ? 0 : idle * 0.6) + (rk > 0 ? Math.sin(this.hitT * 70) * 0.25 * rk : 0);
      const p0 = fwd(5 + push + bobv, 3.5);
      sw.setPosition(p0.x + kx, p0.y + ky).setRotation(a);
      hands = [wp(5.5, 4), wp(10, 4)];
    } else if (st === 'bow') {
      const pull = this.state === 'windup' ? Math.min(1, prog * 1.15) * 5 : 0;
      const p0 = fwd(7 + bobv - (this.swing > 0 ? this.swing * 2 : 0), 0);
      sw.setPosition(p0.x + kx, p0.y + ky).setRotation(this.angle + (rk > 0 ? Math.sin(this.hitT * 70) * 0.2 * rk : 0));
      const rear = wp(3 - pull, 13);
      hands = [wp(8.5, 13), rear];
      const ta = wp(3, 1), tb = wp(3, 25);
      this.rig.line(ta.x, ta.y, rear.x, rear.y, 0xe8e2cc);
      this.rig.line(tb.x, tb.y, rear.x, rear.y, 0xe8e2cc);
      const nock = this.state === 'windup';
      this.nock.setVisible(nock);
      if (nock) this.nock.setPosition(rear.x + Math.cos(this.angle) * 5, rear.y + Math.sin(this.angle) * 5).setRotation(this.angle);
      this.muzzle = { x: p0.x + Math.cos(this.angle) * 5, y: p0.y + Math.sin(this.angle) * 5 };
    } else { // staff: carried upright at the side, raised at you as it charges
      let a = this.angle - 1.35 + idle;
      if (this.state === 'windup') a = Phaser.Math.Linear(this.angle - 1.35, this.angle - 0.15, Math.min(1, prog * 1.2));
      if (this.swing > 0) a = this.angle - 0.05 + 0.5 * (1 - this.swing);
      if (rk > 0) a += Math.sin(this.hitT * 70) * 0.25 * rk;
      const p0 = fwd(4 + bobv, -4.5);
      sw.setPosition(p0.x + kx, p0.y + ky).setRotation(a);
      const grip = wp(17, 5);
      hands = [grip, hip];
      const tip = wp(29.5, 5);
      this.muzzle = { x: tip.x, y: tip.y };
      const gl = this.orbGlow;
      const charge = this.state === 'windup' ? prog : this.swing > 0 ? 1 : 0;
      gl.setVisible(charge > 0.02).setPosition(tip.x, tip.y).setScale(0.3 + charge * 0.5).setAlpha(0.25 + charge * 0.7);
    }
    // telegraphs: the archer's aim line (it locks on for the last third of the draw), the mage's orb gathering power
    const tg = this.tele;
    tg.clear();
    if (this.state === 'windup' && st === 'bow' && this.muzzle) {
      const locked = this.timer <= d.windup * 0.35, A = this.angle;
      const col = locked ? 0xffe0c0 : 0xff6a5a, al = locked ? 0.9 : 0.3 + prog * 0.5;
      const mx = this.muzzle.x, my = this.muzzle.y, ca = Math.cos(A), sa = Math.sin(A);
      let len = 0;
      const maxLen = Math.min(d.ranged.range, 170);
      for (let L = 8; L <= maxLen; L += 5) {
        if (L % 20 === 8 && !this.scene.hasLOS(mx, my, mx + ca * L, my + sa * L)) break; // stops at the first wall
        len = L;
        if (locked || Math.floor(L / 5) % 2 === 0) tg.fillStyle(col, al * (1 - L / (maxLen * 1.25))).fillRect(Math.round(mx + ca * L), Math.round(my + sa * L), 1, 1);
      }
      void len;
    }
    if (this.state === 'windup' && st === 'staff' && this.muzzle) {
      this.gatherT = (this.gatherT || 0) - dt;
      if (this.gatherT <= 0) { this.gatherT = 0.06; this.scene.gatherFx(this.muzzle.x, this.muzzle.y, 0xc9a6ff, 10 + (1 - prog) * 8); }
    }
    sw.setTint(this.state === 'windup' ? 0xffb080 : d.wtint);
    this.rig.draw(s.x, s.y, sn, hands, { flash: this.flash > 0 });

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
      this.bar.fillStyle(0xd4414f, 1).fillRect(x, y, Math.max(0, Math.min(w, Math.round(w * (this.hp / this.stats.maxHealth)))), 2);
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
    this.hitT = 0.18; this.hitA = from ? Math.atan2(this.y - from.y, this.x - from.x) : 0;
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
    this.scene.deathFx(this.x, this.y, this.lastHitAngle, crit, { key: w.texture.key, x: w.x, y: w.y, rotation: w.rotation, scale: w.scaleX, tint: this.def.wtint });
    this.scene.killFx(this.x, this.y, crit);
    if (this.def.style === 'heavy') { // a brute goes down hard
      this.scene.shockwave(this.x, this.y, 0xcfc8b0, 0.5);
      shakeCam(this.scene, 120, 0.004);
    } else if (this.def.style === 'staff') { // the mage's orb lets go
      this.scene.glowPop(this.x, this.y, 0xb48aff, 1.1, 300, 0.7);
      this.scene.burst(this.x, this.y, 0xb48aff, 14, 22, 4);
      this.scene.ringFx(this.x, this.y, 0xb48aff, 3);
    }
    this.scene.onEnemyKilled(this);
    this.sprite.destroy();
    this.shadow.destroy();
    this.weapon.destroy();
    if (this.tele) this.tele.destroy();
    if (this.nock) this.nock.destroy();
    if (this.orbGlow) this.orbGlow.destroy();
    this.rig.destroy();
    this.bar.destroy();
    this.lvText.destroy();
    this.cue.destroy();
    if (this.markIcon) this.markIcon.destroy();
  }
}
