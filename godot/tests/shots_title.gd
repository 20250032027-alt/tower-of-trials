extends Node
## Screenshots of the title screen (needs a display; on a server use xvfb).
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot_shots")
	Game.settings.muted = true
	var title = load("res://scenes/title.tscn").instantiate()
	add_child(title)
	await get_tree().create_timer(1.5).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/title_a.png")
	await get_tree().create_timer(2.6).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/title_b.png")
	title.backdrop.strike_now()
	await get_tree().create_timer(0.12).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/title_bolt.png")
	title.backdrop.enter(func(): pass)
	await get_tree().create_timer(1.05).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/title_enter1.png")
	await get_tree().create_timer(0.55).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/title_enter2.png")
	get_tree().quit()
