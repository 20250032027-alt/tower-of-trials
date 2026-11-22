extends Node
## Every sound the game asks for exists, loads and plays; music loops, intensity cross-fades, stingers. Run:
##   godot --headless --path godot res://tests/sound_smoke.tscn
var fails := 0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func _scripts(dir: String, out: Array) -> void:
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append(dir + "/" + f)
	for d in DirAccess.get_directories_at(dir):
		_scripts(dir + "/" + d, out)

func _ready() -> void:
	Game.start_fresh()
	var snd = get_node("/root/Sound")
	var m: Dictionary = snd.manifest
	check(m.sfx.size() > 100 and m.music.size() == 5 and m.stingers.size() >= 3, "the manifest lists the rendered sounds (%d sfx, %d tracks, %d stingers)" % [m.sfx.size(), m.music.size(), m.stingers.size()])
	# every file loads
	var bad := 0
	for key in m.sfx:
		for f in m.sfx[key]:
			if not (load("res://assets/audio/sfx/" + f) is AudioStream):
				bad += 1
	for t in m.music:
		for f in m.music[t].files:
			if not (load("res://assets/audio/music/" + f) is AudioStream):
				bad += 1
	for s in m.stingers:
		if not (load("res://assets/audio/stingers/" + m.stingers[s]) is AudioStream):
			bad += 1
	check(bad == 0, "every audio file loads (%d broken)" % bad)
	# every sound name the game scripts ask for has a rendered sound
	var files: Array = []
	_scripts("res://scripts", files)
	var re := RegEx.new()
	re.compile("(?:Game\\.sfx|\\bsfx)\\(\"([a-z_]+)\"")
	var names := {}
	for f in files:
		var txt := FileAccess.get_file_as_string(f)
		for r in re.search_all(txt):
			names[r.get_string(1)] = f
	for n in names:
		check(snd.key_for(n, {"weapon": "training_sword", "mat": "bone", "dir": 1, "step": 3, "power": 0.5}) != "", "sound \"%s\" (asked for in %s) has a rendered file" % [n, String(names[n]).get_file()])
	# the option-driven ones resolve for every weapon
	for w in Data.weapons:
		check(snd.key_for("hit", {"weapon": w, "mat": "bone"}) != "" and snd.key_for("hit", {"weapon": w, "mat": "wood", "crit": true}) != "", "hit sound for " + w)
		if Data.weapons[w].cls != "melee":
			check(snd.key_for("shoot", {"weapon": w}) != "" or Data.weapons[w].cls == "magic", "shoot sound for " + w)
	check(snd.key_for("shoot", {"weapon": "training_bow", "power": 0.1}) != snd.key_for("shoot", {"weapon": "training_bow", "power": 1.0}), "a full draw sounds different to a quick shot")
	# playing
	for key in ["ui", "swing", "hit", "kill", "step", "xp", "thunder"]:
		snd.play_sfx(key, {"weapon": "training_claymore", "mat": "bone", "at": Vector2(100, 100)})
	await get_tree().process_frame
	snd._last_at.clear()
	snd.play_sfx("swing", {"weapon": "training_sword"})
	var t0 := int(snd._last_at.get("swing", 0))
	snd.play_sfx("swing", {"weapon": "training_sword"})
	check(int(snd._last_at.get("swing", 0)) == t0, "the same sound twice within its gap plays once")
	Game.settings.muted = true
	snd._last_at.clear()
	snd.play_sfx("ui")
	check(not snd._last_at.has("ui"), "muted: nothing plays")
	Game.settings.muted = false
	# music
	snd.play_music("dungeon", 0.1)
	await get_tree().process_frame
	check(snd._music.track == "dungeon" and snd._music.players.size() == 3, "the dungeon theme has three intensity loops")
	check(snd._music.players[0].playing and (snd._music.players[0].stream as AudioStreamOggVorbis).loop, "and they loop")
	snd.threat(2)
	check(snd._music.level == 2, "a fight raises the music at once")
	snd.threat(0)
	check(snd._music.level == 2, "it does not drop the moment it is calm")
	snd.reset_threat()
	check(snd._music.level == 0, "a new place starts calm")
	snd.play_music("hub", 0.1)
	check(snd._music.track == "hub" and snd._music.players.size() == 1, "the hub has one loop")
	snd.stinger("clear")
	snd.muffle(true)
	snd.apply_settings()
	snd.stop_music(0.1)
	print("sound smoke: ", "ALL OK" if fails == 0 else "%d FAILED" % fails)
	get_tree().quit(1 if fails > 0 else 0)
