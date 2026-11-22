extends CharacterBody2D
## The player: movement, dodge, stamina, melee and ranged weapons. Port of src/game/player.js
## (magic weapons, trait skills, the skill wheel, Berserk and the hand rig are not ported yet, see docs/GODOT_PORT.md).
const Stats = preload("res://scripts/logic/stats.gd")
const Combat = preload("res://scripts/logic/combat.gd")
const FocusLogic = preload("res://scripts/logic/focus.gd")
const Progression = preload("res://scripts/logic/progression.gd")
const Projectile = preload("res://scripts/play/projectile.gd")
const Berserk = preload("res://scripts/logic/berserk.gd")
const Bless = preload("res://scripts/logic/bless.gd")

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
	"training_mage_book": ["w_book_none_0", 14, 7.0, 12.0],
	"training_staff": ["w_staff_none", 34, 17.0, 8.0],
}
const CYCLE := ["training_sword", "training_claymore", "training_spear", "training_bow", "basic_crossbow", "one_time_pistol", "m4", "training_mage_book", "training_staff"]
const SLAM_DOWN := 0.09   # staff: seconds from the top of the swing to the hit
const SLAM_TOTAL := 0.36  # ... until the staff has settled again
const SKILL_SFX := {"heal": "heal", "secondwind": "heal", "mana": "manaup", "cdcut": "manaup", "shield": "shieldup", "mark": "mark", "buff": "buff", "bloodlust": "buff", "lifesteal": "buff", "predator": "buff"}
const SKILL_COLOR := {"heal": "7fe8a0", "secondwind": "7fe8a0", "mana": "6fa8ff", "shield": "9fd8ff", "mark": "ff6a5a", "cdcut": "c9a6ff", "bloodlust": "ff4a4a", "lifesteal": "ff4a6a", "predator": "ffb04a", "berserk": "ff3a2a", "buff": "ffe27a"}

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

# --- skills, buffs, Berserk
var berserk = Berserk.new()
var buffs: Array = []        # {key, until, mods}
var cd: Dictionary = {}      # skill id -> seconds left
var cd_max: Dictionary = {}
var active_until: Dictionary = {}
var shield := 0.0
var shield_until := 0.0
var shield_hit := 0.0
var mark_target = null
var mark_dmg := 0.0
var mark_crit := 0.0
var bloodlust := {"stacks": 0, "until": 0.0, "per": 0.0, "max": 5}
var lifesteal_until := 0.0
var lifesteal_pct := 0.0
var predator_until := 0.0
var predator_bonus := 0.0
var predator_below := 0.5
var current_target = null
var _sig := ""
var _sk_on: Dictionary = {}
var _had_shield := false
var _was_berserk := false
var _aura_t := 0.0
var _sk_t := 0.0
# --- magic (book and staff)
var cast_t := 0.0
var charging := false
var charge_t := 0.0
var charge_full := false
var slam_t := -1.0
var slam_pow := 0.0
var slam_raise := 0.0
var slam_fired := false
var cast_pulse := 0.0
var recoil := 0.0
var staff_tip := Vector2.ZERO
var book_pos := Vector2.ZERO
var gather_t := 0.0
var mote_t := 0.0
var amb_t := 0.0
var shot_n := 0
var aura_glow: Sprite2D
var aura_top: Sprite2D
var shield_glow: Sprite2D
var shield_ring: Sprite2D
var sigil: Sprite2D
var trim: Sprite2D
var twins: Array = []
var fx_glow: Sprite2D
var float_shadow: Sprite2D

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
	trim = _sprite("player_trim_none", Vector2.ZERO, 0)
	trim.visible = false
	move_child(trim, wpn.get_index())
	aura_glow = _glow_sprite(Color("ff3a2a"), -1)
	aura_top = _glow_sprite(Color("ff4a30"), 1)
	shield_glow = _glow_sprite(Color("9fd8ff"), 1)
	sigil = _sprite("fx_sigil_natural_0", Vector2(0, 3), -1)
	sigil.visible = false
	sigil.material = _additive()
	shield_ring = _sprite("fx_ring", Vector2.ZERO, 1)
	shield_ring.modulate = Color("7fd0ff")
	shield_ring.visible = false
	float_shadow = _sprite("shadow", Vector2.ZERO, 0)
	float_shadow.visible = false
	float_shadow.top_level = true
	fx_glow = _glow_sprite(Color.WHITE, 1)
	fx_glow.top_level = true
	for i in 2:
		var st := _sprite("p_sp_divine_bolt", Vector2.ZERO, 1)
		st.visible = false
		twins.append(st)
	move_child(sigil, 0)
	move_child(aura_glow, 1)
	ring = Node2D.new()
	ring.z_index = 30
	ring.draw.connect(_draw_ring)
	add_child(ring)
	refresh_stats(true)
	set_weapon(Game.profile.weapon)
	hp = stats.maxHealth
	stamina = stats.maxStamina

func _additive() -> CanvasItemMaterial:
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	return m

func _glow_sprite(color: Color, _layer: int) -> Sprite2D:
	var g := Sprite2D.new()
	g.texture = Data.tex("fx_glow")
	g.modulate = color
	g.material = _additive()
	g.visible = false
	add_child(g)
	return g

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
	var lists: Array = []
	for b in buffs:
		lists.append(b.mods)
	lists.append(berserk.get_mods())
	stats = Stats.compute(int(p.level), int(p.manaCircles), Stats.trait_passives(p.traits), p.extra, Stats.sum_mods(lists), p.proficiency)
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
	float_shadow.visible = false
	focusing = false
	focus = 0.0
	pending_hit = -1.0
	swing_t = 1.0
	ammo = -1
	lock_target = null
	charging = false
	charge_t = 0.0
	slam_t = -1.0
	cast_t = 0.0
	cast_pulse = 0.0
	reload = 0.0
	if wpn.texture != null:
		wpn.offset = Vector2(-float(art[2]), -wpn.texture.get_height() / 2.0)

