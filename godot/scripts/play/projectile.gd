extends Node2D
## An arrow, bolt, bullet or enemy orb flying in a straight line. Walls stop it; it hits the first target it touches.
## Player shots hurt enemies and dummies; enemy shots hurt the player (and fly through a dodge roll).

var world
var vel := Vector2.ZERO
var from_player := true
var radius := 2.5
var life := 2.5
var damage := 0.0
var crit := false
var focus := 1.0
var knock := 40.0
var spr: Sprite2D
var halo: Sprite2D

func setup(w, pos: Vector2, angle: float, speed: float, tex_key: String, player_owned: bool, r: float = 2.5, tint: Color = Color.WHITE) -> void:
	world = w
	global_position = pos
	vel = Vector2.from_angle(angle) * speed
	from_player = player_owned
	radius = r
	z_index = 12
	spr = Sprite2D.new()
	spr.texture = Data.tex(tex_key)
	spr.modulate = tint
	spr.rotation = angle if tex_key != "p_enemy" else 0.0
	add_child(spr)
	halo = Sprite2D.new()
	halo.texture = Data.tex("fx_glow")
	halo.material = CanvasItemMaterial.new()
	halo.material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	halo.scale = Vector2.ONE * (0.7 if tex_key == "p_enemy" else 0.35)
	halo.modulate = Color(tint.r, tint.g, tint.b, 0.5)
	add_child(halo)

func _physics_process(dt: float) -> void:
	if world.frozen:
		return
	life -= dt
	if life <= 0.0:
		queue_free()
		return
	# move in small steps so a fast bullet cannot skip through a wall or an enemy
	var dist := vel.length() * dt
	var steps := maxi(1, int(ceil(dist / 4.0)))
	for i in steps:
		global_position += vel * dt / steps
		if world.is_wall_at(global_position):
			world.impact_fx(global_position, vel.angle())
			queue_free()
			return
		if from_player:
			for tg in world.targets():
				if tg.alive and tg.global_position.distance_to(global_position) < tg.radius + radius:
					world.player.hit_target(tg, knock, focus)
					world.impact_fx(global_position, vel.angle())
					queue_free()
					return
		else:
			var p = world.player
			if not p.dead and p.invuln <= 0.0 and p.global_position.distance_to(global_position) < p.radius + radius:
				p.take_hit(damage, crit, global_position - vel.normalized() * 10.0)
				world.impact_fx(global_position, vel.angle())
				queue_free()
				return
