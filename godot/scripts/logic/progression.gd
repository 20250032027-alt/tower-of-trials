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
		"extra": {},
		"flags": {},
		"kills": 0,
	}

static func xp_to_next(level: int) -> int:
	return roundi(30.0 + 14.0 * level)

## add XP. Returns the number of levels gained
static func add_xp(profile: Dictionary, amount: float, exp_rate: float) -> int:
	profile.xp += amount * exp_rate
	var gained := 0
	var max_level: int = int(Data.constants.LEVEL_MAX)
	while profile.level < max_level and profile.xp >= xp_to_next(profile.level):
		profile.xp -= xp_to_next(profile.level)
		profile.level += 1
		gained += 1
	if profile.level >= max_level:
		profile.xp = 0.0
	return gained

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
