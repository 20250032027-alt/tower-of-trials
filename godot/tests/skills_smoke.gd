extends Node
## Berserk rules, all 21 skills, the skill wheel, and the book and staff against a dummy. Run:
##   godot --headless --path godot res://tests/skills_smoke.tscn
const Berserk = preload("res://scripts/logic/berserk.gd")
var play
var p
var fails := 0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func dummy_pos_fallback(pl) -> Vector2:
	return pl.dummy_list[0].global_position + Vector2(-40, 0)

func frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame

func _ready() -> void:
	# ---- Berserk, rule by rule (sheet: 4 cores of 25%, drains 2.5%/s, decay at 0, exhaustion when ended early, cores regen after 15 s)
	var b = Berserk.new()
	check(b.cores() == 4 and b.can_activate(), "berserk starts with 4 cores")
	b.activate()
	check(b.active and b.cores() == 3, "activation burns one core")
	for i in 100:
		b.update(0.1)  # 10 s of drain: 25%
	check(b.active and absf(b.force - 0.5) < 0.02, "drains 2.5%% per second (force %.3f)" % b.force)
	b.deactivate()
	check(b.exhaustion > 0.0 and not b.active, "ending early = exhaustion")
	check(b.get_mods().has("moveSpeed") and b.get_mods().moveSpeed < 0.0, "exhaustion slows you")
	b = Berserk.new()
	for i in 3:
		b.activate()
		b.deactivate()
	check(not b.can_activate() or b.cores() == 1, "burnt cores stay burnt")
	b = Berserk.new()
	b.force = 0.25
	b.activate()
	check(b.decay and b.force == 0.0, "the last core burns into Life Force Decay at once")
	var ticks := 0
	for i in 70:
		ticks += b.update(0.1)
	check(ticks == 2, "decay ticks every 3 s (got %d in 7 s)" % ticks)
	for i in 100:
		b.update(0.1)
	check(not b.decay and b.cores() >= 1, "a core regenerates after 15 s and decay ends")

	# ---- the player
	Game.start_fresh()
	Game.pending = {"kind": "floor", "id": "tutorial"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await frames(2)
	p = play.player
	Game.profile.manaCircles = 2
	Game.profile.manaType = "arcane"
	p.refresh_stats()
	p.mana = p.stats.maxMana
	check(p.stats.maxMana > 0.0, "a Mana Circle gives mana")
	# the camera follows the player (it once did not)
	var far: Vector2 = play.tile_center(int(play.layout.w) - 3, int(play.layout.h) - 3)
	p.global_position = far
	await frames(40)
	check(play.camera.global_position.distance_to(p.global_position) < 2.0 and p.global_position.distance_to(far) < 40.0, "the camera follows the player")
	p.global_position = dummy_pos_fallback(play)
	# every skill: use it, see its effect, and the cooldown starts
	var dummy = play.dummy_list[0]
	p.global_position = dummy.global_position + Vector2(-40, 0)
	p.aim = 0.0
	var used := 0
	for sd in Data.skills:
		p.cd.clear()
		p.hp = p.stats.maxHealth * 0.1  # low health, so Second Wind works
		p.mana = p.stats.maxMana * 0.2
		p.set_weapon("training_sword")
		p.lock_target = dummy
		var ok: bool = p.use_skill(sd.id)
		if sd.skill.kind == "mark":
			check(ok and dummy.marked, "marker marks the dummy")
		else:
			check(ok, "skill %s can be used (%s)" % [sd.id, sd.skill.kind])
		if ok:
			used += 1
			check(float(p.cd[sd.id]) == float(sd.skill.cooldown), "%s starts its cooldown" % sd.id)
		p.berserk = Berserk.new()
		p.buffs.clear()
		p.shield = 0.0
		p.refresh_stats()
	check(used == Data.skills.size(), "all %d skills usable (%d)" % [Data.skills.size(), used])
	p.cd.clear()
	p.hp = p.stats.maxHealth
	# buffs change the numbers
	var dr0: float = p.stats.damageReduction
	p.use_skill("iron_body")
	check(p.stats.damageReduction > dr0 + 0.09, "Iron Body: damage reduction +10%")
	p.t += 26.0
	await frames(2)
	check(is_equal_approx(p.stats.damageReduction, dr0), "the buff runs out")
	# heal skill
	p.hp = p.stats.maxHealth * 0.5
	p.use_skill("fast_recovery")
	check(absf(p.hp - p.stats.maxHealth * 0.75) < 1.0, "Fast Recovery heals 25%%")
	# the shield soaks damage
	p.use_skill("guardians_door")
	var hp0: float = p.hp
	p.invuln = 0.0
	p.take_hit(10.0, false, p.global_position + Vector2(10, 0))
	check(p.hp == hp0 and p.shield < p.stats.maxHealth * 0.15, "the shield soaks a hit")
	# berserk (aura key)
	p.set_weapon("training_sword")
	p.toggle_berserk()
	check(p.berserk.active, "R starts the Aura")
	await frames(2)
	var dmg_buffed: float = p.stats.damage
	check(dmg_buffed > 1.0, "the Aura buffs damage (%.2f)" % dmg_buffed)
	p.toggle_berserk()
	check(not p.berserk.active and p.berserk.exhaustion > 0.0, "R again ends it, with exhaustion")
	p.set_weapon("training_bow")
	p.berserk = Berserk.new()
	p.toggle_berserk()
	check(not p.berserk.active, "the Aura needs a melee weapon")

	# ---- the skill wheel
	Engine.time_scale = 1.0
	play.open_wheel()
	check(play.wheel_open and Engine.time_scale < 0.5, "wheel opens and slows the world")
	var i0: int = play.wheel_idx
	play.wheel_step(1)
	check(play.wheel_idx == (i0 + 1) % Data.skills.size(), "wheel steps")
	play.confirm_wheel()
	check(not play.wheel_open and Engine.time_scale == 1.0, "using a skill closes the wheel")
	check(Game.profile.selSkill != null, "the wheel remembers the skill")

	# ---- the book and the staff
	p.cd.clear()
	p.buffs.clear()
	p.refresh_stats()
	p.berserk = Berserk.new()
	Controls.using_pad = true
	for id in ["training_mage_book", "training_staff"]:
		p.set_weapon(id)
		p.mana = p.stats.maxMana
		p.hp = p.stats.maxHealth
		p.global_position = dummy.global_position + Vector2(-60, 0)
		p.velocity = Vector2.ZERO
		dummy.hits = 0
		dummy.total = 0.0
		var m0: float = p.mana
		Input.action_press("attack")
		await frames(60 if id == "training_mage_book" else 20)
		if id == "training_staff":
			await frames(90)  # hold: the charge builds
			check(p.charging and p.charge_t > 0.5, "the staff charges while held (%.2f)" % p.charge_t)
		Input.action_release("attack")
		await frames(90)
		check(dummy.hits > 0, "%s hits the dummy (%d)" % [id, dummy.hits])
		check(p.mana < m0, "%s costs mana" % id)
	# no circle, no magic
	Game.profile.manaCircles = 0
	p.refresh_stats()
	p.swap_weapon()
	check(Game.weapons[p.weapon_id].cls != "magic", "swapping skips magic without a Mana Circle")
	Input.action_release("attack")
	print("skills smoke: ", "ALL OK" if fails == 0 else "%d FAILED" % fails)
	get_tree().quit(1 if fails > 0 else 0)