## called when the menu closes: the weapon, trait or mana may have changed
func reload_loadout(fill_mana: bool = false) -> void:
	refresh_stats()
	var id: String = Game.profile.weapon
	if id != weapon_id:
		set_weapon(id)
	else:
		weapon = Game.weapons[id]
	mana = stats.maxMana if fill_mana else minf(mana, stats.maxMana)

func swap_weapon() -> void:
	var owned: Array = CYCLE.filter(func(id): return Game.profile.ownedWeapons.has(id))
	var i := owned.find(weapon_id)
	for n in owned.size():
		i = (i + 1) % owned.size()
		var w: Dictionary = Game.weapons[owned[i]]
		if w.cls == "magic" and int(Game.profile.manaCircles) <= 0:
			continue  # magic needs a Mana Circle
		set_weapon(owned[i])
		refresh_stats()
		Game.sfx("ui")
		world.toast("%s  (%s, %s)" % [String(weapon.name).to_upper(), weapon.type, weapon.sheet.speed])
		return

func deny(msg: String) -> void:
	if deny_t > 0.0:
		return
	deny_t = 0.8
	world.float_text(global_position + Vector2(0, -14), msg, Color("ff8a7a"))

func heal(amount: float, quiet: bool = false) -> void:
	var before := hp
	hp = minf(stats.maxHealth, hp + amount)
	var got := hp - before
	if got > 0.5 and not quiet:
		world.float_text(global_position + Vector2(0, -14), "+" + str(roundi(got)), Color("6af08a"))

func restore_mana(amount: float) -> void:
	var before := mana
	mana = minf(stats.maxMana, mana + amount)
	var got := mana - before
	if got > 0.5:
		world.float_text(global_position + Vector2(0, -14), "+%d MP" % roundi(got), Color("7fb4ff"))

func bless() -> String:
	return Bless.of_profile(Game.profile)

## "mark", "bloodlust", "predator": extra damage on the target, as the skills describe
func get_cond(target) -> Dictionary:
	var cond := {}
	if target != null and target.get("marked") == true:
		cond["mark"] = mark_dmg
		cond["markCrit"] = mark_crit
	if float(bloodlust.until) > t:
		cond["bloodlust"] = float(bloodlust.stacks) * float(bloodlust.per)
	if predator_until > t and target != null and not target.is_dummy and target == current_target and target.hp / target.stats.maxHealth < predator_below:
		cond["predator"] = predator_bonus
	return cond

# ------------------------------------------------------------------ buffs
func add_buff(key: String, mods: Dictionary, seconds: float) -> void:
	buffs = buffs.filter(func(b): return b.key != key)
	buffs.append({"key": key, "mods": mods, "until": t + seconds})
	refresh_stats()

func _prune_buffs() -> void:
	var before := buffs.size()
	buffs = buffs.filter(func(b): return b.until > t)
	if buffs.size() != before:
		refresh_stats()

# ------------------------------------------------------------------ the frame
func _physics_process(dt: float) -> void:
	if dead or world.frozen:
		return
	t += dt
	_prune_buffs()
	for k in cd.keys():
		if cd[k] > 0.0:
			cd[k] = maxf(0.0, cd[k] - dt)
			if cd[k] == 0.0:
				_on_skill_ready(k)
	_track_skills()
	if float(bloodlust.until) <= t:
		bloodlust.stacks = 0
	if mark_target != null and (not is_instance_valid(mark_target) or not mark_target.alive):
		mark_target = null
	if shield > 0.0 and shield_until <= t:
		shield = 0.0
	deny_t = maxf(0.0, deny_t - dt)
	hurt_flash = maxf(0.0, hurt_flash - dt)
	attack_cd = maxf(0.0, attack_cd - dt)
	dodge_cd = maxf(0.0, dodge_cd - dt)
	invuln = maxf(0.0, invuln - dt)
	in_combat_t = maxf(0.0, in_combat_t - dt)
	reload = maxf(0.0, reload - dt)

	if not Game.profile.flags.get("tutMoved", false) and global_position.distance_to(world.start_pos) > 24.0:
		Game.profile.flags["tutMoved"] = true
	var mv: Vector2 = Controls.move_vector()
	var fire: bool = Input.is_action_pressed("attack") and not world.wheel_open
	var fire_pressed: bool = Input.is_action_just_pressed("attack") and not world.wheel_open
	_update_aim(mv, fire, dt)

	if Input.is_action_just_pressed("swap_weapon") and not world.wheel_open:
		swap_weapon()
	if Input.is_action_just_pressed("aura") and not world.wheel_open:
		toggle_berserk()
	if Input.is_action_just_pressed("lock_on"):
		Game.settings.lock_on = not Game.settings.lock_on
		world.toast("LOCK-ON: " + ("ON" if Game.settings.lock_on else "OFF"))
	if Input.is_action_just_pressed("dodge") and not world.wheel_open:
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
	# Berserk: Life Force Decay hurts (but never kills)
	var ticks: int = berserk.update(dt)
	if ticks > 0:
		var dmg: float = stats.maxHealth * float(Data.constants.BERSERK.decay.periodicDamage) * ticks
		hp = maxf(1.0, hp - dmg)
		world.float_text(global_position + Vector2(0, -14), "-" + str(roundi(dmg)), Color("c27bff"))
	var sig: String = berserk.status() + str(berserk.cores())
	if sig != _sig:
		_sig = sig
		refresh_stats()
	current_target = world.target_near_aim(global_position, aim, 190.0, 0.7)
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
	charging = false
	charge_t = 0.0
	cast_t = 0.0
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
	if charging:
		top *= 1.0 - float(weapon.charge.slow)
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
	elif weapon.cls == "magic":
		_magic_update(dt, fire)
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
	world.slash_fx(global_position, aim, float(weapon.range), swing_dir, "thrust" if weapon_id == "training_spear" else ("large" if weapon_id == "training_claymore" else "small"), Color("ff7a62") if berserk.active else Color.WHITE)
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
	world.crack_hit(global_position, aim, float(weapon.range), half)
	if hit_any:
		var heavy := weapon_id == "training_claymore"
		world.shake(4.0 if heavy else 2.0, 0.12)
		Controls.rumble(0.5 if heavy else 0.25, 0.3, 0.12)
		world.hit_stop(0.078 if heavy else 0.034)

