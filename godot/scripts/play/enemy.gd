extends CharacterBody2D
## A skeleton: soldier, lancer, brute, archer or mage. Port of the Skeleton class in src/game/enemy.js
## (same senses and timings: it notices you only in its room with a line of sight, "?" fills up, then "!" and the chase).
const Stats = preload("res://scripts/logic/stats.gd")
const Combat = preload("res://scripts/logic/combat.gd")
const Awareness = preload("res://scripts/logic/awareness.gd")
const Projectile = preload("res://scripts/play/projectile.gd")

const WEAPON_GRIP := {"w_sword": [28.0, 2.8], "w_claymore": [38.0, 4.0], "w_spear": [32.0, 7.0], "w_bow": [12.0, 8.5], "w_staff": [34.0, 17.0]}
const QUARTER := PI / 4.0

var world
var def: Dictionary
var room := ""
var home := Vector2.ZERO
var alert := 0.0
var sees := false
var sense_t := 0.0
var lost_t := 0.0
var last_seen := Vector2.ZERO
var cue_kind := ""
var cue_t := 0.0
var idx := 0
var level := 1
var rank := "F"
var radius := 7.0
var stats: Dictionary
var hp := 1.0
var alive := true
var is_dummy := false
var state := "idle"
var timer := 0.0
var cooldown := 0.5
var angle := 0.0
var wander := Vector2.ZERO
var knock := Vector2.ZERO
var lunge := Vector2.ZERO
var stagger := 0.0
var flash := 0.0
var bar_t := 0.0
var swing := 0.0
var hit_t := 0.0
var hit_a := 0.0
var strafe_t := 0.0
var strafe_dir := 1.0
var tt := 0.0
var walk_ph := 0.0
var last_hit_angle := 0.0

var shadow: Sprite2D
var body: Sprite2D
var wpn: Sprite2D
var cue: Sprite2D
var ui: Node2D

func setup(w, pos: Vector2, lvl: int, stat_mult: float, index: int, room_id: String, def_id: String) -> void:
	world = w
	def = Data.enemies[def_id]
	room = room_id
	idx = index
	level = lvl
	rank = Data.rank_of_level(lvl)
	global_position = pos
	home = pos
	last_seen = pos
	stats = Stats.compute_enemy(def, lvl, stat_mult)
	stats.maxHealth *= Game.t("enemyHp")
	stats.defense *= Game.t("enemyHp")
	hp = stats.maxHealth
	sense_t = randf() * 0.12
	timer = randf() * 2.0
	cooldown = 0.4 + randf() * 0.6
	angle = randf() * TAU
	tt = randf() * 10.0
	walk_ph = randf() * TAU
	collision_layer = 4
	collision_mask = 1 | 2 | 4 | 8
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
	var cs := CollisionShape2D.new()
	var c := CircleShape2D.new()
	c.radius = 6.0
	cs.shape = c
	add_child(cs)
	shadow = Sprite2D.new()
	shadow.texture = Data.tex("shadow")
	shadow.position = Vector2(0, 5)
	add_child(shadow)
	body = Sprite2D.new()
	body.texture = Data.tex("skeleton")
	body.modulate = Data.hex_color(def.tint)
	add_child(body)
	var wk: String = def.wkey
	var grip: Array = WEAPON_GRIP.get(wk, WEAPON_GRIP.w_sword)
	wpn = Sprite2D.new()
	wpn.texture = Data.tex(wk)
	wpn.centered = false
	wpn.offset = Vector2(-float(grip[1]), -wpn.texture.get_height() / 2.0)
	wpn.modulate = Data.hex_color(def.wtint)
	add_child(wpn)
	cue = Sprite2D.new()
	cue.texture = Data.tex("fx_wonder")
	cue.position = Vector2(0, -16)
	cue.z_index = 42
	cue.visible = false
	add_child(cue)
	ui = Node2D.new()
	ui.z_index = 40
	ui.draw.connect(_draw_ui)
	add_child(ui)

