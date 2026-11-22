extends Node
## The touch overlay presses the same actions as keyboard and pad: move stick, aim-and-attack stick, buttons, map tap. Run:
##   godot --headless --path godot res://tests/touch_smoke.tscn
var play
var fails := 0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame
		await get_tree().process_frame

func touch(idx: int, pos: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = idx
	e.position = pos
	e.pressed = pressed
	Input.parse_input_event(e)
	Input.flush_buffered_events()

func drag(idx: int, pos: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = idx
	e.position = pos
	Input.parse_input_event(e)
	Input.flush_buffered_events()

func has_mouse_attack() -> bool:
	for e in InputMap.action_get_events("attack"):
		if e is InputEventMouseButton:
			return true
	return false

func _ready() -> void:
	Game.start_fresh()
	Game.settings.touch = "on"
	Game.pending = {"kind": "floor", "id": "tutorial"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await frames(3)
	check(play.touch.enabled and Controls.using_touch and Controls.using_pad, "touch mode is on")
	check(not has_mouse_attack(), "the mouse click no longer attacks (a touch also arrives as a click)")
	# move stick
	var p0: Vector2 = play.player.global_position
	touch(0, Vector2(80, 200), true)
	drag(0, Vector2(120, 200))
	await frames(2)
	var mv: Vector2 = Controls.move_vector()
	check(mv.x > 0.9 and absf(mv.y) < 0.2, "dragging the left stick right moves right (%s)" % str(mv))
	await frames(12)
	check(play.player.global_position.x > p0.x + 4.0, "and the Trialist walks")
	drag(0, Vector2(80, 170))
	await frames(2)
	check(Controls.move_vector().y < -0.9, "up is up")
	touch(0, Vector2(80, 170), false)
	await frames(2)
	check(Controls.move_vector().length() < 0.05, "let go: it stops")
	# aim + attack stick
	touch(1, Vector2(360, 100), true)
	await frames(1)
	check(Input.is_action_pressed("attack"), "holding the right side attacks")
	drag(1, Vector2(390, 100))
	await frames(1)
	check(Controls.aim_vector().x > 0.9, "dragging aims")
	touch(1, Vector2(390, 100), false)
	await frames(2)
	check(not Input.is_action_pressed("attack") and Controls.aim_vector().length() < 0.05, "let go: it stops")
	# buttons
	touch(2, Vector2(446, 228), true)
	check(Input.is_action_pressed("dodge"), "ROLL presses dodge")
	touch(2, Vector2(446, 228), false)
	touch(3, Vector2(406, 200), true)
	check(Input.is_action_pressed("swap_weapon"), "SWAP presses swap")
	touch(3, Vector2(406, 200), false)
	# a tap on the minimap opens the full map; a tap closes it
	touch(4, Vector2(440, 60), true)
	await frames(2)
	touch(4, Vector2(440, 60), false)
	await frames(2)
	check(play.minimap.big_open, "tapping the minimap opens the full map")
	touch(5, Vector2(240, 135), true)
	await frames(2)
	touch(5, Vector2(240, 135), false)
	await frames(4)
	check(not play.minimap.big_open, "a tap closes it")
	# off: the mouse attacks again
	Game.settings.touch = "off"
	await frames(3)
	check(not play.touch.enabled and has_mouse_attack(), "touch off: the mouse click attacks again")
	Game.settings.touch = "auto"
	print("touch smoke: ", "ALL OK" if fails == 0 else "%d FAILED" % fails)
	get_tree().quit(1 if fails > 0 else 0)
