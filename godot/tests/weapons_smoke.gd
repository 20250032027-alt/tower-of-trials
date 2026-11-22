extends Node
## Every weapon against a training dummy for three seconds: each must land hits. Run:  godot --headless --path godot res://tests/weapons_smoke.tscn
var play
var ids := ["training_sword", "training_claymore", "training_spear", "training_bow", "basic_crossbow", "one_time_pistol", "m4"]
var idx := 0
var frames := 0
var results := {}
var dummy

func _ready() -> void:
	Game.pending = {"kind": "floor", "id": "tutorial"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().physics_frame
	Controls.using_pad = true # auto-aim, since there is no mouse here
	dummy = play.dummy_list[0]
	_next()

func _next() -> void:
	Input.action_release("attack")
	if idx >= ids.size():
		var bad := 0
		for id in ids:
			print("%-18s hits %3d  damage %7.1f" % [id, results[id].hits, results[id].total])
			if results[id].hits == 0:
				bad += 1
		print("%d weapons, %d never hit" % [ids.size(), bad])
		get_tree().quit(1 if bad > 0 else 0)
		return
	var p = play.player
	p.set_weapon(ids[idx])
	p.stamina = p.stats.maxStamina
	p.global_position = dummy.global_position + Vector2(-60, 0)
	p.velocity = Vector2.ZERO
	if Game.weapons[ids[idx]].cls == "melee":
		p.global_position = dummy.global_position + Vector2(-18, 0)
	dummy.hits = 0
	dummy.total = 0.0
	frames = 0
	Input.action_press("attack")

func _physics_process(_dt: float) -> void:
	if idx >= ids.size():
		return
	frames += 1
	var p = play.player
	p.stamina = p.stats.maxStamina
	# bow and pistol: hold to focus, let go to shoot (tap every 90 frames)
	var w: Dictionary = Game.weapons[ids[idx]]
	if w.cls == "ranger" and not w.get("auto", false):
		if frames % 90 == 60:
			Input.action_release("attack")
		elif frames % 90 == 0:
			Input.action_press("attack")
	if frames > 270:
		results[ids[idx]] = {"hits": dummy.hits if frames > 0 else 0, "total": dummy.total}
		idx += 1
		_next()