# being hit, or a room-mate shouting, makes it notice you at once
func aggro() -> void:
	if state == "idle" or state == "search":
		notice()

func notice() -> void:
	if state == "chase" or state == "windup" or state == "recover":
		return
	state = "chase"
	timer = 0.0
	alert = 1.0
	lost_t = 0.0
	cue_kind = "alert"
	cue_t = 0.9
	world.alert_allies(self)

func look(player_pos: Vector2, dist: float, in_room_only: bool) -> bool:
	if dist > float(def.sightRange):
		return false
	if in_room_only:
		var here: String = world.room_at(player_pos)
		if room != "":
			if here != room:
				return false
		elif dist > 110.0:
			return false
	return world.has_los(global_position, player_pos)

func sense(dt: float, player_pos: Vector2, dist: float) -> void:
	sense_t -= dt
	if sense_t <= 0.0:
		sense_t = 0.12
		sees = look(player_pos, dist, true)
	alert = clampf(alert + Awareness.alert_rate(sees, dist < float(def.earRange), dist, def) * dt, 0.0, 1.0)
	if alert >= 1.0:
		notice()

func _physics_process(dt: float) -> void:
	if not alive or world.frozen:
		return
	var player = world.player
	var to_p: Vector2 = player.global_position - global_position
	var dist := to_p.length()
	var to_player := to_p.angle()
	cooldown = maxf(0.0, cooldown - dt)
	bar_t = maxf(0.0, bar_t - dt)
	flash = maxf(0.0, flash - dt)
	hit_t = maxf(0.0, hit_t - dt)
	cue_t = maxf(0.0, cue_t - dt)
	if swing > 0.0:
		swing = maxf(0.0, swing - dt / 0.16)
	var v := Vector2.ZERO
	var spd_move: float = float(def.moveSpeed)
	if stagger > 0.0:
		stagger -= dt
		v = knock
		knock *= maxf(0.0, 1.0 - dt * 7.0)
	elif player.dead:
		state = "idle"
	else:
		match state:
			"idle":
				sense(dt, player.global_position, dist)
				if state == "idle":
					if alert > 0.25:
						angle = to_player # something is off: stop and stare
					else:
						timer -= dt
						if timer <= 0.0:
							timer = 1.0 + randf() * 2.5
							var hd := home.distance_to(global_position)
							if randf() < 0.55 or hd > 44.0:
								var a := (home - global_position).angle() if hd > 44.0 else randf() * TAU
								wander = Vector2.from_angle(a) * 18.0
								angle = a
							else:
								wander = Vector2.ZERO
						v = wander
			"chase":
				angle = to_player
				sense_t -= dt
				if sense_t <= 0.0:
					sense_t = 0.12
					sees = look(player.global_position, dist, false)
				if sees:
					lost_t = 0.0
					last_seen = player.global_position
				else:
					lost_t += dt
				if dist > float(def.loseRange) or lost_t > float(def.loseTime):
					state = "search"
					timer = float(def.searchTime)
					alert = 0.4
					cue_kind = "wonder"
					cue_t = 0.6
				elif def.has("ranged"):
					var R: Dictionary = def.ranged
					var in_sight: bool = sees and dist <= float(R.range)
					if in_sight and cooldown <= 0.0:
						state = "windup"
						timer = float(def.windup)
					else:
						strafe_t -= dt
						if strafe_t <= 0.0:
							strafe_t = 1.2 + randf() * 1.6
							strafe_dir = -1.0 if randf() < 0.5 else 1.0
						var dir_to := Vector2.from_angle(to_player)
						if dist < float(R.keep):
							v = -dir_to * spd_move * 0.9
						elif not in_sight or dist > float(R.range) * 0.85:
							v = dir_to * spd_move
						else:
							v = Vector2(-sin(to_player), cos(to_player)) * spd_move * 0.35 * strafe_dir
				else:
					if dist < float(def.attackRange) - 3.0 and cooldown <= 0.0:
						state = "windup"
						timer = float(def.windup)
					elif dist > float(def.attackRange) - 6.0:
						v = Vector2.from_angle(to_player) * spd_move
			"search":
				timer -= dt
				var l := last_seen - global_position
				if l.length() > 8.0:
					angle = l.angle()
					v = Vector2.from_angle(angle) * spd_move * 0.6
				else:
					angle += dt * 2.2
				sense(dt, player.global_position, dist)
				if state == "search" and timer <= 0.0:
					state = "idle"
					alert = 0.0
					timer = 0.5
			"windup":
				timer -= dt
				if timer > float(def.windup) * 0.35:
					angle = to_player
					if not def.has("ranged"):
						v = -Vector2.from_angle(to_player) * 14.0 # rears back, then commits
				if timer <= 0.0:
					if def.has("ranged"):
						_fire(player)
					else:
						_strike(player)
					state = "recover"
					timer = 0.4
					cooldown = float(def.cooldown)
			"recover":
				timer -= dt
				if timer <= 0.0:
					state = "chase"
	if stagger <= 0.0 and lunge.length_squared() > 4.0:
		v += lunge # the step forward that goes into a swing
		lunge *= maxf(0.0, 1.0 - dt * 9.0)
	velocity = v
	move_and_slide()
	var sp := v.length()
	tt += dt
	if sp > 12.0:
		walk_ph += sp * dt / 9.0
	else:
		walk_ph = roundf(walk_ph / PI) * PI
	_draw_sprites(dt, sp)
	ui.queue_redraw()

