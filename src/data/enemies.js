// Skeleton Soldier (the only enemy listed in the sheet).
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
    moveSpeed: 54,
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
};
