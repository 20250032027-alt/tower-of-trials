extends Node
## Sound effects and music. The files are rendered from the web game's own synthesiser by tools/godot/render_audio.mjs
## (godot/assets/audio, listed in data/audio.json); this plays them with the same rules as src/game/sfx.js:
## a minimum gap per sound, quiet "soft" sounds that duck under big events, no variant twice in a row, volume and
## stereo position by distance. Music: one loop per track (three intensity loops for dungeons, cross-faded as the fight heats up).
const AUDIO := "res://assets/audio/"
const VOICES := 28
# gap = minimum ms between plays, pv = random pitch spread, soft = ducks under big events, duck = how hard this ducks soft ones
const META := {
	"hit": {"gap": 30, "pv": 0.07}, "crit": {"gap": 30, "pv": 0.05}, "swing": {"gap": 40}, "heavy": {"gap": 40},
	"shoot": {"gap": 40}, "gun": {"gap": 40}, "kill": {"gap": 60},
	"hurt": {"duck": 0.5, "pv": 0.05}, "levelup": {"duck": 0.6, "pv": 0.0}, "berserk": {"duck": 0.5, "pv": 0.03},
	"crumble": {"duck": 0.4}, "thunder": {"duck": 0.3, "pv": 0.1}, "rare": {"duck": 0.4, "pv": 0.0}, "portal": {"duck": 0.3, "pv": 0.02},
	"xp": {"gap": 24, "pv": 0.0, "soft": true}, "step": {"gap": 60, "pv": 0.12, "soft": true},
	"erattle": {"gap": 120, "pv": 0.1, "soft": true}, "heartbeat": {"soft": true, "pv": 0.02},
	"notice": {"gap": 200}, "windup": {"gap": 150}, "ui": {"gap": 30, "soft": true}, "deny": {"gap": 80},
	"tick": {"gap": 25, "soft": true}, "wheelclose": {"gap": 80}, "ready": {"gap": 300}, "expire": {"gap": 200},
	"dry": {"gap": 120}, "lock": {"gap": 90, "soft": true}, "slam": {"gap": 120}, "magewind": {"gap": 200}, "overfocus": {"gap": 250},
}
const DEFAULT_PV := 0.06

var manifest: Dictionary = {}
var streams: Dictionary = {}       # file path -> AudioStream
var voices: Array = []
var _next_voice := 0
var _last_at: Dictionary = {}
var _last_variant: Dictionary = {}
var _duck_tween: Tween
var _music_duck_tween: Tween
var _soft_bus := -1
var _music: Dictionary = {}        # {track, players: Array, level, tween}
var _old_music: Array = []
var _level := 0                    # combat intensity 0 explore / 1 alert / 2 fight
var _low_since := 0
var _lowpass: AudioEffectLowPassFilter
var enabled := true

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var path := "res://data/audio.json"
	if FileAccess.file_exists(path):
		manifest = JSON.parse_string(FileAccess.get_file_as_string(path))
	_build_buses()
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = &"SFX"
		add_child(p)
		voices.append(p)
	apply_settings()

func _build_buses() -> void:
	for n in ["Music", "SFX", "Soft"]:
		if AudioServer.get_bus_index(n) < 0:
			AudioServer.add_bus()
			AudioServer.set_bus_name(AudioServer.bus_count - 1, n)
	AudioServer.set_bus_send(AudioServer.get_bus_index("Soft"), "SFX")
	_soft_bus = AudioServer.get_bus_index("Soft")
	_lowpass = AudioEffectLowPassFilter.new()
	_lowpass.cutoff_hz = 20000.0
	var mi := AudioServer.get_bus_index("Music")
	if AudioServer.get_bus_effect_count(mi) == 0:
		AudioServer.add_bus_effect(mi, _lowpass)
	else:
		_lowpass = AudioServer.get_bus_effect(mi, 0)
	if AudioServer.get_bus_effect_count(0) == 0 and ClassDB.class_exists("AudioEffectHardLimiter"):
		var lim = ClassDB.instantiate("AudioEffectHardLimiter")
		lim.ceiling_db = -1.0
		AudioServer.add_bus_effect(0, lim)

## the sliders and the mute switch (same curves as the web game)
func apply_settings() -> void:
	var s: Dictionary = Game.settings
	var muted: bool = s.muted
	var sfx_g := pow(clampf(float(s.sfx_vol), 0.0, 1.0), 1.5)
	var mus_g := pow(clampf(float(s.music_vol), 0.0, 1.0), 1.6) / pow(0.7, 1.6)   # the loops are rendered at the 70% setting
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("SFX"), linear_to_db(maxf(0.0001, sfx_g)))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), linear_to_db(maxf(0.0001, mus_g)))
	AudioServer.set_bus_mute(AudioServer.get_bus_index("SFX"), muted)
	AudioServer.set_bus_mute(AudioServer.get_bus_index("Music"), muted)

