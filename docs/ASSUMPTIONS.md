# Assumptions and placeholders

The plan spreadsheet leaves some things blank or unclear. Anything below is **my own guess**
and is marked `[PLACEHOLDER]` in the code, so it is easy to find and change.
Everything else follows the spreadsheet.

## Title
- "Tower of [Trials]" is a placeholder (`GAME_TITLE` in `src/data/constants.js`).

## Left locked on purpose (blank in the plan)
- Spell stats for all four mana types (the Magic tab lists the spells as LOCKED).
- Blank trait skills (the skill slot shows "?").
- Secret traits (Regression, Glutton) show as "???" until the plan says more.

## Floors 2-10 (all `[PLACEHOLDER]`, built because the plan only says what a floor *contains*)
The plan says every floor has: 1 main dungeon, 3-6 preset dungeons, a set number of randomized dungeons, a set number of hidden dungeons and a set number of double dungeons. It does not describe Floors 2-10 at all ("Pending Layout / Pending Theme" is on Floor 1 too). So I built all ten from that structure. Everything below is mine and lives in `src/data/floorgen.js` (layouts are generated from a fixed seed per floor, so a floor is the same every time; swap any of it out later).
- Names and moods (Ossuary, Drowned Cistern, Rust Foundry, Ashen Archive, Frostbound Halls, Overgrown Keep, Ember Citadel, Starlit Gallery, The Summit) and their 9 tile palettes (`src/art/tiles.js`). Only colour changes between themes.
- Counts per floor: 1 main, 3-6 presets (4, 3, 4, 5, 4, 5, 6, 4, 6 for Floors 2-10), 2 randomized, 1 hidden (behind a cracked wall) and 1 double dungeon per floor. Floor 1 keeps its original 4 presets / 2 randomized / 1 hidden / 1 double.
- Dungeon ranks per floor: main E, E, E, D, D, D, D, C, C for Floors 2-10 (Floor 1 is F). Presets use the same rank or one lower, hidden dungeons one higher (capped at C). With the demo level cap of 50 the last floors are tuned for a level-50 hero.
- Enemy counts grow about 7% per floor. The main dungeon of each floor is bigger (12 rooms, a last chamber with 4 extra enemies and +3 levels).
- Only the Skeleton Soldier exists in the plan, so every dungeon uses it. Nothing else was invented.
- Stairs: clearing a floor's main dungeon opens the stairs up (flag `floorNCleared`). Every floor also has stairs down. Floor 10 has no stairs up, just a sign.
- Travel from the TOWER tab is open for every floor in this demo (marked "TRAVEL (DEMO)" when the floor is not unlocked yet). DEMO tab has UNLOCK ALL STAIRS.
- Double dungeons: each floor has its own, using the same rule as Floor 1 (enemy level = parent rank max + 5, stats x1.5).

## Controls, camera and UI (all mine, not in the plan)
- Walk speed raised (base 92 -> 124 px/s) because it felt slow; Skeleton Soldier speed 54 -> 60 to keep fights tense.
- Camera shake goes through one setting (HELP > SCREEN SHAKE, default 30%). Camera lead toward the mouse is small and dead-zoned (CAMERA SWAY setting), it used to swing up to 36 px.
- Mouse wheel zooms in whole-number steps; SHIFT + wheel swaps weapon. Skill keys are 1 2 3, shown on the HUD slots and in the LOADOUT tab.
- Quick setups (Warrior, Ranger, Mage, Tank) in the LOADOUT tab are my own trait combinations of existing traits.
- The icon set (traits, stats, categories) is drawn in code (`src/art/iconset.js`); trait icons are my own picture choices.

