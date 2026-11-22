extends RefCounted
## Sword Aura / Berserk (melee). Port of src/logic/berserk.js, rule for rule:
##  - Physical Force (PF) is split into 4 Aura Cores of 25%. Each activation burns one Core.
##  - PF drains 2.5% per second while Berserk is on. PF at 0% = Life Force Decay (heavy penalties + periodic damage).
##  - Ending Berserk early = Life Force Exhaustion (lighter penalties). Burnt Cores come back one by one after 15 s.
var force := 1.0          # 0..1
var active := false
var mods: Dictionary = {}
var time_left := INF      # skill-based activations have a time cap
var decay := false
var decay_tick := 0.0
var exhaustion := 0.0
var regen_timer := 0.0

static func B() -> Dictionary:
	return Data.constants.BERSERK

func cores() -> int:
	return int(floor(force / float(B().forcePerCore) + 1e-9))

func can_activate() -> bool:
	return not active and not decay and force >= float(B().forcePerCore) - 1e-9

## mods: stat bonuses while on (null = the plain Berserk). duration: seconds (INF = until Force runs out)
func activate(bonus = null, duration: float = INF) -> bool:
	if not can_activate():
		return false
	force = maxf(0.0, force - float(B().forcePerCore))
	exhaustion = 0.0
	regen_timer = 0.0
	if force <= 1e-9:
		_start_decay()  # the 4th activation without regen = instant decay
		return true
	active = true
	mods = bonus if bonus != null else B().baseBuff
	time_left = duration
	return true

func deactivate() -> void:
	if not active:
		return
	active = false
	mods = {}
	exhaustion = float(B().exhaustion.seconds)
	regen_timer = 0.0

func _start_decay() -> void:
	active = false
	mods = {}
	force = 0.0
	decay = true
	decay_tick = 0.0
	exhaustion = 0.0
	regen_timer = 0.0

## returns the number of periodic-damage ticks that happened this frame
func update(dt: float) -> int:
	var ticks := 0
	var b: Dictionary = B()
	if active:
		force -= float(b.drainPerSecond) * dt
		time_left -= dt
		if force <= 0.0:
			_start_decay()
		elif time_left <= 0.0:
			deactivate()
		return 0
	if decay:
		decay_tick += dt
		while decay_tick >= float(b.decay.tickSeconds):
			decay_tick -= float(b.decay.tickSeconds)
			ticks += 1
	elif exhaustion > 0.0:
		exhaustion = maxf(0.0, exhaustion - dt)
	# core regeneration: one core every 15 s without activation
	if force < 1.0:
		regen_timer += dt
		if regen_timer >= float(b.coreRegenSeconds):
			regen_timer = 0.0
			force = minf(1.0, (floor(force / float(b.forcePerCore) + 1e-9) + 1.0) * float(b.forcePerCore))
	if decay and force >= float(b.forcePerCore) - 1e-9:
		decay = false
		exhaustion = float(b.exhaustion.seconds)
	return ticks

## stat modifiers the Berserk system applies right now
func get_mods() -> Dictionary:
	var b: Dictionary = B()
	if active:
		return mods
	if decay:
		var d: Dictionary = b.decay
		return {"moveSpeed": d.moveSpeed, "damage": d.damage, "critDamage": d.critDamage, "critRate": d.critRate, "meleeDamage": d.meleeDamage}
	if exhaustion > 0.0:
		var e: Dictionary = b.exhaustion
		return {"moveSpeed": e.moveSpeed, "damage": e.damage, "critDamage": e.critDamage, "meleeDamage": e.meleeDamage}
	return {}

func status() -> String:
	if active:
		return "BERSERK"
	if decay:
		return "LIFE FORCE DECAY"
	if exhaustion > 0.0:
		return "EXHAUSTED"
	return "READY"