func hit_target(tg, knock: float, focus_value: float, mult: float = 1.0, w = null) -> void:
	var wp: Dictionary = weapon if w == null else w
	var cond := get_cond(tg)
	var atk: Dictionary = Combat.player_attack(wp, stats, focus_value, cond, Game.rng)
	var dmg: float = float(atk.damage) * mult
	tg.hurt(dmg, atk.crit, global_position, knock, {"weapon": wp.id, "focus": focus_value})
	if tg.is_dummy:
		Game.profile.flags["tutHit"] = true
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	if not tg.is_dummy and lifesteal_until > t:
		var steal: float = tg.stats.maxHealth * lifesteal_pct
		tg.hurt_true(steal)
		heal(steal, true)
	Progression.add_proficiency(Game.profile, wp.cls, stats.weaponMastery * Game.t("profRate"))
	hits += 1
	if hits % 8 == 0:
		refresh_stats()
	if atk.crit:
		world.shake(3.0, 0.1)
		world.hit_stop(0.072)
		world.kick(aim, 3.0)

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

## o: {x, y} where it leaves / {type} blessing look / {big} bigger picture / {mult} damage multiplier / {aoe: {r, dmg}} burst / {home, home_rate} / {radius}
func _shoot(angle: float, speed: float, focus_value: float, o: Dictionary = {}) -> Node:
	var pname: String = weapon.projectile
	var magic := pname.begins_with("mana")
	var type: String = o.get("type", bless())
	var key := "p_" + pname
	if magic:
		key = "p_sp_%s_%s" % [type, "big" if o.get("big", false) else ("bolt" if pname == "mana_bolt" else "orb")]
	var tip: Vector2 = Vector2(o.x, o.y) if o.has("x") else global_position + Vector2.from_angle(angle) * (float(WEAPON_ART[weapon_id][3]) + 8.0)
	var proj = Projectile.new()
	world.add_effect(proj)
	var col: Color = Bless.spell_color(type) if magic else Color.WHITE
	proj.setup(world, tip, angle, speed, key, true, float(o.get("radius", 2.5)), col)
	if magic:
		proj.spr.rotation = 0.0
	proj.focus = focus_value
	proj.knock = 30.0 if magic else 40.0
	proj.weapon_def = weapon
	proj.mult = float(o.get("mult", 1.0))
	proj.aoe = o.get("aoe")
	proj.home = o.get("home")
	proj.home_rate = float(o.get("home_rate", 2.0))
	proj.color = col
	if pname == "bullet":
		proj.set_trail(0.012, Color("fff2d0"), 0.09)
	elif magic:
		proj.set_trail(0.022 if o.get("big", false) else 0.035, col, 0.26 if o.get("big", false) else 0.19)
	elif pname == "arrow":
		proj.set_trail(0.03, Color("e8e0c8"), 0.11)
	elif pname == "bolt":
		proj.set_trail(0.026, Color("d8d2c0"), 0.1)
	if pname == "bullet":
		shot_n += 1
		world.muzzle_flash(tip, angle)
		world.kick(angle + PI, 0.7 if weapon.has("mag") else 3.0)
	elif pname == "bolt":
		world.muzzle_flash(tip, angle)
		world.kick(angle + PI, 1.0)
	return proj

## a projectile of mine touched a target (the weapon it left is remembered: you may have swapped since)
func projectile_hit(proj, tg) -> void:
	if not tg.alive:
		return
	var w: Dictionary = proj.weapon_def
	hit_target(tg, 30.0 if w.cls == "magic" else 40.0, proj.focus, proj.mult, w)
	world.impact_fx(proj.global_position, proj.vel.angle())
	projectile_burst(proj, tg)

## a fully charged staff orb bursts where it lands: everything close takes a share of the damage
func projectile_burst(proj, except = null) -> void:
	var aoe = proj.aoe
	if aoe == null:
		return
	for tg in world.targets():
		if not tg.alive or tg == except:
			continue
		if tg.global_position.distance_to(proj.global_position) > float(aoe.r) + tg.radius:
			continue
		hit_target(tg, 55.0, proj.focus, proj.mult * float(aoe.dmg), proj.weapon_def)
	world.ring_fx(proj.global_position, proj.color)
	world.burst(proj.global_position, proj.color, 12, float(aoe.r) * 2.0)
	world.shake(2.5, 0.11)
	world.hit_stop(0.055)
	Game.sfx("thunder")

