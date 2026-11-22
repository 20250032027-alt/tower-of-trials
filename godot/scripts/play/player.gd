extends CharacterBody2D
## The player: movement, dodge, stamina, melee and ranged weapons. Port of src/game/player.js
## (magic weapons, trait skills, the skill wheel, Berserk and the hand rig are not ported yet, see docs/GODOT_PORT.md).
const Stats = preload("res://scripts/logic/stats.gd")
const Combat = preload("res://scripts/logic/combat.gd")
const FocusLogic = preload("res://scripts/logic/focus.gd")
const Progression = preload("res://scripts/logic/progression.gd")
const Projectile = preload("res://scripts/play/projectile.gd")

const BASE_SPEED := 124.0
const ACCEL := 1250.0
const TURN_BOOST := 1.7
const FRICTION := 1900.0
const START_KICK := 0.3
const DODGE_TIME := 0.2
const BUFFER_TIME := 0.18
const QUARTER := PI / 4.0

## weapon id -> [sprite, image width, grip x, distance in front of the body]
const WEAPON_ART := {
	"training_sword": ["w_sword", 28, 3.0, 9.5],
	"training_claymore": ["w_claymore", 38, 4.0, 10.0],
	"training_spear": ["w_spear", 32, 7.0, 8.5],
	"training_bow": ["w_bow", 12, 8.5, 10.5],
	"basic_crossbow": ["w_crossbow", 24, 3.5, 8.5],
	"one_time_pistol": ["w_pistol", 18, 3.0, 9.5],
	"m4": ["w_m4", 34, 11.0, 8.0],
}
const CYCLE := ["training_sword", "training_claymore", "training_spear", "training_bow", "basic_crossbow", "one_time_pistol", "m4"]

var world # the Play scene
var stats: Dictionary
var weapon_id := "training_sword"
var weapon: Dictionary
var hp := 100.0
var stamina := 100.0
var mana := 0.0
var aim := 0.0
var dead := false
var t := 0.0
var radius := 5.0

var attack_cd := 0.0
var dodge_cd := 0.0
var dodging := 0.0
var invuln := 0.0
var in_combat_t := 0.0
var dodge_vec := Vector2.RIGHT
var dodge_buf := 0.0
var atk_buf := 0.0
var swing_t := 1.0
var swing_len := 0.2
var swing_dir := 1.0
var swing_from := 0.0
var pending_hit := -1.0
var focusing := false
var focus := 0.0
var charged := false
var overed := false
var lock_target = null
var reload := 0.0
var ammo := -1
var hurt_flash := 0.0
var deny_t := 0.0
var walk_t := 0.0 # how long you have been walking (pad: faces the way you walk)
var hits := 0
var _stride := 0.0

var shadow: Sprite2D
var body: Sprite2D
var scarf: Sprite2D
var hood: Sprite2D
var wpn: Sprite2D
var ring: Node2D

func _ready() -> void:
	collision_layer = 2
	collision_mask = 1 | 4 | 8
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
	var cs := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = radius
	cs.shape = circle
	add_child(cs)
	shadow = _sprite("shadow", Vector2(0, 5), 0)
	body = _sprite("player", Vector2.ZERO, 0)
	scarf = _sprite("player_scarf", Vector2.ZERO, 0)
	scarf.centered = false
	scarf.offset = Vector2(-5, -11)
	hood = _sprite("player_hood", Vector2.ZERO, 0)
	wpn = Sprite2D.new()
	wpn.centered = false
	add_child(wpn)
	ring = Node2D.new()
	ring.z_index = 30
	ring.draw.connect(_draw_ring)
	add_child(ring)
	refresh_stats(true)
	set_weapon(Game.profile.weapon)
	hp = stats.maxHealth
	stamina = stats.maxStamina

func _sprite(key: String, pos: Vector2, z: int) -> Sprite2D:
	var s := Sprite2D.new()
	s.texture = Data.tex(key)
	s.position = pos
	add_child(s)
	return s

# ------------------------------------------------------------------ stats and weapons
func refresh_stats(initial: bool = false) -> void:
	var p: Dictionary = Game.profile
	var ratio: float = hp / stats.maxHealth if (not initial and stats.has("maxHealth")) else 1.0
	stats = Stats.compute(int(p.level), int(p.manaCircles), Stats.trait_passives(p.traits), p.extra, {}, p.proficiency)
	if not initial:
		hp = stats.maxHealth * ratio
		stamina = minf(stamina, stats.maxStamina)

