extends Node
## Opens the menu, renders every tab, presses the real buttons (equip, awaken, tuning, level), saves and loads. Run:
##   godot --headless --path godot res://tests/menu_smoke.tscn
const Progression = preload("res://scripts/logic/progression.gd")
var play
var fails := 0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func _press(menu, fid: String) -> bool:
	var found: Array = menu._find_fid(menu.content, fid)
	if found.is_empty():
		return false
	(found[0] as Button).pressed.emit()
	return true

func _ready() -> void:
	Game.start_fresh()
	Game.pending = {"kind": "floor", "id": "tutorial"}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().physics_frame
	var m = play.menu
	m.open()
	check(m.is_open and play.frozen == false, "menu opens")
	await get_tree().process_frame
	await get_tree().process_frame
	check(play.frozen, "world freezes while the menu is open")
	for t in m.TABS:
		m._set_tab(t[0])
		await get_tree().process_frame
		check(m.content.get_child_count() > 3, "tab %s has content" % t[0])
	# weapons: equip the bow
	m._set_tab("weapons")
	await get_tree().process_frame
	check(_press(m, "w_training_bow"), "bow button exists")
	check(Game.profile.weapon == "training_bow", "bow equipped")
	# magic is locked without a circle
	var blocked: bool = (m._find_fid(m.content, "w_training_staff").is_empty())  # disabled buttons are skipped
	check(blocked, "staff is locked without a Mana Circle")
	# a magic trait makes the awaken button work
	Game.profile.traits = ["mana_surge"]
	Game.profile.manaCircles = 0
	m._set_tab("magic")
	await get_tree().process_frame
	var ok := false
	for i in 30:
		_press(m, "awaken")
		if int(Game.profile.manaCircles) > 0:
			ok = true
			break
	check(ok, "awaken forms a Mana Circle within 30 tries")
	check(Game.profile.manaType != null, "a mana type is chosen")
	# tuning
	m._set_tab("tuning")
	await get_tree().process_frame
	Game.set_tune("xpRate", 2.0)
	check(is_equal_approx(Game.t("xpRate"), 2.0) and Game.tune_changed("xpRate"), "tuning changes")
	Game.set_tune("dmg_training_sword", 2.0)
	check(is_equal_approx(float(Game.weapons.training_sword.damage), float(Data.weapons.training_sword.damage) * 2.0), "tuning reaches the weapon table")
	Game.reset_tune()
	check(not Game.tune_changed("xpRate"), "tuning resets")
	# demo tab: level + xp
	m._set_tab("demo")
	await get_tree().process_frame
	m.lvl_pick = 20
	_press(m, "setlvl")
	check(int(Game.profile.level) == 20, "set level 20")
	m.close()
	await get_tree().physics_frame
	check(not m.is_open and play.player.weapon_id == "training_bow", "closing applies the loadout")
	check(play.player.stats.level == 20, "player stats follow the new level")
	check(play.player.hp == play.player.stats.maxHealth, "full heal after set level")
	# save + load round trip
	var path := "user://menu_smoke_save.json"
	Game.profile.flags["trialCleared"] = true
	Game.profile.proficiency.melee = 0.25
	check(Progression.save_profile(Game.profile, path), "save writes")
	var back: Dictionary = Progression.load_profile(path)
	check(int(back.level) == 20 and typeof(back.level) == TYPE_INT, "level loads as a whole number")
	check(back.flags.get("trialCleared", false) == true, "flags load")
	check(is_equal_approx(float(back.proficiency.melee), 0.25), "proficiency loads")
	check(back.weapon == "training_bow" and back.ownedWeapons.size() == Game.profile.ownedWeapons.size(), "weapons load")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	# adaptive growth levels
	var p2 := Progression.create_profile()
	p2.traits = ["adaptive_growth"]
	Progression.add_xp(p2, 500.0, 1.0, Game.rng)
	check(Progression.last_adaptive.size() == int(p2.level) - 1 and p2.level > 1, "adaptive growth rolls on every level")
	print("menu smoke: ", "ALL OK" if fails == 0 else "%d FAILED" % fails)
	get_tree().quit(1 if fails > 0 else 0)