# ------------------------------------------------------------------ magic: the book and the staff
func _magic_target(cone: float = 0.6):
	if not Game.settings.lock_on:
		return null  # lock-on is switched off (key T / settings)
	var ok := func(tg) -> bool:
		return tg != null and is_instance_valid(tg) and tg.alive and tg.global_position.distance_to(global_position) < 250.0 \
			and absf(angle_difference((tg.global_position - global_position).angle(), aim)) < cone * 1.35 and world.has_los(global_position, tg.global_position)
	if ok.call(lock_target):
		return lock_target
	var tg = world.target_near_aim(global_position, aim, 230.0, cone)
	return tg if ok.call(tg) else null

## the angle from `from` that meets a moving target (most of the way: it still rewards a good aim)
func _lead_angle(from: Vector2, tg, speed: float) -> float:
	var v = tg.get("velocity")
	if v == null:
		v = Vector2.ZERO
	var d: Vector2 = tg.global_position - from
	var tt := minf(0.7, d.length() / maxf(60.0, speed)) * 0.8
	return (d + (v as Vector2) * tt).angle()

func _no_circle() -> void:
	deny("NO MANA CIRCLE")
	attack_cd = 0.4
	world.toast("MAGIC NEEDS A MANA CIRCLE. EQUIP A MAGIC TRAIT AND VISIT THE MANA ALTAR.")

func _magic_update(dt: float, fire: bool) -> void:
	var w: Dictionary = weapon
	cast_pulse = maxf(0.0, cast_pulse - dt * 4.0)
	recoil = maxf(0.0, recoil - dt * 8.0)
	if w.has("charge"):
		_staff_update(dt, fire)
		return
	if cast_t > 0.0:
		cast_t -= dt
		if cast_t <= 0.0:
			_release_spell()
		return
	if fire and attack_cd <= 0.0:
		if int(Game.profile.manaCircles) <= 0:
			_no_circle()
			return
		var cost: float = float(w.mana) * stats.manaCost
		if mana < cost:
			deny("NO MANA")
			return
		mana -= cost
		cast_t = float(w.castTime)
		attack_cd = float(w.cooldown) + float(w.castTime)
		in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
		Game.sfx("magic", {"weapon": w.id})

## book: the spell leaves the floating book
func _release_spell() -> void:
	world.noise(global_position)
	var w: Dictionary = weapon
	var angle := aim
	var base: Vector2 = book_pos if book_pos != Vector2.ZERO else global_position
	var origin := base + Vector2.from_angle(angle) * 6.0
	var o := {"x": origin.x, "y": origin.y, "radius": float(w.radius), "home_rate": 1.5}
	var tg = _magic_target(0.42)
	if tg != null:
		angle = _lead_angle(origin, tg, float(w.projectileSpeed))
		o["home"] = tg
		var o2 := base + Vector2.from_angle(angle) * 6.0
		o.x = o2.x
		o.y = o2.y
	_shoot(angle, float(w.projectileSpeed), 1.0, o)
	Game.sfx("cast", {"weapon": w.id})
	cast_pulse = 1.0
	recoil = 0.6

## staff: a tap is a quick orb. Hold and the staff rises while the orb gathers; let go and it slams down and throws a heavy one.
func _staff_update(dt: float, fire: bool) -> void:
	var w: Dictionary = weapon
	var c: Dictionary = w.charge
	if cast_t > 0.0:
		cast_t -= dt
	if charging:
		lock_target = _magic_target(0.6)  # the reticle follows whoever is best in front of you
	elif slam_t < 0.0:
		lock_target = null
	if slam_t >= 0.0:  # the swing down, the throw, the settle
		slam_t += dt
		if not slam_fired and slam_t >= SLAM_DOWN:
			slam_fired = true
			_staff_throw()
		if slam_t >= SLAM_TOTAL:
			slam_t = -1.0
		return
	if not charging:
		if fire and attack_cd <= 0.0:
			if int(Game.profile.manaCircles) <= 0:
				_no_circle()
				return
			if mana < float(w.mana) * stats.manaCost:
				deny("NO MANA")
				return
			charging = true
			charge_t = 0.0
			charge_full = false
			gather_t = 0.0
			Game.sfx("draw", {"weapon": w.id})
		return
	if fire:
		charge_t = minf(float(c.time), charge_t + dt)
		in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
		if not charge_full and charge_t >= float(c.time):
			charge_full = true
			Game.sfx("charged")
			world.ring_fx(global_position, Bless.spell_color(bless()))
		return
	# let go: a tap fires at once, a charge swings down first
	var pow_k := clampf(charge_t / float(c.time), 0.0, 1.0) if charge_t >= float(c.min) else 0.0
	charging = false
	slam_pow = pow_k
	slam_raise = pow_k  # how high the staff was when it let go (for the animation)
	slam_fired = false
	slam_t = 0.0
	charge_t = 0.0
	cast_t = SLAM_DOWN + 0.08
	if pow_k <= 0.0:
		slam_t = SLAM_DOWN * 0.5  # a tap skips most of the swing