func set_weapon(id: String) -> void:
	weapon_id = id
	weapon = Game.weapons[id]
	Game.profile.weapon = id
	var art: Array = WEAPON_ART[id]
	wpn.texture = Data.tex(art[0])
	wpn.offset = Vector2(-float(art[2]), -wpn.texture.get_height() / 2.0)
	focusing = false
	focus = 0.0
	pending_hit = -1.0
	swing_t = 1.0
	ammo = -1

func swap_weapon() -> void:
	var owned: Array = CYCLE.filter(func(id): return Game.profile.ownedWeapons.has(id))
	var i := owned.find(weapon_id)
	set_weapon(owned[(i + 1) % owned.size()])
	world.toast(String(weapon.name).to_upper())

func deny(msg: String) -> void:
	if deny_t > 0.0:
		return
	deny_t = 0.8
	world.float_text(global_position + Vector2(0, -14), msg, Color("ff8a7a"))

func heal(amount: float) -> void:
	hp = minf(stats.maxHealth, hp + amount)

# ------------------------------------------------------------------ the frame
func _physics_process(dt: float) -> void:
	if dead or world.frozen:
		return
	t += dt
	deny_t = maxf(0.0, deny_t - dt)
	hurt_flash = maxf(0.0, hurt_flash - dt)
	attack_cd = maxf(0.0, attack_cd - dt)
	dodge_cd = maxf(0.0, dodge_cd - dt)
	invuln = maxf(0.0, invuln - dt)
	in_combat_t = maxf(0.0, in_combat_t - dt)
	reload = maxf(0.0, reload - dt)

	var mv: Vector2 = Controls.move_vector()
	var fire := Input.is_action_pressed("attack")
	var fire_pressed := Input.is_action_just_pressed("attack")
	_update_aim(mv, fire, dt)

	if Input.is_action_just_pressed("swap_weapon"):
		swap_weapon()
	if Input.is_action_just_pressed("lock_on"):
		Game.settings.lock_on = not Game.settings.lock_on
		world.toast("LOCK-ON: " + ("ON" if Game.settings.lock_on else "OFF"))
	if Input.is_action_just_pressed("dodge"):
		dodge_buf = BUFFER_TIME
	if dodge_buf > 0.0:
		dodge_buf -= dt
		if dodging <= 0.0 and dodge_cd <= 0.0:
			if _try_dodge(mv):
				dodge_buf = 0.0
			elif stamina < stats.dodgeStamina * stats.maxStamina:
				dodge_buf = 0.0
	if fire_pressed:
		atk_buf = BUFFER_TIME
	atk_buf = maxf(0.0, atk_buf - dt)

	_move(dt, mv)
	_handle_weapon(dt, fire, fire_pressed)
	_recover(dt)
	_sync_sprites(dt)

func _update_aim(mv: Vector2, fire: bool, dt: float) -> void:
	if Controls.using_pad:
		var st: Vector2 = Controls.aim_vector()
		if st.length() > 0.3:
			aim = st.angle()
		elif fire and Game.settings.auto_aim:
			var tg = world.nearest_target(global_position, 230.0)
			if tg != null:
				aim = (tg.global_position - global_position).angle()
		elif mv.length() > 0.3:
			walk_t += dt
			if walk_t > 0.5:
				aim = mv.angle()
		if mv.length() <= 0.3:
			walk_t = 0.0
	else:
		aim = (get_global_mouse_position() - global_position).angle()

func _try_dodge(mv: Vector2) -> bool:
	if dodging > 0.0 or dodge_cd > 0.0:
		return false
	var cost: float = stats.dodgeStamina * stats.maxStamina
	if stamina < cost:
		deny("NO STAMINA")
		return false
	stamina -= cost
	dodge_cd = stats.dodgeCooldown
	dodging = DODGE_TIME
	invuln = DODGE_TIME + 0.08
	if mv.length() > 0.1:
		dodge_vec = mv.normalized()
	elif velocity.length() > 25.0:
		dodge_vec = velocity.normalized()
	else:
		dodge_vec = -Vector2.from_angle(aim)
	focusing = false
	focus = 0.0
	pending_hit = -1.0
	swing_t = 1.0
	Game.profile.flags["tutDodged"] = true
	world.dust(global_position)
	return true

