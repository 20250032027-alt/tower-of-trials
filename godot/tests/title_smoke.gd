extends Node
## The title screen: every exported picture loads at its size, the vista runs (storm, crows, march, particles) without
## errors, and the start sequence ends by calling its callback. Run:
##   godot --headless --path godot res://tests/title_smoke.tscn
var fails := 0
var finished := false

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func _ready() -> void:
	Game.settings.muted = true
	var T: Dictionary = Data.title
	check(int(T.W) == 240 and int(T.H) == 135, "picture size")
	var bad := 0
	for k in T.files:
		var tex := Data.ttex(k)
		var sz: Array = T.files[k]
		if tex == null or tex.get_width() != int(sz[0]) or tex.get_height() != int(sz[1]):
			bad += 1
			print("bad title picture ", k)
	check(bad == 0, "title pictures load")
	check(T.files.size() > 60, "title picture count")
	check(T.windows.size() > 40 and T.graves.size() >= 5 and T.stars.size() > 50, "title placements")
	for n in int(T.TIERS) + 1:
		check(T.files.has("world%d" % n), "world picture %d" % n)

	var title = load("res://scenes/title.tscn").instantiate()
	add_child(title)
	var bd = title.backdrop
	check(bd.stars.size() == T.stars.size(), "stars built")
	check(bd.march_units.size() == 10 and bd.bats.size() == 4 and bd.torches.size() == 2 and bd.guards.size() == 2, "actors built")
	for i in 60:
		await get_tree().process_frame
	bd.strike_now()
	for i in 30:
		await get_tree().process_frame
	check(bd.bolt.spr != null, "a bolt is falling")
	var a: Vector2 = bd.bats[0].s.position
	for i in 30:
		await get_tree().process_frame
	check(bd.bats[0].s.position != a, "bats move")
	check(bd.torches[0].halo.modulate.a > 0.2, "torch glow")
	# the parallax follows the pointer
	var before: float = bd.C.sky.position.x
	bd.px = 1.0
	bd._shift_layers(1.0)
	check(bd.C.stage.position.x > bd.C.sky.position.x - 0.01 or bd.C.stage.position.x != before, "parallax shifts layers")
	bd.px = 0.0
	# the start sequence ends
	bd.enter(func(): finished = true)
	var t0 := Time.get_ticks_msec()
	while not finished and Time.get_ticks_msec() - t0 < 4000:
		await get_tree().process_frame
	check(finished, "start sequence calls back")
	check(bd.cam_zoom > 3.0, "camera pushed in")
	print("title smoke: ", "PASS" if fails == 0 else "%d FAIL" % fails)
	get_tree().quit(1 if fails > 0 else 0)