func _strike(player) -> void:
	var reach := float(def.attackRange) + 8.0
	swing = 1.0
	lunge = Vector2.from_angle(angle) * 80.0
	world.slash_fx(global_position, angle, reach, 1.0, "thrust" if def.style == "spear" else ("large" if def.style == "heavy" else "small"), Color("ff8a5a"))
	if def.style == "heavy":
		var pd: float = player.global_position.distance_to(global_position)
		if pd < 170.0:
			world.shake(4.0 * (1.15 - pd / 200.0), 0.11)
	var d: Vector2 = player.global_position - global_position
	if d.length() <= reach + 4.0 and absf(angle_difference(d.angle(), angle)) <= deg_to_rad(float(def.attackArcDeg)) / 2.0:
		var atk: Dictionary = Combat.enemy_attack(stats, Game.rng)
		player.take_hit(atk.damage * Game.t("enemyDmg"), atk.crit, global_position)

# archers and mages: the shot flies straight and can be dodged (a roll = no hit)
func _fire(player) -> void:
	var R: Dictionary = def.ranged
	var a: float = (player.global_position - global_position).angle() + (randf() - 0.5) * 0.12
	var atk: Dictionary = Combat.enemy_attack(stats, Game.rng)
	var proj = Projectile.new()
	world.add_effect(proj)
	var key := "p_arrow" if R.shot == "arrow" else "p_enemy"
	proj.setup(world, global_position + Vector2.from_angle(a) * 8.0, a, float(R.speed), key, false, 3.0, Data.hex_color(R.tint))
	proj.damage = atk.damage * Game.t("enemyDmg")
	proj.crit = atk.crit
	proj.life = 2.4
	swing = 1.0
	world.muzzle_flash(global_position + Vector2.from_angle(a) * 8.0, a)

