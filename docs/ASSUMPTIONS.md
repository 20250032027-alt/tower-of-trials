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
- Floors 2-10 are listed in the Tower tab as "NOT IN DEMO".

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
- One-Time Pistol: one round, then a 1.1 s reload.
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

## How the two plan files were used
- **Spreadsheet (PDF)**: the source for the data: ranks, level rules, player and Skeleton Soldier stats, the 8 training weapons, traits and skills, Berserk/Focus, mana circles, dungeon types and the 11 floors. Anything the sheet leaves blank stays locked or is listed above as a placeholder.
- **draw.io diagram**: the file only contains one empty rectangle (no labels, no arrows), so nothing could be taken from it. The code layout (`data / logic / game / scenes / ui`) is my own. If you fill the diagram in later it can be matched against the code.
- Title v2: the title is a ray-cast low-angle view (camera tilted up and rolled ~11 degrees) rather than a flat front elevation. Purely visual, so no plan data is involved; the 11 storeys and progress-lit windows are kept.
