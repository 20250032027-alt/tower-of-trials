# Moving Tower of [Trials] to Godot

## The short version
There is no tool that turns a Phaser (JavaScript) game into a Godot game. It is a **port**: a rewrite in GDScript, feature by feature.
What *can* be moved automatically is everything that is data or art, and this repo already does that, so the rewrite is only the code that makes things happen.

| Part of the web game | What happens to it |
|---|---|
| Numbers and maps (`src/data`: weapons, enemies, traits, skills, floors, dungeons, tuning) | **Exported** to `godot/data/*.json` by `npm run godot:export`. Nothing is retyped. |
| All art (`src/art`: drawn by code) | **Exported** as 167 PNG files to `godot/assets/art`, plus the pixel font. |
| Pure game maths (`src/logic`: rng, layout, stats, combat, focus, awareness, progression) | **Ported** to GDScript in `godot/scripts/logic`, and **tested against the web game**: the same seed must build the same map tile for tile. |
| Game objects (`src/game`: player, enemy, projectiles) | **Rewritten** as Godot nodes in `godot/scripts/play`. |
| Scenes and HUD (`src/scenes`, `src/ui`) | **Rewritten** with Godot nodes. The DOM menus become Godot Control scenes. |
| Sound and music (`sfx.js`, `musicengine.js`) | **Rendered** to .ogg once by `npm run godot:audio` (an offline render of the web synthesiser), played by the `Sound` autoload. |
| Title screen vista (`titleworld.js`, `titlescene.js`) | **Exported** as 73 pictures + `godot/data/title.json` (placements); animated by `scripts/ui/title_backdrop.gd`. |

## How the Phaser ideas map to Godot
| Web (Phaser) | Godot |
|---|---|
| Scene (`PlayScene`) | a scene with a script (`scripts/play/play_scene.gd`) |
| `G` global state, `localStorage` save | `Game` autoload, `user://` files (profile and settings) |
| `Controls` + `Pad` (gamepad.js) | `Controls` autoload with the **InputMap** (actions like `attack`, `dodge`). Godot reads gamepads itself, so the whole gamepad.js layer is not needed. |
| Arcade physics bodies | `CharacterBody2D` + `move_and_slide()`, walls from a `TileMapLayer` with collision |
| `scene.add.image` + depth numbers | `Sprite2D`; draw order from a y-sorted `Node2D` |
| Tweens and timers | `create_tween()`, `create_timer()` |
| DOM HUD and menus (HTML/CSS) | a `CanvasLayer` with Controls (HUD, menus, minimap, touch overlay) |
| `shakeCam` + rumble | `world.shake()` + `Controls.rumble()` |
| Vite build + Vercel | Godot Web export (`npm run godot:web`, see below) or desktop builds |

The game keeps the same look: viewport 480x270, whole-number scaling so every pixel stays square.

## Working together on both versions
Until the Godot version has caught up, the web game is the **source of truth for data and art**:
- Change a number, a map or a sprite in `src/` and run `npm run godot:export`. Commit the result.
- Never hand-edit `godot/data/*.json` or `godot/assets/art/*.png` (the next export overwrites them).
- Gameplay code in `godot/scripts` and scenes in `godot/scenes` belong to Godot and are edited there.
- Run `npm run godot:test` before pushing Godot changes (needs Godot 4.4+ on the PATH, or `GODOT=...`).
- Vercel keeps deploying the web game from the repo root. The `godot/` folder does not affect it.

When the Godot version is ready to replace the web one, switch the direction: convert the json to Godot Resources, move the art into Godot's own import pipeline, and retire `src/`.

