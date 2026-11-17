// =====================================================================
//  TOWER FLOORS + DUNGEONS
//
//  Sheet: 11 floors (1 Tutorial + 10 main). The sheet only needs the Tutorial Floor and Floor 1
//  before December, but the whole tower is built here: Floors 2-10 are generated in data/floorgen.js.
//  Floor layouts/themes are "Pending" in the sheet -> every layout below is a [PLACEHOLDER] design of mine.
//
//  Dungeon kinds (sheet):
//    preset      custom-made dungeons
//    random      randomly generated dungeons
//    hidden      secret/unshown dungeons on the map (always preset)
//    double      a dungeon within a dungeon, difficulty exceeds normal scaling,
//                always preset, can spawn inside preset (very low chance) and
//                randomized (low chance) dungeons
//    main        the main dungeon of the floor (main gameplay loop)
//
//  Layout format (see logic/layout.js):
//    R(id, x, y, w, h, extra)   a room
//    links: [[roomA, roomB, 'h'|'v'], ...]   corridors (h = horizontal first)
//    extra: role 'start'|'exit', enemies:n, chest:true, pillars:[[dx,dy]..],
//           objects:[{t:'sign'|'portal'|'dummy'|'altar'|..., dx, dy, ...}]
// =====================================================================

import { generateTowerFloors } from './floorgen.js';

const R = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, ...extra });