func _staff_throw() -> void:
	world.noise(global_position)
	var w: Dictionary = weapon
	var c: Dictionary = w.charge
	var pw := slam_pow
	# pay for it now; a charge you cannot afford falls back to what you can
	var base: float = float(w.mana) * stats.manaCost
	var extra: float = float(c.extraMana) * stats.manaCost
	if mana < base:
		deny("NO MANA")
		return
	if pw > 0.0 and mana < base + extra * pw:
		pw = maxf(0.0, (mana - base) / extra)
	mana -= base + extra * pw
	attack_cd = float(w.cooldown)
	var angle := aim
	var speed: float = float(w.projectileSpeed) * (1.0 + pw * 0.25)
	var tg = lock_target if (lock_target != null and is_instance_valid(lock_target) and lock_target.alive) else _magic_target(0.6)
	var from: Vector2 = staff_tip if staff_tip != Vector2.ZERO else global_position + Vector2.from_angle(angle) * 20.0
	if tg != null:
		angle = _lead_angle(from, tg, speed)
	var full := pw >= 0.99
	var tip := from + Vector2.from_angle(angle) * 4.0
	var big := pw >= 0.55
	var o := {"x": tip.x, "y": tip.y, "big": big, "mult": 1.0 + float(c.damageMult) * pw, "home": tg, "home_rate": 2.4, "radius": float(w.radius) + (2.5 if big else 0.0)}
	if full:
		o["aoe"] = {"r": float(c.aoe), "dmg": float(c.aoeDamage)}
	_shoot(angle, speed, 1.0, o)
	Game.sfx("cast", {"weapon": w.id})
	recoil = 0.6 + pw * 0.8
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	if pw > 0.2:  # the slam: the ground shudders where the staff came down
		world.shockwave(tip, Bless.spell_color(bless()), pw)
		world.shake(1.5 + pw * 2.0, 0.07 + pw * 0.09)
		world.kick(angle, 1.0 + pw * 3.0)

# ------------------------------------------------------------------ skills (src/game/player.js useSkill and friends)
func skill_def(id: String):
	return Data.skill_by_id.get(id)

## skills running right now: [{id, name, left}]
func active_skills() -> Array:
	var out: Array = []
	for sd in Data.skills:
		var left: float = float(active_until.get(sd.id, 0.0)) - t
		if left > 0.0:
			out.append({"id": sd.id, "name": sd.name, "left": left})
	return out

# a soft ping when the skill you picked is ready again
func _on_skill_ready(id: String) -> void:
	if id != Game.profile.selSkill:
		return
	Game.sfx("ready")
	world.hud.flash_skill("ready")

# a running skill runs out: a short fade so you notice the bonus is gone
func _track_skills() -> void:
	for sd in Data.skills:
		var on: bool = float(active_until.get(sd.id, 0.0)) > t
		if _sk_on.get(sd.id, false) and not on and sd.skill.kind != "berserk":
			Game.sfx("expire")
			world.ring_fx(global_position, Color("8a8aa0"))
		_sk_on[sd.id] = on

func _start_cd(id: String, seconds: float) -> void:
	cd[id] = seconds
	cd_max[id] = seconds

func use_skill(id: String) -> bool:
	var sd = skill_def(id)
	if sd == null:
		deny("NO SKILL")
		return false
	var sk: Dictionary = sd.skill
	if float(cd.get(id, 0.0)) > 0.0:
		deny("%ds" % ceili(cd[id]))
		return false
	var key := "skill:" + id
	var used := true
	match String(sk.kind):
		"buff":
			add_buff(key, sk.mods, float(sk.active))
		"mark":
			var tg = lock_target if (lock_target != null and is_instance_valid(lock_target) and lock_target.alive) else world.target_near_aim(global_position, aim, 240.0, 0.9)
			if tg == null:
				deny("NO TARGET")
				used = false
			else:
				if mark_target != null and is_instance_valid(mark_target):
					mark_target.marked = false
				mark_target = tg
				tg.marked = true
				mark_dmg = float(sk.damage)
				mark_crit = float(sk.critRate)
				world.ring_fx(tg.global_position, Color("ff6a5a"))
				world.glow_pop(tg.global_position, Color("ff6a5a"), 0.9, 0.28, 0.6)  # the mark lands on them
		"heal":
			heal(stats.maxHealth * float(sk.pct))
		"mana":
			if stats.maxMana <= 0.0:
				deny("NO MANA POOL")
				used = false
			else:
				restore_mana(stats.maxMana * float(sk.pct))
		"cdcut":
			for j in cd.keys():
				if j != id and cd[j] > 0.0:
					cd[j] = maxf(0.0, cd[j] - float(cd_max.get(j, 1.0)) * float(sk.pct))
		"secondwind":
			if hp / stats.maxHealth >= float(sk.threshold):
				deny("HEALTH NOT LOW")
				used = false
			else:
				heal(stats.maxHealth * float(sk.pct))
		"bloodlust":
			bloodlust = {"stacks": 0, "until": t + float(sk.active), "per": float(sk.perKill), "max": int(sk.maxStacks)}
		"lifesteal":
			lifesteal_until = t + float(sk.active)
			lifesteal_pct = float(sk.pct)
		"shield":
			shield = stats.maxHealth * float(sk.pct)
			shield_until = t + float(sk.active)
		"predator":
			predator_until = t + float(sk.active)
			predator_bonus = float(sk.bonus)
			predator_below = float(sk.below)
		"berserk":
			if weapon.cls != "melee":
				deny("NEEDS MELEE WEAPON")
				used = false
			elif not berserk.activate(sk.mods, float(sk.active)):
				deny("AURA CORE EMPTY")
				used = false
		_:
			used = false
	if not used:
		return false
	_start_cd(id, float(sk.cooldown))
	active_until[id] = t + float(sk.active)
	var fxc: Color
	if sk.kind == "berserk":
		fxc = Color("ff3a2a")
		_berserk_burst()
	else:
		fxc = world.skill_fx(global_position, String(sk.kind))
	Game.sfx("berserk" if sk.kind == "berserk" else SKILL_SFX.get(sk.kind, "skill"))
	world.float_text(global_position + Vector2(0, -18), String(sd.name).to_upper(), fxc)
	world.hud.flash_skill("use")
	return true