func _stream(file: String) -> AudioStream:
	if not streams.has(file):
		streams[file] = load(file) if ResourceLoader.exists(file) else null
	return streams[file]

# ------------------------------------------------------------------ sound effects
## which rendered sound a (name, options) pair means; "" if there is none
func key_for(sound_name: String, o: Dictionary) -> String:
	var sfx: Dictionary = manifest.get("sfx", {})
	var w := String(o.get("weapon", ""))
	var key := sound_name
	match sound_name:
		"swing":
			key = "swing:" + (w if sfx.has("swing:" + w) else "training_sword")
		"heavy":
			key = "swing:training_claymore"
		"hit", "crit":
			var mat := String(o.get("mat", "bone"))
			var kind := "crit" if (sound_name == "crit" or o.get("crit", false)) else "hit"
			key = "%s:%s:%s" % [kind, w if sfx.has("hit:%s:%s" % [w, mat]) else "training_sword", mat]
		"shoot", "gun":
			if sound_name == "gun":
				w = "one_time_pistol"
			if w == "training_bow" or not sfx.has("shoot:" + w):
				if w == "training_bow" or w == "":
					var pw := float(o.get("power", 0.5))
					key = "shoot:training_bow:%d" % (0 if pw < 0.33 else (1 if pw < 0.8 else 2))
				else:
					key = "shoot:one_time_pistol"
			else:
				key = "shoot:" + w
		"magic", "cast":
			key = "%s:%s" % [sound_name, w if sfx.has("%s:%s" % [sound_name, w]) else "training_mage_book"]
		"xp":
			key = "xp:%d" % clampi(int(o.get("step", 0)), 0, 8)
		"tick":
			key = "tick:" + ("up" if int(o.get("dir", 1)) > 0 else "down")
	return key if sfx.has(key) else ""

func play_sfx(sound_name: String, o: Dictionary = {}) -> void:
	if not enabled or Game.settings.muted:
		return
	var key := key_for(sound_name, o)
	if key == "":
		return
	var m: Dictionary = META.get(sound_name, {})
	var now := Time.get_ticks_msec()
	var gap: int = int(m.get("gap", 0))
	if gap > 0 and now - int(_last_at.get(sound_name, -1000000)) < gap:
		return
	var vol := float(o.get("vol", 1.0))
	var pan := 0.0
	var at = o.get("at")
	if at != null:
		var pl = _listener()
		if pl != null:
			var d: Vector2 = at - pl
			var g := _distance_gain(d.length(), 50.0, 360.0)
			if g <= 0.02:
				return
			vol *= g
			pan = clampf(d.x / 220.0, -0.8, 0.8)
	_last_at[sound_name] = now
	var files: Array = manifest.sfx[key]
	var v := 0
	if files.size() > 1:
		v = randi() % files.size()
		if v == int(_last_variant.get(key, -1)):
			v = (v + 1 + randi() % (files.size() - 1)) % files.size()
		_last_variant[key] = v
	var st := _stream(AUDIO + "sfx/" + String(files[v]))
	if st == null:
		return
	var pv: float = float(m.get("pv", DEFAULT_PV))
	var pitch := float(o.get("pitch", 1.0)) * (1.0 + randf_range(-pv, pv) * 0.5)
	var soft: bool = m.get("soft", false)
	var bus: StringName = &"Soft" if soft else &"SFX"
	var db := linear_to_db(maxf(0.0001, vol))
	var sc := get_tree().current_scene
	if at != null and sc is Node2D:
		# positioned: Godot pans it for us (the listener follows the camera)
		var p2 := AudioStreamPlayer2D.new()
		p2.stream = st
		p2.bus = bus
		p2.volume_db = db
		p2.pitch_scale = clampf(pitch, 0.5, 2.0)
		p2.attenuation = 0.0
		p2.max_distance = 400.0
		p2.panning_strength = clampf(absf(pan) * 1.25, 0.0, 1.0) if pan != 0.0 else 1.0
		sc.add_child(p2)
		p2.global_position = at
		p2.finished.connect(p2.queue_free)
		p2.play()
	else:
		var player: AudioStreamPlayer = voices[_next_voice]
		_next_voice = (_next_voice + 1) % voices.size()
		player.stream = st
		player.bus = bus
		player.volume_db = db
		player.pitch_scale = clampf(pitch, 0.5, 2.0)
		player.play()
	if m.has("duck"):
		_duck(float(m.duck))

func _listener() -> Variant:
	var sc := get_tree().current_scene
	if sc != null and sc.get("player") != null and is_instance_valid(sc.player):
		return sc.player.global_position
	return null

