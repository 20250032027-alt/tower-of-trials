// The player: movement, dodge, 8 weapons, trait skills, Berserk, Focus, magic.

import Phaser from 'phaser';
import { WEAPONS } from '../data/weapons.js';
import { TRAIT_BY_ID } from '../data/traits.js';
import { SKILL_BY_ID, ALL_SKILL_IDS } from '../data/skills.js';
import { BERSERK, COMBAT_TIMEOUT, MANA_TYPES, FOCUS, RANK_COLORS } from '../data/constants.js';
import { HANDS, BLESS } from '../art/figures.js';
import { HandRig, LOOK, weaponPoint } from './rig.js';
import { hexToInt } from './text.js';
import { computeStats, sumMods, traitPassives } from '../logic/stats.js';
import { playerAttack, damageAfterMitigation } from '../logic/combat.js';
import { Berserk } from '../logic/berserk.js';
import { focusTick } from '../logic/focus.js';
import { addProficiency } from '../logic/progression.js';
import { G, shakeCam } from './state.js';
import { sfx } from './sfx.js';
import { T } from '../data/tuning.js';

const BASE_SPEED = 124; // was 92 (felt slow); swing/focus slow-downs below are softer to match
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
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeIn = (u) => u * u;
const smooth = (u) => u * u * (3 - 2 * u);
const SLAM_DOWN = 0.09; // seconds from the top of the staff swing to the hit
const SLAM_TOTAL = 0.36; // ... until the staff has settled again

// how each weapon is drawn in the hands
const WEAPON_KEY = {
  training_sword: 'w_sword', training_claymore: 'w_claymore', training_spear: 'w_spear', training_bow: 'w_bow',
  basic_crossbow: 'w_crossbow', one_time_pistol: 'w_pistol', m4: 'w_m4', training_mage_book: 'w_book', training_staff: 'w_staff',
};
const IMG_W = { w_sword: 28, w_claymore: 38, w_spear: 32, w_bow: 12, w_crossbow: 24, w_pistol: 18, w_m4: 34, w_book: 14, w_staff: 34 };
// how each weapon sits in the hands (grip point, distance in front of the body, where the two hands are)
const VIS = {};
for (const [id, key] of Object.entries(WEAPON_KEY)) VIS[id] = { key, ox: HANDS[key].grip / IMG_W[key], hold: HANDS[key].hold, hands: HANDS[key].hands, lat: HANDS[key].lat || 0, rest: HANDS[key].rest || null, tip: HANDS[key].tip || 8 };