func _move(dt: float, mv: Vector2) -> void:
	if dodging > 0.0:
		dodging -= dt
		var k := maxf(0.0, dodging) / DODGE_TIME
		var dist: float = 52.0 * float(stats.dodgeDistance)
		var vmax: float = dist / (DODGE_TIME * 0.65)
		velocity = dodge_vec * vmax * (0.3 + 0.7 * k)
		move_and_slide()
		return
	var top: float = BASE_SPEED * float(stats.moveSpeed)
	if focusing:
		top *= lerpf(0.85, float(weapon.get("drawSlow", 0.7)), clampf(focus, 0.0, 1.0))
	if swing_t < 1.0:
		top *= 0.92
	var l := mv.length()
	if l > 0.05:
		var dirv := mv / l
		var target := dirv * top * minf(1.0, l)
		var cur := velocity.length()
		if cur < top * START_KICK:
			velocity = dirv * top * START_KICK
		var d := target - velocity
		var dot := (velocity.dot(target) / (cur * target.length())) if (cur > 1.0 and target.length() > 0.0) else 1.0
		var a := ACCEL * (TURN_BOOST if dot < 0.2 else 1.0) * dt
		if d.length() > a:
			d = d.normalized() * a
		velocity += d
	else:
		var cur2 := velocity.length()
		var f := FRICTION * dt
		velocity = Vector2.ZERO if cur2 <= f else velocity - velocity / cur2 * f
	move_and_slide()
	# footsteps: a soft puff of dust each stride
	var sp := velocity.length()
	if sp > 30.0:
		_stride += sp * dt
		if _stride > 26.0:
			_stride = 0.0
			if sp > 70.0:
				world.step_dust(global_position, velocity)
	else:
		_stride = minf(_stride, 10.0)

func _recover(dt: float) -> void:
	var r: Dictionary = stats.regen
	var mode := "combat" if in_combat_t > 0.0 else "out"
	hp = minf(stats.maxHealth, hp + stats.maxHealth * float(r.health[mode]) * dt)
	var still := velocity.length() < 20.0 and dodging <= 0.0
	var mult: float = Game.t("staminaStill") if still else Game.t("staminaMoving")
	if not focusing:
		stamina = minf(stats.maxStamina, stamina + stats.maxStamina * float(r.stamina[mode]) * mult * dt)
	mana = minf(stats.maxMana, mana + stats.maxMana * float(r.mana[mode]) * Game.t("manaRegen") * dt)

# ------------------------------------------------------------------ weapons
func _handle_weapon(dt: float, fire: bool, fire_pressed: bool) -> void:
	if dodging > 0.0:
		return
	if weapon.cls == "melee":
		if swing_t < 1.0:
			swing_t = minf(1.0, swing_t + dt / swing_len)
		if pending_hit >= 0.0:
			pending_hit -= dt
			if pending_hit < 0.0:
				pending_hit = -1.0
				_melee_strike()
		if fire or atk_buf > 0.0:
			_melee_attack()
	else:
		_ranger_update(dt, fire, fire_pressed)

func _melee_attack() -> void:
	if attack_cd > 0.0 or pending_hit >= 0.0:
		return
	var cost: float = float(weapon.stamina) * stats.staminaCost * stats.maxStamina
	if stamina < cost:
		deny("NO STAMINA")
		return
	stamina -= cost
	attack_cd = weapon.cooldown
	atk_buf = 0.0
	swing_from = 0.0
	swing_t = 0.0
	swing_dir *= -1.0
	swing_len = float(weapon.get("swingTime", 0.16))
	pending_hit = maxf(0.001, swing_len * float(weapon.get("windup", 0.0)))

func _melee_strike() -> void:
	var lunge: float = 70.0 if weapon_id == "training_claymore" else (85.0 if weapon_id == "training_spear" else 55.0)
	velocity += Vector2.from_angle(aim) * lunge
	var half := deg_to_rad(float(weapon.arcDeg)) / 2.0
	world.slash_fx(global_position, aim, float(weapon.range), swing_dir, "thrust" if weapon_id == "training_spear" else ("large" if weapon_id == "training_claymore" else "small"))
	var hit_any := false
	for tg in world.targets():
		if not tg.alive:
			continue
		var d: Vector2 = tg.global_position - global_position
		var dist := d.length()
		if dist > float(weapon.range) + tg.radius:
			continue
		var slack := atan2(tg.radius, maxf(dist, 1.0))
		if absf(angle_difference(d.angle(), aim)) > half + slack:
			continue
		hit_target(tg, float(weapon.knockback), 1.0)
		hit_any = true
	if hit_any:
		var heavy := weapon_id == "training_claymore"
		world.shake(4.0 if heavy else 2.0, 0.12)
		Controls.rumble(0.5 if heavy else 0.25, 0.3, 0.12)
		world.hit_stop(0.078 if heavy else 0.034)

