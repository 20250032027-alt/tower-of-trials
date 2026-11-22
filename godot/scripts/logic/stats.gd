extends RefCounted
## "level + traits + buffs" -> final numbers. Port of src/logic/stats.js.

static func basic_growth(level: int) -> float:
	return 1.0 + float(Data.constants.BASIC_GROWTH) * (level - 1)

static func crit_growth(level: int) -> float:
	return 1.0 + float(Data.constants.CRIT_GROWTH) * (level - 1)

## add several { stat: +x } dictionaries together
static func sum_mods(lists: Array) -> Dictionary:
	var out := {}
	for m in lists:
		if m == null:
			continue
		for k in m:
			out[k] = float(out.get(k, 0.0)) + float(m[k])
	return out

static func trait_passives(trait_ids: Array) -> Dictionary:
	var lists: Array = []
	for id in trait_ids:
		var t = Data.trait_by_id.get(id)
		if t != null and t.has("mods"):
			lists.append(t.mods)
	return sum_mods(lists)

static func compute(level: int, mana_circles: int = 0, passives: Dictionary = {}, extra: Dictionary = {}, buffs: Dictionary = {}, proficiency: Dictionary = {}) -> Dictionary:
	var m := sum_mods([passives, extra, buffs])
	var C: Dictionary = Data.constants
	var g := basic_growth(level)
	var cg := crit_growth(level)
	var units: Dictionary = C.UNITS
	var base: Dictionary = C.PLAYER_BASE
	var base_health: float = float(units.health) * float(base.health) * g
	var stamina_cost: float = maxf(0.1, 1.0 + float(m.get("staminaCost", 0.0)))
	var mana_cost: float = maxf(0.1, 1.0 + float(m.get("manaCost", 0.0)))
	var mana_regen_mult: float = 1.0 + float(m.get("manaRegen", 0.0))
	var rec: Dictionary = base.recovery
	var prof := {"melee": 0.0, "ranger": 0.0, "magic": 0.0}
	for k in proficiency:
		prof[k] = float(proficiency[k])
	return {
		"level": level,
		"rank": Data.rank_of_level(level),
		"maxHealth": base_health * (1.0 + float(m.get("maxHealth", 0.0))),
		"defense": float(base.defensePctOfHealth) * base_health * (1.0 + float(m.get("defense", 0.0))),
		"maxStamina": float(units.stamina) * float(base.stamina) * g * (1.0 + float(m.get("maxStamina", 0.0))),
		"maxMana": (mana_circles * float(units.manaPerCircle) * g * (1.0 + float(m.get("maxMana", 0.0)))) if mana_circles > 0 else 0.0,
		"staminaCost": stamina_cost,
		"manaCost": mana_cost,
		"regen": {
			"health": rec.health.duplicate(),
			"stamina": rec.stamina.duplicate(),
			"mana": {"combat": float(rec.mana.combat) * mana_regen_mult, "out": float(rec.mana.out) * mana_regen_mult},
		},
		"critRate": clampf(float(base.critRate) * cg + float(m.get("critRate", 0.0)), 0.0, 1.0),
		"critDamage": float(base.critDamage) * cg + float(m.get("critDamage", 0.0)),
		"moveSpeed": maxf(0.1, float(base.moveSpeed) + float(m.get("moveSpeed", 0.0))),
		"dodgeDistance": maxf(0.3, float(base.dodgeDistance) + float(m.get("dodgeDistance", 0.0))),
		"dodgeCooldown": float(base.dodgeCooldown),
		"dodgeStamina": float(base.dodgeStamina) * stamina_cost,
		"damage": maxf(0.05, float(base.damage) + float(m.get("damage", 0.0))),
		"meleeDamage": maxf(0.05, float(base.meleeDamage) + float(m.get("meleeDamage", 0.0))),
		"rangeDamage": maxf(0.05, float(base.rangeDamage) + float(m.get("rangeDamage", 0.0))),
		"magicDamage": maxf(0.05, float(base.magicDamage) + float(m.get("magicDamage", 0.0))),
		"damageReduction": clampf(float(base.damageReduction) + float(m.get("damageReduction", 0.0)), 0.0, 0.9),
		"focusSpeed": maxf(0.1, float(base.focusSpeed) + float(m.get("focusSpeed", 0.0))),
		"expRate": maxf(0.0, float(base.expRate) + float(m.get("expRate", 0.0))),
		"weaponMastery": maxf(0.0, float(base.weaponProficiencyRate) + float(m.get("weaponMastery", 0.0))),
		"lootLuck": float(m.get("lootLuck", 0.0)),
		"proficiency": prof,
	}

## stats for an enemy of a given level (basic stats +5% per level)
static func compute_enemy(def: Dictionary, level: int, stat_mult: float = 1.0) -> Dictionary:
	var g := basic_growth(level)
	var cg := crit_growth(level)
	var base_health: float = float(def.baseHealth) * g * stat_mult
	return {
		"level": level,
		"maxHealth": base_health,
		"defense": float(def.defensePctOfHealth) * base_health,
		"damage": float(def.baseDamage) * g * stat_mult,
		"critRate": float(def.critRate) * cg,
		"critDamage": float(def.critDamage) * cg,
	}
