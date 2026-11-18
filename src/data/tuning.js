// Live tuning: the numbers a tester is most likely to want to change, editable in the game (menu > TUNING).
// Values are saved in the browser (localStorage), so they survive a refresh. Nothing here needs a rebuild.
// Every default below is a [PLACEHOLDER] chosen from tester feedback, not from the plan.

import { WEAPONS } from './weapons.js';
import { FOCUS } from './constants.js';

export const TUNING_GROUPS = [
  {
    name: 'PROGRESSION',
    note: 'Lower = slower.',
    items: [
      { key: 'xpRate', label: 'XP gained', def: 0.6, min: 0.1, max: 3, step: 0.05, fmt: 'x' },
      { key: 'profRate', label: 'Weapon proficiency gained', def: 0.5, min: 0.1, max: 3, step: 0.05, fmt: 'x' },
    ],
  },
  {
    name: 'RECOVERY',
    note: 'Mana and stamina.',
    items: [
      { key: 'manaRegen', label: 'Mana recovery', def: 0.5, min: 0.05, max: 3, step: 0.05, fmt: 'x' },
      { key: 'staminaStill', label: 'Stamina recovery while standing still', def: 1.8, min: 0.5, max: 4, step: 0.1, fmt: 'x' },
      { key: 'staminaMoving', label: 'Stamina recovery while moving', def: 1, min: 0.1, max: 3, step: 0.1, fmt: 'x' },
    ],
  },
  {
    name: 'RANGED',
    note: 'Seconds to a full focus: lower = faster. Bow is slowest, then crossbow, then guns.',
    items: [
      { key: 'bowSec', label: 'Bow: full draw', def: 2.9, min: 0.5, max: 6, step: 0.1, fmt: 's' },
      { key: 'crossbowSec', label: 'Crossbow: time between shots', def: 0.34, min: 0.1, max: 2, step: 0.02, fmt: 's' },
      { key: 'pistolSec', label: 'Pistol: full focus', def: 0.45, min: 0.1, max: 3, step: 0.05, fmt: 's' },
      { key: 'm4Sec', label: 'M4: time between shots', def: 0.09, min: 0.04, max: 0.5, step: 0.01, fmt: 's' },
    ],
  },
  {
    name: 'WEAPON DAMAGE',
    note: 'A multiplier on each weapon.',
    items: [
      { key: 'dmg_training_sword', label: 'Sword', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_training_claymore', label: 'Claymore', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_training_spear', label: 'Spear', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_training_bow', label: 'Bow', def: 1.25, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_basic_crossbow', label: 'Crossbow', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_one_time_pistol', label: 'Pistol', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_m4', label: 'M4', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_training_mage_book', label: 'Mage Book', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
      { key: 'dmg_training_staff', label: 'Staff', def: 1, min: 0.1, max: 4, step: 0.05, fmt: 'x' },
    ],
  },
  {
    name: 'WEAPON SIZE',
    note: 'Spear reach in pixels (the sprite is drawn shorter, so the reach follows).',
    items: [
      { key: 'spearRange', label: 'Spear reach', def: 44, min: 20, max: 80, step: 2, fmt: 'px' },
    ],
  },
  {
    name: 'ENEMIES',
    note: 'A multiplier on every enemy.',
    items: [
      { key: 'enemyHp', label: 'Enemy health', def: 1, min: 0.2, max: 5, step: 0.1, fmt: 'x' },
      { key: 'enemyDmg', label: 'Enemy damage', def: 1, min: 0.2, max: 5, step: 0.1, fmt: 'x' },
    ],
  },
];

export const TUNING_ITEMS = TUNING_GROUPS.flatMap((g) => g.items);
const DEF = Object.fromEntries(TUNING_ITEMS.map((i) => [i.key, i.def]));
const KEY = 'tower-trials-tuning-v1';

let values = {};
try { values = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { values = {}; }

/** Current value of a tuning number (the saved one, else its default). */
export function T(key) {
  const v = values[key];
  return typeof v === 'number' && isFinite(v) ? v : DEF[key];
}
export const tuneDefault = (key) => DEF[key];
export const tuneIsChanged = (key) => typeof values[key] === 'number' && values[key] !== DEF[key];

// Push the tuning numbers into the weapon table (damage, rates, reach), so the rest of the game just reads WEAPONS.
export function applyTuning() {
  for (const w of Object.values(WEAPONS)) {
    if (w.baseDamage == null) w.baseDamage = w.damage;
    w.damage = w.baseDamage * T('dmg_' + w.id);
  }
  WEAPONS.training_spear.range = T('spearRange');
  WEAPONS.training_bow.focusRate = FOCUS.secondsTo100 / T('bowSec');
  WEAPONS.one_time_pistol.focusRate = FOCUS.secondsTo100 / T('pistolSec');
  WEAPONS.basic_crossbow.cooldown = T('crossbowSec');
  WEAPONS.m4.cooldown = T('m4Sec');
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* ignore */ } applyTuning(); }
export function setTune(key, v) {
  const it = TUNING_ITEMS.find((i) => i.key === key);
  if (!it || !isFinite(v)) return;
  values[key] = Math.max(it.min, Math.min(it.max, v));
  save();
}
export function resetTune(key) {
  if (key) delete values[key]; else values = {};
  save();
}
applyTuning();
export const tuneJson = () => JSON.stringify(Object.fromEntries(TUNING_ITEMS.map((i) => [i.key, T(i.key)])), null, 2);
export function formatTune(item, v) {
  if (item.fmt === 'x') return v.toFixed(2).replace(/0$/, '') + 'x';
  if (item.fmt === 's') return v.toFixed(2).replace(/0$/, '') + 's';
  return Math.round(v) + (item.fmt || '');
}