func hurt(damage: float, crit: bool, from_pos: Vector2, knock_force: float, info: Dictionary) -> float:
	if not alive:
		return 0.0
	var dealt := Combat.after_mitigation(damage, stats.defense, 0.0)
	hp -= dealt
	flash = 0.12
	hit_t = 0.18
	hit_a = (global_position - from_pos).angle()
	bar_t = 3.0
	aggro()
	if state == "idle":
		state = "chase"
	if knock_force > 0.0:
		var resist := 1.0 - float(def.knockbackResist)
		knock = Vector2.from_angle(hit_a) * knock_force * resist
		stagger = 0.12 + minf(0.22, knock_force / 700.0)
		if state == "windup" and knock_force > 100.0:
			state = "recover"
			timer = 0.4
	world.float_text(global_position + Vector2(randf_range(-4, 4), -10), str(roundi(dealt)), Color("ffd84a") if crit else Color.WHITE, 1.5 if crit else 1.0)
	last_hit_angle = hit_a
	world.hit_fx(global_position, hit_a, crit)
	if hp <= 0.0:
		_die(crit)
	return dealt

func _die(crit: bool) -> void:
	if not alive:
		return
	alive = false
	world.death_fx(global_position, last_hit_angle, crit)
	world.on_enemy_killed(self)
	queue_free()

# ------------------------------------------------------------------ drawing
func _draw_sprites(_dt: float, sp: float) -> void:
	var sn := roundf(angle / QUARTER) * QUARTER
	body.rotation = sn
	if flash > 0.0:
		body.modulate = Color(1, 0.56, 0.56)
	elif state == "windup" and int(timer * 22.0) % 2 == 1:
		body.modulate = Color(1, 0.82, 0.63)
	else:
		body.modulate = Data.hex_color(def.tint)
	var style: String = def.style
	var prog := 1.0 - timer / float(def.windup) if state == "windup" else 0.0
	var gait := minf(1.0, sp / 50.0)
	var idle := sin(tt * 1.6) * 0.04 + sin(walk_ph) * 0.1 * gait
	var hold := 7.0
	var rot := angle
	match style:
		"sword", "heavy":
			var big := style == "heavy"
			var a := angle + (1.1 if big else 0.9)
			if state == "windup":
				a = angle - (1.7 if big else 1.3) - prog * 0.3
			if swing > 0.0:
				a = angle + lerpf(1.3 if big else 1.0, -1.4 if big else -1.1, swing)
			elif state != "windup":
				a += idle
			rot = a
			hold = 6.0
		"spear":
			hold = 8.0
			if state == "windup":
				hold = 8.0 - 5.0 * prog
			if swing > 0.0:
				hold = 8.0 + 10.0 * (1.0 - absf(swing * 2.0 - 1.0))
			rot = angle + idle * 0.5
		"bow":
			hold = 8.0
			rot = angle + (0.0 if state == "windup" else idle * 0.5)
		"staff":
			hold = 5.0
			rot = angle - (0.9 * prog if state == "windup" else 0.0) + (0.5 * swing)
	wpn.rotation = rot
	wpn.position = Vector2.from_angle(angle) * hold
	wpn.modulate = Data.hex_color(def.wtint)
	# the "?" / "!" over its head
	var show_cue := false
	if cue_t > 0.0 and cue_kind != "":
		cue.texture = Data.tex("fx_alert" if cue_kind == "alert" else "fx_wonder")
		show_cue = true
	elif state == "idle" and alert > 0.25:
		cue.texture = Data.tex("fx_wonder")
		show_cue = true
	cue.visible = show_cue
	cue.modulate.a = 1.0 if cue_t > 0.0 else clampf(alert * 1.4, 0.3, 1.0)

func _draw_ui() -> void:
	if bar_t > 0.0 and hp > 0.0:
		var w := minf(18.0, maxf(8.0, stats.maxHealth / 12.0))
		var frac := clampf(hp / stats.maxHealth, 0.0, 1.0)
		ui.draw_rect(Rect2(-w / 2.0 - 1, -17, w + 2, 4), Color("120d0a"))
		ui.draw_rect(Rect2(-w / 2.0, -16, w * frac, 2), Color("d9503f"))
	if bar_t > 0.0 or state == "chase" or state == "windup":
		ui.draw_string(world.font, Vector2(-20, -20), "LV%d" % level, HORIZONTAL_ALIGNMENT_CENTER, 40, 10, Data.rank_color(rank))
