extends Node
## Screenshots of the goal chip, arrow, minimap and the full map (needs a display; on a server use xvfb).
var play

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/%s.png" % name)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot_shots")
	Game.start_fresh()
	Game.profile.level = 3
	Game.pending = {"kind": "floor", "id": "floor1"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.6).timeout
	await _shot("m1_floor1")
	var cp: Vector2 = play.tile_center(14, 7)
	play.player.global_position = cp + Vector2(-70, 0)
	play.crack_hp.clear()
	await get_tree().create_timer(0.8).timeout
	await _shot("m2_floor1_walk")
	play.minimap.set_big(true)
	await get_tree().create_timer(0.3).timeout
	await _shot("m3_bigmap")
	play.minimap.set_big(false)
	Game.profile.demo.doubleAlways = true
	play.queue_free()
	await get_tree().process_frame
	Game.pending = {"kind": "dungeon", "id": "bone_hall", "seed": 3}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.6).timeout
	play.player.global_position = play.tile_center(play.run.rift.x, play.run.rift.y) + Vector2(-40, 0)
	await get_tree().create_timer(0.8).timeout
	await _shot("m4_dungeon_rift")
	get_tree().quit()
