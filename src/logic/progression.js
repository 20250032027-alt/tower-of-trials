// Player profile (what gets saved) + XP / level-up logic.

import { LEVEL_MIN, LEVEL_MAX, xpToNext } from '../data/constants.js';
import { TRAIT_BY_ID } from '../data/traits.js';
import { WEAPON_LIST } from '../data/weapons.js';
import { ALL_SKILL_IDS } from '../data/skills.js';

export function createProfile() {
  return {
    level: LEVEL_MIN,
    xp: 0,
    traits: [], // the trait (passives) you carry this run: ONE
    skills: [...ALL_SKILL_IDS], // every skill you own (unlimited); they are used from the skill wheel
    selSkill: null, // the skill the wheel last had selected
    weapon: 'training_sword',
    ownedWeapons: WEAPON_LIST.map((w) => w.id), // demo: every training weapon
    proficiency: { melee: 0, ranger: 0, magic: 0 },
    manaCircles: 0,
    manaType: null,
    awakened: false, // has the Mana Altar been used for the current talent?
    rerolls: 1, // free skill rerolls left in this run (random-skills mode)
    extra: {}, // permanent bonus mods (Adaptive Growth)
    flags: {}, // trialCleared, floor1Cleared, hiddenFound ...
    kills: 0,
    demo: { doubleAlways: false },
  };
}

const ADAPTIVE_POOL = ['maxHealth', 'maxStamina', 'critRate', 'critDamage', 'moveSpeed', 'damage'];

export function setLevel(profile, level) {
  profile.level = Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(level)));
  profile.xp = 0;
}

/**
 * Add XP. Returns { levelsGained, adaptive: [statName,...] }.
 * expRate is the player's Experience Rate (1.0 = 100%).
 */
export function addXp(profile, amount, expRate, rng) {
  profile.xp += amount * expRate;
  let levelsGained = 0;
  const adaptive = [];
  while (profile.level < LEVEL_MAX && profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level += 1;
    levelsGained += 1;
    // Trait "Adaptive Growth": +10% to a random stat whenever you level up
    if (profile.traits.some((id) => TRAIT_BY_ID[id] && TRAIT_BY_ID[id].onLevelUp === 'adaptive')) {
      const pool = profile.manaCircles > 0 ? [...ADAPTIVE_POOL, 'maxMana'] : ADAPTIVE_POOL;
      const stat = pool[Math.floor(rng.next() * pool.length)];
      profile.extra[stat] = (profile.extra[stat] || 0) + 0.1;
      adaptive.push(stat);
    }
  }
  if (profile.level >= LEVEL_MAX) profile.xp = 0;
  return { levelsGained, adaptive };
}

// Weapon proficiency gain per hit (Weapon Proficiency Rate 100% in the sheet)
export function addProficiency(profile, cls, masteryRate) {
  profile.proficiency[cls] = Math.min(1, (profile.proficiency[cls] || 0) + 0.004 * masteryRate);
}

export function xpFromEnemy(def, level, dungeonBonus = 1) {
  return Math.round((def.xpBase + def.xpPerLevel * level) * dungeonBonus);
}

// Tell the profile which trait is its Innate Talent (the highest-rank Magic trait equipped)
export function innateTalent(profile) {
  const rankIndex = (r) => 'FEDCBAS'.indexOf(r);
  let best = null;
  for (const id of profile.traits) {
    const t = TRAIT_BY_ID[id];
    if (t && t.type === 'Magic' && (!best || rankIndex(t.rank) > rankIndex(best.rank))) best = t;
  }
  return best;
}

// --- save / load (localStorage may be unavailable, so always try/catch)
const SAVE_KEY = 'tower-trials-demo-v1';
export function saveProfile(profile) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
}
export function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return { ...createProfile(), ...JSON.parse(raw) };
  } catch (e) { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
