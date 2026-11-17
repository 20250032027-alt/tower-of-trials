// Damage maths (no Phaser).
// The sheet gives percentage multipliers; the base weapon damage and the
// defense formula are [PLACEHOLDER] choices:
//   damage taken = damage * 100 / (100 + defense)

import { basicGrowth } from './stats.js';

export const FOCUS_MIN_DAMAGE = 0.25;

export const applyDefense = (dmg, defense) => dmg * (100 / (100 + Math.max(0, defense)));

export function focusDamageMult(focus) {
  return Math.max(FOCUS_MIN_DAMAGE, focus);
}

/**
 * One player attack, before the target's defense.
 * cond: { mark, predator, bloodlust (all additive +fractions), markCrit }
 */
export function playerAttack({ weapon, stats, focus = 1, cond = {}, rng }) {
  const growth = basicGrowth(stats.level);
  const classMult =
    weapon.cls === 'melee' ? stats.meleeDamage : weapon.cls === 'ranger' ? stats.rangeDamage : stats.magicDamage;
  const prof = (stats.proficiency && stats.proficiency[weapon.cls]) || 0;
  let dmg = weapon.damage * growth;
  dmg *= stats.damage * classMult;
  dmg *= 1 + prof * 0.25; // [PLACEHOLDER] 100% proficiency = +25% damage
  dmg *= 1 + (cond.mark || 0) + (cond.predator || 0) + (cond.bloodlust || 0);
  if (weapon.cls === 'ranger') dmg *= focusDamageMult(focus);
  const crit = rng.chance(Math.min(1, stats.critRate + (cond.markCrit || 0)));
  if (crit) dmg *= stats.critDamage;
  return { damage: dmg, crit };
}

// One enemy attack, before the player's defense / damage reduction.
export function enemyAttack({ enemyStats, rng }) {
  let dmg = enemyStats.damage;
  const crit = rng.chance(enemyStats.critRate);
  if (crit) dmg *= enemyStats.critDamage;
  return { damage: dmg, crit };
}

export function damageAfterMitigation(raw, defense, damageReduction = 0) {
  return Math.max(1, applyDefense(raw, defense) * (1 - damageReduction));
}