// which sound each kind of skill makes when you use it
const SKILL_SFX = { heal: 'heal', secondwind: 'heal', mana: 'manaup', cdcut: 'manaup', shield: 'shieldup', mark: 'mark', buff: 'buff', bloodlust: 'buff', lifesteal: 'buff', predator: 'buff' };

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.t = 0; // game time in seconds (stops while paused)
    this.dead = false;
    this.radius = 5;

    this.shadow = scene.add.image(x, y + 5, 'shadow').setDepth(4);
    this.aura = scene.add.image(x, y, 'fx_glow').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3a2a).setVisible(false).setScale(0.9);
    this.auraTop = scene.add.image(x, y, 'fx_glow').setDepth(10.7).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4a30).setVisible(false);
    this.shieldFx = scene.add.image(x, y, 'fx_glow').setDepth(10.8).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fd8ff).setVisible(false);
    this.sprite = scene.physics.add.sprite(x, y, 'player').setDepth(10);
    this.sprite.body.setCircle(5, 5, 5);
    this.sprite.ref = this;
    this.scarf = scene.add.image(x, y, 'player_scarf').setDepth(10.1).setOrigin(5 / 20, 11 / 20);
    this.hood = scene.add.image(x, y, 'player_hood').setDepth(10.45);
    this.rig = new HandRig(scene, LOOK.hero, 10.2, 11.5);
    this.weaponSprite = scene.add.image(x, y, 'w_sword').setDepth(11);
    this.nock = scene.add.image(x, y, 'p_arrow').setDepth(11).setVisible(false);
    this.floatShadow = scene.add.image(x, y, 'shadow').setDepth(4).setAlpha(0.3).setVisible(false);
    this.trim = scene.add.image(x, y, 'player_trim_none').setDepth(10.5);
    this.sigil = scene.add.image(x, y, 'fx_sigil_natural_0').setDepth(3.6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.twins = [0, 1].map(() => scene.add.image(x, y, 'p_sp_divine_bolt').setDepth(11.8).setVisible(false)); // Gemini's Blessing: two stars circle you
    this.fxGlow = scene.add.image(x, y, 'fx_glow').setDepth(11.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.shieldRing = scene.add.image(x, y, 'fx_ring').setDepth(12).setTint(0x7fd0ff).setVisible(false);

    this.berserk = new Berserk();
    this.buffs = []; // {key, until, mods}
    this.cd = {}; // per skill id: seconds left
    this.cdMax = {};
    this.activeUntil = {};
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
    // animation state
    this.charging = false; this.chargeT = 0; this.chargeFull = false; // staff: hold to charge
    this.slamT = -1; this.slamPow = 0; this.slamRaise = 0; this.slamLift = 0; this.slamFired = false; // staff: the swing down (-1 = not slamming)
    this.pendingHit = null; this.swingLen = 0.2; this.swingFrom = 0; this.angOff = 0; // melee: the hit lands when the wind-up ends
    this.crank = 0; // crossbow: 1 just fired .. 0 cocked and loaded
    this.castPulse = 0; // book: pushes forward when it casts
    this.flinch = 0; this.flinchA = 0; this.walkPh = 0; this.prevSp = 0; this.foot = 1; this.skidCd = 0; this.landed = 0; this.wasDodging = false; this.streakT = 0; this.runLean = 0; this.moteT = 0; this.gatherT = 0; this.ambT = 0;
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
      this.cd = {};
      this.activeUntil = {};
      this.buffs = this.buffs.filter((b) => !b.key.startsWith('skill'));
    }
    this.refreshStats();
  }

  setWeapon(id) {
    this.weaponDef = WEAPONS[id] || WEAPONS.training_sword;
    const v = VIS[this.weaponDef.id];
    this.weaponSprite.setTexture(v.key).setOrigin(v.ox, 0.5).setScale(1);
    this.focusing = false; this.focus = 0; this.castT = 0; this.reload = 0; this.ammo = null;
    this.lockTarget = null;
    this.charging = false; this.chargeT = 0; this.slamT = -1; this.pendingHit = null; this.crank = 0; this.castPulse = 0; this.angOff = 0;
    const xbow = this.weaponDef.id === 'basic_crossbow';
    this.nock.setTexture(xbow ? 'p_bolt' : 'p_arrow').setOrigin(xbow ? 0 : 0.5, 0.5).setVisible(false);
  }

  /** The blessing the book, staff and spells follow ('none' until a Mana Circle has been awakened). */
  bless() {
    const p = G.profile;
    return p.manaCircles > 0 && p.manaType && BLESS[p.manaType] ? p.manaType : 'none';
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
    for (const k in this.cd) if (this.cd[k] > 0) { this.cd[k] = Math.max(0, this.cd[k] - dt); if (this.cd[k] === 0) this.onSkillReady(k); }
    this.trackSkills();
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.inCombatT = Math.max(0, this.inCombatT - dt);
    if (this.reload > 0) {
      this.reload = Math.max(0, this.reload - dt);
      if (this.reload === 0) { // the new magazine clicks home: a small flash at the muzzle
        sfx('reload');
        if (this.weaponDef.cls === 'ranger') { const tp = this.weaponTip(this.aim); this.scene.glowPop(tp.x, tp.y, 0xfff2d0, 0.45, 130); this.scene.burst(tp.x, tp.y, 0xffffff, 4, 7, 0); }
      }
    }
    if (this.shield > 0 && this.shieldUntil <= this.t) this.shield = 0;
    if (this.bloodlust.until <= this.t) this.bloodlust.stacks = 0;
    if (this.markTarget && !this.markTarget.alive) this.markTarget = null;

    // footsteps: one soft step per stride (and a little dust when running)
    const vsp = Math.hypot(this.sprite.body.velocity.x, this.sprite.body.velocity.y);
    if (vsp > 30 && this.dodging <= 0) {
      this.stride = (this.stride || 0) + vsp * dt;
      if (this.stride > 26) {
        this.stride = 0; this.foot = -(this.foot || 1); sfx('step');
        if (vsp > 70) { const v = this.sprite.body.velocity; this.scene.stepDust(this.x, this.y, v.x, v.y, this.foot); }
      }
    } else this.stride = Math.min(this.stride || 0, 10);
    // pushing off from rest and sliding to a stop
    if (this.prevSp < 25 && vsp >= 25 && this.dodging <= 0 && this.landed <= 0) {
      const v = this.sprite.body.velocity, l = vsp || 1;
      this.scene.startDust(this.x, this.y, v.x / l, v.y / l);
    }
    if (this.skidCd > 0) this.skidCd -= dt;
    this.prevSp = vsp;

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
    if (inp.useSkill) this.useSkill(inp.useSkill);
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
      this.streakT -= dt;
      if (this.streakT <= 0) { this.streakT = 0.03; this.scene.speedStreak(this.x, this.y, Math.atan2(this.dodgeVec.y, this.dodgeVec.x)); }
      this.wasDodging = true;
      return;
    }
    if (this.wasDodging) { // the roll just ended: you land in a crouch, dust rolling out
      this.wasDodging = false; this.landed = 0.14;
      this.scene.landDust(this.x, this.y);
    }
    if (this.landed > 0) this.landed -= dt;
    let top = BASE_SPEED * this.stats.moveSpeed;
    const wd = this.weaponDef;
    if (this.castT > 0) top *= 0.5;
    if (this.charging) top *= lerp(0.85, wd.charge.slow, clamp01(this.chargeT / wd.charge.time)); // hauling a big spell: the longer, the slower
    else if (this.focusing) top *= lerp(0.85, wd.drawSlow || 0.7, clamp01(this.focus)); // pulling a bow: same
    if (this.swingT < 1) top *= 0.92;

    const len = Math.hypot(inp.mx, inp.my);
    let vx = body.velocity.x, vy = body.velocity.y;
    const had = this.prevInput; this.prevInput = len > 0.05;
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
      if (dot < 0.2 && cur > 80 && this.skidCd <= 0) { this.skidCd = 0.16; this.scene.skidDust(this.x, this.y, vx, vy, 3); } // hard reversal: boots skid
      const a = ACCEL * (dot < 0.2 ? TURN_BOOST : 1) * dt;
      if (dl > a) { dx = (dx / dl) * a; dy = (dy / dl) * a; }
      vx += dx; vy += dy;
      this.cornerAssist(dt, inp, len);
    } else {
      const cur = Math.hypot(vx, vy);
      const f = FRICTION * dt;
      if (cur > 110 && this.skidCd <= 0 && had) { this.skidCd = 0.2; this.scene.skidDust(this.x, this.y, vx, vy, 2); } // let go at a run: a short slide
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
    this.charging = false; this.chargeT = 0; this.pendingHit = null; // rolling away drops a held charge / an unfinished swing
    if (this.swingT < 1) this.swingT = 1;
    sfx('dodge');
    G.profile.flags.tutDodged = true;
    this.scene.dust(this.x, this.y);
    return true;
  }

  recover(dt) {
    const r = this.stats.regen;
    const mode = this.inCombatT > 0 ? 'combat' : 'out';
    this.hp = Math.min(this.stats.maxHealth, this.hp + this.stats.maxHealth * r.health[mode] * dt);
    // stamina comes back faster when you stand still (resting) than while you are moving
    const v = this.sprite.body.velocity, still = Math.hypot(v.x, v.y) < 20 && this.dodging <= 0;
    const stam = still ? T('staminaStill') : T('staminaMoving');
    if (!this.focusing) this.stamina = Math.min(this.stats.maxStamina, this.stamina + this.stats.maxStamina * r.stamina[mode] * stam * dt);
    this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.maxMana * r.mana[mode] * T('manaRegen') * dt);
  }

  // ----------------------------------------------------------- weapons
  handleWeapon(dt, inp) {
    if (this.castPulse > 0) this.castPulse = Math.max(0, this.castPulse - dt * 6);
    if (this.crank > 0) this.crank = Math.max(0, this.crank - dt / Math.max(0.2, this.weaponDef.cooldown));
    if (this.dodging > 0) return;
    const cls = this.weaponDef.cls;
    if (cls === 'melee') {
      if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / this.swingLen);
      if (this.pendingHit) { this.pendingHit -= dt; if (this.pendingHit <= 0) { this.pendingHit = null; this.meleeStrike(); } }
      if (inp.fire || this.atkBuf > 0) this.meleeAttack();
    } else if (cls === 'ranger') this.rangerUpdate(dt, inp);
    else this.magicUpdate(dt, inp);
  }

  // Start a swing: a short wind-up (the weapon draws back), then the hit lands as the sweep begins.
  meleeAttack() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef;
    if (this.attackCd > 0 || this.pendingHit) return;
    const cost = w.stamina * this.stats.staminaCost * this.stats.maxStamina;
    if (this.stamina < cost) { this.deny('NO STAMINA'); return; }
    this.stamina -= cost;
    this.attackCd = w.cooldown;
    this.atkBuf = 0;
    this.swingFrom = this.angOff;
    this.swingT = 0;
    this.swingDir *= -1;
    this.swingLen = w.swingTime || 0.16;
    this.pendingHit = Math.max(0.001, this.swingLen * (w.windup || 0));
    sfx('draw', { weapon: w.id });
  }

  // the moment the blade comes through: lunge, slash, damage
  meleeStrike() {
    const w = this.weaponDef;
    const lunge = w.id === 'training_claymore' ? 70 : w.id === 'training_spear' ? 85 : 55;
    this.sprite.body.velocity.x += Math.cos(this.aim) * lunge;
    this.sprite.body.velocity.y += Math.sin(this.aim) * lunge;
    sfx('swing', { weapon: w.id });
    this.scene.slashFx(this.x, this.y, this.aim, w.range, this.berserk.active ? 0xff7a62 : 0xffffff, this.swingDir, w.id === 'training_spear' ? 'thrust' : w.id === 'training_claymore' ? 'large' : 'small');
    if (w.id === 'training_spear') { // the thrust drives the whole body forward: speed lines and a scuff of dust
      this.scene.speedStreak(this.x, this.y, this.aim);
      this.scene.startDust(this.x, this.y, Math.cos(this.aim), Math.sin(this.aim));
    }

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
      if (heavy) shakeCam(this.scene, 80, 0.0034);
      this.scene.hitStop(heavy ? 78 : w.id === 'training_spear' ? 28 : 34);
      this.scene.kick(this.aim, heavy ? 4 : 2);
    }
  }

  hitTarget(t, knock, focus, mult = 1) {
    const w = this.weaponDef;
    const cond = this.getCond(t);
    const atk = playerAttack({ weapon: w, stats: this.stats, focus, cond, rng: G.rng });
    const dmg = atk.damage * mult;
    t.hurt(dmg, atk.crit, { x: this.x, y: this.y }, knock, { weapon: w.id, focus });
    if (t.isDummy) G.profile.flags.tutHit = true;
    this.inCombatT = COMBAT_TIMEOUT;
    if (!t.isDummy && this.lifestealUntil > this.t) {
      const steal = t.stats.maxHealth * this.lifestealPct;
      t.hurtTrue(steal);
      this.heal(steal, true);
    }
    // weapon proficiency (Weapon Type Proficiency in the sheet)
    addProficiency(G.profile, w.cls, this.stats.weaponMastery * T('profRate'));
    if (++this.hits % 8 === 0) this.refreshStats();
    if (atk.crit) { shakeCam(this.scene, 70, 0.0028); this.scene.hitStop(72); this.scene.kick(this.aim, 3); }
  }

  // ranger: bow and pistol = hold to FOCUS, release to shoot. Crossbow = hold and it shoots by itself.
  rangerUpdate(dt, inp) {
    const w = this.weaponDef;
    if (w.auto) return this.autoFire(inp);
    if (!this.focusing && inp.firePressed && this.attackCd <= 0 && this.reload <= 0) {
      this.focusing = true;
      this.focus = 0;
      this.charged = false; this.overed = false;
      sfx('draw', { weapon: w.id });
    }
    if (!this.focusing) { this.lockTarget = null; return; }

    if (inp.fire) {
      const r = focusTick(this.focus, dt, this.stats.focusSpeed, w.focusRate, this.stamina > 1);
      this.focus = r.focus;
      if (!this.charged && this.focus >= 1) { this.charged = true; sfx('charged'); this.scene.ringFx(this.x, this.y, 0xffe27a, 2); } // fully focused: ping + a pulse
      if (!this.overed && this.focus >= 1.5) { this.overed = true; sfx('overfocus'); this.scene.ringFx(this.x, this.y, 0xff9a3a, 2); } // past 150%: it starts to cost stamina, and says so
      if (r.staminaFrac > 0) this.stamina = Math.max(0, this.stamina - r.staminaFrac * this.stats.staminaCost * this.stats.maxStamina);
      this.lockTarget = G.settings.lockOn === false ? null : this.scene.targetNearAim(this.x, this.y, this.aim, FOCUS.lockRange, 0.55);
    } else {
      this.fireRanged();
      this.focusing = false;
      this.focus = 0;
      this.lockTarget = null;
    }
  }

  // crossbow: no focusing. Held = a quick, steady stream; each shot snaps a little toward what you are aiming at.
  autoFire(inp) {
    const w = this.weaponDef;
    this.focusing = false; this.focus = 0; this.lockTarget = null;
    if (!inp.fire && this.atkBuf <= 0) return;
    if (this.reload > 0) { if (inp.firePressed && w.mag) { sfx('dry'); this.recoil = 0.25; } return; } // an empty click while the magazine goes in
    if (this.attackCd > 0) return;
    const cost = w.stamina * this.stats.staminaCost * this.stats.maxStamina;
    if (this.stamina < cost) { this.deny('NO STAMINA'); return; }
    this.scene.noise && this.scene.noise(this.x, this.y);
    this.stamina -= cost;
    this.atkBuf = 0;
    let angle = this.aim;
    const tg = this.currentTarget;
    const near = G.settings.lockOn !== false && tg && tg.alive && angDiff(Math.atan2(tg.y - this.y, tg.x - this.x), angle) < 0.26;
    if (near) angle = this.leadAngle(this, tg, w.projectileSpeed);
    if (w.spread) angle += (Math.random() - 0.5) * 2 * w.spread; // a carbine is not a sniper rifle
    const tip = this.weaponTip(angle);
    this.shoot(angle, w.projectileSpeed, w.projectile, 1, 2.5, undefined, { x: tip.x, y: tip.y });
    this.attackCd = w.cooldown;
    if (!w.mag) this.crank = 1; // (the crossbow cranks; a rifle does not)
    this.recoil = w.mag ? 0.5 : 1;
    this.inCombatT = COMBAT_TIMEOUT;
    sfx('shoot', { weapon: w.id, power: 1, pitch: w.mag && this.ammo != null && this.ammo <= 6 ? 1.18 : 1 }); // the last few rounds sound thinner
    if (w.mag) { // magazine: count the rounds, then reload
      this.ammo = (this.ammo == null ? w.mag : this.ammo) - 1;
      if (this.ammo <= 0) {
        this.ammo = w.mag; this.reload = w.reload;
        this.scene.floatText(this.x, this.y - 16, 'RELOAD', 0xffe27a, 1);
        sfx('magout');
        this.scene.magFx(this.x + Math.cos(angle) * 6, this.y + Math.sin(angle) * 6, angle);
      }
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
    if (this.focus >= 1) this.scene.ringFx(this.x, this.y, this.focus > 1.5 ? 0xff9a3a : 0xffe27a, 1); // a full draw lets go with a pulse
    this.inCombatT = COMBAT_TIMEOUT;
    this.recoil = 1;
  }

  /** The best target for a spell: wide cone, in sight, and sticky (you keep the one you had while it stays in front of you). */
  magicTarget(cone = 0.6) {
    if (G.settings.lockOn === false) return null; // lock-on is switched off (key T / settings)
    const sc = this.scene;
    const ok = (t) => t && t.alive && Math.hypot(t.x - this.x, t.y - this.y) < 250 && angDiff(Math.atan2(t.y - this.y, t.x - this.x), this.aim) < cone * 1.35 && sc.hasLOS(this.x, this.y, t.x, t.y);
    if (ok(this.lockTarget)) return this.lockTarget;
    const t = sc.targetNearAim(this.x, this.y, this.aim, 230, cone);
    return ok(t) ? t : null;
  }

  /** The angle from `from` that meets a moving target (most of the way: it still rewards a good aim). */
  leadAngle(from, tg, speed) {
    const v = tg.sprite && tg.sprite.body ? tg.sprite.body.velocity : { x: 0, y: 0 };
    const dx = tg.x - from.x, dy = tg.y - from.y;
    const t = Math.min(0.7, Math.hypot(dx, dy) / Math.max(60, speed)) * 0.8;
    return Math.atan2(dy + v.y * t, dx + v.x * t);
  }

  /** Where a bolt leaves the weapon (the head of the staff, the end of the crossbow...), in the world. */
  weaponTip(angle) {
    const v = VIS[this.weaponDef.id];
    const d = v.hold + v.tip;
    return { x: this.x + Math.cos(angle) * d, y: this.y + Math.sin(angle) * d };
  }

  // o: { x, y } where it leaves · { type } blessing look · { big } bigger picture · { mult } damage multiplier · { aoe } burst radius + damage share
  shoot(angle, speed, texture, focus, radius, tint, o = {}) {
    const mana = texture.startsWith('mana');
    const type = o.type || this.bless();
    const key = mana ? `p_sp_${type}_${o.big ? 'big' : texture === 'mana_bolt' ? 'bolt' : 'orb'}` : 'p_' + texture;
    const hold = VIS[this.weaponDef.id].hold + VIS[this.weaponDef.id].tip;
    const sx = o.x != null ? o.x : this.x + Math.cos(angle) * hold, sy = o.y != null ? o.y : this.y + Math.sin(angle) * hold;
    const p = this.scene.projectiles.create(sx, sy, key).setDepth(12);
    const fw = p.width, fh = p.height;
    p.body.setCircle(radius, fw / 2 - radius, fh / 2 - radius);
    p.setRotation(mana ? 0 : angle);
    p.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    p.life = 1.5;
    if (o.home) { p.home = o.home; p.homeRate = o.homeRate || 2; }
    p.shot = { weapon: this.weaponDef, focus, mult: o.mult || 1, aoe: o.aoe || null, color: mana ? hexToInt(BLESS[type].spell) : 0xffffff };
    if (texture === 'bullet') p.trail = { every: 0.012, color: 0xfff2d0, ms: 90 };
    else if (mana) p.trail = { every: o.big ? 0.022 : 0.035, color: tint || hexToInt(BLESS[type].spell), ms: o.big ? 260 : 190 };
    if (texture === 'arrow') p.trail = { every: 0.03, color: 0xe8e0c8, ms: 110 };
    else if (texture === 'bolt') p.trail = { every: 0.026, color: 0xd8d2c0, ms: 100 };
    if (texture === 'bullet') {
      const rapid = !!this.weaponDef.mag;
      this.shotN = (this.shotN || 0) + 1;
      this.scene.muzzleFlash(p.x, p.y, angle, 0xffe2a0);
      if (!rapid || this.shotN % 2 === 0) this.scene.casingFx(this.x + Math.cos(angle) * hold * 0.45, this.y + Math.sin(angle) * hold * 0.45, angle);
      this.scene.kick(angle + Math.PI, rapid ? 0.7 : 3);
    } else if (texture === 'bolt') { this.scene.muzzleFlash(p.x, p.y, angle, 0xcfd6e0); this.scene.kick(angle + Math.PI, 1); }
    return p;
  }

  projectileHit(proj, target) {
    if (!proj.active || !target.alive) return;
    const w = proj.shot.weapon;
    // temporarily evaluate with the weapon the projectile was fired from
    const keep = this.weaponDef;
    this.weaponDef = w;
    this.hitTarget(target, w.cls === 'magic' ? 30 : 40, proj.shot.focus, proj.shot.mult);
    this.weaponDef = keep;
    this.scene.spark(proj.x, proj.y);
    this.projectileBurst(proj, target);
    proj.destroy();
  }

  // a fully charged staff orb bursts where it lands: everything close takes a share of the damage
  projectileBurst(proj, except = null) {
    const aoe = proj.shot && proj.shot.aoe;
    if (!aoe) return;
    const keep = this.weaponDef;
    this.weaponDef = proj.shot.weapon;
    for (const t of this.scene.targets) {
      if (!t.alive || t === except) continue;
      if (Math.hypot(t.x - proj.x, t.y - proj.y) > aoe.r + t.radius) continue;
      this.hitTarget(t, 55, proj.shot.focus, proj.shot.mult * aoe.dmg);
    }
    this.weaponDef = keep;
    this.scene.ringFx(proj.x, proj.y, proj.shot.color, 4);
    this.scene.burst(proj.x, proj.y, proj.shot.color, 12, aoe.r, 2);
    shakeCam(this.scene, 110, 0.0034);
    this.scene.hitStop(55);
    sfx('thunder');
  }

  magicUpdate(dt, inp) {
    const w = this.weaponDef;
    if (w.charge) return this.staffUpdate(dt, inp);
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

  // book: the spell leaves the floating book
  releaseSpell() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef;
    let angle = this.aim;
    const o = this.bookPos ? { x: this.bookPos.x + Math.cos(angle) * 6, y: this.bookPos.y + Math.sin(angle) * 6 } : {};
    const tg = this.magicTarget(0.42);
    if (tg) { angle = this.leadAngle(o.x != null ? o : this, tg, w.projectileSpeed); o.home = tg; o.homeRate = 1.5; if (o.x != null) { o.x = this.bookPos.x + Math.cos(angle) * 6; o.y = this.bookPos.y + Math.sin(angle) * 6; } }
    this.shoot(angle, w.projectileSpeed, w.projectile, 1, w.radius, undefined, o);
    sfx('cast', { weapon: w.id });
    this.castPulse = 1;
    this.recoil = 0.6;
  }

  // staff: tap = a quick orb. Hold = the staff rises while the orb gathers; let go and it slams down and throws a heavy one.
  staffUpdate(dt, inp) {
    const w = this.weaponDef, c = w.charge;
    if (this.castT > 0) this.castT -= dt;
    if (this.charging) this.lockTarget = this.magicTarget(0.6); // the reticle follows whoever is best in front of you
    else if (this.slamT < 0) this.lockTarget = null;
    if (this.slamT >= 0) { // the swing down, the throw, the settle
      this.slamT += dt;
      if (!this.slamFired && this.slamT >= SLAM_DOWN) { this.slamFired = true; this.staffThrow(); }
      if (this.slamT >= SLAM_TOTAL) this.slamT = -1;
      return;
    }
    if (!this.charging) {
      if (inp.fire && this.attackCd <= 0) {
        if (G.profile.manaCircles <= 0) { this.deny('NO MANA CIRCLE'); this.attackCd = 0.4; G.ui.toast('Magic needs a Mana Circle. Equip a Magic trait and visit the Mana Altar.', 'warn'); return; }
        if (this.mana < w.mana * this.stats.manaCost) { this.deny('NO MANA'); return; }
        this.charging = true; this.chargeT = 0; this.chargeFull = false; this.gatherT = 0;
        sfx('draw', { weapon: w.id });
      }
      return;
    }
    if (inp.fire) {
      this.chargeT = Math.min(c.time, this.chargeT + dt);
      this.inCombatT = COMBAT_TIMEOUT;
      if (!this.chargeFull && this.chargeT >= c.time) { this.chargeFull = true; sfx('charged'); this.scene.ringFx(this.x, this.y, hexToInt(BLESS[this.bless()].spell), 2); }
      return;
    }
    // let go: tap fires at once, a charge swings down first
    const pow = this.chargeT >= c.min ? clamp01(this.chargeT / c.time) : 0;
    this.charging = false;
    this.slamPow = pow;
    this.slamRaise = pow; // how high the staff was when it let go (for the animation)
    this.slamFired = false;
    this.slamT = 0;
    this.chargeT = 0;
    this.castT = SLAM_DOWN + 0.08;
    if (pow <= 0) this.slamT = SLAM_DOWN * 0.5; // a tap skips most of the swing
  }

  staffThrow() {
    this.scene.noise && this.scene.noise(this.x, this.y);
    const w = this.weaponDef, c = w.charge;
    let pow = this.slamPow;
    // pay for it now; a charge you cannot afford falls back to what you can
    const base = w.mana * this.stats.manaCost, extra = c.extraMana * this.stats.manaCost;
    if (this.mana < base) { this.deny('NO MANA'); return; }
    if (pow > 0 && this.mana < base + extra * pow) pow = Math.max(0, (this.mana - base) / extra);
    this.mana -= base + extra * pow;
    this.attackCd = w.cooldown;
    let angle = this.aim;
    const speed = w.projectileSpeed * (1 + pow * 0.25);
    const tg = this.lockTarget && this.lockTarget.alive ? this.lockTarget : this.magicTarget(0.6);
    const from = this.staffTip || this.weaponTip(angle);
    if (tg) angle = this.leadAngle(from, tg, speed);
    const full = pow >= 0.99;
    const tip = this.staffTip ? { x: this.staffTip.x + Math.cos(angle) * 4, y: this.staffTip.y + Math.sin(angle) * 4 } : this.weaponTip(angle);
    const big = pow >= 0.55;
    this.shoot(angle, speed, w.projectile, 1, w.radius + (big ? 2.5 : 0), undefined, {
      x: tip.x, y: tip.y, big, mult: 1 + c.damageMult * pow, home: tg, homeRate: 2.4,
      aoe: full ? { r: c.aoe, dmg: c.aoeDamage } : null,
    });
    sfx('cast', { weapon: w.id });
    this.recoil = 0.6 + pow * 0.8;
    this.inCombatT = COMBAT_TIMEOUT;
    if (pow > 0.2) { // the slam: the ground shudders where the staff came down
      this.scene.shockwave(tip.x, tip.y, hexToInt(BLESS[this.bless()].spell), pow);
      shakeCam(this.scene, 70 + pow * 90, 0.0016 + pow * 0.003);
      this.scene.kick(angle, 1 + pow * 3);
    }
  }

  // ------------------------------------------------------------ skills
  skillInfo(id) {
    const def = SKILL_BY_ID[id] || null;
    return {
      trait: def, // (the skill carries the name of its trait)
      skill: def ? def.skill : null,
      cd: this.cd[id] || 0,
      cdMax: this.cdMax[id] || 1,
      activeLeft: Math.max(0, (this.activeUntil[id] || 0) - this.t),
    };
  }

  /** Skills that are running right now: [{ name, left }]. */
  activeSkills() {
    const out = [];
    for (const id of ALL_SKILL_IDS) {
      const left = (this.activeUntil[id] || 0) - this.t;
      if (left > 0) out.push({ id, name: SKILL_BY_ID[id].name, left });
    }
    return out;
  }

  // a soft ping when the skill you have picked is ready again
  onSkillReady(id) {
    if (id !== G.profile.selSkill) return;
    sfx('ready');
    if (G.hud && G.hud.flashSkill) G.hud.flashSkill('ready');
  }

  // a running skill runs out: a short fade so you notice the bonus is gone
  trackSkills() {
    const was = (this._skOn = this._skOn || {});
    for (const id of ALL_SKILL_IDS) {
      const on = (this.activeUntil[id] || 0) > this.t;
      if (was[id] && !on && SKILL_BY_ID[id].skill.kind !== 'berserk') { sfx('expire'); this.scene.ringFx(this.x, this.y, 0x8a8aa0, 1); }
      was[id] = on;
    }
  }

  startCd(id, seconds) {
    this.cd[id] = seconds;
    this.cdMax[id] = seconds;
  }

  useSkill(id) {
    const def = SKILL_BY_ID[id];
    if (!def) { this.deny('NO SKILL'); return; }
    const sk = def.skill;
    if ((this.cd[id] || 0) > 0) { this.deny(Math.ceil(this.cd[id]) + 's'); return; }
    const key = 'skill:' + id;
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
        this.scene.ringFx(t.x, t.y, 0xff6a5a, 3); this.scene.glowPop(t.x, t.y, 0xff6a5a, 0.9, 280, 0.6); // the mark lands on them
        break;
      }
      case 'heal': this.heal(this.stats.maxHealth * sk.pct); break;
      case 'mana':
        if (this.stats.maxMana <= 0) { this.deny('NO MANA POOL'); used = false; break; }
        this.restoreMana(this.stats.maxMana * sk.pct);
        break;
      case 'cdcut':
        for (const j in this.cd) if (j !== id && this.cd[j] > 0) this.cd[j] = Math.max(0, this.cd[j] - (this.cdMax[j] || 1) * sk.pct);
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
    if (!used) return false;
    this.startCd(id, sk.cooldown);
    this.activeUntil[id] = this.t + sk.active;
    const fxc = sk.kind === 'berserk' ? 0xff3a2a : this.scene.skillFx(this.x, this.y, sk.kind);
    if (sk.kind === 'berserk') this.berserkBurst();
    sfx(sk.kind === 'berserk' ? 'berserk' : SKILL_SFX[sk.kind] || 'skill');
    this.scene.floatText(this.x, this.y - 18, def.name.toUpperCase(), fxc, 1);
    if (G.hud && G.hud.flashSkill) G.hud.flashSkill('use');
    if (navigator.vibrate && this.scene.touch && this.scene.touch.enabled) navigator.vibrate(18);
    return true;
  }

  toggleBerserk() {
    if (this.weaponDef.cls !== 'melee') { this.deny('NEEDS MELEE WEAPON'); G.ui.toast('Sword Aura is a Melee system. Equip a Sword, Claymore or Spear.', 'warn'); return; }
    if (this.berserk.active) { this.berserk.deactivate(); sfx('ui'); return; }
    if (this.berserk.decay) { this.deny('LIFE FORCE DECAY'); return; }
    if (!this.berserk.activate()) { this.deny('AURA CORE EMPTY'); return; }
    sfx('berserk');
    this.berserkBurst();
  }

  // the Aura ignites: a red shockwave on the ground, a flash of light and a spray of embers
  berserkBurst() {
    const sc = this.scene;
    sc.shockwave(this.x, this.y, 0xff3a2a, 0.55);
    sc.glowPop(this.x, this.y, 0xff3a2a, 1.5, 340, 0.75);
    for (let i = 0; i < 12; i++) sc.emberFx(this.x + (Math.random() - 0.5) * 16, this.y + (Math.random() - 0.5) * 8, i % 2 ? 0xff3a2a : 0xff8a3a, 11.5);
    shakeCam(sc, 130, 0.0045);
    sc.hitStop(60);
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
      if (absorbed > 0) { this.shieldHit = 0.16; sfx('ui'); }
    }
    this.hp -= dmg;
    this.inCombatT = COMBAT_TIMEOUT;
    sfx('hurt');
    shakeCam(this.scene, 110, 0.004);
    this.scene.hitStop(55);
    this.scene.hud.flashHurt(Math.min(0.9, 0.5 + dmg / this.stats.maxHealth * 2));
    this.hurtFlash = 0.1;
    this.flinch = 1; this.flinchA = src ? Math.atan2(this.y - src.y, this.x - src.x) : 0;
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
  // what the blessing adds around you: a faint sigil on the ground, drifting motes, and (Gemini) two orbiting stars
  blessFx(dt, bless) {
    const s = this.sprite;
    const on = bless !== 'none';
    this.sigil.setVisible(on);
    if (on) {
      const k = `fx_sigil_${bless}_${Math.floor(this.t * 1.5) % 2}`;
      if (this.sigil.texture.key !== k) this.sigil.setTexture(k);
      this.sigil.setPosition(Math.round(s.x), Math.round(s.y + 3)).setAlpha(0.3 + Math.sin(this.t * 2.4) * 0.1);
      this.ambT -= dt;
      if (this.ambT <= 0) { this.ambT = 0.4 + Math.random() * 0.25; this.scene.ambientMote(bless, s.x, s.y, hexToInt(BLESS[bless].spell)); }
    }
    const gem = on && G.profile.traits.includes('geminis_blessing');
    this.twins.forEach((st, i) => {
      st.setVisible(gem);
      if (!gem) return;
      const a = this.t * 2.2 + i * Math.PI;
      st.setPosition(Math.round(s.x + Math.cos(a) * 15), Math.round(s.y + Math.sin(a) * 9 - 2)).setDepth(Math.sin(a) > 0 ? 11.8 : 9.8);
    });
  }

  syncSprites(dt) {
    const s = this.sprite;
    this.shadow.setPosition(s.x, s.y + 5);
    const bodyAng = snap(this.aim);
    const ca0 = Math.cos(bodyAng), sa0 = Math.sin(bodyAng);
    const alpha = this.dodging > 0 ? 0.55 : 1;
    const bless = this.bless();
    s.setRotation(bodyAng).setAlpha(alpha);
    // the head bobs with each step (a pixel forward and back) and breathes when standing; a hit makes it flinch away
    const vel = s.body.velocity;
    const spd = Math.hypot(vel.x, vel.y);
    if (spd > 30 && this.dodging <= 0) this.walkPh += spd * dt / 13; else this.walkPh = Math.round(this.walkPh / Math.PI) * Math.PI;
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 7);
    const bob = spd > 30 && this.dodging <= 0 ? Math.round(Math.sin(this.walkPh) * 0.9) : Math.sin(this.t * 2.2) > 0.55 ? 1 : 0;
    this.runLean += ((spd > 105 && this.dodging <= 0 ? 1 : 0) - this.runLean) * Math.min(1, dt * 9);
    const dip = Math.round(this.runLean * 0.8) + (this.landed > 0 ? 1 : 0); // head pushes forward at a run, ducks as you land
    const hx = ca0 * (bob + dip) + Math.cos(this.flinchA) * this.flinch * 2, hy = sa0 * (bob + dip) + Math.sin(this.flinchA) * this.flinch * 2;
    this.hood.setPosition(s.x + hx, s.y + hy).setRotation(bodyAng).setAlpha(alpha);
    const tk = 'player_trim_' + bless;
    if (this.trim.texture.key !== tk) this.trim.setTexture(tk);
    this.trim.setVisible(bless !== 'none').setPosition(s.x + hx, s.y + hy).setRotation(bodyAng).setAlpha(alpha);
    this.blessFx(dt, bless);
    // scarf: the knot sits behind the neck, the tail trails and sways (more when running / rolling)
    const sway = Math.sin(this.t * 6) * 0.08 * (0.35 + Math.min(1.5, spd / 90)) + (this.dodging > 0 ? 0.35 : 0);
    this.scarf.setPosition(s.x - ca0 * 5 - sa0 + hx * 0.5, s.y - sa0 * 5 + ca0 + hy * 0.5).setRotation(bodyAng + sway).setAlpha(alpha);

    // berserk aura / status tint
    // the Sword Aura: a red glow on the ground and over the body, a flickering red tint, and embers rising off you
    const ba = this.berserk.active;
    this.aura.setPosition(s.x, s.y).setVisible(ba);
    this.auraTop.setPosition(s.x, s.y).setVisible(ba);
    if (this._wasBa && !ba) { // the Aura dies down: embers fall, a dark ring and a low sigh
      sfx('aurafade');
      this.scene.burst(s.x, s.y, 0x7a1a1a, 10, 16, 6);
      this.scene.ringFx(s.x, s.y, 0x7a1a1a, 2);
    }
    this._wasBa = ba;
    if (ba) {
      const pu = Math.sin(this.t * 9) * 0.5 + 0.5, fl = Math.sin(this.t * 23) * 0.5 + 0.5;
      this.afterT = (this.afterT || 0) - dt; // running with the Aura on leaves red ghosts behind you
      if (this.afterT <= 0 && spd > 90 && this.dodging <= 0) { this.afterT = 0.075; this.scene.afterimage(this, 0xff3a2a, 0.28, 220); }
      this.aura.setScale(1.55 + pu * 0.25).setAlpha(0.7 + pu * 0.25);
      this.auraTop.setScale(0.72 + pu * 0.1).setAlpha(0.22 + fl * 0.14);
      this.auraT = (this.auraT || 0) - dt;
      if (this.auraT <= 0) { this.auraT = 0.07; this.scene.emberFx(s.x + (Math.random() - 0.5) * 12, s.y + (Math.random() - 0.5) * 6, Math.random() < 0.5 ? 0xff3a2a : 0xff8a3a, 11.5); }
    }
    // a shield is a bubble of light round you: it flares when it soaks a hit and shatters when it breaks
    if (this.shield > 0) {
      this._hadShield = true;
      const flare = this.shieldHit > 0 ? this.shieldHit / 0.16 : 0;
      this.shieldHit = Math.max(0, (this.shieldHit || 0) - dt);
      const lowLeft = this.shieldUntil - this.t < 2 ? (Math.floor(this.t * 10) % 2 ? 0.4 : 1) : 1; // blinks when about to run out
      this.shieldFx.setVisible(true).setPosition(s.x, s.y).setScale(0.95 + Math.sin(this.t * 5) * 0.04 + flare * 0.25).setAlpha((0.3 + flare * 0.5) * lowLeft);
    } else {
      if (this._hadShield) {
        this._hadShield = false;
        if (this.shieldUntil > this.t) { // it was broken, not timed out
          sfx('shieldbreak');
          this.scene.glowPop(s.x, s.y, 0x9fd8ff, 1.3, 260, 0.7);
          this.scene.burst(s.x, s.y, 0x9fd8ff, 14, 22, 0);
          this.scene.ringFx(s.x, s.y, 0x9fd8ff, 3);
        }
      }
      this.shieldFx.setVisible(false);
    }
    // while a skill is running a few motes of its colour drift up off you
    this.skT = (this.skT || 0) - dt;
    if (this.skT <= 0) {
      this.skT = 0.32;
      const run = this.activeSkills().filter((a) => SKILL_BY_ID[a.id].skill.kind !== 'berserk');
      if (run.length) this.scene.riseFx(s.x, s.y, 0xffe27a, 1, 7, 16);
    }
    let tint = null;
    if (this.hurtFlash > 0) tint = 0xff6a6a;
    else if (this.berserk.decay) tint = 0xb48aff;
    else if (ba) tint = Math.floor(this.t * 12) % 2 ? 0xff9484 : 0xffb0a0;
    else if (this.berserk.exhaustion > 0 && !this.berserk.active) tint = 0xb0b0c0;
    if (tint == null) { s.clearTint(); this.hood.clearTint(); } else { s.setTint(tint); this.hood.setTint(tint); }
    this.scarf.setTint(this.hurtFlash > 0 ? 0xff6a6a : hexToInt(RANK_COLORS[this.stats.rank] || '#b7b0a2'));

    // ---- weapon pose
    const w = this.weaponDef;
    const v = VIS[w.id];
    const cos = Math.cos(this.aim), sin = Math.sin(this.aim);
    let hold = v.hold, lat = v.lat, off = 0, lift = 0, lean = 0, tremor = 0;
    let key = v.key;
    let hands = null; // set when the hands are not simply on the weapon
    this.floatShadow.setVisible(false);

    if (w.cls === 'melee') {
      const half = Phaser.Math.DegToRad(w.arcDeg) / 2, d = this.swingDir, spear = w.id === 'training_spear';
      const relaxed = spear ? 0 : -0.35 * d + Math.sin(this.t * 1.7) * 0.03; // idle: the point rests low, sways a little
      if (this.swingT < 1) {
        const wf = Math.max(0.05, w.windup || 0.2), T = this.swingT;
        const back = spear ? 0 : -half * 1.3 * d; // how far round it is drawn back
        if (T < wf) { // wind-up: draw back, the body leans away
          const u = easeOut(T / wf);
          if (spear) { hold += -7 * u; off = 0.1 * d * u; } else { off = lerp(this.swingFrom, back, u); hold -= 2 * u; }
          lean = -1.4 * u;
        } else {
          const R = (T - wf) / (1 - wf), sweepEnd = 0.45;
          if (R < sweepEnd) { // the strike
            const u = R / sweepEnd;
            if (spear) { hold += lerp(-7, 16, 1 - Math.pow(1 - u, 3)); off = 0.1 * d * (1 - u); } else { off = lerp(back, half * 1.1 * d, smooth(u)); hold += 3 * Math.sin(u * Math.PI); }
            lean = lerp(-1.4, spear ? 5 : 3, u);
          } else { // follow-through: overshoot, then recover to the ready pose
            const u = easeOut((R - sweepEnd) / (1 - sweepEnd));
            if (spear) { hold += lerp(16, 0, u); lean = lerp(5, 0, u); } else { off = lerp(half * 1.1 * d, relaxed, u); hold += 3 * (1 - u); lean = lerp(3, 0, u); }
          }
        }
      } else off = relaxed;
      this.angOff = off;
    } else if (w.cls === 'ranger') {
      const f = clamp01(this.focus);
      if (this.focusing) {
        if (w.id === 'training_bow') { lean = -f * 1.6; off = -0.05 * f; } else hold -= 1 + f * 1.5;
        if (this.focus >= 1) tremor = (Math.floor(this.t * 36) % 2 ? 1 : -1) * Math.min(1, 0.4 + (this.focus - 1)) * 0.6; // holding a full draw: it trembles
      } else off = Math.sin(this.t * 1.6) * 0.025;
      if (this.recoil > 0) { hold -= this.recoil * 3; lean = Math.max(lean, -this.recoil * 0.8); this.recoil = Math.max(0, this.recoil - dt * 8); }
      if (w.mag && this.reload > 0) { // reloading: the muzzle dips and the weapon is brought in close while the magazine goes in
        const k = Math.sin((1 - this.reload / w.reload) * Math.PI);
        off += k * 0.55; hold -= k * 2.5;
      }
    } else if (w.floats) { // the book and the staff hover beside you: nothing is held, the hands only guide
      const hover = Math.sin(this.t * 2.6) * 1.6;
      if (w.charge) {
        const sign = cos >= 0 ? -1 : 1; // rotate towards screen-up
        const idle = { hold: 8, lat: -14, off: -0.1 + Math.sin(this.t * 1.7) * 0.05, lift: -hover };
        const top = (r) => ({ hold: lerp(8, 2, r), lat: lerp(-14, -3, r), off: lerp(idle.off, sign * 1.25, r), lift: lerp(-hover, 9, r) });
        const hit = { hold: 16, lat: -3, off: -sign * 0.55, lift: -1 };
        const mix = (A, B, u) => ({ hold: lerp(A.hold, B.hold, u), lat: lerp(A.lat, B.lat, u), off: lerp(A.off, B.off, u), lift: lerp(A.lift, B.lift, u) });
        let P = idle;
        if (this.slamT >= 0) { // swing down fast, then settle back beside you
          const T = this.slamT, r = easeOut(clamp01(this.slamRaise * 1.4));
          if (T < SLAM_DOWN) { const u = easeIn(T / SLAM_DOWN); P = mix(top(r), hit, u); lean = lerp(-1.2 * r, 3, u); }
          else { const u = easeOut((T - SLAM_DOWN) / (SLAM_TOTAL - SLAM_DOWN)); P = mix(hit, idle, u); lean = lerp(3, 0, u); }
        } else if (this.charging) { // it rises overhead and spins up; once full it shakes with the power in it
          const r = easeOut(clamp01(this.chargeT / w.charge.time * 1.4));
          P = top(r); lean = -1.2 * r;
          if (this.chargeFull) P.lift += Math.floor(this.t * 30) % 2 ? 0.6 : -0.6;
        }
        hold = P.hold; lat = P.lat; off = P.off; lift = P.lift;
        key = `w_staff_${bless}`;
      } else {
        const pulse = this.castPulse;
        hold = 9 + pulse * 6; lat = -13; off = Math.sin(this.t * 1.9) * 0.12 + pulse * 0.1;
        const frame = pulse > 0.2 ? 1 : [0, 1, 0, 2][Math.floor(this.t * 5) % 4];
        key = `w_book_${bless}_${frame}`;
        lift = -hover; // negative lift = lower on screen; bob is on screen-y
      }
    }
    // the weapon rocks a little with each stride (more when it is only carried, less while it is being used)
    const strideK = this.dodging <= 0 && spd > 30 ? Math.min(1, spd / 110) : 0;
    const busy = this.swingT < 1 || this.focusing || this.charging || this.slamT >= 0;
    hold += Math.sin(this.walkPh) * 0.8 * strideK * (busy ? 0.3 : 1);
    lat += Math.cos(this.walkPh) * 0.5 * strideK * (busy ? 0.3 : 1);
    if (this.weaponSprite.texture.key !== key) this.weaponSprite.setTexture(key);
    const ang = this.aim + off;
    const wx = s.x + cos * hold - sin * lat - sin * tremor, wy = s.y + sin * hold + cos * lat + cos * tremor - lift;
    this.weaponSprite.setPosition(wx, wy).setRotation(ang).setScale(1);

    // ---- hands: sleeves from the shoulders to the grip points of whatever is held
    const wsp = this.weaponSprite;
    const gripPx = wsp.originX * wsp.width;
    const wp = (hx2, hy2) => weaponPoint(hx2, hy2, wsp.x, wsp.y, wsp.rotation, gripPx, wsp.height, wsp.scaleX);
    const body = (f, l) => ({ x: s.x + ca0 * f - sa0 * l, y: s.y + sa0 * f + ca0 * l });
    hands = v.hands.map(([hx2, hy2]) => wp(hx2, hy2));
    if (w.floats) { // arms hang relaxed; the near hand lifts towards the floating weapon (never touching it) when you cast or charge
      const t = this.t, staff = !!w.charge;
      const obj = staff ? wp(17, 5) : { x: wsp.x, y: wsp.y };
      const sh = body(0.5, -5.5);
      const dist = Math.hypot(obj.x - sh.x, obj.y - sh.y) || 1;
      const len = Math.max(4, Math.min(10, dist - 6));
      const reachL = { x: sh.x + (obj.x - sh.x) / dist * len, y: sh.y + (obj.y - sh.y) / dist * len };
      const arm = Math.sin(this.walkPh) * strideK * 2.2; // arms swing opposite each other as you walk
      const relaxL = body(3.5 + Math.sin(t * 1.3) * 0.4 + arm, -6.4), relaxR = body(3.5 + Math.sin(t * 1.3 + 1) * 0.4 - arm, 6.4);
      let k = 0.2, rk = 0, ry = 0, rf = 6;
      if (staff) {
        const r = this.charging ? easeOut(clamp01(this.chargeT / w.charge.time * 1.4)) : this.slamT >= 0 ? (this.slamT < SLAM_DOWN ? 1 : Math.max(0, 1 - (this.slamT - SLAM_DOWN) / 0.2)) * clamp01(this.slamRaise * 1.4 + 0.4) : 0;
        k = Math.max(k, r); rk = r; ry = -lift * 0.5; rf = this.slamT >= SLAM_DOWN ? 12 : 8;
      } else { k = Math.max(k, this.castPulse); rk = this.castPulse; rf = 6 + this.castPulse * 7; }
      const chan = body(rf, 3);
      hands = [
        { x: lerp(relaxR.x, chan.x, rk), y: lerp(relaxR.y, chan.y - ry, rk) },
        { x: lerp(relaxL.x, reachL.x, k), y: lerp(relaxL.y, reachL.y, k) },
      ];
      if (!staff) this.bookPos = { x: wsp.x, y: wsp.y };
    } else if (v.rest) hands.push(body(v.rest[0] - Math.sin(this.walkPh) * strideK * 1.4, v.rest[1]));
    const isBow = w.id === 'training_bow', isXbow = w.id === 'basic_crossbow';
    const pull = isBow && this.focusing ? Math.min(1, this.focus) * 6 : 0;
    if (isBow) hands[1] = wp(3 - pull, 13);
    if (isXbow) { // cranking: the rear hand works the string back
      const k = this.crank;
      if (k > 0.12 && k < 0.85) hands[1] = wp(7 + Math.sin((0.85 - k) / 0.73 * Math.PI * 3) * 1.4, 8.5);
    }
    if (w.charge) this.staffTip = wp(29.5, 5);

    this.rig.draw(s.x, s.y, bodyAng, hands, { alpha, flash: this.hurtFlash > 0, lean });
    if (isBow) { // the string follows the drawing hand
      const a = wp(3, 1), b = wp(3, 25);
      this.rig.line(a.x, a.y, hands[1].x, hands[1].y, 0xe8e2cc);
      this.rig.line(b.x, b.y, hands[1].x, hands[1].y, 0xe8e2cc);
    }
    if (isXbow) { // the string snaps forward when it fires, is cranked back, then a bolt slides in
      const k = this.crank;
      const sx = k > 0.85 ? 15.5 + (Math.floor(this.t * 40) % 2 ? 0.8 : 0) : lerp(9.5, 15.5, clamp01((k - 0.12) / 0.73));
      const a = wp(15, 1), b = wp(15, 15), m = wp(sx, 8.5);
      this.rig.line(a.x, a.y, m.x, m.y, 0xe8e2cc);
      this.rig.line(b.x, b.y, m.x, m.y, 0xe8e2cc);
    }
    wsp.setAlpha(alpha);

    // nocked arrow while drawing the bow / the bolt that has slid onto the crossbow rail
    const nockOn = (isBow && this.focusing) || (isXbow && this.crank < 0.2);
    this.nock.setVisible(nockOn);
    if (nockOn) {
      if (isBow) this.nock.setPosition(hands[1].x + cos * 5, hands[1].y + sin * 5).setRotation(this.aim);
      else { const n = wp(9, 8.5); this.nock.setPosition(n.x, n.y).setRotation(ang); }
    }

    // ---- glows and motes: floating book, charging staff
    const spellCol = hexToInt(BLESS[bless].spell);
    let g = null;
    if (w.floats) {
      const gy = s.y + sin * hold + cos * lat + 9;
      this.floatShadow.setVisible(true).setPosition(Math.round(wsp.x), Math.round(gy)).setScale(w.charge ? 2 : 1, 1).setAlpha(0.26 - Math.sin(this.t * 2.6) * 0.04);
      if (w.charge) {
        const pow = this.charging ? clamp01(this.chargeT / w.charge.time) : this.slamT >= 0 ? this.slamRaise * Math.max(0, 1 - this.slamT / SLAM_TOTAL) : 0;
        g = { x: this.staffTip.x, y: this.staffTip.y, a: 0.1 + pow * 0.65, sc: 0.35 + pow * 0.6 };
        if (this.charging) {
          this.gatherT -= dt;
          if (this.gatherT <= 0) { this.gatherT = 0.1 - pow * 0.05; this.scene.gatherFx(this.staffTip.x, this.staffTip.y, spellCol, 14 + pow * 8); }
        } else if (bless !== 'none') {
          this.moteT -= dt;
          if (this.moteT <= 0) { this.moteT = 0.3; this.scene.floatMote(this.staffTip.x + (Math.random() - 0.5) * 6, this.staffTip.y + (Math.random() - 0.5) * 6, spellCol); }
        }
      } else {
        g = { x: wsp.x, y: wsp.y, a: 0.12 + this.castPulse * 0.5, sc: 0.55 + this.castPulse * 0.25 };
        this.moteT -= dt;
        if (this.moteT <= 0 && bless !== 'none') { this.moteT = 0.16; this.scene.floatMote(wsp.x + (Math.random() - 0.5) * 12, wsp.y + (Math.random() - 0.5) * 8, spellCol); }
      }
    }
    if (g) this.fxGlow.setVisible(true).setPosition(g.x, g.y).setTint(spellCol).setAlpha(g.a).setScale(g.sc);
    else this.fxGlow.setVisible(false);

    this.shieldRing.setVisible(this.shield > 0).setPosition(s.x, s.y).setAlpha(0.5 + Math.sin(this.t * 6) * 0.2);
  }
}