func toggle_berserk() -> void:
	if weapon.cls != "melee":
		deny("NEEDS MELEE WEAPON")
		world.toast("SWORD AURA IS A MELEE SYSTEM. EQUIP A SWORD, CLAYMORE OR SPEAR.")
		return
	if berserk.active:
		berserk.deactivate()
		Game.sfx("ui")
		return
	if berserk.decay:
		deny("LIFE FORCE DECAY")
		return
	if not berserk.activate():
		deny("AURA CORE EMPTY")
		return
	Game.sfx("berserk")
	_berserk_burst()

# the Aura ignites: a red shockwave on the ground, a flash of light and a spray of embers
func _berserk_burst() -> void:
	world.shockwave(global_position, Color("ff3a2a"), 0.55)
	world.glow_pop(global_position, Color("ff3a2a"), 1.5, 0.34, 0.75)
	for i in 12:
		world.ember_fx(global_position + Vector2(randf_range(-8, 8), randf_range(-4, 4)), Color("ff3a2a") if i % 2 == 1 else Color("ff8a3a"))
	world.shake(3.5, 0.13)
	world.hit_stop(0.06)

func on_kill() -> void:
	if float(bloodlust.until) > t:
		bloodlust.stacks = mini(int(bloodlust.get("max", 5)), int(bloodlust.stacks) + 1)

# ------------------------------------------------------------------ being hurt
func take_hit(raw: float, crit: bool, from_pos: Vector2) -> void:
	if dead:
		return
	if invuln > 0.0:
		world.float_text(global_position + Vector2(0, -14), "DODGE", Color("9fe8ff"))
		return
	var dmg := Combat.after_mitigation(raw, stats.defense, stats.damageReduction)
	if shield > 0.0:
		var absorbed := minf(shield, dmg)
		shield -= absorbed
		dmg -= absorbed
		if absorbed > 0.0:
			shield_hit = 0.16
			Game.sfx("ui")
	hp -= dmg
	in_combat_t = float(Data.constants.COMBAT_TIMEOUT)
	hurt_flash = 0.14
	invuln = 0.25
	Game.sfx("hurt")
	velocity += (global_position - from_pos).normalized() * 160.0
	if dmg > 0.0:
		world.float_text(global_position + Vector2(0, -14), ("CRIT " if crit else "") + str(roundi(dmg)), Color("ff5a4a"), 1.5 if crit else 1.0)
	world.shake(3.0, 0.12)
	world.flash_hurt(minf(0.9, 0.5 + dmg / stats.maxHealth * 2.0))
	Controls.rumble(0.8, 0.5, 0.2)
	world.hit_stop(0.055)
	if hp <= 0.0:
		hp = 0.0
		dead = true
		world.on_player_death()

# ------------------------------------------------------------------ drawing
func _mix(a: Dictionary, b: Dictionary, u: float) -> Dictionary:
	return {"hold": lerpf(a.hold, b.hold, u), "lat": lerpf(a.lat, b.lat, u), "off": lerpf(a.off, b.off, u), "lift": lerpf(a.lift, b.lift, u)}

func _ease_out(x: float) -> float:
	return 1.0 - pow(1.0 - clampf(x, 0.0, 1.0), 2.0)

