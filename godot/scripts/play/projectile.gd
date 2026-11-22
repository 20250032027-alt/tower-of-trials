extends Node2D
## An arrow, bolt, bullet, spell or enemy orb flying along. Walls stop it; it hits the first target it touches.
## Player shots hurt enemies and dummies (and can home in on a target, or burst); enemy shots hurt the player (and fly through a dodge roll).

var world
var vel := Vector2.ZERO
var from_player := true
var radius := 2.5
var life := 2.5
var damage := 0.0
var crit := false
var focus := 1.0
var knock := 40.0
var weapon_def = null   # the weapon it left (you may have swapped since)
var mult := 1.0
var aoe = null          # {r, dmg}: bursts where it lands
var home = null         # steers towards this target
var home_rate := 2.0
var color := Color.WHITE
var spr: Sprite2D
var halo: Sprite2D
var _trail_every := 0.0
var _trail_color := Color.WHITE
var _trail_life := 0.12
var _trail_t := 0.0

func setup(w, pos: Vector2, angle: float, speed: float, tex_key: String, player_owned: bool, r: float = 2.5, tint: Color = Color.WHITE) -> void:
	world = w
	global_position = pos
	vel = Vector2.from_angle(angle) * speed
	from_player = player_owned
	radius = r
	z_index = 12
	spr = Sprite2D.new()
	spr.texture = Data.tex(tex_key)
	spr.rotation = angle if tex_key != "p_enemy" else 0.0
	add_child(spr)
	if tex_key.begins_with("p_sp_"):
		tint = Color(tint.r, tint.g, tint.b)
	halo = Sprite2D.new()
	halo.texture = Data.tex("fx_glow")
	halo.material = CanvasItemMaterial.new()
	halo.material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	halo.scale = Vector2.ONE * (0.7 if tex_key == "p_enemy" else (0.5 if tex_key.begins_with("p_sp_") else 0.35))
	halo.modulate = Color(tint.r, tint.g, tint.b, 0.5)
	add_child(halo)

func set_trail(every: float, c: Color, life_seconds: float) -> void:
	_trail_every = every
	_trail_color = c
	_trail_life = life_seconds

func _physics_process(dt: float) -> void:
	if world.frozen:
		return
	life -= dt
	if life <= 0.0:
		queue_free()
		return
	if home != null:
		if is_instance_valid(home) and home.alive:
			var want: float = (home.global_position - global_position).angle()
			var cur := vel.angle()
			var step := home_rate * dt
			var diff := angle_difference(cur, want)
			vel = Vector2.from_angle(cur + clampf(diff, -step, step)) * vel.length()
			if spr.rotation != 0.0 or true:
				pass
		else:
			home = null
	if _trail_every > 0.0:
		_trail_t -= dt
		if _trail_t <= 0.0:
			_trail_t = _trail_every
			world._particle("fx_dot", global_position, Vector2.ZERO, _trail_life, _trail_color, 0.4, true)
	# move in small steps so a fast bullet cannot skip through a wall or an enemy
	var dist := vel.length() * dt
	var steps := maxi(1, int(ceil(dist / 4.0)))
	for i in steps:
		global_position += vel * dt / steps
		if world.is_wall_at(global_position):
			world.impact_fx(global_position, vel.angle())
			if aoe != null:
				world.player.projectile_burst(self)
			queue_free()
			return
		if from_player:
			for tg in world.targets():
				if tg.alive and tg.global_position.distance_to(global_position) < tg.radius + radius:
					world.player.projectile_hit(self, tg)
					queue_free()
					return
		else:
			var p = world.player
			if not p.dead and p.invuln <= 0.0 and p.global_position.distance_to(global_position) < p.radius + radius:
				p.take_hit(damage, crit, global_position - vel.normalized() * 10.0)
				world.impact_fx(global_position, vel.angle())
				queue_free()
				return
