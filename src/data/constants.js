// =====================================================================
//  CORE NUMBERS  (everything here comes from the planning spreadsheet
//  unless it is marked  [PLACEHOLDER]  - those are my own guesses so the
//  game is playable. Change them freely.)
// =====================================================================

export const GAME_TITLE = 'Tower of [Trials]'; // [PLACEHOLDER] title from the sheet

// ---- Level Rank System (sheet) ------------------------------------
export const RANKS = [
  { rank: 'F', min: 1, max: 10 },
  { rank: 'E', min: 11, max: 30 },
  { rank: 'D', min: 31, max: 49 },
  { rank: 'C', min: 50, max: 79 },
  { rank: 'B', min: 80, max: 99 },
  { rank: 'A', min: 100, max: 150 },
  { rank: 'S', min: 151, max: Infinity },
];

export const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

export const RANK_COLORS = {
  F: '#b7b0a2',
  E: '#7fc47f',
  D: '#6aa6d8',
  C: '#c48bd6',
  B: '#e0a64a',
  A: '#e0654a',
  S: '#ffd84a',
};

export function rankOfLevel(level) {
  for (const r of RANKS) if (level >= r.min && level <= r.max) return r.rank;
  return 'F';
}

export function rankRange(rank) {
  return RANKS.find((r) => r.rank === rank) || RANKS[0];
}

// ---- Level system (sheet) ------------------------------------------
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 50;
export const BASIC_GROWTH = 0.05; // +5% of base per level, every basic stat
export const CRIT_GROWTH = 0.01; // +1% of base per level, every criticals stat

// [PLACEHOLDER] xp needed to go from level L to L+1
export const xpToNext = (level) => Math.round(30 + 14 * level);

// ---- Player base stats (sheet: all "100%" etc.) ---------------------
// The sheet only gives percentages, so these are the "100%" reference values.
export const UNITS = {
  health: 100, // [PLACEHOLDER] 100% health = 100 HP
  stamina: 100, // [PLACEHOLDER]
  manaPerCircle: 100, // [PLACEHOLDER] mana is 0% without a Mana Circle
};

export const PLAYER_BASE = {
  health: 1.0,
  defensePctOfHealth: 0.1, // Defense 10% Health
  stamina: 1.0,
  mana: 0.0, // Mana 0% - needs a Mana Circle
  // recovery per second, as a fraction of the max
  recovery: {
    health: { combat: 0.0, out: 0.01 },
    stamina: { combat: 0.05, out: 0.15 },
    mana: { combat: 0.05, out: 0.05 },
  },
  critRate: 0.15,
  critDamage: 1.25,
  moveSpeed: 1.0,
  dodgeDistance: 1.0,
  dodgeCooldown: 1.5, // seconds
  dodgeStamina: 0.25,
  damage: 1.0,
  meleeDamage: 1.0,
  rangeDamage: 1.0,
  magicDamage: 1.0,
  damageReduction: 0.0,
  weaponProficiencyRate: 1.0,
  focusSpeed: 1.0, // 100% = 2.5 seconds to reach 100% focus
  expRate: 1.0,
};

// ---- Combat-state rules ---------------------------------------------
export const COMBAT_TIMEOUT = 5; // [PLACEHOLDER] seconds without hit/hurt -> "out of combat"
export const TRAIT_SLOTS = 1; // [PLACEHOLDER] testers: ONE trait per run (skills are separate and unlimited)

// ---- Sword Aura / Berserk (sheet) -----------------------------------
export const BERSERK = {
  maxCores: 4,
  forcePerCore: 0.25,
  drainPerSecond: 0.025, // 2.5% per second while Berserk is active
  coreRegenSeconds: 15, // depleted cores regenerate after 15s without activation
  // Life Force Decay penalties (sheet)
  decay: {
    periodicDamage: 0.05, // 5% of max health per tick
    moveSpeed: -0.7,
    damage: -0.5,
    critDamage: -0.5,
    critRate: -0.25,
    meleeDamage: -0.25,
    tickSeconds: 3, // [PLACEHOLDER] how often the periodic damage ticks
  },
  // Life Force Exhaustion penalties (sheet)
  exhaustion: {
    moveSpeed: -0.25,
    damage: -0.25,
    critDamage: -0.25,
    meleeDamage: -0.1,
    seconds: 8, // [PLACEHOLDER] how long exhaustion lasts
  },
  // [PLACEHOLDER] bonuses of the plain Berserk (no skill equipped)
  baseBuff: { damage: 0.1, defense: 0.05, moveSpeed: 0.05 },
};

// ---- Focus system (sheet: Ranger) ------------------------------------
export const FOCUS = {
  secondsTo100: 2.5, // at 100% focus speed
  overFocusStart: 1.5, // 100-150% costs no extra stamina
  maxFocus: 2.0, // [PLACEHOLDER] hard cap
  staminaPer10Over: 0.05, // every 10% focus above 150% costs 5% stamina
  lockRange: 170, // [PLACEHOLDER] pixels, how far you can lock onto a target
};

// ---- Magic system (sheet) --------------------------------------------
// Chance of creating 1 / 2 Mana Circles, by the rank of your Innate Talent (trait)
export const MANA_CIRCLE_CHANCE = {
  F: { one: 0.2, two: 0.03, talent: 'Mana Reserve' },
  E: { one: 0.25, two: 0.05, talent: 'Focused Mind' },
  D: { one: 0.3, two: 0.07, talent: 'Mana Surge' },
  C: { one: 0.15, two: 0.08, talent: 'False Predation' },
  B: { one: 0.5, two: 0.1, talent: 'Arcane Affinity' },
  A: { one: 0.6, two: 0.15, talent: 'Fake Mana Heart' },
  S: { one: 0.8, two: 0.2, talent: "Gemini's Blessing" },
};

export const MANA_TYPES = {
  natural: {
    name: 'Natural Mana',
    desc: 'Drawn from the nature within the Tower of [Trials]',
    magic: ['Water', 'Fire', 'Wind', 'Geo'],
    color: '#6ed48a',
  },
  divine: {
    name: 'Divine Mana',
    desc: 'Granted by higher beings',
    magic: ['Healing', 'Glutton', 'Necromancy'],
    color: '#ffe27a',
  },
  arcane: {
    name: 'Arcane Mana',
    desc: 'Harnessed through manipulating mana based on academic theories and formulas',
    magic: ['Lightning', 'Healing', 'Protection'],
    color: '#6fb4ff',
  },
  extraplanar: {
    name: 'Extraplanar Mana',
    desc: 'Reality-warping drawn from the overseer of the Tower of [Trials]',
    magic: ['Teleportation', 'Invisibility'],
    color: '#c27bff',
  },
};

export const GEMINI_NOTICE = 'Constellation [Gemini] blesses you with her creation and divinity.';

// ---- Dungeon spawning rules (sheet) ----------------------------------
export const DOUBLE_DUNGEON_CHANCE = {
  preset: 0.03, // "very low chances in preset dungeons" [PLACEHOLDER number]
  randomized: 0.12, // "low chances in randomized dungeons" [PLACEHOLDER number]
};