func _sync_sprites(dt: float) -> void:
	var snapped := roundf(aim / QUARTER) * QUARTER
	var alpha := 0.55 if dodging > 0.0 else 1.0
	var ba: bool = berserk.active
	var tint := Color.WHITE
	if hurt_flash > 0.0:
		tint = Color(1, 0.42, 0.42)
	elif berserk.decay:
		tint = Color("b48aff")
	elif ba:
		tint = Color("ff9484") if int(t * 12.0) % 2 == 1 else Color("ffb0a0")
	elif berserk.exhaustion > 0.0:
		tint = Color("b0b0c0")
	var bl := bless()
	body.rotation = snapped
	body.modulate = Color(tint.r, tint.g, tint.b, alpha)
	var ca := cos(snapped)
	var sa := sin(snapped)
	var sp := velocity.length()
	var bob := roundf(sin(t * 13.0) * 0.9) if (sp > 30.0 and dodging <= 0.0) else 0.0
	hood.rotation = snapped
	hood.position = Vector2(ca, sa) * bob
	hood.modulate = body.modulate
	trim.visible = bl != "none"
	if trim.visible:
		trim.texture = Data.tex("player_trim_" + bl)
		trim.rotation = snapped
		trim.position = hood.position
		trim.modulate = Color(1, 1, 1, alpha)
	_bless_fx(dt, bl)
	var sway := sin(t * 6.0) * 0.08 * (0.35 + minf(1.5, sp / 90.0)) + (0.35 if dodging > 0.0 else 0.0)
	scarf.position = Vector2(-ca * 5.0 - sa, -sa * 5.0 + ca)
	scarf.rotation = snapped + sway
	var rank_col: Color = Data.rank_color(stats.rank)
	scarf.modulate = Color(1, 0.42, 0.42, alpha) if hurt_flash > 0.0 else Color(rank_col.r, rank_col.g, rank_col.b, alpha)
	_aura_fx(dt, ba, sp)
	# the weapon: held in front (or floating beside you), swings through its arc
	var art: Array = WEAPON_ART[weapon_id]
	var hold := float(art[3])
	var lat := 0.0
	var lift := 0.0
	var off := 0.0
	var spear := weapon_id == "training_spear"
	var key := ""
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
	elif weapon.cls == "ranger":
		hold -= (focus * 2.5 if focusing else 0.0)
		if recoil > 0.0:
			hold -= recoil * 3.0
	else:
		# the book and the staff hover beside you: nothing is held
		var hover := sin(t * 2.6) * 1.6
		if weapon.has("charge"):
			var c: Dictionary = weapon.charge
			var sg := -1.0 if cos(aim) >= 0.0 else 1.0  # rotate towards screen-up
			var idle := {"hold": 8.0, "lat": -14.0, "off": -0.1 + sin(t * 1.7) * 0.05, "lift": -hover}
			var top := func(r: float) -> Dictionary:
				return {"hold": lerpf(8.0, 2.0, r), "lat": lerpf(-14.0, -3.0, r), "off": lerpf(idle.off, sg * 1.25, r), "lift": lerpf(-hover, 9.0, r)}
			var hit := {"hold": 16.0, "lat": -3.0, "off": -sg * 0.55, "lift": -1.0}
			var P: Dictionary = idle
			if slam_t >= 0.0:  # swing down fast, then settle back beside you
				var r2 := _ease_out(clampf(slam_raise * 1.4, 0.0, 1.0))
				if slam_t < SLAM_DOWN:
					var u2 := pow(slam_t / SLAM_DOWN, 2.0)
					P = _mix(top.call(r2), hit, u2)
				else:
					P = _mix(hit, idle, _ease_out((slam_t - SLAM_DOWN) / (SLAM_TOTAL - SLAM_DOWN)))
			elif charging:  # it rises overhead and spins up; once full it shakes with the power in it
				var r3 := _ease_out(clampf(charge_t / float(c.time) * 1.4, 0.0, 1.0))
				P = top.call(r3)
				if charge_full:
					P.lift += 0.6 if int(t * 30.0) % 2 == 1 else -0.6
			hold = P.hold
			lat = P.lat
			off = P.off
			lift = P.lift
			key = "w_staff_" + bl
		else:
			hold = 9.0 + cast_pulse * 6.0
			lat = -13.0
			off = sin(t * 1.9) * 0.12 + cast_pulse * 0.1
			var frame: int = 1 if cast_pulse > 0.2 else [0, 1, 0, 2][int(t * 5.0) % 4]
			key = "w_book_%s_%d" % [bl, frame]
			lift = -hover
	if key != "":
		var tx := Data.tex(key)
		if wpn.texture != tx:
			wpn.texture = tx
	wpn.rotation = aim + off
	var fwd := Vector2.from_angle(aim)
	var perp := Vector2(-fwd.y, fwd.x)
	wpn.position = fwd * hold + perp * lat + Vector2(0.0, -lift)
	wpn.modulate = Color(1, 1, 1, alpha)
	var wg := global_position + wpn.position
	if weapon.has("charge"):
		staff_tip = wg + Vector2.from_angle(wpn.rotation) * 12.5
	elif weapon.cls == "magic":
		book_pos = wg
	# glows and motes: the floating book, the charging staff
	var spell_col := Bless.spell_color(bl)
	float_shadow.visible = weapon.cls == "magic"
	fx_glow.visible = false
	if weapon.cls == "magic":
		float_shadow.global_position = Vector2(roundf(wg.x), roundf(global_position.y + sin(aim) * hold + cos(aim) * lat + 9.0))
		float_shadow.scale = Vector2(2.0 if weapon.has("charge") else 1.0, 1.0)
		float_shadow.modulate = Color(1, 1, 1, 0.26 - sin(t * 2.6) * 0.04)
		var ga := 0.0
		var gs := 0.0
		var gp := wg
		if weapon.has("charge"):
			var pw := clampf(charge_t / float(weapon.charge.time), 0.0, 1.0) if charging else (slam_raise * maxf(0.0, 1.0 - slam_t / SLAM_TOTAL) if slam_t >= 0.0 else 0.0)
			gp = staff_tip
			ga = 0.1 + pw * 0.65
			gs = 0.35 + pw * 0.6
			if charging:
				gather_t -= dt
				if gather_t <= 0.0:
					gather_t = 0.1 - pw * 0.05
					world.gather_fx(staff_tip, spell_col, 14.0 + pw * 8.0)
			elif bl != "none":
				mote_t -= dt
				if mote_t <= 0.0:
					mote_t = 0.3
					world.float_mote(staff_tip + Vector2(randf_range(-3, 3), randf_range(-3, 3)), spell_col)
		else:
			ga = 0.12 + cast_pulse * 0.5
			gs = 0.55 + cast_pulse * 0.25
			mote_t -= dt
			if mote_t <= 0.0 and bl != "none":
				mote_t = 0.16
				world.float_mote(wg + Vector2(randf_range(-6, 6), randf_range(-4, 4)), spell_col)
		fx_glow.visible = true
		fx_glow.global_position = gp
		fx_glow.modulate = Color(spell_col.r, spell_col.g, spell_col.b, ga)
		fx_glow.scale = Vector2.ONE * gs
	ring.queue_redraw()

func _bless_fx(dt: float, bl: String) -> void:
	var on := bl != "none"
	sigil.visible = on
	if on:
		var k := "fx_sigil_%s_%d" % [bl, int(t * 1.5) % 2]
		sigil.texture = Data.tex(k)
		sigil.modulate = Color(1, 1, 1, 0.3 + sin(t * 2.4) * 0.1)
		amb_t -= dt
		if amb_t <= 0.0:
			amb_t = 0.4 + randf() * 0.25
			world.ambient_mote(bl, global_position, Bless.spell_color(bl))
	var gem: bool = on and Game.profile.traits.has("geminis_blessing")  # two stars circle you
	for i in 2:
		twins[i].visible = gem
		if gem:
			var a := t * 2.2 + i * PI
			twins[i].position = Vector2(cos(a) * 15.0, sin(a) * 9.0 - 2.0).round()