// ---------------------------------------------------------------- floors
export const FLOORS = {
  tutorial: {
    id: 'tutorial',
    name: 'Tutorial Floor',
    short: 'Tutorial',
    theme: 'trial',
    layout: {
      w: 64, h: 40, corridor: 2,
      rooms: [
        R('start', 3, 14, 10, 10, {
          role: 'start',
          objects: [
            { t: 'sign', dx: 1, dy: 0, title: 'WELCOME, CLIMBER', text: 'This is the Tutorial Floor of the Tower of [Trials].\nWalk up to signs and press E (or tap USE) to read them.\nMove: WASD / left stick.   Aim: mouse / right stick.' },
            { t: 'sign', dx: 8, dy: 0, title: 'THE TOWER', text: 'The Tower has 11 Floors: this Tutorial Floor and 10 Main Floors.\nEach floor is a story act made of dungeons.\nFinish the Trial of Bones, then climb to Floor 1.' },
          ],
        }),
        R('yard', 17, 5, 16, 12, {
          objects: [
            { t: 'sign', dx: 1, dy: 0, title: 'COMBAT BASICS', text: 'ATTACK: left click / hold the right stick.\nDODGE: SPACE (costs 25% stamina, 1.5s cooldown).\nStamina refills 15%/s out of combat, 5%/s in combat.\nCrits: 15% chance for 125% damage at level 1.' },
            { t: 'sign', dx: 14, dy: 0, title: 'SWORD AURA', text: 'Melee users can unleash BERSERK (key R).\nIt burns 2.5% Physical Force per second.\nPhysical Force is split into 4 Aura Cores (25% each).\nEmpty = Life Force Decay.   Ending early = Exhaustion.' },
            { t: 'dummy', dx: 4, dy: 4 },
            { t: 'dummy', dx: 8, dy: 8 },
            { t: 'dummy', dx: 12, dy: 4 },
          ],
        }),
        R('range', 37, 5, 16, 12, {
          objects: [
            { t: 'sign', dx: 1, dy: 0, title: 'FOCUS SYSTEM (RANGER)', text: 'Hold attack with a Bow, Crossbow or Pistol to FOCUS.\nAll targets in view are highlighted; one gets locked on.\nFocus fills in 2.5s at 100% Focus Speed. Damage scales with focus.\n100-150% focus costs no extra stamina; above 150% every 10% costs 5% stamina.' },
            { t: 'sign', dx: 14, dy: 0, title: 'SWITCHING WEAPONS', text: 'Press Q (or tap SWAP) to cycle weapons.\nOpen the menu (TAB / MENU) to see every weapon and its sheet stats.' },
            { t: 'dummy', dx: 13, dy: 3 },
            { t: 'dummy', dx: 13, dy: 8 },
            { t: 'dummy', dx: 9, dy: 5 },
            { t: 'dummy', dx: 5, dy: 9 },
          ],
        }),
        R('traits', 17, 22, 14, 10, {
          objects: [
            { t: 'altar', kind: 'loadout', dx: 3, dy: 4, label: 'LOADOUT' },
            { t: 'altar', kind: 'mana', dx: 10, dy: 4, label: 'MANA ALTAR' },
            { t: 'sign', dx: 1, dy: 0, title: 'TRAITS AND SKILLS', text: 'Each trait gives passive bonuses AND a skill (keys 1-3).\nTrait rank does not change your Level rank.\nBlank or "???" entries in the plan are shown locked.' },
            { t: 'sign', dx: 12, dy: 0, title: 'MAGIC SYSTEM', text: 'Magic and Mana need an Innate Talent: a Magic-type trait.\nAt the Mana Altar your talent may form 1 or 2 Mana Circles.\nNo Mana Circle = no Mana = no Book or Staff.' },
          ],
        }),
        R('gate', 37, 22, 18, 12, {
          objects: [
            { t: 'portal', dx: 4, dy: 5, label: 'TRIAL OF BONES', to: { type: 'dungeon', id: 'trial' } },
            { t: 'portal', dx: 13, dy: 5, label: 'STAIRS TO FLOOR 1', to: { type: 'floor', id: 'floor1' }, requires: 'trialCleared' },
            { t: 'sign', dx: 8, dy: 0, title: 'THE GATE', text: 'Clear the Trial of Bones to unlock the stairs to Floor 1.\nRank of a dungeon decides how strong its enemies are.\nLevel ranks: F 1-10, E 11-30, D 31-49, C 50-79, B 80-99, A 100-150, S 151+.' },
          ],
        }),
      ],
      links: [
        ['start', 'yard', 'h'],
        ['yard', 'range', 'h'],
        ['start', 'traits', 'h'],
        ['traits', 'gate', 'h'],
        ['range', 'gate', 'h'],
      ],
    },
  },

  floor1: {
    id: 'floor1',
    name: 'Floor 1',
    short: 'Floor 1',
    theme: 'crypt',
    n: 1, mainId: 'main', hiddenId: 'hidden_vault',
    intro: 'FLOOR 1. Look for cracks in the walls...',
    layout: {
      w: 72, h: 48, corridor: 2,
      rooms: [
        R('start', 3, 18, 10, 10, {
          role: 'start',
          objects: [
            { t: 'portal', dx: 7, dy: 4, label: 'STAIRS DOWN', to: { type: 'floor', id: 'tutorial', arriveAtStairs: true } },
            { t: 'sign', dx: 1, dy: 0, title: 'FLOOR 1', text: 'Each floor has 1 main dungeon, 3-6 preset dungeons, a few randomized dungeons, secret hidden dungeons and rare double dungeons.\nEvery dungeon has a Rank. Higher rank = higher-level enemies.' },
          ],
        }),
        R('plaza', 18, 16, 16, 14, {
          objects: [
            { t: 'sign', dx: 7, dy: 0, title: 'DUNGEON TYPES', text: 'PRESET: custom-made.   RANDOMIZED: generated fresh every time.\nHIDDEN: secret, never shown on the map.\nDOUBLE: a dungeon inside a dungeon. Rare, and far harder than normal scaling.' },
            { t: 'altar', kind: 'loadout', dx: 7, dy: 6, label: 'LOADOUT' },
            { t: 'dummy', dx: 2, dy: 9 },
            { t: 'dummy', dx: 12, dy: 9 },
          ],
        }),
        R('mainhall', 40, 18, 18, 10, {
          objects: [
            { t: 'portal', dx: 8, dy: 4, label: 'MAIN DUNGEON: SKELETON CRYPT', to: { type: 'dungeon', id: 'main' } },
            { t: 'sign', dx: 1, dy: 0, title: 'MAIN DUNGEON', text: 'The main dungeon is the main gameplay loop of the floor.\nIt is the longest one, and it ends in the Last Chamber.' },
            { t: 'portal', dx: 15, dy: 4, label: 'STAIRS TO FLOOR 2', to: { type: 'floor', id: 'floor2' }, requires: 'floor1Cleared', lockText: 'CLEAR THE SKELETON CRYPT' },
          ],
        }),
        R('pA', 40, 4, 14, 9, { objects: [{ t: 'portal', dx: 6, dy: 4, label: 'BONE HALL', to: { type: 'dungeon', id: 'bone_hall' } }] }),
        R('pB', 40, 34, 14, 9, { objects: [{ t: 'portal', dx: 6, dy: 4, label: 'CRYPT PASSAGE', to: { type: 'dungeon', id: 'crypt_passage' } }] }),
        R('pC', 5, 36, 10, 8, { objects: [{ t: 'portal', dx: 4, dy: 3, label: 'COLLAPSED ARMORY', to: { type: 'dungeon', id: 'collapsed_armory' } }] }),
        R('pD', 5, 4, 10, 8, { objects: [{ t: 'portal', dx: 4, dy: 3, label: 'SENTINEL GALLERY', to: { type: 'dungeon', id: 'sentinel_gallery' } }] }),
        R('rA', 58, 4, 10, 8, { objects: [{ t: 'portal', dx: 4, dy: 3, label: 'SHIFTING RUINS I', to: { type: 'dungeon', id: 'random_1' } }] }),
        R('rB', 58, 34, 10, 8, { objects: [{ t: 'portal', dx: 4, dy: 3, label: 'SHIFTING RUINS II', to: { type: 'dungeon', id: 'random_2' } }] }),
        // sealed secret vault: a cracked wall at (15,7) leads in. Portal is inside.
        R('vault', 16, 5, 6, 5, {
          objects: [{ t: 'portal', dx: 3, dy: 2, label: 'FORGOTTEN VAULT', to: { type: 'dungeon', id: 'hidden_vault' }, hidden: true }],
        }),
      ],
      links: [
        ['start', 'plaza', 'h'],
        ['plaza', 'mainhall', 'h'],
        ['plaza', 'pA', 'v'],
        ['plaza', 'pB', 'v'],
        ['start', 'pC', 'h'],
        ['start', 'pD', 'h'],
        ['pA', 'rA', 'h'],
        ['pB', 'rB', 'h'],
      ],
      cracks: [{ x: 15, y: 7 }],
    },
  },
};

