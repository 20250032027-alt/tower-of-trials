// Magic system: Innate Talents may form Mana Circles (sheet table).
// Without a Mana Circle you have 0 mana and cannot use magic weapons.

import { MANA_CIRCLE_CHANCE } from '../data/constants.js';

/** Roll how many Mana Circles a talent of this rank forms: 0, 1 or 2. */
export function rollManaCircles(talentRank, rng) {
  const c = MANA_CIRCLE_CHANCE[talentRank];
  if (!c) return 0;
  const r = rng.next();
  if (r < c.two) return 2;
  if (r < c.two + c.one) return 1;
  return 0;
}

export const hasMagic = (profile) => profile.manaCircles > 0;