func _aura_fx(dt: float, ba: bool, sp: float) -> void:
	aura_glow.visible = ba
	aura_top.visible = ba
	if _was_berserk and not ba:  # the Aura dies down: embers fall, a dark ring and a low sigh
		Game.sfx("aurafade")
		world.burst(global_position, Color("7a1a1a"), 10, 16.0)
		world.ring_fx(global_position, Color("7a1a1a"))
	_was_berserk = ba
	if ba:
		var pu := sin(t * 9.0) * 0.5 + 0.5
		var fl := sin(t * 23.0) * 0.5 + 0.5
		aura_glow.scale = Vector2.ONE * (1.55 + pu * 0.25) * 0.9
		aura_glow.modulate = Color(1, 0.23, 0.16, 0.7 + pu * 0.25)
		aura_top.scale = Vector2.ONE * (0.72 + pu * 0.1)
		aura_top.modulate = Color(1, 0.29, 0.19, 0.22 + fl * 0.14)
		_aura_t -= dt
		if _aura_t <= 0.0:
			_aura_t = 0.07
			world.ember_fx(global_position + Vector2(randf_range(-6, 6), randf_range(-3, 3)), Color("ff3a2a") if randf() < 0.5 else Color("ff8a3a"))
	# a shield is a bubble of light round you: it flares when it soaks a hit and shatters when it breaks
	if shield > 0.0:
		_had_shield = true
		var flare := shield_hit / 0.16 if shield_hit > 0.0 else 0.0
		shield_hit = maxf(0.0, shield_hit - dt)
		var low := (0.4 if int(t * 10.0) % 2 == 1 else 1.0) if shield_until - t < 2.0 else 1.0  # blinks when about to run out
		shield_glow.visible = true
		shield_glow.scale = Vector2.ONE * (0.95 + sin(t * 5.0) * 0.04 + flare * 0.25)
		shield_glow.modulate = Color(0.62, 0.85, 1.0, (0.3 + flare * 0.5) * low)
		shield_ring.visible = true
		shield_ring.modulate = Color(0.5, 0.82, 1.0, 0.5 + sin(t * 6.0) * 0.2)
	else:
		if _had_shield:
			_had_shield = false
			if shield_until > t:  # it was broken, not timed out
				Game.sfx("shieldbreak")
				world.glow_pop(global_position, Color("9fd8ff"), 1.3, 0.26, 0.7)
				world.burst(global_position, Color("9fd8ff"), 14, 22.0)
				world.ring_fx(global_position, Color("9fd8ff"))
		shield_glow.visible = false
		shield_ring.visible = false
	# while a skill is running a few motes drift up off you
	_sk_t -= dt
	if _sk_t <= 0.0:
		_sk_t = 0.32
		for a in active_skills():
			if skill_def(a.id).skill.kind != "berserk":
				world.rise_fx(global_position, Color("ffe27a"), 1, 7.0, 16.0)
				break

## the focus ring round the player: inner ring fills to 100%, an outer ring takes it on to 200%
func _draw_ring() -> void:
	if charging or slam_t >= 0.0:
		_draw_magic_aim()
	if not focusing:
		return
	var f := clampf(focus, 0.0, 2.0)
	var col := Color("ffe27a") if f < 1.0 else (Color("ffb04a") if f < 1.5 else Color("ff6a3a"))
	ring.draw_arc(Vector2.ZERO, 13.0, -PI / 2.0, -PI / 2.0 + TAU * minf(f, 1.0), 40, col, 1.5)
	if f > 1.0:
		ring.draw_arc(Vector2.ZERO, 16.0, -PI / 2.0, -PI / 2.0 + TAU * (f - 1.0), 40, Color("ff6a3a"), 1.5)
	if lock_target != null and is_instance_valid(lock_target) and lock_target.alive:
		var d: Vector2 = lock_target.global_position - global_position
		ring.draw_arc(d, 11.0, 0.0, TAU, 24, Color("ff5a4a"), 1.0)

## the staff's aim help: a dotted line towards where it will go, a reticle on the locked target
func _draw_magic_aim() -> void:
	var f := clampf(charge_t / float(weapon.charge.time), 0.0, 1.0) if charging else slam_raise
	var tg = lock_target if (lock_target != null and is_instance_valid(lock_target) and lock_target.alive) else null
	var from: Vector2 = (staff_tip - global_position) if staff_tip != Vector2.ZERO else Vector2.ZERO
	var to_a: float = (tg.global_position - global_position - from).angle() if tg != null else aim
	var length: float = minf(150.0, (tg.global_position - global_position - from).length()) if tg != null else 110.0
	var col := Color("ffe27a") if tg != null else Color("bfd0ff")
	var d := 14.0
	while d < length:
		var a := 0.12 + 0.5 * f * (1.0 - d / (length + 40.0))
		if a <= 0.0:
			break
		ring.draw_rect(Rect2((from + Vector2.from_angle(to_a) * d).round(), Vector2(1, 1)), Color(col.r, col.g, col.b, a))
		d += 6.0
	if tg != null:
		ring.draw_arc(tg.global_position - global_position, 10.0 + sin(t * 8.0) * 1.0, 0.0, TAU, 24, Color("ffe27a"), 1.0)
