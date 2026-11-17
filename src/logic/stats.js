// Turns "level + equipped traits + active buffs" into final numbers.
// No Phaser here: it's plain maths so it can be unit-tested.

import {
  PLAYER_BASE, UNITS, BASIC_GROWTH, CRIT_GROWTH, rankOfLevel,
} from '../data/constants.js';
import { TRAIT_BY_ID } from '../data/traits.js';

export const basicGrowth = (level) => 1 + BASIC_GROWTH * (level - 1);
export const critGrowth = (level) => 1 + CRIT_GROWTH * (level - 1);

// add several { stat: +x } objects together
export function sumMods(...lists) {
  const out = {};
  for (const m of lists) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

export const traitPassives = (traitIds) =>
  sumMods(...traitIds.map((id) => TRAIT_BY_ID[id] && TRAIT_BY_ID[id].mods));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} p
 *  level, manaCircles, passives (sum of trait mods), extra (permanent bonus mods,
 *  e.g. Adaptive Growth), buffs (sum of temporary mods), proficiency {melee,ranger,magic}
 */
export function computeStats({ level, manaCircles = 0, passives = {}, extra = {}, buffs = {}, proficiency = {} }) {
  const m = sumMods(passives, extra, buffs);
  const g = basicGrowth(level);
  const cg = critGrowth(level);
  const baseHealth = UNITS.health * PLAYER_BASE.health * g;
  const staminaCost = Math.max(0.1, 1 + (m.staminaCost || 0));
  const manaCost = Math.max(0.1, 1 + (m.manaCost || 0));
  const manaRegenMult = 1 + (m.manaRegen || 0);
  const rec = PLAYER_BASE.recovery;

  return {
    level,
    rank: rankOfLevel(level),
    maxHealth: baseHealth * (1 + (m.maxHealth || 0)),
    defense: PLAYER_BASE.defensePctOfHealth * baseHealth * (1 + (m.defense || 0)),
    maxStamina: UNITS.stamina * PLAYER_BASE.stamina * g * (1 + (m.maxStamina || 0)),
    maxMana: manaCircles > 0 ? manaCircles * UNITS.manaPerCircle * g * (1 + (m.maxMana || 0)) : 0,
    staminaCost,
    manaCost,
    regen: {
      health: { ...rec.health },
      stamina: { ...rec.stamina },
      mana: { combat: rec.mana.combat * manaRegenMult, out: rec.mana.out * manaRegenMult },
    },
    critRate: clamp(PLAYER_BASE.critRate * cg + (m.critRate || 0), 0, 1),
    critDamage: PLAYER_BASE.critDamage * cg + (m.critDamage || 0),
    moveSpeed: Math.max(0.1, PLAYER_BASE.moveSpeed + (m.moveSpeed || 0)),
    dodgeDistance: Math.max(0.3, PLAYER_BASE.dodgeDistance + (m.dodgeDistance || 0)),
    dodgeCooldown: PLAYER_BASE.dodgeCooldown,
    dodgeStamina: PLAYER_BASE.dodgeStamina * staminaCost,
    damage: Math.max(0.05, PLAYER_BASE.damage + (m.damage || 0)),
    meleeDamage: Math.max(0.05, PLAYER_BASE.meleeDamage + (m.meleeDamage || 0)),
    rangeDamage: Math.max(0.05, PLAYER_BASE.rangeDamage + (m.rangeDamage || 0)),
    magicDamage: Math.max(0.05, PLAYER_BASE.magicDamage + (m.magicDamage || 0)),
    damageReduction: clamp(PLAYER_BASE.damageReduction + (m.damageReduction || 0), 0, 0.9),
    focusSpeed: Math.max(0.1, PLAYER_BASE.focusSpeed + (m.focusSpeed || 0)),
    expRate: Math.max(0, PLAYER_BASE.expRate + (m.expRate || 0)),
    weaponMastery: Math.max(0, PLAYER_BASE.weaponProficiencyRate + (m.weaponMastery || 0)),
    lootLuck: m.lootLuck || 0,
    proficiency: { melee: 0, ranger: 0, magic: 0, ...proficiency },
  };
}

// Stats for an enemy of a given level (sheet: basic stats +5% per level).
export function computeEnemyStats(def, level, statMult = 1) {
  const g = basicGrowth(level);
  const cg = critGrowth(level);
  const baseHealth = def.baseHealth * g * statMult;
  return {
    level,
    maxHealth: baseHealth,
    defense: def.defensePctOfHealth * baseHealth,
    damage: def.baseDamage * g * statMult, // [PLACEHOLDER] damage grows like a basic stat
    critRate: def.critRate * cg,
    critDamage: def.critDamage * cg,
  };
}
