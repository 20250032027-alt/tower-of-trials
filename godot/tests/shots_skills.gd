extends Node
## Screenshots of the skill wheel, the Aura, the book and the staff (needs a display; on a server use xvfb).
var play

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/godot_shots/%s.png" % name)

func _crop(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var sp := Vector2(240, 135)
	var c := img.get_region(Rect2i(clampi(int(sp.x) - 50, 0, 380), clampi(int(sp.y) - 50, 0, 170), 100, 100))
	c.resize(400, 400, Image.INTERPOLATE_NEAREST)
	c.save_png("/tmp/godot_shots/%s.png" % name)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot_shots")
	Game.start_fresh()
	Game.profile.manaCircles = 2
	Game.profile.manaType = "natural"
	Game.profile.level = 20
	Game.pending = {"kind": "dungeon", "id": "bone_hall", "seed": 3}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().create_timer(0.4).timeout
	var p = play.player
	play.camera.limit_left = -100000
	play.camera.limit_top = -100000
	play.camera.limit_right = 100000
	play.camera.limit_bottom = 100000
	p.refresh_stats()
	p.mana = p.stats.maxMana
	p.hp = p.stats.maxHealth
	var e = play.enemy_list[0]
	p.global_position = e.global_position + Vector2(-80, 6)
	Controls.using_pad = true
	p.set_weapon("training_sword")
	p.toggle_berserk()
	p.use_skill("guardians_door")
	p.use_skill("iron_body")
	await get_tree().create_timer(0.5).timeout
	await _shot("s1_aura")
	await _crop("c1_aura")
	play.open_wheel()
	play.wheel_idx = 5
	await get_tree().create_timer(0.3).timeout
	await _shot("s2_wheel")
	play.close_wheel()
	p.set_weapon("training_mage_book")
	await get_tree().create_timer(0.3).timeout
	Input.action_press("attack")
	await get_tree().create_timer(0.35).timeout
	await _shot("s3_book")
	await _crop("c3_book")
	Input.action_release("attack")
	p.set_weapon("training_staff")
	p.mana = p.stats.maxMana
	p.cd.clear()
	await get_tree().create_timer(0.3).timeout
	Input.action_press("attack")
	await get_tree().create_timer(1.0).timeout
	await _shot("s4_staff_charge")
	await _crop("c4_staff")
	Input.action_release("attack")
	await get_tree().create_timer(0.12).timeout
	await _shot("s5_staff_slam")
	await get_tree().create_timer(0.35).timeout
	await _shot("s6_staff_fly")
	get_tree().quit()