## Numbers I had to choose (`src/data/constants.js` unless noted)
- Units: 100% health = 100 HP, 100% stamina = 100, 100 mana per Mana Circle.
- XP needed per level: `30 + 14 * level`. Demo level cap: 50.
- Defense: `damage * 100 / (100 + defense)`; enemy damage grows 5% per level.
- Weapon proficiency: +0.4% per hit up to +25% damage (`src/logic/combat.js`).
- Combat timeout 5 s (recovery switches between in/out of combat rates).
- 3 trait slots.
- Berserk: exhaustion lasts 8 s, Life Force Decay ticks every 3 s (never kills, HP floor 1), plain Berserk buff +10% damage / +5% defense / +5% move.
- Focus: hard cap 200%, lock-on range 170 px.
- Double dungeon chance: 3% in preset dungeons, 12% in randomized dungeons.
- Double dungeon enemy level: parent rank max level + 5, stats x1.5.
- Weapon damage and cooldowns follow the descriptions in the plan, numbers are mine (`src/data/weapons.js`).
- One-Time Pistol: one round, then a 0.9 s reload.
- Magic weapons fire a basic mana bolt coloured by your mana type until spells are defined.
- Skeleton Soldier: 60 HP, 9 damage, 20% defense, 10% crit (125%). Awareness (sight 220 px inside its own room, hearing 34 px, notice time 0.9 s, lose time 3.5 s, search 3 s) and its XP drop (18 + 5 per level) are my numbers (`src/data/enemies.js`).

## Taken straight from the plan
- Level ranks F-S (1-10, 11-30, 31-49, 50-79, 80-99, 100-150, 151+).
- +5% basic stats and +1% crit stats per level.
- Recovery rates: health 0%/1%, stamina 5%/15%, mana 5%/5% (in / out of combat).
- Dodge: 1.5 s cooldown, 25% stamina.
- The 8 Training weapons and their descriptions.
- Berserk / Sword Aura (4 cores, 2.5%/s drain, Decay and Exhaustion penalties, 15 s core regen).
- Focus (2.5 s to 100%, above 150% costs 5% stamina per 10%).
- Mana Circle chance table per Innate Talent rank, 4 mana types.
- Dungeon types: preset, random, hidden, double, main. The Tower has 11 floors.

## Sound, juice and XP orbs (all mine, not in the plan)
- The plan has no audio or feel notes, so every sound is synthesised in code (`src/game/sfx.js`): layered weapon swings/hits/shots per weapon, bone vs wood hit materials, rising-pitch XP pickup chain, ducking + limiter. Volumes were trimmed by rendering every sound offline and measuring it; the per-sound trims are in the `META` table in `sfx.js`.
- XP now drops as gold orbs instead of arriving instantly. The amount is unchanged (same formula); it just arrives a moment later. Chest XP also spills as orbs. The dungeon-clear bonus is still instant. Anything still on the floor is credited when you leave the room or fall.
- Hit-stop lengths, shake strengths, the final-blow slow-motion and the orb timings are tuning numbers I picked, nothing from the plan.

## Music, title screen and death effects (all mine, not in the plan)
- The plan has no music notes. The mood (mysterious and calm), the keys, tempos, the four-note motif and the layering rules are my choices; they are all in `src/logic/musictheory.js` and `src/game/tracks.js` so they are easy to change. The music is synthesised, not recorded, so it is a placeholder in sound quality: a composer can replace it later and keep the same layering idea.
- The tagline "ELEVEN FLOORS. ONE WAY UP." comes from the plan (11 floors = tutorial + 10). The title screen's lit windows count cleared dungeons.
- Skeleton death pieces (skull, ribs, femur, dropped weapon, bone heap, ash, soul wisp) are cosmetic only and change no numbers.