func _distance_gain(dist: float, near: float, far: float) -> float:
	if dist <= near:
		return 1.0
	if dist >= far:
		return 0.0
	return pow(1.0 - (dist - near) / (far - near), 1.6)

## quiet sounds get out of the way of big events
func _duck(amount: float) -> void:
	if _soft_bus < 0:
		return
	if _duck_tween != null and _duck_tween.is_valid():
		_duck_tween.kill()
	AudioServer.set_bus_volume_db(_soft_bus, linear_to_db(maxf(0.0001, 1.0 - amount)))
	_duck_tween = create_tween()
	_duck_tween.tween_interval(0.28)
	_duck_tween.tween_method(func(g: float): AudioServer.set_bus_volume_db(_soft_bus, linear_to_db(maxf(0.0001, g))), 1.0 - amount, 1.0, 0.45)

# ------------------------------------------------------------------ music
func play_music(track: String, fade: float = 1.8) -> void:
	var info: Dictionary = manifest.get("music", {}).get(track, {})
	if info.is_empty():
		return
	if _music.has("track") and _music.track == track:
		return
	var players: Array = []
	for f in info.files:
		var st = _stream(AUDIO + "music/" + String(f))
		if st == null:
			continue
		if st is AudioStreamOggVorbis:
			st.loop = true
		var p := AudioStreamPlayer.new()
		p.stream = st
		p.bus = &"Music"
		p.volume_db = -80.0
		add_child(p)
		players.append(p)
	if players.is_empty():
		return
	var family: bool = info.get("family", false)
	var lvl: int = mini(_level, players.size() - 1) if family else 0
	_retire_current(fade)
	for p in players:
		p.play()
	var tw := create_tween().set_parallel(true)
	for i in players.size():
		tw.tween_property(players[i], "volume_db", 0.0 if i == lvl else -80.0, fade)
	_music = {"track": track, "players": players, "level": lvl, "family": family}

func _retire_current(fade: float) -> void:
	if _music.is_empty():
		return
	var old: Array = _music.players
	var tw := create_tween().set_parallel(true)
	for p in old:
		tw.tween_property(p, "volume_db", -80.0, fade * 0.9)
	tw.chain().tween_callback(func():
		for p in old:
			if is_instance_valid(p):
				p.queue_free())
	_music = {}

func stop_music(fade: float = 1.2) -> void:
	_retire_current(fade)

## combat intensity from the scene (0 exploring, 1 something is onto you, 2 a real fight); rises at once, falls one step after 3.5 s of calm
func threat(target: int) -> void:
	var now := Time.get_ticks_msec()
	if target > _level:
		_level = target
		_low_since = 0
		_apply_level(0.35)
	elif target < _level:
		if _low_since == 0:
			_low_since = now
		if now - _low_since > 3500:
			_level -= 1
			_low_since = now
			_apply_level(1.4)
	else:
		_low_since = 0

func reset_threat() -> void:
	_level = 0
	_low_since = 0
	_apply_level(0.8)

func _apply_level(seconds: float) -> void:
	if _music.is_empty() or not _music.family:
		return
	var ps: Array = _music.players
	var lvl := mini(_level, ps.size() - 1)
	if lvl == _music.level:
		return
	_music.level = lvl
	var tw := create_tween().set_parallel(true)
	for i in ps.size():
		tw.tween_property(ps[i], "volume_db", 0.0 if i == lvl else -80.0, seconds)

## the menu muffles the music (and tucks it back a little)
func muffle(on: bool) -> void:
	if _lowpass == null:
		return
	var tw := create_tween()
	tw.tween_property(_lowpass, "cutoff_hz", 700.0 if on else 20000.0, 0.2 if on else 0.3)

## a short musical moment over the top of the music ("start", "clear", "death")
func stinger(stinger_name: String) -> void:
	if Game.settings.muted:
		return
	var f = manifest.get("stingers", {}).get(stinger_name)
	if f == null:
		return
	var st := _stream(AUDIO + "stingers/" + String(f))
	if st == null:
		return
	var p := AudioStreamPlayer.new()
	p.stream = st
	p.bus = &"Music"
	p.volume_db = 6.0
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()
	_duck_music(0.6, 3.2)

func _duck_music(amount: float, hold: float) -> void:
	if _music.is_empty():
		return
	if _music_duck_tween != null and _music_duck_tween.is_valid():
		_music_duck_tween.kill()
	var p: AudioStreamPlayer = _music.players[_music.level]
	_music_duck_tween = create_tween()
	_music_duck_tween.tween_property(p, "volume_db", linear_to_db(1.0 - amount), 0.1)
	_music_duck_tween.tween_interval(hold)
	_music_duck_tween.tween_property(p, "volume_db", 0.0, 1.2)
