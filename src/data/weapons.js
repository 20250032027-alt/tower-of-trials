// Weapons table from the sheet (Weight / Unique / Speed) plus the
// "Specifics" row (Training Sword, Training Claymore, ...).
// The sheet has no damage numbers, so the combat numbers below are
// [PLACEHOLDER] values chosen to match the descriptions
// (Claymore = heavy + slow + more damage, Spear = longer range + fast, ...).

export const CLASSES = {
  melee: { name: 'Melee', color: '#7fc47f' },
  ranger: { name: 'Ranger', color: '#6aa6d8' },
  magic: { name: 'Magic', color: '#c48bd6' },
};

export const WEAPONS = {
  training_sword: {
    id: 'training_sword',
    name: 'Training Sword',
    type: 'Sword',
    cls: 'melee',
    sheet: { weight: 'Light', unique: 'Average', speed: 'Average' },
    damage: 12,
    arcDeg: 110,
    range: 30,
    cooldown: 0.4,
    stamina: 0.06,
    knockback: 70,
    swingTime: 0.21, // seconds for the whole swing animation: wind-up, sweep, follow-through
    windup: 0.3, // fraction of it spent drawing back; the hit lands when the wind-up ends
    sprite: 'sword',
  },
  training_claymore: {
    id: 'training_claymore',
    name: 'Training Claymore',
    type: 'Claymore',
    cls: 'melee',
    sheet: { weight: 'Heavy', unique: 'More Damage', speed: 'Slow' },
    damage: 26,
    arcDeg: 140,
    range: 36,
    cooldown: 0.95,
    stamina: 0.12,
    knockback: 160,
    swingTime: 0.46,
    windup: 0.34,
    sprite: 'claymore',
  },
  training_spear: {
    id: 'training_spear',
    name: 'Training Spear',
    type: 'Spear',
    cls: 'melee',
    sheet: { weight: 'Light', unique: 'Longer Range', speed: 'Fast' },
    damage: 10,
    arcDeg: 26,
    range: 44, // was 54 (testers: too strong); the sprite is shorter too. Tuning panel: SPEAR REACH
    cooldown: 0.3,
    stamina: 0.05,
    knockback: 50,
    swingTime: 0.26,
    windup: 0.3,
    sprite: 'spear',
  },
  training_bow: {
    id: 'training_bow',
    name: 'Training Bow',
    type: 'Bow',
    cls: 'ranger',
    sheet: { unique: 'Charge', speed: 'Charge-Based' },
    damage: 28, // [PLACEHOLDER] hits harder because the draw is slow (x1.25 more from the tuning panel)
    cooldown: 0.35,
    stamina: 0.05,
    projectileSpeed: 310,
    focusRate: 0.86, // 2.5 s / rate = about 2.9 s to a full draw: the slowest ranged weapon (tuning panel: BOW FULL DRAW)
    minFocus: 0.3, // charge-based: needs some charge before it will fire
    maxProjectileBoost: 1.6,
    drawSlow: 0.5, // walking speed while you are drawing (it is slower the harder you pull)
    sprite: 'bow',
    projectile: 'arrow',
  },
  basic_crossbow: {
    id: 'basic_crossbow',
    name: 'Basic Crossbow',
    type: 'Crossbow',
    cls: 'ranger',
    sheet: { unique: 'Quick', speed: 'Fast' },
    auto: true, // hold the button and it keeps shooting by itself, no focusing
    damage: 15,
    cooldown: 0.34, // a crank-and-shoot every 0.34 s: faster than the bow's draw
    stamina: 0.03,
    projectileSpeed: 380,
    focusRate: 1.6,
    minFocus: 0.0,
    maxProjectileBoost: 1.0,
    sprite: 'crossbow',
    projectile: 'bolt',
  },
  one_time_pistol: {
    id: 'one_time_pistol',
    name: 'One-time Pistol',
    type: 'Firearm',
    cls: 'ranger',
    sheet: { unique: 'Rare', speed: 'Extremely Fast' },
    damage: 15,
    cooldown: 0.17,
    reload: 0.9, // [PLACEHOLDER] "one-time" = one round, then it must reload
    stamina: 0.03,
    projectileSpeed: 560,
    focusRate: 5.5, // 2.5 s / 5.5 = 0.45 s to a full focus: faster than the crossbow
    minFocus: 0.0,
    maxProjectileBoost: 1.0,
    drawSlow: 0.75,
    sprite: 'pistol',
    projectile: 'bullet',
  },
  m4: {
    id: 'm4',
    name: 'M4 Carbine',
    type: 'Firearm',
    cls: 'ranger',
    sheet: { unique: 'Rare', speed: 'Fully Automatic' },
    auto: true, // hold the button: a steady burst, no focusing
    damage: 6, // [PLACEHOLDER] a little per round; it makes up for it with the rate of fire
    cooldown: 0.09,
    mag: 30, // rounds in a magazine
    reload: 1.4,
    spread: 0.055, // radians of random spread
    stamina: 0.006,
    projectileSpeed: 600,
    focusRate: 8,
    minFocus: 0.0,
    maxProjectileBoost: 1.0,
    drawSlow: 0.8,
    sprite: 'm4',
    projectile: 'bullet',
  },
  training_mage_book: {
    id: 'training_mage_book',
    name: 'Training Mage Book',
    type: 'Book',
    cls: 'magic',
    sheet: { unique: 'Quick and Fast', speed: 'Casting Time' },
    floats: true, // the book hovers beside you instead of being held
    damage: 8,
    cooldown: 0.2,
    castTime: 0.08,
    mana: 4,
    projectileSpeed: 260,
    sprite: 'book',
    projectile: 'mana_bolt',
    radius: 4,
  },
  training_staff: {
    id: 'training_staff',
    name: 'Training Staff',
    type: 'Staff',
    cls: 'magic',
    sheet: { unique: 'More Damage and Slower', speed: 'Casting Time' },
    floats: true, // like the book it hovers beside you; nothing is held
    // tap = a quick small orb; HOLD to charge: the staff rises, then slams down and throws a heavy orb that bursts on impact
    charge: { time: 1.1, min: 0.22, extraMana: 10, damageMult: 1.8, slow: 0.4, aoe: 30, aoeDamage: 0.6 },
    damage: 24,
    cooldown: 0.55,
    castTime: 0.2,
    mana: 12,
    projectileSpeed: 210,
    sprite: 'staff',
    projectile: 'mana_orb',
    radius: 7,
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);