// ------------------------------------------------------------- dungeons
// rank: dungeon rank (sets the enemy level range)  levelDelta: +/- vs player level
export const DUNGEONS = {
  trial: {
    id: 'trial', name: 'Trial of Bones', kind: 'preset', rank: 'F', levelDelta: 0, floor: 'tutorial',
    theme: 'trial', xpBonus: 1.0, clearFlag: 'trialCleared',
    layout: {
      w: 50, h: 30, corridor: 2,
      rooms: [
        R('a', 2, 10, 9, 9, { role: 'start' }),
        R('b', 15, 4, 10, 9, { enemies: 2 }),
        R('c', 15, 18, 10, 9, { enemies: 2, chest: true }),
        R('d', 30, 10, 14, 9, { enemies: 3, role: 'exit' }),
      ],
      links: [['a', 'b', 'h'], ['a', 'c', 'h'], ['b', 'd', 'h'], ['c', 'd', 'h']],
    },
  },

  main: {
    id: 'main', name: 'Skeleton Crypt', kind: 'main', rank: 'F', levelDelta: 2, floor: 'floor1',
    theme: 'crypt', xpBonus: 1.25, clearFlag: 'floor1Cleared',
    layout: {
      w: 80, h: 54, corridor: 2,
      rooms: [
        R('s', 3, 22, 10, 10, { role: 'start' }),
        R('a', 18, 10, 12, 10, { enemies: 3 }),
        R('b', 18, 34, 12, 10, { enemies: 3, chest: true }),
        R('c', 36, 22, 12, 10, { enemies: 5, pillars: [[3, 3], [8, 3], [3, 6], [8, 6]] }),
        R('d', 36, 4, 12, 8, { enemies: 4 }),
        R('f', 36, 40, 12, 8, { enemies: 4, chest: true }),
        R('g', 54, 10, 12, 10, { enemies: 5 }),
        R('h', 54, 34, 12, 10, { enemies: 5, chest: true }),
        R('last', 70, 22, 8, 12, { enemies: 7, role: 'exit', levelBonus: 3 }),
      ],
      links: [
        ['s', 'c', 'h'], ['s', 'a', 'h'], ['s', 'b', 'h'],
        ['a', 'd', 'h'], ['b', 'f', 'h'], ['c', 'd', 'v'], ['c', 'f', 'v'],
        ['c', 'g', 'h'], ['c', 'h', 'h'], ['g', 'last', 'h'], ['h', 'last', 'h'],
      ],
    },
  },

  bone_hall: {
    id: 'bone_hall', name: 'Bone Hall', kind: 'preset', rank: 'F', levelDelta: 0, floor: 'floor1',
    theme: 'crypt', xpBonus: 1.0,
    layout: {
      w: 64, h: 36, corridor: 2,
      rooms: [
        R('s', 2, 14, 8, 8, { role: 'start' }),
        R('hall', 14, 6, 22, 24, { enemies: 7, pillars: [[5, 5], [5, 10], [5, 15], [16, 5], [16, 10], [16, 15]] }),
        R('e1', 40, 4, 14, 10, { enemies: 3, chest: true }),
        R('e2', 40, 22, 14, 10, { enemies: 3 }),
        R('ex', 56, 14, 6, 8, { role: 'exit' }),
      ],
      links: [['s', 'hall', 'h'], ['hall', 'e1', 'h'], ['hall', 'e2', 'h'], ['e1', 'ex', 'h'], ['e2', 'ex', 'h']],
    },
  },

  crypt_passage: {
    id: 'crypt_passage', name: 'Crypt Passage', kind: 'preset', rank: 'F', levelDelta: 1, floor: 'floor1',
    theme: 'crypt', xpBonus: 1.0,
    layout: {
      w: 64, h: 40, corridor: 2,
      rooms: [
        R('s', 2, 3, 8, 8, { role: 'start' }),
        R('a', 16, 10, 10, 8, { enemies: 3 }),
        R('b', 32, 3, 10, 8, { enemies: 3, chest: true }),
        R('d', 46, 12, 12, 10, { enemies: 5, chest: true }),
        R('c', 32, 20, 10, 8, { enemies: 4 }),
        R('e', 16, 28, 10, 8, { enemies: 3, role: 'exit' }),
      ],
      links: [['s', 'a', 'h'], ['a', 'b', 'h'], ['b', 'd', 'h'], ['d', 'c', 'h'], ['c', 'e', 'h']],
    },
  },

  collapsed_armory: {
    id: 'collapsed_armory', name: 'Collapsed Armory', kind: 'preset', rank: 'F', levelDelta: 1, floor: 'floor1',
    theme: 'crypt', xpBonus: 1.0,
    layout: {
      w: 56, h: 36, corridor: 2,
      rooms: [
        R('w', 2, 14, 10, 8, { role: 'start' }),
        R('hub', 20, 12, 16, 12, { enemies: 5, pillars: [[3, 3], [12, 3], [3, 8], [12, 8]] }),
        R('n', 22, 2, 12, 6, { enemies: 3, chest: true }),
        R('s2', 22, 28, 12, 6, { enemies: 3, chest: true }),
        R('e', 42, 14, 10, 8, { enemies: 4, role: 'exit' }),
      ],
      links: [['w', 'hub', 'h'], ['hub', 'n', 'v'], ['hub', 's2', 'v'], ['hub', 'e', 'h']],
    },
  },

  sentinel_gallery: {
    id: 'sentinel_gallery', name: 'Sentinel Gallery', kind: 'preset', rank: 'F', levelDelta: 2, floor: 'floor1',
    theme: 'crypt', xpBonus: 1.0,
    layout: {
      w: 64, h: 30, corridor: 2,
      rooms: [
        R('s', 2, 10, 8, 8, { role: 'start' }),
        R('g1', 14, 8, 12, 12, { enemies: 4, pillars: [[3, 3], [8, 3], [3, 8], [8, 8]] }),
        R('g2', 30, 8, 12, 12, { enemies: 5, chest: true, pillars: [[3, 3], [8, 3], [3, 8], [8, 8]] }),
        R('g3', 46, 8, 14, 12, { enemies: 6, role: 'exit', pillars: [[3, 3], [10, 3], [3, 8], [10, 8]] }),
      ],
      links: [['s', 'g1', 'h'], ['g1', 'g2', 'h'], ['g2', 'g3', 'h']],
    },
  },

  random_1: { id: 'random_1', name: 'Shifting Ruins I', kind: 'random', rank: 'F', levelDelta: 1, floor: 'floor1', theme: 'crypt', xpBonus: 1.0 },
  random_2: { id: 'random_2', name: 'Shifting Ruins II', kind: 'random', rank: 'F', levelDelta: 3, floor: 'floor1', theme: 'crypt', xpBonus: 1.1 },

  hidden_vault: {
    id: 'hidden_vault', name: 'Forgotten Vault', kind: 'hidden', rank: 'E', levelDelta: 0, floor: 'floor1',
    theme: 'vault', xpBonus: 1.6,
    layout: {
      w: 44, h: 28, corridor: 2,
      rooms: [
        R('s', 2, 8, 8, 8, { role: 'start' }),
        R('a', 14, 4, 10, 8, { enemies: 4 }),
        R('b', 28, 9, 12, 10, { enemies: 6, chest: true, role: 'exit', extraChests: 2 }),
      ],
      links: [['s', 'a', 'h'], ['a', 'b', 'h']],
    },
  },

  // Double dungeon. Always preset. Level = parent rank max + 5, stats x1.5
  rift: {
    id: 'rift', name: 'Double Dungeon: Rift of Bones', kind: 'double', rank: 'E', levelDelta: 0, floor: 'floor1',
    theme: 'rift', xpBonus: 2.0, statMult: 1.5, fixedLevelOffset: 5,
    layout: {
      w: 48, h: 32, corridor: 2,
      rooms: [
        R('s', 2, 10, 8, 8, { role: 'start' }),
        R('a', 14, 6, 12, 10, { enemies: 5 }),
        R('b', 30, 8, 14, 14, { enemies: 6, role: 'exit', chest: true, pillars: [[4, 4], [9, 4], [4, 9], [9, 9]] }),
      ],
      links: [['s', 'a', 'h'], ['a', 'b', 'h']],
    },
  },
};

// ---------------------------------------------------------------- Floors 2-10 [PLACEHOLDER], generated
const GEN = generateTowerFloors();
Object.assign(FLOORS, GEN.floors);
Object.assign(DUNGEONS, GEN.dungeons);

// the double dungeon of each floor (Floor 1 keeps the original one)
export const RIFT_OF = { floor1: 'rift', ...GEN.riftOf };

// 11 floors listed in the sheet: 1 tutorial + 10 main floors
export const TOWER = [
  { id: 'tutorial', label: 'Tutorial Floor', playable: true },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'floor' + (i + 1), label: 'Floor ' + (i + 1), playable: true })),
];

// how many of each kind of dungeon a floor has (used by the TOWER tab and the tests)
export const dungeonsOf = (floorId) => Object.values(DUNGEONS).filter((d) => d.floor === floorId);
