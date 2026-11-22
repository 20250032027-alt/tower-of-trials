extends Node
## Saves screenshots of the main screens to /tmp/godot_shots (needs a display; on a server use xvfb):
##   xvfb-run -a godot --path godot --rendering-driver opengl3 res://tests/screenshots.tscn
var play
var n := 0

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/%s.png" % name)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot_shots")
	var title: Node = load("res://scenes/title.tscn").instantiate()
	add_child(title)
	await get_tree().create_timer(0.8).timeout
	await _shot("1_title")
	title.queue_free()
	Game.pending = {"kind": "floor", "id": "tutorial"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.4).timeout
	for it in play.interactables:
		if String(it.prompt.call()).contains("READ SIGN"):
			play.player.global_position = it.pos
			break
	await get_tree().create_timer(0.3).timeout
	await _shot("2_sign_prompt")
	play.hud.show_dialog("SWORD AURA", "Melee users can unleash BERSERK (key R).\nIt burns 2.5% Physical Force per second.\nPhysical Force is split into 4 Aura Cores (25% each).\nEmpty = Life Force Decay.   Ending early = Exhaustion.")
	await get_tree().create_timer(0.2).timeout
	await _shot("3_dialog")
	play.hud.close_dialog()
	Game.profile.traits = ["mana_surge"]
	play.menu.open()
	for t in ["status", "traits", "weapons", "magic", "tower", "help", "tuning", "demo"]:
		play.menu._set_tab(t)
		await get_tree().create_timer(0.25).timeout
		await _shot("menu_" + t)
	play.menu.close()
	play.queue_free()
	# a fight in the Bone Hall (floor 1 dungeon: soldiers and lancers)
	Game.pending = {"kind": "dungeon", "id": "bone_hall", "seed": 3}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.3).timeout
	var p = play.player
	var e = play.enemy_list[0]
	p.global_position = e.global_position + Vector2(-70, 6)
	e.notice()
	Controls.using_pad = true
	Input.action_press("attack")
	await get_tree().create_timer(1.1).timeout
	await _shot("5_fight")
	await get_tree().create_timer(0.4).timeout
	await _shot("6_fight2")
	Input.action_release("attack")
	get_tree().quit()
