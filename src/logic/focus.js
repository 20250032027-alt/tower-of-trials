// Focus System (Ranger).  From the sheet:
//  - Focus starts at 0%.  Focus Speed 100% = 2.5 seconds to reach 100%.
//  - Damage is directly proportional to focus when the shot hits.
//  - 100%-150% focus: no extra stamina used.
//  - More than 150%: for every 10% focus, 5% stamina consumption.
// [PLACEHOLDER] hard cap of 200% focus.

import { FOCUS } from '../data/constants.js';

/**
 * Advance focus by dt seconds.
 * Returns { focus, staminaFrac } where staminaFrac is the stamina (as a fraction of
 * max stamina, before the stamina-cost modifier) used this tick.
 */
export function focusTick(focus, dt, focusSpeed, weaponRate = 1, canPayStamina = true) {
  const rate = (1 / FOCUS.secondsTo100) * focusSpeed * weaponRate; // focus per second
  let target = focus + rate * dt;
  // can't push past 150% when out of stamina
  const ceiling = canPayStamina ? FOCUS.maxFocus : FOCUS.overFocusStart;
  if (target > ceiling) target = Math.max(focus, ceiling);
  const over = Math.max(0, target - Math.max(focus, FOCUS.overFocusStart));
  const staminaFrac = (over / 0.1) * FOCUS.staminaPer10Over;
  return { focus: target, staminaFrac };
}
