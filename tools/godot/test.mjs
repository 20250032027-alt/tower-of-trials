// Runs the Godot test scenes headless:  npm run godot:test
// Needs Godot 4.4+ on your PATH as `godot`, or set GODOT to the full path of the program (e.g. set GODOT=D:\Godot\Godot_v4.4.1-stable_win64_console.exe).
// The first run imports the sprites, which takes a few seconds.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const godot = process.env.GODOT || 'godot';
const project = join(root, 'godot');

const imp = spawnSync(godot, ['--headless', '--path', project, '--import'], { encoding: 'utf8' });
if (imp.error) {
  console.error(`Could not start "${godot}". Install Godot 4.4+ and put it on your PATH, or set GODOT to its full path.`);
  process.exit(1);
}

const scenes = [
  ['logic + web parity (layouts, rng, maths)', 'res://tests/run_tests.tscn'],
  ['every floor and dungeon builds', 'res://tests/all_maps_smoke.tscn'],
  ['every weapon hits', 'res://tests/weapons_smoke.tscn'],
  ['every enemy kind hurts', 'res://tests/enemy_kinds_smoke.tscn'],
  ['first part of the demo, start to Floor 1', 'res://tests/flow_smoke.tscn'],
  ['menus, settings, tuning, save and load', 'res://tests/menu_smoke.tscn'],
  ['skills, Berserk, skill wheel, book and staff', 'res://tests/skills_smoke.tscn'],
  ['goal arrow, minimap, fog, cracked wall, hidden vault, rifts', 'res://tests/map_smoke.tscn'],
  ['sound effects and music', 'res://tests/sound_smoke.tscn'],
  ['touch controls', 'res://tests/touch_smoke.tscn'],
  ['title screen vista', 'res://tests/title_smoke.tscn'],
];
let failed = 0;
for (const [name, scene] of scenes) {
  const r = spawnSync(godot, ['--headless', '--path', project, scene], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log((r.stdout || '') + (r.stderr || ''));
}
process.exit(failed ? 1 : 0);
