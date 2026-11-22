extends RefCounted
## Player profile + XP / level-up. Port of src/logic/progression.js and runtraits.js.

const RUN_RANK_WEIGHT := {"F": 55.0, "E": 20.0, "D": 12.0, "C": 7.0, "B": 3.5, "A": 2.0, "S": 0.5}

static func create_profile() -> Dictionary:
	var owned: Array = []
	for id in Data.weapons:
		owned.append(id)
	var skills: Array = []
	for s in Data.skills:
		skills.append(s.id)
	return {
		"level": int(Data.constants.LEVEL_MIN),
		"xp": 0.0,
		"traits": [],
		"skills": skills,
		"selSkill": null,
		"weapon": "training_sword",
		"ownedWeapons": owned,
		"proficiency": {"melee": 0.0, "ranger": 0.0, "magic": 0.0},
		"manaCircles": 0,
		"manaType": null,
		"awakened": false, # has the Mana Altar been used for the current talent?
		"rerolls": 1,      # free trait rerolls left in this run
		"extra": {},       # permanent bonus mods (Adaptive Growth)
		"flags": {},
		"kills": 0,
		"demo": {"doubleAlways": false},
	}

static func xp_to_next(level: int) -> int:
	return roundi(30.0 + 14.0 * level)

const ADAPTIVE_POOL := ["maxHealth", "maxStamina", "critRate", "critDamage", "moveSpeed", "damage"]
## the stats Adaptive Growth raised on the last add_xp call (so the caller can say so)
static var last_adaptive: Array = []

static func set_level(profile: Dictionary, level: int) -> void:
	profile.level = clampi(level, int(Data.constants.LEVEL_MIN), int(Data.constants.LEVEL_MAX))
	profile.xp = 0.0

## add XP. Returns the number of levels gained. Trait "Adaptive Growth": +10% to a random stat on every level.
static func add_xp(profile: Dictionary, amount: float, exp_rate: float, rng = null) -> int:
	profile.xp += amount * exp_rate
	last_adaptive = []
	var gained := 0
	var max_level: int = int(Data.constants.LEVEL_MAX)
	var adaptive := false
	for id in profile.traits:
		var t = Data.trait_by_id.get(id)
		if t != null and t.get("onLevelUp", "") == "adaptive":
			adaptive = true
	while profile.level < max_level and profile.xp >= xp_to_next(profile.level):
		profile.xp -= xp_to_next(profile.level)
		profile.level += 1
		gained += 1
		if adaptive and rng != null:
			var pool: Array = ADAPTIVE_POOL.duplicate()
			if int(profile.manaCircles) > 0:
				pool.append("maxMana")
			var stat: String = pool[int(floor(rng.next() * pool.size()))]
			profile.extra[stat] = float(profile.extra.get(stat, 0.0)) + 0.1
			last_adaptive.append(stat)
	if profile.level >= max_level:
		profile.xp = 0.0
	return gained

## the highest-rank Magic trait you carry decides your Mana Circle odds (null if none)
static func innate_talent(profile: Dictionary):
	var best = null
	for id in profile.traits:
		var t = Data.trait_by_id.get(id)
		if t != null and t.type == "Magic" and (best == null or "FEDCBAS".find(t.rank) > "FEDCBAS".find(best.rank)):
			best = t
	return best

## how many Mana Circles a talent of this rank forms: 0, 1 or 2 (src/logic/mana.js)
static func roll_mana_circles(talent_rank: String, rng) -> int:
	var c = Data.constants.MANA_CIRCLE_CHANCE.get(talent_rank)
	if c == null:
		return 0
	var r: float = rng.next()
	if r < float(c.two):
		return 2
	if r < float(c.two) + float(c.one):
		return 1
	return 0

# ------------------------------------------------------------------ save / load (a JSON file in user://)
## JSON turns every number into a float: put the whole numbers back
static func normalize(p: Dictionary) -> Dictionary:
	var base := create_profile()
	for k in base:
		if not p.has(k):
			p[k] = base[k]
	p.level = clampi(int(p.level), int(Data.constants.LEVEL_MIN), int(Data.constants.LEVEL_MAX))
	p.kills = int(p.kills)
	p.manaCircles = int(p.manaCircles)
	p.rerolls = int(p.rerolls)
	p.xp = float(p.xp)
	if not Data.weapons.has(p.weapon):
		p.weapon = "training_sword"
	return p

static func save_profile(profile: Dictionary, path: String) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(profile))
	return true

## the saved profile, or {} if there is none (or it is broken)
static func load_profile(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		return {}
	return normalize(parsed)

static func add_proficiency(profile: Dictionary, cls: String, mastery_rate: float) -> void:
	profile.proficiency[cls] = minf(1.0, float(profile.proficiency.get(cls, 0.0)) + 0.004 * mastery_rate)

static func xp_from_enemy(def: Dictionary, level: int, dungeon_bonus: float = 1.0) -> int:
	return roundi((float(def.xpBase) + float(def.xpPerLevel) * level) * dungeon_bonus)

## roll n different traits (never a secret one). Returns trait ids. Rank first (weighted), then a trait of that rank.
static func roll_run_traits(rng, n: int = 1, exclude: Array = []) -> Array:
	var pool: Array = []
	for t in Data.traits:
		if not t.get("secret", false) and not exclude.has(t.id):
			pool.append(t)
	var picked: Array = []
	for i in n:
		var left: Array = pool.filter(func(t): return not picked.has(t.id))
		if left.is_empty():
			break
		var ranks: Array = []
		for r in RUN_RANK_WEIGHT:
			if left.any(func(t): return t.rank == r):
				ranks.append(r)
		var total := 0.0
		for r in ranks:
			total += RUN_RANK_WEIGHT[r]
		var x: float = rng.next() * total
		var rank: String = ranks[ranks.size() - 1]
		for r in ranks:
			x -= RUN_RANK_WEIGHT[r]
			if x < 0.0:
				rank = r
				break
		var of_rank: Array = left.filter(func(t): return t.rank == rank)
		picked.append(of_rank[int(floor(rng.next() * of_rank.size()))].id)
	return picked
