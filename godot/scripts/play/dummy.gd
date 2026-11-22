extends StaticBody2D
## A training dummy: counts your hits and total damage, never dies.
const Combat = preload("res://scripts/logic/combat.gd")

var world
var alive := true
var is_dummy := true
var marked := false
var radius := 8.0
var hits := 0
var total := 0.0
var wobble := 0.0
var reset_t := 0.0
var spr: Sprite2D
var label: Label

func setup(w, pos: Vector2) -> void:
	world = w
	global_position = pos
	collision_layer = 8
	collision_mask = 0
	var cs := CollisionShape2D.new()
	var c := CircleShape2D.new()
	c.radius = 8.0
	cs.shape = c
	add_child(cs)
	var sh := Sprite2D.new()
	sh.texture = Data.tex("shadow")
	sh.position = Vector2(0, 5)
	add_child(sh)
	spr = Sprite2D.new()
	spr.texture = Data.tex("o_dummy")
	add_child(spr)
	label = Label.new()
	label.add_theme_font_override("font", world.font)
	label.add_theme_font_size_override("font_size", 10)
	label.add_theme_color_override("font_color", Color("f4e7b0"))
	label.add_theme_color_override("font_outline_color", Color("120d0a"))
	label.add_theme_constant_override("outline_size", 3)
	label.position = Vector2(-60, -30)
	label.size = Vector2(120, 12)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.z_index = 40
	add_child(label)

func hurt(damage: float, crit: bool, from_pos: Vector2, _knock: float, _info: Dictionary) -> float:
	var dealt := Combat.after_mitigation(damage, 0.0, 0.0)
	hits += 1
	total += dealt
	wobble = 0.2
	reset_t = 3.0
	world.float_text(global_position + Vector2(randf_range(-5, 5), -8), str(roundi(dealt)), Color("ffd84a") if crit else Color.WHITE, 1.5 if crit else 1.0)
	label.text = "HITS %d  TOTAL %d" % [hits, roundi(total)]
	world.hit_fx(global_position, (global_position - from_pos).angle(), crit)
	return dealt

func _physics_process(dt: float) -> void:
	if wobble > 0.0:
		wobble -= dt
		spr.rotation = sin(wobble * 60.0) * 0.18 * (wobble / 0.2)
	else:
		spr.rotation = 0.0
	if reset_t > 0.0:
		reset_t -= dt
		if reset_t <= 0.0:
			hits = 0
			total = 0.0
			label.text = ""
