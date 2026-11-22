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
| Sound and music (`sfx.js`, `musicengine.js`) | **Not moved yet.** Plan below. |

## How the Phaser ideas map to Godot
| Web (Phaser) | Godot |
|---|---|
| Scene (`PlayScene`) | a scene with a script (`scripts/play/play_scene.gd`) |
| `G` global state, `localStorage` save | `Game` autoload, `user://` file (not done yet) |
| `Controls` + `Pad` (gamepad.js) | `Controls` autoload with the **InputMap** (actions like `attack`, `dodge`). Godot reads gamepads itself, so the whole gamepad.js layer is not needed. |
| Arcade physics bodies | `CharacterBody2D` + `move_and_slide()`, walls from a `TileMapLayer` with collision |
| `scene.add.image` + depth numbers | `Sprite2D`; draw order from a y-sorted `Node2D` |
| Tweens and timers | `create_tween()`, `create_timer()` |
| DOM HUD and menus (HTML/CSS) | a `CanvasLayer` with Controls (the HUD draws itself in one `Control` for now) |
| `shakeCam` + rumble | `world.shake()` + `Controls.rumble()` |
| Vite build + Vercel | Godot Web export (optional, later) or desktop builds |

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

## Not ported yet (in a sensible order)
1. **Menus** (`src/ui/ui.js`): Status, Loadout, Weapons, Magic, Tower, Help, Tuning, Demo tabs. Build them as Godot Control scenes with a `Theme` using the pixel font. Godot's built-in UI focus already gives gamepad and keyboard navigation, so the web `gamepad.js` menu code is not needed. The Altars and the pause screen's missing buttons come with this.
2. **Skills and traits in play**: the skill wheel and the 21 skills (`player.js` `useSkill`, `data/skills.js`), cooldowns, shields, marks, lifesteal and so on. Trait passives already work through the stats.
3. **Berserk / Sword Aura** (`logic/berserk.js` is pure and ports directly) and its red glow.
4. **Magic**: Mage Book, Staff, mana circles and types, the Mana Altar, spells (`player.js` magic part, `game/orbs.js`).
5. **Minimap, full map, fog of war, objective bar and arrow, guide tips** (`hud-dom.js`, `guide.js`).
6. **Save / load** (`logic/progression.js` has the profile; write it as JSON to `user://`).
7. **Sound and music.** `sfx.js` and `musicengine.js` make sound with the browser's WebAudio, which Godot does not have. Two ways: (a) render each effect and each music loop to .ogg once (a small Node + headless-browser script can do it with an OfflineAudioContext) and import the files, which is fast and sounds identical; or (b) rewrite the synth with Godot's `AudioStreamGenerator`, which is much more work. Start with (a).
8. **The juice pass**: hand and arm rig, afterimages while rolling, skill effects, shield bubble, M4 reload ring, archer aim line, mage gather, brute slam, aura embers. Cosmetic, port after the rules are done.
9. **Hidden dungeons** (cracked walls) and the rift (double dungeon spawn inside dungeons).
10. **The real title screen** (`titlebackdrop.js`, `titleworld.js`: the Tower at dusk). The Godot title is a plain placeholder.
11. **Touch controls** and the browser zoom/auto-fit settings. Desktop and gamepad work today.
12. **Web export** (Godot > Project > Export > Web) if you want it playable on Vercel again. It needs the export templates and two HTTP headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) in `vercel.json`.

A good way to pick the next job: open the web file named above, read the matching function, write the Godot version, and add a test scene beside the existing ones.

## Notes for whoever writes GDScript here
- JSON numbers load as floats. Wrap with `int(...)` before using them as tile or array indexes, and write `var x: float = ...` when a value comes out of a Dictionary (`:=` cannot guess the type from a Variant).
- Autoload names (`Data`, `Game`, `Controls`) are only known when a scene runs, not in `godot -s script.gd`. Tests are therefore scenes (`tests/*.tscn`).
- Collision layers: 1 walls, 2 player, 3 enemies, 4 dummies (named in Project Settings).
- Children draw in tree order inside a y-sorted node, so build a character as shadow, body, hood, weapon, in that order, and avoid `z_index` on parts of a character.
- The first import after cloning generates the hidden `godot/.godot` folder (ignored by git). If a sprite looks missing, open the editor once.
- The tests in `godot/tests` also work as examples: they drive the game with `Input.action_press("attack")` and read node state.
