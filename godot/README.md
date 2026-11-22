# Tower of [Trials] - Godot port

The Godot 4 version of the demo. The web game (Phaser, in `../src`) stays as the working reference while this one is built up.
**Read `../docs/GODOT_PORT.md` first**: it explains how the port works, what is done, and what to do next.

## Open it
1. Install **Godot 4.4 or newer** (standard build, not .NET). Tested on 4.4.1.
2. Godot Project Manager > **Import** > pick `godot/project.godot` > Open. The first open imports the sprites (a few seconds).
3. Press **F5** to play. It starts on the title screen, then the Tutorial Floor.

The project uses the *Compatibility* renderer, so it also works on weak PCs and can be exported to the web.

## Controls
| | Keyboard + mouse | Gamepad |
|---|---|---|
| Move | WASD / arrows | left stick / D-pad |
| Aim | mouse | right stick (idle + attack = auto-aim at the nearest enemy) |
| Attack / focus | hold left click | RT or X (hold = focus, release = shoot) |
| Roll | Space | B or LT |
| Use / read / enter | E | A |
| Swap weapon | Q | Y |
| Lock-on on/off | T | R3 |
| Pause | Tab / Esc | Start |

Rumble on a gamepad follows hits you take and land.

## What is in here
```
godot/
  project.godot          window 480x270, integer scaling, Compatibility renderer, 3 autoloads
  data/*.json            numbers and maps, EXPORTED from the web game (do not edit by hand, see below)
  assets/art/*.png       every sprite, EXPORTED from the web game's code-drawn art
  assets/fonts/          the pixel font
  scripts/autoload/      Data (loads the json + sprites), Game (profile, settings, tuning, scene changes), Controls (input map)
  scripts/logic/         pure maths, ports of src/logic: rng, layout, stats, combat, focus, awareness, progression
  scripts/play/          the play scene, player, enemy, dummy, projectile, HUD
  scripts/ui/            title screen
  scenes/                title.tscn, play.tscn (each is one node with a script that builds the rest in code)
  tests/                 headless tests (see below)
```

## Data and art come from the web game
`data/*.json` and `assets/art/*.png` are written by a script from the web game's source, so both versions always use the same numbers and sprites:

```
npm run godot:export      (from the repo root; needs only Node)
```

While the web game is the source of truth, **change numbers in `../src/data/*.js` and re-run the export** instead of editing the json (a hand edit would be overwritten by the next export). Gameplay code in `scripts/` is Godot's own and is edited here.

## Tests
```
npm run godot:test        (from the repo root; needs `godot` on your PATH, or set GODOT=full\path\to\godot.exe)
```
It runs these scenes headless:
- `tests/run_tests.tscn`: the GDScript logic against the web game. Maps built from the same seed must be identical tile for tile, plus rng, stats and damage maths.
- `tests/all_maps_smoke.tscn`: every floor and all 96 dungeons build, with the player on a floor tile.
- `tests/weapons_smoke.tscn`, `tests/enemy_kinds_smoke.tscn`: every weapon lands hits, every enemy kind can hurt.
- `tests/flow_smoke.tscn`: reads a sign, enters the Trial of Bones, clears it, leaves, takes the stairs to Floor 1.

`tests/screenshots.tscn` saves screenshots of the main screens (needs a display).
