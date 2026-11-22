// Exports everything from the web game that the Godot port can reuse as plain files:
//   godot/assets/art/*.png   every sprite the web game draws in code (src/art)
//   godot/assets/fonts/      the pixel font
//   godot/data/*.json        the numbers and layouts (src/data)
//   godot/tests/fixtures/    layouts built by the JS code, so the GDScript port can be checked against them
// Run:  npm run godot:export     (needs no extra packages)

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog } from '../../src/art/catalog.js';
import { THEMES } from '../../src/art/tiles.js';
import * as C from '../../src/data/constants.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { ENEMIES, ENEMY_MIX } from '../../src/data/enemies.js';
import * as TR from '../../src/data/traits.js';
import * as SK from '../../src/data/skills.js';
import { TUNING_GROUPS } from '../../src/data/tuning.js';
import { FLOORS, DUNGEONS, RIFT_OF, TOWER } from '../../src/data/world.js';
import { buildLayout, generateRandomDef } from '../../src/logic/layout.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'godot');
const mk = (p) => mkdirSync(p, { recursive: true });

// ---------------------------------------------------------------- PNG writer (no dependencies)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- art
mk(join(out, 'assets/art'));
const cat = buildCatalog();
const sizes = {};
for (const [key, pix] of Object.entries(cat)) {
  writeFileSync(join(out, 'assets/art', key + '.png'), png(pix.w, pix.h, pix.data));
  sizes[key] = [pix.w, pix.h];
}
mk(join(out, 'assets/fonts'));
copyFileSync(join(root, 'src/ui/pixel-ui.ttf'), join(out, 'assets/fonts/pixel-ui.ttf'));

// ---------------------------------------------------------------- data
mk(join(out, 'data'));
const json = (name, obj) => writeFileSync(join(out, 'data', name + '.json'), JSON.stringify(obj, (k, v) => (v === Infinity ? 1e9 : v), 1) + '\n');
json('constants', {
  RANKS: C.RANKS, RANK_COLORS: C.RANK_COLORS, LEVEL_MIN: C.LEVEL_MIN, LEVEL_MAX: C.LEVEL_MAX, BASIC_GROWTH: C.BASIC_GROWTH, CRIT_GROWTH: C.CRIT_GROWTH,
  UNITS: C.UNITS, PLAYER_BASE: C.PLAYER_BASE, COMBAT_TIMEOUT: C.COMBAT_TIMEOUT, TRAIT_SLOTS: C.TRAIT_SLOTS, BERSERK: C.BERSERK, FOCUS: C.FOCUS,
  MANA_CIRCLE_CHANCE: C.MANA_CIRCLE_CHANCE, MANA_TYPES: C.MANA_TYPES,
  xpToNext: 'round(30 + 14 * level)',
});
json('weapons', WEAPONS);
json('enemies', { ENEMIES, ENEMY_MIX });
json('traits', { TRAIT_TYPES: TR.TRAIT_TYPES, TRAITS: TR.TRAITS });
json('skills', { SKILLS: SK.SKILLS });
json('tuning', TUNING_GROUPS.map((g) => ({ name: g.name, note: g.note, items: g.items })));
json('themes', THEMES);
json('world', { FLOORS, DUNGEONS, RIFT_OF, TOWER });
json('art_sizes', sizes);

// ---------------------------------------------------------------- parity fixtures (JS built these, GDScript must build the same)
mk(join(out, 'tests/fixtures'));
const fx = (name, def, seed) => {
  const L = buildLayout(def, seed);
  writeFileSync(join(out, 'tests/fixtures', name + '.json'), JSON.stringify({ seed, def, w: L.w, h: L.h, tiles: Array.from(L.tiles), spawn: L.spawn, objects: L.objects, enemies: L.enemies, rooms: L.rooms }) + '\n');
};
fx('layout_tutorial', FLOORS.tutorial.layout, 1);
fx('layout_trial', DUNGEONS.trial.layout, 7);
fx('layout_main', DUNGEONS.main.layout, 12345);
const rd = generateRandomDef(42, { enemyBonus: 1 });
fx('layout_random_42', rd, 42);

console.log(`exported ${Object.keys(cat).length} sprites, ${Object.keys(FLOORS).length} floors, ${Object.keys(DUNGEONS).length} dungeons -> godot/`);
