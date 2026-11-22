extends RefCounted
## Damage maths. Port of src/logic/combat.js.
const Stats = preload("res://scripts/logic/stats.gd")

const FOCUS_MIN_DAMAGE := 0.25

static func apply_defense(dmg: float, defense: float) -> float:
	return dmg * (100.0 / (100.0 + maxf(0.0, defense)))

static func focus_damage_mult(focus: float) -> float:
	return maxf(FOCUS_MIN_DAMAGE, focus)

## one player attack, before the target's defense. Returns {damage, crit}
static func player_attack(weapon: Dictionary, stats: Dictionary, focus: float, cond: Dictionary, rng) -> Dictionary:
	var growth := Stats.basic_growth(int(stats.level))
	var cls: String = weapon.cls
	var class_mult: float = stats.meleeDamage if cls == "melee" else (stats.rangeDamage if cls == "ranger" else stats.magicDamage)
	var prof: float = float(stats.proficiency.get(cls, 0.0))
	var dmg: float = float(weapon.damage) * growth
	dmg *= float(stats.damage) * class_mult
	dmg *= 1.0 + prof * 0.25
	dmg *= 1.0 + float(cond.get("mark", 0.0)) + float(cond.get("predator", 0.0)) + float(cond.get("bloodlust", 0.0))
	if cls == "ranger":
		dmg *= focus_damage_mult(focus)
	var crit: bool = rng.chance(minf(1.0, float(stats.critRate) + float(cond.get("markCrit", 0.0))))
	if crit:
		dmg *= float(stats.critDamage)
	return {"damage": dmg, "crit": crit}

static func enemy_attack(enemy_stats: Dictionary, rng) -> Dictionary:
	var dmg: float = enemy_stats.damage
	var crit: bool = rng.chance(float(enemy_stats.critRate))
	if crit:
		dmg *= float(enemy_stats.critDamage)
	return {"damage": dmg, "crit": crit}

static func after_mitigation(raw: float, defense: float, damage_reduction: float = 0.0) -> float:
	return maxf(1.0, apply_defense(raw, defense) * (1.0 - damage_reduction))
