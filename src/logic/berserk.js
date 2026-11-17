// Sword Aura / Berserk (Melee).  Rules straight from the sheet:
//  - Physical Force (PF) is split into 4 Aura Cores of 25%.
//  - Each Berserk activation consumes one Core (25%).
//  - PF drains 2.5% per second while Berserk is active.
//  - PF at 0%  -> Life Force Decay (heavy penalties + periodic damage).
//  - Ending Berserk early (no decay) -> Life Force Exhaustion (lighter penalties).
//  - Depleted Cores regenerate individually after 15s without activation.
// [PLACEHOLDER] bits: exhaustion length, decay tick rate, decay ends when 1 core is back.

import { BERSERK } from '../data/constants.js';

export class Berserk {
  constructor() {
    this.force = 1; // 0..1
    this.active = false;
    this.mods = null; // bonus mods of the current activation
    this.timeLeft = Infinity; // skill-based activations have a time cap
    this.decay = false;
    this.decayTick = 0;
    this.exhaustion = 0;
    this.regenTimer = 0;
  }

  get cores() {
    return Math.floor(this.force / BERSERK.forcePerCore + 1e-9);
  }

  canActivate() {
    return !this.active && !this.decay && this.force >= BERSERK.forcePerCore - 1e-9;
  }

  /** mods: stat bonuses while active. duration: seconds (Infinity = until PF ends). */
  activate(mods = BERSERK.baseBuff, duration = Infinity) {
    if (!this.canActivate()) return false;
    this.force = Math.max(0, this.force - BERSERK.forcePerCore);
    this.exhaustion = 0;
    this.regenTimer = 0;
    if (this.force <= 1e-9) {
      this._startDecay(); // 4th activation without regen = instant decay
      return true;
    }
    this.active = true;
    this.mods = mods;
    this.timeLeft = duration;
    return true;
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.mods = null;
    this.exhaustion = BERSERK.exhaustion.seconds;
    this.regenTimer = 0;
  }

  _startDecay() {
    this.active = false;
    this.mods = null;
    this.force = 0;
    this.decay = true;
    this.decayTick = 0;
    this.exhaustion = 0;
    this.regenTimer = 0;
  }

  /** returns { damageTicks } - number of periodic-damage ticks that happened this frame */
  update(dt) {
    let damageTicks = 0;
    if (this.active) {
      this.force -= BERSERK.drainPerSecond * dt;
      this.timeLeft -= dt;
      if (this.force <= 0) {
        this._startDecay();
      } else if (this.timeLeft <= 0) {
        this.deactivate();
      }
      return { damageTicks };
    }
    if (this.decay) {
      this.decayTick += dt;
      while (this.decayTick >= BERSERK.decay.tickSeconds) {
        this.decayTick -= BERSERK.decay.tickSeconds;
        damageTicks++;
      }
    } else if (this.exhaustion > 0) {
      this.exhaustion = Math.max(0, this.exhaustion - dt);
    }
    // core regeneration: one core every 15s without activation
    if (this.force < 1) {
      this.regenTimer += dt;
      if (this.regenTimer >= BERSERK.coreRegenSeconds) {
        this.regenTimer = 0;
        this.force = Math.min(1, (Math.floor(this.force / BERSERK.forcePerCore + 1e-9) + 1) * BERSERK.forcePerCore);
      }
    }
    if (this.decay && this.force >= BERSERK.forcePerCore - 1e-9) {
      this.decay = false;
      this.exhaustion = BERSERK.exhaustion.seconds;
    }
    return { damageTicks };
  }

  /** stat modifiers currently applied by the Berserk system */
  getMods() {
    if (this.active) return this.mods || {};
    if (this.decay) {
      const d = BERSERK.decay;
      return { moveSpeed: d.moveSpeed, damage: d.damage, critDamage: d.critDamage, critRate: d.critRate, meleeDamage: d.meleeDamage };
    }
    if (this.exhaustion > 0) {
      const e = BERSERK.exhaustion;
      return { moveSpeed: e.moveSpeed, damage: e.damage, critDamage: e.critDamage, meleeDamage: e.meleeDamage };
    }
    return {};
  }

  get status() {
    if (this.active) return 'BERSERK';
    if (this.decay) return 'LIFE FORCE DECAY';
    if (this.exhaustion > 0) return 'EXHAUSTED';
    return 'READY';
  }
}