func hit_target(tg, knock: float, focus_value: float) -> void:
	var atk: Dictionary = Combat.player_attack(weapon, stats, focus_value, {}, Game.rng)
	tg.hurt(atk.damage, atk.crit, global_position, knock, {"weapon": weapon_id, "focus": focus_value})
	if tg.is_dummy:
		Game.profile.flags["tutHit"] = true
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	Progression.add_proficiency(Game.profile, weapon.cls, stats.weaponMastery * Game.t("profRate"))
	hits += 1
	if hits % 8 == 0:
		refresh_stats()
	if atk.crit:
		world.shake(3.0, 0.1)
		world.hit_stop(0.072)

func _ranger_update(dt: float, fire: bool, fire_pressed: bool) -> void:
	if weapon.get("auto", false):
		_auto_fire(fire)
		return
	if not focusing and fire_pressed and attack_cd <= 0.0 and reload <= 0.0:
		focusing = true
		focus = 0.0
		charged = false
		overed = false
	if not focusing:
		lock_target = null
		return
	if fire:
		var r: Dictionary = FocusLogic.tick(focus, dt, stats.focusSpeed, float(weapon.focusRate), stamina > 1.0)
		focus = r.focus
		if not charged and focus >= 1.0:
			charged = true
			world.ring_fx(global_position, Color("ffe27a"))
		if not overed and focus >= 1.5:
			overed = true
			world.ring_fx(global_position, Color("ff9a3a"))
		if r.staminaFrac > 0.0:
			stamina = maxf(0.0, stamina - r.staminaFrac * stats.staminaCost * stats.maxStamina)
		lock_target = world.target_near_aim(global_position, aim, float(Data.constants.FOCUS.lockRange), 0.55) if Game.settings.lock_on else null
	else:
		_fire_ranged()
		focusing = false
		focus = 0.0
		lock_target = null

func _fire_ranged() -> void:
	if focus < float(weapon.minFocus):
		deny("NEEDS MORE CHARGE")
		return
	var cost: float = float(weapon.stamina) * stats.staminaCost * stats.maxStamina
	if stamina < cost:
		deny("NO STAMINA")
		return
	stamina -= cost
	var angle := aim
	if lock_target != null and lock_target.alive:
		angle = (lock_target.global_position - global_position).angle()
	var boost := 1.0 + (float(weapon.maxProjectileBoost) - 1.0) * minf(1.0, focus / 1.5)
	_shoot(angle, float(weapon.projectileSpeed) * boost, focus)
	attack_cd = weapon.cooldown
	if weapon.has("reload"):
		reload = weapon.reload
	if focus >= 1.0:
		world.ring_fx(global_position, Color("ff9a3a") if focus > 1.5 else Color("ffe27a"))
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)

func _auto_fire(fire: bool) -> void:
	focusing = false
	focus = 0.0
	lock_target = null
	if not fire and atk_buf <= 0.0:
		return
	if reload > 0.0 or attack_cd > 0.0:
		return
	var cost: float = float(weapon.stamina) * stats.staminaCost * stats.maxStamina
	if stamina < cost:
		deny("NO STAMINA")
		return
	stamina -= cost
	atk_buf = 0.0
	var angle := aim
	var tg = world.target_near_aim(global_position, aim, 190.0, 0.26) if Game.settings.lock_on else null
	if tg != null:
		angle = (tg.global_position - global_position).angle()
	if weapon.has("spread"):
		angle += (randf() - 0.5) * 2.0 * float(weapon.spread)
	_shoot(angle, float(weapon.projectileSpeed), 1.0)
	attack_cd = weapon.cooldown
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	if weapon.has("mag"):
		ammo = (int(weapon.mag) if ammo < 0 else ammo) - 1
		if ammo <= 0:
			ammo = int(weapon.mag)
			reload = weapon.reload
			world.float_text(global_position + Vector2(0, -16), "RELOAD", Color("ffe27a"))

func _shoot(angle: float, speed: float, focus_value: float) -> void:
	var tip := global_position + Vector2.from_angle(angle) * (float(WEAPON_ART[weapon_id][3]) + 8.0)
	var proj = Projectile.new()
	world.add_effect(proj)
	proj.setup(world, tip, angle, speed, "p_" + String(weapon.projectile), true, 2.5)
	proj.focus = focus_value
	proj.knock = 40.0
	world.muzzle_flash(tip, angle)

