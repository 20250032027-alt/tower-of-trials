// Skeleton Soldier (the enemy listed in the sheet) + four VARIETIES with other weapons (tester feedback, mine, [PLACEHOLDER]).
// Which ones turn up depends on the floor: see ENEMY_MIX below.
// Sheet values: Health 100%, Defense 20% Health, Stamina 100%,
// Mana 0%, Crit Rate 10%, Crit Damage 125%, weapon = Sword (melee).
// Recovery: health 0%/1%, stamina 5%/15%, mana 5%/5% (in / out of combat).
// Level = based on Dungeon Rank + Player Level.  Rank = based on Level.

export const ENEMIES = {
  skeleton_soldier: {
    id: 'skeleton_soldier',
    name: 'Skeleton Soldier',
    weapon: 'Sword',
    // "100%" reference values [PLACEHOLDER numbers]
    baseHealth: 60,
    baseDamage: 9,
    defensePctOfHealth: 0.2,
    critRate: 0.1,
    critDamage: 1.25,
    // behaviour [PLACEHOLDER]
    moveSpeed: 60,
    // awareness [PLACEHOLDER]: notices you in its own room (line of sight) or when you are right beside it
    sightRange: 220,   // farthest it can see you, only inside its own room
    earRange: 34,      // it hears you this close even without line of sight
    noticeTime: 0.9,   // seconds of seeing you from far away before it reacts (faster when close)
    calmRate: 0.5,     // suspicion fades at this rate when it can no longer sense you
    loseTime: 3.5,     // seconds without line of sight before it gives up the chase and searches
    searchTime: 3,     // seconds it looks around the spot where it last saw you
    loseRange: 230,
    attackRange: 24,
    attackArcDeg: 100,
    windup: 0.42,
    cooldown: 1.3,
    knockbackResist: 0.0,
    xpBase: 18,
    xpPerLevel: 5,
    healDropChance: 0.12,
  },

  // ------------------------------------------------------------ varieties (they share the soldier's senses)
  skeleton_lancer: {
    id: 'skeleton_lancer', name: 'Skeleton Lancer', weapon: 'Spear', style: 'spear', wkey: 'w_spear', wtint: 0xc9a27a, tint: 0xdde6f4,
    baseHealth: 50, baseDamage: 8, defensePctOfHealth: 0.2, critRate: 0.1, critDamage: 1.25,
    moveSpeed: 66, // quicker
    attackRange: 38, attackArcDeg: 34, windup: 0.5, cooldown: 1.15, knockbackResist: 0.0, // longer reach, a narrow thrust
    xpBase: 20, xpPerLevel: 5, healDropChance: 0.12,
  },
  skeleton_brute: {
    id: 'skeleton_brute', name: 'Skeleton Brute', weapon: 'Claymore', style: 'heavy', wkey: 'w_claymore', wtint: 0x9aa0b4, tint: 0xd2a89c,
    baseHealth: 115, baseDamage: 14, defensePctOfHealth: 0.25, critRate: 0.08, critDamage: 1.3,
    moveSpeed: 42, // slow, big
    attackRange: 28, attackArcDeg: 140, windup: 0.8, cooldown: 2.0, knockbackResist: 0.5, // slow, wide, heavy
    xpBase: 32, xpPerLevel: 7, healDropChance: 0.2,
  },
  skeleton_archer: {
    id: 'skeleton_archer', name: 'Skeleton Archer', weapon: 'Bow', style: 'bow', wkey: 'w_bow', wtint: 0xb59a78, tint: 0xcfe0c0,
    baseHealth: 38, baseDamage: 7, defensePctOfHealth: 0.1, critRate: 0.12, critDamage: 1.25,
    moveSpeed: 52,
    attackRange: 24, attackArcDeg: 60, windup: 0.6, cooldown: 1.9, knockbackResist: 0.0,
    ranged: { range: 165, keep: 85, speed: 200, shot: 'arrow', tint: 0xd9cfae }, // keeps its distance and shoots
    xpBase: 24, xpPerLevel: 6, healDropChance: 0.1,
  },
  skeleton_mage: {
    id: 'skeleton_mage', name: 'Skeleton Mage', weapon: 'Staff', style: 'staff', wkey: 'w_staff', wtint: 0xa890e0, tint: 0xc8b4ec,
    baseHealth: 32, baseDamage: 11, defensePctOfHealth: 0.1, critRate: 0.1, critDamage: 1.25,
    moveSpeed: 46,
    attackRange: 24, attackArcDeg: 60, windup: 0.85, cooldown: 2.6, knockbackResist: 0.0,
    ranged: { range: 150, keep: 100, speed: 125, shot: 'enemy', tint: 0xffffff }, // a slow orb you can dodge
    xpBase: 30, xpPerLevel: 7, healDropChance: 0.15,
  },
};

// Every variety shares the soldier's senses and timings unless it says otherwise
for (const id of ['skeleton_lancer', 'skeleton_brute', 'skeleton_archer', 'skeleton_mage']) {
  ENEMIES[id] = { ...ENEMIES.skeleton_soldier, ...ENEMIES[id] };
}
ENEMIES.skeleton_soldier.style = 'sword';
ENEMIES.skeleton_soldier.wkey = 'w_sword';
ENEMIES.skeleton_soldier.wtint = 0xc9a27a;
ENEMIES.skeleton_soldier.tint = 0xffffff;

// What can spawn on each floor (weights). The Tutorial Floor is soldiers only. Floor 1 adds the Lancer, floor 2 the Archer,
// floor 3 the Brute, floor 4 the Mage; from floor 5 on every variety is around and the tougher ones are common.
export const ENEMY_MIX = {
  tutorial: { skeleton_soldier: 1 },
  floor1: { skeleton_soldier: 72, skeleton_lancer: 28 },
  floor2: { skeleton_soldier: 45, skeleton_lancer: 30, skeleton_archer: 25 },
  floor3: { skeleton_soldier: 34, skeleton_lancer: 24, skeleton_archer: 24, skeleton_brute: 18 },
  floor4: { skeleton_soldier: 28, skeleton_lancer: 20, skeleton_archer: 24, skeleton_brute: 16, skeleton_mage: 12 },
  later: { skeleton_soldier: 18, skeleton_lancer: 20, skeleton_archer: 22, skeleton_brute: 22, skeleton_mage: 18 },
};

/** Pick which skeleton stands at a spawn point on this floor. `u` is a random number in [0, 1). */
export function pickEnemyType(floorId, u) {
  const mix = ENEMY_MIX[floorId] || ENEMY_MIX.later;
  const ids = Object.keys(mix);
  let x = u * ids.reduce((s, id) => s + mix[id], 0);
  for (const id of ids) { x -= mix[id]; if (x < 0) return id; }
  return ids[0];
}
