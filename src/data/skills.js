// SKILLS are separate from TRAITS. A trait is a passive that you carry (only ONE per run, dealt by rank F to S).
// Skills are the active abilities, and you can have as many as you like: they are picked from a wheel (key F).
// For now the skills are simply the skills that the traits of the plan come with, under the trait's name.
// (A trait whose skill is blank in the plan has no skill yet. Secret "???" traits have none either.)

import { TRAITS } from './traits.js';

export const SKILLS = TRAITS.filter((t) => t.skill && !t.secret).map((t) => ({
  id: t.id, name: t.name, rank: t.rank, type: t.type, skill: t.skill,
}));
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const ALL_SKILL_IDS = SKILLS.map((s) => s.id);