## What works in the Godot version today (the first playable slice)
- Title screen, then **the whole tower is reachable**: Tutorial Floor, Floors 1-10, and all 96 dungeons (preset, random, hidden, main, double). Every map is built from the same data and builds exactly like the web version.
- **Player**: snappy movement and roll (same numbers), stamina/health/mana recovery (with the tuning values), level and XP, one random trait per run (its passive stats apply).
- **Weapons**: sword, claymore, spear (windup, arc, lunge, knockback, hit-stop), bow and pistol (focus ring, over-focus stamina cost, lock-on), crossbow and M4 (auto fire, M4 magazine and reload).
- **Enemies**: all five kinds (soldier, lancer, brute, archer, mage) with the real senses (notice only in their room with line of sight, "?" then "!", chase, lose you, search, return), knockback, windup, ranged shots you can roll through. Kinds per floor as in `ENEMY_MIX`.
- Signs, training dummies, chests, exits, stairs and portals (the stairs stay locked until you clear the Trial), clear bonus, XP orbs, heal drops, level-up.
- Torches, hit sparks, damage numbers, slash effects, camera shake, hit-stop.
- Keyboard + mouse and gamepad (with rumble), HUD, sign dialogs, pause screen.

## Also ported (everything from the web demo)
- **Menus** (Status, Loadout, Weapons, Magic, Tower, Help, Tuning, Demo), pause screen, Altars, **save / load** (`user://`), settings.
- **Skills and traits in play**: the skill wheel and all 21 skills, cooldowns, shields, marks, lifesteal. **Berserk / Sword Aura** and its glow. **Magic**: Mage Book, Staff, mana circles and types, the Mana Altar.
- **Minimap, full map (M / Back), fog of war, objective bar and arrow, guide tips.**
- **Hidden dungeons** (cracked walls open after three hits) and the **rift** (Double Dungeon): same roll and same spot as the web game (checked by the parity test), state kept per run.
- **Sound and music**: every effect and music loop (dungeon / vault / rift moods, combat intensity, stingers, muffle in menus), buses and volume settings.
- **Touch controls**: floating move stick, aim-and-attack stick, ROLL / SKILL / AURA / SWAP / USE / MAP / MENU buttons, tap the minimap for the full map. Setting TOUCH CONTROLS: auto / on / off.
- **The real title screen**: the Tower at dusk with storm and lightning, crows, a skeleton march on the ridge, graves with wisps and eyes, torches and embers, windows that light up once per cleared dungeon, bats, mist, and the gate-opens push-in when you start.
- **Juice**: dust (steps, push-off, skids, landing), roll afterimages and speed streaks, Berserk ghosts, archer aim line, mage gather, brute slam, hit-stop, shake.

## Not ported / not verified
- **Hand and arm rig** (`game/rig.js`): the Godot characters hold their weapon without drawn arms. Cosmetic.
- **M4 reload ring**, a few skill effects and the shield bubble look simpler than the web ones.
- **Web export** (`npm run godot:web`) is set up (`godot/export_presets.cfg`, `tools/godot/export_web.mjs`) but needs Godot's **Web export templates** (Godot > Editor > Manage Export Templates). It writes to `public/godot/` (git-ignored). To host it on Vercel the page needs the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (the preset uses a build without threads, so they are only needed if you turn thread support on). It has not been run on the build machine because no templates were installed there.
- Real-device touch (phone) and Godot 4.7 behaviour beyond what the tests cover. The headless tests run on 4.4.1.
- The browser-only zoom / auto-fit settings do not exist in Godot (the integer scaling is automatic).

A good way to find the next job: open the web file named above, read the matching function, write the Godot version, and add a test scene beside the existing ones.

## Notes for whoever writes GDScript here
- JSON numbers load as floats. Wrap with `int(...)` before using them as tile or array indexes, and write `var x: float = ...` when a value comes out of a Dictionary (`:=` cannot guess the type from a Variant).
- Autoload names (`Data`, `Game`, `Controls`) are only known when a scene runs, not in `godot -s script.gd`. Tests are therefore scenes (`tests/*.tscn`).
- Collision layers: 1 walls, 2 player, 3 enemies, 4 dummies (named in Project Settings).
- Children draw in tree order inside a y-sorted node, so build a character as shadow, body, hood, weapon, in that order, and avoid `z_index` on parts of a character.
- The first import after cloning generates the hidden `godot/.godot` folder (ignored by git). If a sprite looks missing, open the editor once.
- The tests in `godot/tests` also work as examples: they drive the game with `Input.action_press("attack")` and read node state.
