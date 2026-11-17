// The player: movement, dodge, 8 weapons, trait skills, Berserk, Focus, magic.

import Phaser from 'phaser';
import { WEAPONS } from '../data/weapons.js';
import { TRAIT_BY_ID } from '../data/traits.js';
import { BERSERK, COMBAT_TIMEOUT, MANA_TYPES, FOCUS, RANK_COLORS } from '../data/constants.js';
import { HANDS } from '../art/figures.js';
import { HandRig, LOOK, weaponPoint } from './rig.js';
import { hexToInt } from './text.js';
import { computeStats, sumMods, traitPassives } from '../logic/stats.js';
import { playerAttack, damageAfterMitigation } from '../logic/combat.js';
import { Berserk } from '../logic/berserk.js';
import { focusTick } from '../logic/focus.js';
import { addProficiency } from '../logic/progression.js';
import { G } from './state.js';
import { sfx } from './sfx.js';

const BASE_SPEED = 92;
// Movement feel (steep curves: reach top speed fast, stop even faster => "snappy" but not robotic)
const ACCEL = 1250; // px/s^2 while holding a direction
const TURN_BOOST = 1.7; // extra acceleration when reversing/turning sharply
const FRICTION = 1900; // px/s^2 when you let go
const START_KICK = 0.3; // fraction of top speed you get on the very first frame
const DODGE_TIME = 0.2;
const BUFFER_TIME = 0.18; // input buffer window (seconds) for dodge / attack
const QUARTER = Math.PI / 4;
const snap = (a) => Math.round(a / QUARTER) * QUARTER;
const angDiff = (a, b) => Math.abs(Phaser.Math.Angle.Wrap(a - b));