## Playtest round 1: weapon feel, random skills, blessings (all mine, from tester feedback, not in the plan)
- **Skills are random each run.** A "run" = a new game, a fall, or leaving a dungeon. You are dealt 3 different non-secret traits (rank chosen by weight F 55, E 20, D 12, C 7, B 3.5, A 2, S 0.5, then a random trait of that rank; `src/logic/runtraits.js`) and get 1 free reroll per run. Setting `traitMode` ('random' default, 'pick' = the old hand-picked loadout with presets) is on the LOADOUT tab. The trait library becomes a read-only codex in random mode. Mana Circles you have already awakened are kept between runs; the Mana Altar needs a Magic trait in the current set.
- **Magic ranks are hidden.** The Mana Circle odds table and the percentages are gone from the MAGIC tab. Magic traits (Innate Talents) show "?" instead of a rank letter and sit in their own block. The odds themselves are unchanged (`MANA_CIRCLE_CHANCE`). I read "the ranks" as the Magic ones only; other traits still show their rank.
- **Charging slows you.** Bow: walking drops to 50% at full draw (0.85 at the start of the draw). Pistol 75%. Staff charge 40%. Rolling cancels a charge or an unfinished swing.
- **Bow draw is slower:** full focus takes about 40% longer (`focusRate` 0.7) and the full draw trembles. Damage raised to 28 to make up for the slower draw.
- **Crossbow auto-fires** while the attack button is held: one bolt every 0.38 s, 15 damage, no focusing, a light snap toward what you aim at.
- **Ranged buff** (testers: ranged should hit a bit harder and faster): pistol 15 damage, 0.17 s cooldown. Book 8 damage, 0.2 s cooldown, 0.08 s cast, 4 mana. All numbers are placeholders like the rest.
- **Book** floats beside you (bobs, page flutter, thrusts when it casts). **Staff**: tap = quick orb (24 damage, 12 mana); hold up to 1.1 s to charge: the staff rises overhead, then slams down. A full charge costs +10 mana, does up to 2.8x damage and bursts for 60% damage in a 30 px radius.
- **Melee** has a wind-up: the hit lands as the sweep starts (sword 0.06 s, spear 0.08 s, claymore 0.16 s after you press). Swing times 0.21 / 0.26 / 0.46 s. Idle breathing, walk head-bob and a hit flinch are cosmetic only.
- **Blessings** (colour, glyph, spell shape) per Mana type: Natural = green sprout with leaf spokes, Divine = gold cross and four-point star, Arcane = blue rune and hex crystal, Extraplanar = violet void ring. They change the book, the staff, the spell sprites, a trim on the hood, a faint ground sigil and drifting motes. Gemini's Blessing adds two orbiting stars. No numbers change.
- **Book and staff are never held** (round 2 feedback): they float beside you, the hands only guide them (near hand lifts toward the staff when charging). Nothing about damage changed.
- **Staff aiming help** (mine): while charging, a soft lock-on picks the enemy closest to your aim inside a ~34 degree cone (range 250 px, line of sight needed, sticky: it keeps the same enemy until it leaves a wider ~46 degree cone). A reticle marks it and a dotted guide shows the line. The orb leads moving enemies and bends gently towards its target (turn rate 2.4 rad/s, never more than ~75 degrees off its course). The book uses a narrower cone (24 degrees, turn rate 1.5) and the crossbow leads a target within 15 degrees of your aim. These are assists, not auto-aim: nothing outside the cone is ever targeted.
- **Movement and juice** (cosmetic only, no stat changes): footstep puffs alternate by foot, dust on starting, skidding on a hard reversal or stop, speed streaks and a landing puff on the roll, head leans forward at a run and ducks on landing, weapon and arms rock with the stride. Skeletons rear back on wind-up, step into the swing, sway when idle and rattle when hit. Added hit streaks and bone dust, muzzle flash and ejected casings (pistol), light trails on arrows and bolts, a slam shockwave with flying rubble, torch embers and drifting dust in the air.

