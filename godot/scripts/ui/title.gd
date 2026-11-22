extends Node2D
## A small title screen: pick START and the game begins on the Tutorial Floor.
var font: Font = Data.font
var t := 0.0

func _ready() -> void:
	var bg := Sprite2D.new()
	bg.texture = Data.tex("tiles_trial")
	bg.region_enabled = true
	bg.region_rect = Rect2(0, 0, 16, 16)
	bg.visible = false
	add_child(bg)
	var hero := Sprite2D.new()
	hero.texture = Data.tex("hero_icon")
	hero.position = Vector2(240, 120)
	hero.scale = Vector2.ONE * 4.0
	hero.name = "Hero"
	add_child(hero)

func _process(dt: float) -> void:
	t += dt
	$Hero.position.y = 120 + sin(t * 2.0) * 3.0
	queue_redraw()
	if Input.is_action_just_pressed("interact") or Input.is_action_just_pressed("attack") or Input.is_action_just_pressed("menu") or Input.is_action_just_pressed("ui_accept"):
		set_process(false)
		Game.new_game()
		Game.go_play({"kind": "floor", "id": "tutorial"})

func _draw() -> void:
	draw_string(font, Vector2(0, 52), "TOWER OF [TRIALS]", HORIZONTAL_ALIGNMENT_CENTER, 480, 20, Color("ffe27a"))
	draw_string(font, Vector2(0, 70), "GODOT PORT  -  FIRST PLAYABLE SLICE", HORIZONTAL_ALIGNMENT_CENTER, 480, 10, Color("c9a24a"))
	var blink := int(t * 2.0) % 2 == 0
	if blink:
		var key := "PRESS A" if Controls.using_pad else "PRESS E, CLICK OR ENTER"
		draw_string(font, Vector2(0, 200), key + " TO START", HORIZONTAL_ALIGNMENT_CENTER, 480, 10, Color.WHITE)
	draw_string(font, Vector2(0, 232), "MOVE WASD / LEFT STICK     AIM MOUSE / RIGHT STICK", HORIZONTAL_ALIGNMENT_CENTER, 480, 10, Color(1, 1, 1, 0.5))
	draw_string(font, Vector2(0, 246), "ATTACK CLICK / RT     ROLL SPACE / B     USE E / A", HORIZONTAL_ALIGNMENT_CENTER, 480, 10, Color(1, 1, 1, 0.5))