// how each weapon is drawn in the hands
const WEAPON_KEY = {
  training_sword: 'w_sword', training_claymore: 'w_claymore', training_spear: 'w_spear', training_bow: 'w_bow',
  basic_crossbow: 'w_crossbow', one_time_pistol: 'w_pistol', training_mage_book: 'w_book', training_staff: 'w_staff',
};
const IMG_W = { w_sword: 28, w_claymore: 38, w_spear: 44, w_bow: 12, w_crossbow: 24, w_pistol: 18, w_book: 14, w_staff: 34 };
// how each weapon sits in the hands (grip point, distance in front of the body, where the two hands are)
const VIS = {};
for (const [id, key] of Object.entries(WEAPON_KEY)) VIS[id] = { key, ox: HANDS[key].grip / IMG_W[key], hold: HANDS[key].hold, hands: HANDS[key].hands, lat: HANDS[key].lat || 0, rest: HANDS[key].rest || null };

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.t = 0; // game time in seconds (stops while paused)
    this.dead = false;
    this.radius = 5;

    this.shadow = scene.add.image(x, y + 5, 'shadow').setDepth(4);
    this.aura = scene.add.image(x, y, 'fx_glow').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3a2a).setVisible(false).setScale(0.9);
    this.sprite = scene.physics.add.sprite(x, y, 'player').setDepth(10);
    this.sprite.body.setCircle(5, 5, 5);
    this.sprite.ref = this;
    this.scarf = scene.add.image(x, y, 'player_scarf').setDepth(10.1).setOrigin(5 / 20, 11 / 20);
    this.hood = scene.add.image(x, y, 'player_hood').setDepth(10.45);
    this.rig = new HandRig(scene, LOOK.hero, 10.2, 11.5);
    this.weaponSprite = scene.add.image(x, y, 'w_sword').setDepth(11);
    this.nock = scene.add.image(x, y, 'p_arrow').setDepth(11).setVisible(false);
    this.shieldRing = scene.add.image(x, y, 'fx_ring').setDepth(12).setTint(0x7fd0ff).setVisible(false);

    this.berserk = new Berserk();
    this.buffs = []; // {key, until, mods}
    this.cd = [0, 0, 0];
    this.cdMax = [1, 1, 1];
    this.activeUntil = [0, 0, 0];
    this.aim = 0;
    this.inCombatT = 0;
    this.invuln = 0;
    this.dodging = 0;
    this.dodgeVec = new Phaser.Math.Vector2(1, 0);
    this.dodgeCd = 0;
    this.dodgeBuf = 0;
    this.atkBuf = 0;
    this.ghostT = 0;
    this.nudgeCd = 0;
    this.attackCd = 0;
    this.swingT = 1;
    this.swingDir = 1;
    this.focusing = false;
    this.focus = 0;
    this.lockTarget = null;
    this.currentTarget = null;
    this.reload = 0;
    this.castT = 0;
    this.shield = 0;
    this.shieldUntil = 0;
    this.markTarget = null;
    this.markDmg = 0;
    this.markCrit = 0;
    this.bloodlust = { stacks: 0, until: 0, per: 0 };
    this.lifestealUntil = 0;
    this.lifestealPct = 0;
    this.predatorUntil = 0;
    this.predatorBonus = 0;
    this.predatorBelow = 0.5;
    this.denyT = 0;
    this.hurtFlash = 0;
    this.recoil = 0;
    this._sig = '';
    this.hits = 0;

    this.setWeapon(G.profile.weapon);
    this.refreshStats(true);
    this.hp = this.stats.maxHealth;
    this.stamina = this.stats.maxStamina;
    this.mana = this.stats.maxMana;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get profile() { return G.profile; }

  // ------------------------------------------------------------ stats
  refreshStats(initial = false) {
    const p = G.profile;
    const buffMods = sumMods(...this.buffs.map((b) => b.mods), this.berserk.getMods());
    this.stats = computeStats({
      level: p.level,
      manaCircles: p.manaCircles,
      passives: traitPassives(p.traits),
      extra: p.extra,
      buffs: buffMods,
      proficiency: p.proficiency,
    });
    if (!initial) {
      this.hp = Math.min(this.hp, this.stats.maxHealth);
      this.stamina = Math.min(this.stamina, this.stats.maxStamina);
      this.mana = Math.min(this.mana, this.stats.maxMana);
    }
  }

  // called when the menu changed traits / weapon / mana
  reloadLoadout(resetCooldowns = false) {
    this.setWeapon(G.profile.weapon);
    if (resetCooldowns) {
      this.cd = [0, 0, 0];
      this.activeUntil = [0, 0, 0];
      this.buffs = this.buffs.filter((b) => !b.key.startsWith('skill'));
    }
    this.refreshStats();
  }

  setWeapon(id) {
    this.weaponDef = WEAPONS[id] || WEAPONS.training_sword;
    const v = VIS[this.weaponDef.id];
    this.weaponSprite.setTexture(v.key).setOrigin(v.ox, 0.5).setScale(1);
    this.focusing = false; this.focus = 0; this.castT = 0; this.reload = 0;
    this.lockTarget = null;
  }

  swapWeapon() {
    const owned = G.profile.ownedWeapons;
    let i = owned.indexOf(G.profile.weapon);
    for (let n = 0; n < owned.length; n++) {
      i = (i + 1) % owned.length;
      const w = WEAPONS[owned[i]];
      if (w.cls === 'magic' && G.profile.manaCircles <= 0) continue; // magic needs a Mana Circle
      G.profile.weapon = w.id;
      this.setWeapon(w.id);
      this.refreshStats();
      sfx('ui');
      G.ui.toast(`${w.name.toUpperCase()}  (${w.type}, ${w.sheet.speed})`, 'info');
      return;
    }
  }

  // ---------------------------------------------------------- buffs
  addBuff(key, mods, seconds) {
    this.buffs = this.buffs.filter((b) => b.key !== key);
    this.buffs.push({ key, mods, until: this.t + seconds });
    this.refreshStats();
  }

  pruneBuffs() {
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.until > this.t);
    if (this.buffs.length !== before) this.refreshStats();
  }

  // --------------------------------------------------------- helpers
  deny(msg) {
    if (this.denyT > 0) return;
    this.denyT = 0.5;
    sfx('deny');
    if (msg) this.scene.floatText(this.x, this.y - 16, msg, 0xff7a7a, 1);
  }

  heal(amount, quiet = false) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHealth, this.hp + amount);
    const got = this.hp - before;
    if (got > 0.5 && !quiet) this.scene.floatText(this.x, this.y - 14, '+' + Math.round(got), 0x6af08a, 1);
  }

  restoreMana(amount) {
    const before = this.mana;
    this.mana = Math.min(this.stats.maxMana, this.mana + amount);
    const got = this.mana - before;
    if (got > 0.5) this.scene.floatText(this.x, this.y - 14, '+' + Math.round(got) + ' MP', 0x7fb4ff, 1);
  }

  getCond(target) {
    const cond = {};
    if (target && target.marked) { cond.mark = this.markDmg; cond.markCrit = this.markCrit; }
    if (this.bloodlust.until > this.t) cond.bloodlust = this.bloodlust.stacks * this.bloodlust.per;
    if (this.predatorUntil > this.t && target && !target.isDummy && target === this.currentTarget && target.hp / target.stats.maxHealth < this.predatorBelow) {
      cond.predator = this.predatorBonus;
    }
    return cond;
  }

  // ------------------------------------------------------------ update
  update(dt, inp) {
    if (this.dead) return;
    this.t += dt;
    if (this.denyT > 0) this.denyT -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.pruneBuffs();

    // timers
    for (let i = 0; i < 3; i++) if (this.cd[i] > 0) this.cd[i] = Math.max(0, this.cd[i] - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.inCombatT = Math.max(0, this.inCombatT - dt);
    if (this.reload > 0) { this.reload = Math.max(0, this.reload - dt); if (this.reload === 0) sfx('reload'); }
    if (this.shield > 0 && this.shieldUntil <= this.t) this.shield = 0;
    if (this.bloodlust.until <= this.t) this.bloodlust.stacks = 0;
    if (this.markTarget && !this.markTarget.alive) this.markTarget = null;

    // footsteps: one soft step per stride (and a little dust when running)
    const vsp = Math.hypot(this.sprite.body.velocity.x, this.sprite.body.velocity.y);
    if (vsp > 30 && this.dodging <= 0) {
      this.stride = (this.stride || 0) + vsp * dt;
      if (this.stride > 26) { this.stride = 0; sfx('step'); if (vsp > 70) this.scene.stepDust(this.x, this.y); }
    } else this.stride = Math.min(this.stride || 0, 10);

    // berserk
    const { damageTicks } = this.berserk.update(dt);
    if (damageTicks > 0) {
      const dmg = this.stats.maxHealth * BERSERK.decay.periodicDamage * damageTicks;
      this.hp = Math.max(1, this.hp - dmg); // Life Force Decay hurts but never kills you [PLACEHOLDER]
      this.scene.floatText(this.x, this.y - 14, '-' + Math.round(dmg), 0xc27bff, 1);
    }
    const sig = this.berserk.status + this.berserk.cores;
    if (sig !== this._sig) { this._sig = sig; this.refreshStats(); }

    // aim / target
    this.aim = inp.aim;
    this.currentTarget = this.scene.targetNearAim(this.x, this.y, this.aim, 190, 0.7);

    // actions
    if (inp.swap) this.swapWeapon();
    if (inp.berserk) this.toggleBerserk();
    if (inp.skill1) this.useSkill(0);
    if (inp.skill2) this.useSkill(1);
    if (inp.skill3) this.useSkill(2);
    if (inp.dodge) this.dodgeBuf = BUFFER_TIME;
    if (this.dodgeBuf > 0) {
      this.dodgeBuf -= dt;
      // fire as soon as it becomes legal (or deny once if the stamina is really missing)
      if (this.dodging <= 0 && this.dodgeCd <= 0 && this.castT <= 0) {
        if (this.tryDodge(inp)) this.dodgeBuf = 0;
        else if (this.stamina < this.stats.dodgeStamina * this.stats.maxStamina) this.dodgeBuf = 0;
      }
    }
    if (inp.firePressed) this.atkBuf = BUFFER_TIME;
    if (this.atkBuf > 0) this.atkBuf -= dt;

    this.move(dt, inp);
    this.handleWeapon(dt, inp);
    this.recover(dt);
    this.syncSprites(dt);
  }

  move(dt, inp) {
    const s = this.sprite;
    const body = s.body;
    if (this.dodging > 0) {
      this.dodging -= dt;
      // burst out fast, then ease off (reads as a quick roll instead of a sliding box)
      const k = Math.max(0, this.dodging) / DODGE_TIME;
      const dist = 52 * this.stats.dodgeDistance;
      const vmax = dist / (DODGE_TIME * 0.65);
      const sp = vmax * (0.3 + 0.7 * k);
      s.setVelocity(this.dodgeVec.x * sp, this.dodgeVec.y * sp);
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.035; this.scene.afterimage(this); }
      return;
    }
    let top = BASE_SPEED * this.stats.moveSpeed;
    if (this.castT > 0) top *= 0.5;
    if (this.focusing) top *= 0.65;
    if (this.swingT < 1) top *= 0.85;

    const len = Math.hypot(inp.mx, inp.my);
    let vx = body.velocity.x, vy = body.velocity.y;
    if (len > 0.05) {
      // analog sticks: tiny pushes walk, full push runs. Keyboard is always 1.
      const mag = Math.min(1, len);
      const tx = (inp.mx / len) * top * mag, ty = (inp.my / len) * top * mag;
      const cur = Math.hypot(vx, vy);
      if (cur < top * START_KICK) { // first frame: instant response
        vx = (inp.mx / len) * top * START_KICK; vy = (inp.my / len) * top * START_KICK;
      }
      let dx = tx - vx, dy = ty - vy;
      const dl = Math.hypot(dx, dy);
      const dot = cur > 1 ? (vx * tx + vy * ty) / (cur * Math.hypot(tx, ty) || 1) : 1;
      const a = ACCEL * (dot < 0.2 ? TURN_BOOST : 1) * dt;
      if (dl > a) { dx = (dx / dl) * a; dy = (dy / dl) * a; }
      vx += dx; vy += dy;
      this.cornerAssist(dt, inp, len);
    } else {
      const cur = Math.hypot(vx, vy);
      const f = FRICTION * dt;
      if (cur <= f) { vx = 0; vy = 0; } else { vx -= (vx / cur) * f; vy -= (vy / cur) * f; }
    }
    s.setVelocity(vx, vy);
  }

  // When you push along a wall and the opening is only a few pixels off, slide into it
  // instead of getting stuck on the corner (doorways, corridor mouths).
  cornerAssist(dt, inp, len) {
    const body = this.sprite.body;
    const layer = this.scene.layer;
    const ax = inp.mx / len, ay = inp.my / len;
    let dx = 0, dy = 0;
    if (Math.abs(ax) > 0.8 && Math.abs(ay) < 0.5) dx = Math.sign(ax);
    else if (Math.abs(ay) > 0.8 && Math.abs(ax) < 0.5) dy = Math.sign(ay);
    else return;
    const blocked = dx ? (dx > 0 ? body.blocked.right : body.blocked.left) : (dy > 0 ? body.blocked.down : body.blocked.up);
    if (!blocked) return;
    const free = (cx, cy) => layer.getTilesWithinWorldXY(cx - 4.9, cy - 4.9, 9.8, 9.8, { isColliding: true }).length === 0;
    const px = this.x, py = this.y;
    for (let n = 1; n <= 6; n++) {
      for (const sg of [1, -1]) {
        const ox = dx ? 0 : sg * n, oy = dx ? sg * n : 0;
        if (free(px + ox + dx * 3, py + oy + dy * 3)) {
          const step = Math.min(n, 90 * dt);
          if (dx) this.sprite.y += sg * step; else this.sprite.x += sg * step;
          return;
        }
      }
    }
  }

  tryDodge(inp) {
    if (this.dodging > 0 || this.dodgeCd > 0 || this.castT > 0) return false;
    const cost = this.stats.dodgeStamina * this.stats.maxStamina;
    if (this.stamina < cost) { this.deny('NO STAMINA'); return false; }
    this.stamina -= cost;
    this.dodgeCd = this.stats.dodgeCooldown;
    this.dodging = DODGE_TIME;
    this.invuln = DODGE_TIME + 0.08;
    const len = Math.hypot(inp.mx, inp.my);
    const v = this.sprite.body.velocity, vl = Math.hypot(v.x, v.y);
    if (len > 0.1) this.dodgeVec.set(inp.mx / len, inp.my / len);
    else if (vl > 25) this.dodgeVec.set(v.x / vl, v.y / vl); // keep rolling the way you were running
    else this.dodgeVec.set(-Math.cos(this.aim), -Math.sin(this.aim)); // standing still: roll backwards
    this.focusing = false; this.focus = 0;
    sfx('dodge');
    G.profile.flags.tutDodged = true;
    this.scene.dust(this.x, this.y);
    return true;
  }

  recover(dt) {
    const r = this.stats.regen;
    const mode = this.inCombatT > 0 ? 'combat' : 'out';
    this.hp = Math.min(this.stats.maxHealth, this.hp + this.stats.maxHealth * r.health[mode] * dt);
    if (!this.focusing) this.stamina = Math.min(this.stats.maxStamina, this.stamina + this.stats.maxStamina * r.stamina[mode] * dt);
    this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.maxMana * r.mana[mode] * dt);
  }

  // ----------------------------------------------------------- weapons
  handleWeapon(dt, inp) {
    if (this.dodging > 0) return;
    const cls = this.weaponDef.cls;
    if (cls === 'melee') {
      if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / 0.16);
      if (inp.fire || this.atkBuf > 0) this.meleeAttack();
    } else if (cls === 'ranger') this.rangerUpdate(dt, inp);
    else this.magicUpdate(dt, inp);
  }

  meleeAttack() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef;
    if (this.attackCd > 0) return;
    const cost = w.stamina * this.stats.staminaCost * this.stats.maxStamina;
    if (this.stamina < cost) { this.deny('NO STAMINA'); return; }
    this.stamina -= cost;
    this.attackCd = w.cooldown;
    this.atkBuf = 0;
    this.swingT = 0;
    this.swingDir *= -1;
    // a small step into the swing makes melee feel committed
    const lunge = w.id === 'training_claymore' ? 70 : w.id === 'training_spear' ? 85 : 55;
    this.sprite.body.velocity.x += Math.cos(this.aim) * lunge;
    this.sprite.body.velocity.y += Math.sin(this.aim) * lunge;
    sfx('swing', { weapon: w.id });
    this.scene.slashFx(this.x, this.y, this.aim, w.range, 0xffffff, this.swingDir, w.id === 'training_spear' ? 'thrust' : w.id === 'training_claymore' ? 'large' : 'small');

    const half = Phaser.Math.DegToRad(w.arcDeg) / 2;
    let hitAny = false;
    for (const t of this.scene.targets) {
      if (!t.alive) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > w.range + t.radius) continue;
      const slack = Math.atan2(t.radius, Math.max(d, 1)); // bigger bodies are easier to catch on the arc edge
      if (angDiff(Math.atan2(dy, dx), this.aim) > half + slack) continue;
      this.hitTarget(t, w.knockback, 1);
      hitAny = true;
    }
    this.scene.crackHit(this.x, this.y, this.aim, w.range, half);
    if (hitAny) {
      const heavy = w.id === 'training_claymore';
      if (heavy) this.scene.cameras.main.shake(80, 0.0034);
      this.scene.hitStop(heavy ? 78 : w.id === 'training_spear' ? 28 : 34);
      this.scene.kick(this.aim, heavy ? 4 : 2);
    }
  }

  hitTarget(t, knock, focus) {
    const w = this.weaponDef;
    const cond = this.getCond(t);
    const atk = playerAttack({ weapon: w, stats: this.stats, focus, cond, rng: G.rng });
    t.hurt(atk.damage, atk.crit, { x: this.x, y: this.y }, knock, { weapon: w.id, focus });
    if (t.isDummy) G.profile.flags.tutHit = true;
    this.inCombatT = COMBAT_TIMEOUT;
    if (!t.isDummy && this.lifestealUntil > this.t) {
      const steal = t.stats.maxHealth * this.lifestealPct;
      t.hurtTrue(steal);
      this.heal(steal, true);
    }
    // weapon proficiency (Weapon Type Proficiency in the sheet)
    addProficiency(G.profile, w.cls, this.stats.weaponMastery);
    if (++this.hits % 8 === 0) this.refreshStats();
    if (atk.crit) { this.scene.cameras.main.shake(70, 0.0028); this.scene.hitStop(72); this.scene.kick(this.aim, 3); }
  }

  // ranger: hold to FOCUS, release to shoot
  rangerUpdate(dt, inp) {
    const w = this.weaponDef;
    if (!this.focusing && inp.firePressed && this.attackCd <= 0 && this.reload <= 0) {
      this.focusing = true;
      this.focus = 0;
      this.charged = false;
      sfx('draw', { weapon: w.id });
    }
    if (!this.focusing) { this.lockTarget = null; return; }

    if (inp.fire) {
      const r = focusTick(this.focus, dt, this.stats.focusSpeed, w.focusRate, this.stamina > 1);
      this.focus = r.focus;
      if (!this.charged && this.focus >= 1) { this.charged = true; sfx('charged'); this.scene.ringFx(this.x, this.y, 0xffe27a, 2); } // fully focused: ping + a pulse
      if (r.staminaFrac > 0) this.stamina = Math.max(0, this.stamina - r.staminaFrac * this.stats.staminaCost * this.stats.maxStamina);
      this.lockTarget = this.scene.targetNearAim(this.x, this.y, this.aim, FOCUS.lockRange, 0.55);
    } else {
      this.fireRanged();
      this.focusing = false;
      this.focus = 0;
      this.lockTarget = null;
    }
  }

  fireRanged() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef;
    if (this.focus < w.minFocus) { this.deny('NEEDS MORE CHARGE'); return; }
    const cost = w.stamina * this.stats.staminaCost * this.stats.maxStamina;
    if (this.stamina < cost) { this.deny('NO STAMINA'); return; }
    this.stamina -= cost;
    let angle = this.aim;
    if (this.lockTarget && this.lockTarget.alive) angle = Math.atan2(this.lockTarget.y - this.y, this.lockTarget.x - this.x);
    const boost = 1 + (w.maxProjectileBoost - 1) * Math.min(1, this.focus / 1.5);
    this.shoot(angle, w.projectileSpeed * boost, w.projectile, this.focus, 2.5);
    this.attackCd = w.cooldown;
    if (w.reload) this.reload = w.reload;
    sfx('shoot', { weapon: w.id, power: Math.min(1, this.focus) });
    this.inCombatT = COMBAT_TIMEOUT;
    this.recoil = 1;
  }

  shoot(angle, speed, texture, focus, radius, tint) {
    const key = texture === 'mana_bolt' ? 'p_mana_bolt' : texture === 'mana_orb' ? 'p_mana_orb' : 'p_' + texture;
    const hold = VIS[this.weaponDef.id].hold + 8;
    const p = this.scene.projectiles.create(this.x + Math.cos(angle) * hold, this.y + Math.sin(angle) * hold, key).setDepth(12);
    const fw = p.width, fh = p.height;
    p.body.setCircle(radius, fw / 2 - radius, fh / 2 - radius);
    p.setRotation(texture.startsWith('mana') ? 0 : angle);
    p.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    p.life = 1.5;
    p.shot = { weapon: this.weaponDef, focus };
    if (texture === 'bullet') p.trail = { every: 0.012, color: 0xfff2d0, ms: 90 };
    else if (texture.startsWith('mana')) p.trail = { every: 0.035, color: tint || 0x9fb4ff, ms: 190 };
    if (tint) p.setTint(tint);
    if (texture === 'bullet') { this.scene.spark(p.x, p.y); this.scene.kick(angle + Math.PI, 3); }
    else if (texture === 'bolt') this.scene.kick(angle + Math.PI, 2);
    return p;
  }

  projectileHit(proj, target) {
    if (!proj.active || !target.alive) return;
    const w = proj.shot.weapon;
    // temporarily evaluate with the weapon the projectile was fired from
    const keep = this.weaponDef;
    this.weaponDef = w;
    this.hitTarget(target, w.cls === 'magic' ? 30 : 40, proj.shot.focus);
    this.weaponDef = keep;
    this.scene.spark(proj.x, proj.y);
    proj.destroy();
  }

  magicUpdate(dt, inp) {
    const w = this.weaponDef;
    if (this.castT > 0) {
      this.castT -= dt;
      if (this.castT <= 0) this.releaseSpell();
      return;
    }
    if (inp.fire && this.attackCd <= 0) {
      if (G.profile.manaCircles <= 0) { this.deny('NO MANA CIRCLE'); this.attackCd = 0.4; G.ui.toast('Magic needs a Mana Circle. Equip a Magic trait and visit the Mana Altar.', 'warn'); return; }
      const cost = w.mana * this.stats.manaCost;
      if (this.mana < cost) { this.deny('NO MANA'); return; }
      this.mana -= cost;
      this.castT = w.castTime;
      this.attackCd = w.cooldown + w.castTime;
      this.inCombatT = COMBAT_TIMEOUT;
      sfx('magic', { weapon: w.id });
    }
  }

  releaseSpell() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef;
    const color = G.profile.manaType ? parseInt(MANA_TYPES[G.profile.manaType].color.slice(1), 16) : 0x9fb4ff;
    let angle = this.aim;
    const tg = this.currentTarget;
    if (tg && tg.alive && angDiff(Math.atan2(tg.y - this.y, tg.x - this.x), angle) < 0.22) angle = Math.atan2(tg.y - this.y, tg.x - this.x);
    this.shoot(angle, w.projectileSpeed, w.projectile, 1, w.radius, color);
    sfx('cast', { weapon: w.id });
    this.recoil = 0.6;
  }

  // ------------------------------------------------------------ skills
  skillInfo(i) {
    const id = G.profile.traits[i];
    const trait = id ? TRAIT_BY_ID[id] : null;
    return {
      trait,
      skill: trait ? trait.skill : null,
      cd: this.cd[i],
      cdMax: this.cdMax[i],
      activeLeft: Math.max(0, this.activeUntil[i] - this.t),
    };
  }

  startCd(i, seconds) {
    this.cd[i] = seconds;
    this.cdMax[i] = seconds;
  }

  useSkill(i) {
    const trait = TRAIT_BY_ID[G.profile.traits[i]];
    if (!trait) { this.deny('EMPTY SLOT'); return; }
    const sk = trait.skill;
    if (!sk) { this.deny('SKILL LOCKED'); G.ui.toast(`${trait.name}: skill is blank in the plan (locked).`, 'warn'); return; }
    if (this.cd[i] > 0) { this.deny(Math.ceil(this.cd[i]) + 's'); return; }
    const key = 'skill' + i;
    let used = true;
    switch (sk.kind) {
      case 'buff':
        this.addBuff(key, sk.mods, sk.active);
        break;
      case 'mark': {
        const t = this.lockTarget || this.scene.targetNearAim(this.x, this.y, this.aim, 240, 0.9);
        if (!t) { this.deny('NO TARGET'); used = false; break; }
        if (this.markTarget) this.markTarget.marked = false;
        this.markTarget = t; t.marked = true;
        this.markDmg = sk.damage; this.markCrit = sk.critRate;
        break;
      }
      case 'heal': this.heal(this.stats.maxHealth * sk.pct); break;
      case 'mana':
        if (this.stats.maxMana <= 0) { this.deny('NO MANA POOL'); used = false; break; }
        this.restoreMana(this.stats.maxMana * sk.pct);
        break;
      case 'cdcut':
        for (let j = 0; j < 3; j++) if (j !== i && this.cd[j] > 0) this.cd[j] = Math.max(0, this.cd[j] - this.cdMax[j] * sk.pct);
        break;
      case 'secondwind':
        if (this.hp / this.stats.maxHealth >= sk.threshold) { this.deny('HEALTH NOT LOW'); used = false; break; }
        this.heal(this.stats.maxHealth * sk.pct);
        break;
      case 'bloodlust':
        this.bloodlust = { stacks: 0, until: this.t + sk.active, per: sk.perKill, max: sk.maxStacks };
        break;
      case 'lifesteal':
        this.lifestealUntil = this.t + sk.active; this.lifestealPct = sk.pct;
        break;
      case 'shield':
        this.shield = this.stats.maxHealth * sk.pct; this.shieldUntil = this.t + sk.active;
        break;
      case 'predator':
        this.predatorUntil = this.t + sk.active; this.predatorBonus = sk.bonus; this.predatorBelow = sk.below;
        break;
      case 'berserk':
        if (this.weaponDef.cls !== 'melee') { this.deny('NEEDS MELEE WEAPON'); used = false; break; }
        if (!this.berserk.activate(sk.mods, sk.active)) { this.deny('AURA CORE EMPTY'); used = false; break; }
        break;
      default: used = false;
    }
    if (!used) return;
    this.startCd(i, sk.cooldown);
    this.activeUntil[i] = this.t + sk.active;
    sfx(sk.kind === 'berserk' ? 'berserk' : 'skill');
    this.scene.floatText(this.x, this.y - 18, trait.name.toUpperCase(), 0xffe27a, 1);
    this.scene.ringFx(this.x, this.y, 0xffe27a);
  }

  toggleBerserk() {
    if (this.weaponDef.cls !== 'melee') { this.deny('NEEDS MELEE WEAPON'); G.ui.toast('Sword Aura is a Melee system. Equip a Sword, Claymore or Spear.', 'warn'); return; }
    if (this.berserk.active) { this.berserk.deactivate(); sfx('ui'); return; }
    if (this.berserk.decay) { this.deny('LIFE FORCE DECAY'); return; }
    if (!this.berserk.activate()) { this.deny('AURA CORE EMPTY'); return; }
    sfx('berserk');
    this.scene.ringFx(this.x, this.y, 0xff3a2a);
    this.scene.cameras.main.shake(120, 0.004);
  }

  onKill() {
    if (this.bloodlust.until > this.t) this.bloodlust.stacks = Math.min(this.bloodlust.max || 5, this.bloodlust.stacks + 1);
  }

  // ------------------------------------------------------------ damage
  takeHit(raw, crit, src) {
    if (this.dead) return false;
    if (this.invuln > 0) {
      this.scene.floatText(this.x, this.y - 14, 'DODGE', 0x9fe8ff, 1);
      return false;
    }
    let dmg = damageAfterMitigation(raw, this.stats.defense, this.stats.damageReduction);
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
    }
    this.hp -= dmg;
    this.inCombatT = COMBAT_TIMEOUT;
    sfx('hurt');
    this.scene.cameras.main.shake(110, 0.004);
    this.scene.hitStop(55);
    this.scene.hud.flashHurt(Math.min(0.9, 0.5 + dmg / this.stats.maxHealth * 2));
    this.hurtFlash = 0.1;
    if (dmg > 0) this.scene.floatText(this.x, this.y - 12, (crit ? 'CRIT ' : '') + Math.round(dmg), crit ? 0xff5a5a : 0xff9a9a, crit ? 2 : 1);
    if (src) {
      const a = Math.atan2(this.y - src.y, this.x - src.x);
      this.sprite.setVelocity(Math.cos(a) * 160, Math.sin(a) * 160);
      this.scene.kick(a, 3);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.sprite.setVelocity(0, 0);
      this.scene.onPlayerDeath();
    }
    return true;
  }

  // ------------------------------------------------------------ visuals
  syncSprites(dt) {
    const s = this.sprite;
    this.shadow.setPosition(s.x, s.y + 5);
    const bodyAng = snap(this.aim);
    const ca0 = Math.cos(bodyAng), sa0 = Math.sin(bodyAng);
    const alpha = this.dodging > 0 ? 0.55 : 1;
    s.setRotation(bodyAng).setAlpha(alpha);
    this.hood.setPosition(s.x, s.y).setRotation(bodyAng).setAlpha(alpha);
    // scarf: the knot sits behind the neck, the tail trails and sways (more when running / rolling)
    const vel = s.body.velocity;
    const spd = Math.hypot(vel.x, vel.y);
    const sway = Math.sin(this.t * 6) * 0.08 * (0.35 + Math.min(1.5, spd / 90)) + (this.dodging > 0 ? 0.35 : 0);
    this.scarf.setPosition(s.x - ca0 * 5 - sa0, s.y - sa0 * 5 + ca0).setRotation(bodyAng + sway).setAlpha(alpha);

    // berserk aura / status tint
    this.aura.setPosition(s.x, s.y).setVisible(this.berserk.active);
    if (this.berserk.active) this.aura.setScale(0.9 + Math.sin(this.t * 12) * 0.08).setAlpha(0.55);
    let tint = null;
    if (this.hurtFlash > 0) tint = 0xff6a6a;
    else if (this.berserk.decay) tint = 0xb48aff;
    else if (this.berserk.exhaustion > 0 && !this.berserk.active) tint = 0xb0b0c0;
    if (tint == null) { s.clearTint(); this.hood.clearTint(); } else { s.setTint(tint); this.hood.setTint(tint); }
    this.scarf.setTint(this.hurtFlash > 0 ? 0xff6a6a : hexToInt(RANK_COLORS[this.stats.rank] || '#b7b0a2'));

    // weapon
    const w = this.weaponDef;
    const v = VIS[w.id];
    let hold = v.hold;
    let ang = this.aim;
    const cos = Math.cos(this.aim), sin = Math.sin(this.aim);
    if (w.cls === 'melee') {
      if (this.swingT < 1) {
        const half = Phaser.Math.DegToRad(w.arcDeg) / 2;
        if (w.id === 'training_spear') hold += Math.sin(this.swingT * Math.PI) * 14;
        else ang += this.swingDir * Phaser.Math.Linear(-half, half, this.swingT);
      } else ang += 0.35 * this.swingDir * -1; // relaxed pose
    } else if (w.cls === 'ranger') {
      if (this.focusing && w.id !== 'training_bow') hold -= 1 + Math.min(1, this.focus) * 1.5;
      if (this.recoil > 0) { hold -= this.recoil * 3; this.recoil = Math.max(0, this.recoil - dt * 8); }
    } else {
      if (this.castT > 0) { hold += 2 + (Math.sin(this.t * 40) > 0 ? 1 : 0); } this.weaponSprite.setScale(1);
    }
    this.weaponSprite.setPosition(s.x + cos * hold - sin * v.lat, s.y + sin * hold + cos * v.lat).setRotation(ang);
    if (w.cls === 'magic' && w.id === 'training_mage_book') this.weaponSprite.setRotation(this.aim + Math.sin(this.t * 3) * 0.1);

    // hands: sleeves from the shoulders to the grip points of whatever is held
    const wsp = this.weaponSprite;
    const gripPx = wsp.originX * wsp.width;
    const wp = (hx, hy) => weaponPoint(hx, hy, wsp.x, wsp.y, wsp.rotation, gripPx, wsp.height, wsp.scaleX);
    const hands = v.hands.map(([hx, hy]) => wp(hx, hy));
    if (v.rest) hands.push({ x: s.x + ca0 * v.rest[0] - sa0 * v.rest[1], y: s.y + sa0 * v.rest[0] + ca0 * v.rest[1] });
    const isBow = w.id === 'training_bow';
    const pull = isBow && this.focusing ? Math.min(1, this.focus) * 6 : 0;
    if (isBow) hands[1] = wp(3 - pull, 13);
    const lunge = w.id === 'training_spear' && this.swingT < 1 ? Math.sin(this.swingT * Math.PI) * 14 * 0.45 : 0;
    this.rig.draw(s.x, s.y, bodyAng, hands, { alpha, flash: this.hurtFlash > 0, lean: lunge });
    if (isBow) { // the string follows the drawing hand
      const a = wp(3, 1), b = wp(3, 25);
      this.rig.line(a.x, a.y, hands[1].x, hands[1].y, 0xe8e2cc);
      this.rig.line(b.x, b.y, hands[1].x, hands[1].y, 0xe8e2cc);
    }
    wsp.setAlpha(alpha);

    // nocked arrow while drawing the bow
    this.nock.setVisible(this.focusing && isBow);
    if (this.focusing && isBow) this.nock.setPosition(hands[1].x + cos * 5, hands[1].y + sin * 5).setRotation(this.aim);

    this.shieldRing.setVisible(this.shield > 0).setPosition(s.x, s.y).setAlpha(0.5 + Math.sin(this.t * 6) * 0.2);
  }
}