## Playtest round 3: tuning panel, one trait + skill wheel, enemy varieties, M4 (all mine, from tester feedback, not in the plan)
- **TUNING tab** (menu) lets you change the main numbers live; they apply at once and are saved in this browser (`src/data/tuning.js`, key `tower-trials-tuning-v1`). COPY ALL gives the values as JSON to paste back into the code. Defaults below.
- **XP gained 0.6x, weapon proficiency gained 0.5x, mana recovery 0.5x.** I read "decrease rate" as "slower".
- **Stamina:** I read "make stamina consumption faster when not moving" as stamina *recovery* being faster when standing still: 1.8x still, 1.0x moving. If a literal reading was meant (spending faster while idle) tell me.
- **Focus speed** is shown as "seconds to full" (lower = faster): bow 2.9 s (was ~3.6 s), crossbow has no focus and fires every 0.34 s (faster than the bow), pistol 0.45 s (faster than the crossbow), M4 is full-auto with no focus (0.09 s per shot). Bow damage x1.25. The focus meter is now a ring around the player: the inner ring fills to 100%, an outer ring takes it on to 200%.
- **One trait, many skills.** `TRAIT_SLOTS = 1`: one trait per run, dealt by rank (F common to S rare) with one reroll. It is a passive that is always on. Skills are separate: you own all 21 (for now the skills are the ones that carry the traits' names, `src/data/skills.js`), pick one with the skill wheel (key F, or the skill button on touch; the game slows down while it is open). Old saves keep only their first trait. Round 1's "3 traits per run" is replaced by this.
- **Enemy varieties by floor** (`ENEMY_MIX` in `src/data/enemies.js`): tutorial soldier only; floor 1 soldier + lancer (spear); floor 2 + archer (bow, keeps its distance); floor 3 + brute (claymore, slow, hits hard); floor 4 + mage (staff, slow purple orbs); floors 5+ use a mix of all five. Stats are the soldier's, scaled per variety, placeholders. They are drawn from the same skeleton art with different weapons and tints.
- **M4 carbine**: auto, 30 round magazine, 1.4 s reload, damage 6, 0.09 s between shots, a little spread. Placeholder numbers like the other weapons.
- **Spear** sprite 32x9 px (was larger) and its reach 44 px (was longer).
- **Lock-on is a setting** (key T, or the HELP tab). Off = bow, crossbow, book and staff aim only where you point.
- **Aura (Berserk)** has a red glow and red embers around the player, and the body flickers red.
- **Touch HUD** is larger on phones (1.5x) and tablets (2x); the HELP tab setting HUD SIZE can override it.
- **Juice pass on the round 3 additions** (cosmetic only, no numbers change): the skill wheel opens with a whoosh and eases in, ticks (and buzzes on touch) as you scroll, and the picked skill pops; each kind of skill has its own colour, sound and effect (heal and mana rise as motes, shield is a bubble that flares on hits and shatters when broken, mark rings the target, buffs shed motes while running); the skill button flashes and pings when the skill you picked is ready, and a soft fade plays when a running skill ends. M4: muzzle light, thinner shots on the last rounds, dry click while reloading, magazine drops out, the weapon dips and a thin ring fills during the reload, a flash when it is loaded, blinking AMMO text when low. Archers show a dotted aim line that locks for the last third of the draw; mages gather motes into the orb and ring when they fire; brutes stomp (camera rumble when close) and their swing slams the floor; lancers dash with speed lines; arrows and orbs carry a glow and burst on impact; brutes and mages die with their own effects. Focus: the ring blinks at full, pulses at 150%, and a full draw lets go with a pulse. Aura: red shockwave and embers on ignite, red ghosts when running, red slashes, a fade when it ends. Lock-on: the reticle snaps in with a tick, and toggling shows LOCK ON / OFF with its own sound.
- Bug fixed along the way: enemy arrows and orbs were destroying the player sprite on hit (the overlap callback got its arguments swapped).

## How the two plan files were used
- **Spreadsheet (PDF)**: the source for the data: ranks, level rules, player and Skeleton Soldier stats, the 8 training weapons, traits and skills, Berserk/Focus, mana circles, dungeon types and the 11 floors. Anything the sheet leaves blank stays locked or is listed above as a placeholder.
- **draw.io diagram**: the file only contains one empty rectangle (no labels, no arrows), so nothing could be taken from it. The code layout (`data / logic / game / scenes / ui`) is my own. If you fill the diagram in later it can be matched against the code.
- Title v2: the title is a ray-cast low-angle view (camera tilted up and rolled ~11 degrees) rather than a flat front elevation. Purely visual, so no plan data is involved; the 11 storeys and progress-lit windows are kept.
