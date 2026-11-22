extends Node
## Screenshot of the touch controls (needs a display; on a server use xvfb).
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot_shots")
	Game.start_fresh()
	Game.settings.touch = "on"
	Game.pending = {"kind": "dungeon", "id": "bone_hall", "seed": 3}
	var play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.8).timeout
	var e := InputEventScreenTouch.new()
	e.index = 0
	e.position = Vector2(90, 200)
	e.pressed = true
	Input.parse_input_event(e)
	var d := InputEventScreenDrag.new()
	d.index = 0
	d.position = Vector2(112, 190)
	Input.parse_input_event(d)
	var e2 := InputEventScreenTouch.new()
	e2.index = 1
	e2.position = Vector2(330, 140)
	e2.pressed = true
	Input.parse_input_event(e2)
	await get_tree().create_timer(0.4).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/t1_touch.png")
	get_tree().quit()