# ------------------------------------------------------------------ being hurt
func take_hit(raw: float, crit: bool, from_pos: Vector2) -> void:
	if dead or invuln > 0.0:
		return
	var dmg := Combat.after_mitigation(raw, stats.defense, stats.damageReduction)
	hp -= dmg
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	hurt_flash = 0.14
	invuln = 0.25
	velocity += (global_position - from_pos).normalized() * 120.0
	world.float_text(global_position + Vector2(0, -14), str(roundi(dmg)), Color("ff5a4a"), 1.5 if crit else 1.0)
	world.shake(3.0, 0.12)
	Controls.rumble(0.8, 0.5, 0.2)
	world.hit_stop(0.05)
	if hp <= 0.0:
		hp = 0.0
		dead = true
		world.on_player_death()

# ------------------------------------------------------------------ drawing
func _sync_sprites(dt: float) -> void:
	var snapped := roundf(aim / QUARTER) * QUARTER
	var alpha := 0.55 if dodging > 0.0 else 1.0
	var tint := Color(1, 0.42, 0.42) if hurt_flash > 0.0 else Color.WHITE
	body.rotation = snapped
	body.modulate = Color(tint.r, tint.g, tint.b, alpha)
	var ca := cos(snapped)
	var sa := sin(snapped)
	var sp := velocity.length()
	var bob := roundf(sin(t * 13.0) * 0.9) if (sp > 30.0 and dodging <= 0.0) else 0.0
	hood.rotation = snapped
	hood.position = Vector2(ca, sa) * bob
	hood.modulate = body.modulate
	var sway := sin(t * 6.0) * 0.08 * (0.35 + minf(1.5, sp / 90.0)) + (0.35 if dodging > 0.0 else 0.0)
	scarf.position = Vector2(-ca * 5.0 - sa, -sa * 5.0 + ca)
	scarf.rotation = snapped + sway
	var rank_col: Color = Data.rank_color(stats.rank)
	scarf.modulate = Color(1, 0.42, 0.42, alpha) if hurt_flash > 0.0 else Color(rank_col.r, rank_col.g, rank_col.b, alpha)
	# the weapon: held in front, swings through its arc
	var art: Array = WEAPON_ART[weapon_id]
	var hold := float(art[3])
	var off := 0.0
	var spear := weapon_id == "training_spear"
	if weapon.cls == "melee":
		var half := deg_to_rad(float(weapon.arcDeg)) / 2.0
		var relaxed := 0.0 if spear else -0.35 * swing_dir + sin(t * 1.7) * 0.03
		off = relaxed
		if swing_t < 1.0:
			var wf := maxf(0.05, float(weapon.get("windup", 0.2)))
			var back := 0.0 if spear else -half * 1.3 * swing_dir
			if swing_t < wf:
				var u := 1.0 - pow(1.0 - swing_t / wf, 2.0)
				if spear:
					hold -= 7.0 * u
				else:
					off = lerpf(relaxed, back, u)
			else:
				var r := (swing_t - wf) / (1.0 - wf)
				if spear:
					hold += -7.0 + 18.0 * (1.0 - pow(1.0 - minf(1.0, r * 2.5), 2.0)) * (1.0 - maxf(0.0, r - 0.5) * 2.0)
				elif r < 0.45:
					off = lerpf(back, -back, 1.0 - pow(1.0 - r / 0.45, 2.0))
				else:
					off = lerpf(-back, relaxed, (r - 0.45) / 0.55)
	else:
		hold -= (focus * 2.5 if focusing else 0.0)
	wpn.rotation = aim + off
	wpn.position = Vector2.from_angle(aim) * hold
	wpn.modulate = Color(1, 1, 1, alpha)
	ring.queue_redraw()

## the focus ring round the player: inner ring fills to 100%, an outer ring takes it on to 200%
func _draw_ring() -> void:
	if not focusing:
		return
	var f := clampf(focus, 0.0, 2.0)
	var col := Color("ffe27a") if f < 1.0 else (Color("ffb04a") if f < 1.5 else Color("ff6a3a"))
	ring.draw_arc(Vector2.ZERO, 13.0, -PI / 2.0, -PI / 2.0 + TAU * minf(f, 1.0), 40, col, 1.5)
	if f > 1.0:
		ring.draw_arc(Vector2.ZERO, 16.0, -PI / 2.0, -PI / 2.0 + TAU * (f - 1.0), 40, Color("ff6a3a"), 1.5)
	if lock_target != null and lock_target.alive:
		var d: Vector2 = lock_target.global_position - global_position
		ring.draw_arc(d, 11.0, 0.0, TAU, 24, Color("ff5a4a"), 1.0)
