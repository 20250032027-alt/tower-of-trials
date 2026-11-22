extends Node
## Run-wide state: the player profile, settings, live tuning numbers, save files, and moving between scenes.
const Rng = preload("res://scripts/logic/rng.gd")
const Progression = preload("res://scripts/logic/progression.gd")

const SAVE_PATH := "user://save.json"
const SETTINGS_PATH := "user://settings.json"
const DEFAULT_SETTINGS := {
	"guide": true, "minimap": true, "auto_aim": true, "lock_on": true, "rumble": true,
	"muted": false, "music_vol": 0.7, "sfx_vol": 1.0, "shake": 0.3, "trait_mode": "random", "zoom": 0,
}

var profile: Dictionary
var rng
var settings: Dictionary = DEFAULT_SETTINGS.duplicate()
var tuning: Dictionary = {}
var tune_defaults: Dictionary = {}
var tune_items: Dictionary = {}  # key -> item dict
var weapons: Dictionary = {}   # Data.weapons with the tuning numbers applied
var pending: Dictionary = {}   # what the Play scene should build next
var runs: Dictionary = {}      # dungeon runs kept while you step into a double dungeon and come back
var explored: Dictionary = {}  # minimap fog of war per map
var first_run := false
var pending_heal := false
var autosave := true
var _fade: ColorRect

func _ready() -> void:
	rng = Rng.new(randi())
	autosave = DisplayServer.get_name() != "headless"
	for g in Data.tuning_groups:
		for it in g.items:
			tune_items[it.key] = it
			tune_defaults[it.key] = float(it.def)
			tuning[it.key] = float(it.def)
	if autosave:
		load_settings()
	apply_tuning()
	profile = Progression.create_profile()
	profile.traits = Progression.roll_run_traits(rng, int(Data.constants.TRAIT_SLOTS))
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_fade)

# ------------------------------------------------------------------ the profile
func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func save_summary() -> Dictionary:
	return Progression.load_profile(SAVE_PATH)

func persist() -> void:
	if autosave:
		Progression.save_profile(profile, SAVE_PATH)

func clear_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))

## a brand new run: new profile, a trait is dealt (in "random" mode), the save is erased
func start_fresh() -> void:
	clear_save()
	profile = Progression.create_profile()
	runs.clear()
	explored.clear()
	first_run = true
	deal_traits()

func new_game() -> void:
	start_fresh()
	first_run = false

## "random" mode: deal a trait by rarity and give one free reroll. false in "pick myself" mode
func deal_traits(exclude: Array = []) -> bool:
	if settings.trait_mode == "pick":
		return false
	profile.traits = Progression.roll_run_traits(rng, int(Data.constants.TRAIT_SLOTS), exclude)
	profile.rerolls = 1
	profile.awakened = false
	return true

func continue_save() -> bool:
	var p := Progression.load_profile(SAVE_PATH)
	if p.is_empty():
		return false
	profile = p
	runs.clear()
	explored.clear()
	first_run = false
	profile.traits = profile.traits.slice(0, 1)
	if profile.traits.is_empty():
		deal_traits()
	return true

# ------------------------------------------------------------------ settings + tuning (one file, user://settings.json)
func load_settings() -> void:
	if not FileAccess.file_exists(SETTINGS_PATH):
		return
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.READ)
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		return
	for k in DEFAULT_SETTINGS:
		if parsed.has(k):
			settings[k] = parsed[k]
	var tn: Variant = parsed.get("tuning", {})
	if tn is Dictionary:
		for k in tn:
			if tuning.has(k):
				tuning[k] = float(tn[k])

func save_settings() -> void:
	if not autosave:
		return
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if f == null:
		return
	var out: Dictionary = settings.duplicate()
	var changed := {}
	for k in tuning:
		if tune_changed(k):
			changed[k] = tuning[k]
	out["tuning"] = changed
	f.store_string(JSON.stringify(out))

## the screen shake setting (0..1) scales every shake
func shake_scale() -> float:
	return float(settings.shake)

# ------------------------------------------------------------------ tuning
## a tuning number (see data/tuning.json)
func t(key: String) -> float:
	return float(tuning.get(key, 1.0))

func tune_changed(key: String) -> bool:
	return not is_equal_approx(float(tuning.get(key, 0.0)), float(tune_defaults.get(key, 0.0)))

func set_tune(key: String, v: float) -> void:
	if not tune_items.has(key):
		return
	tuning[key] = clampf(v, float(tune_items[key].min), float(tune_items[key].max))
	apply_tuning()
	save_settings()

func reset_tune(key: String = "") -> void:
	if key == "":
		for k in tune_defaults:
			tuning[k] = tune_defaults[k]
	elif tune_defaults.has(key):
		tuning[key] = tune_defaults[key]
	apply_tuning()
	save_settings()

func tune_text(item: Dictionary, v: float) -> String:
	match String(item.get("fmt", "")):
		"x":
			return ("%.2f" % v).rstrip("0").rstrip(".") + "x"
		"s":
			return ("%.2f" % v).rstrip("0").rstrip(".") + "s"
	return str(roundi(v)) + String(item.get("fmt", ""))

func tune_json() -> String:
	var out := {}
	for k in tuning:
		out[k] = tuning[k]
	return JSON.stringify(out, "  ")

## copy the weapon table and apply tuning (damage multipliers, spear reach, focus times ...), like applyTuning() in tuning.js
func apply_tuning() -> void:
	weapons = Data.weapons.duplicate(true)
	for id in weapons:
		weapons[id]["damage"] = float(weapons[id].get("damage", 0.0)) * t("dmg_" + id)
	var secs: float = float(Data.constants.FOCUS.secondsTo100)
	weapons.training_spear.range = t("spearRange")
	weapons.training_bow.focusRate = secs / t("bowSec")
	weapons.one_time_pistol.focusRate = secs / t("pistolSec")
	weapons.basic_crossbow.cooldown = t("crossbowSec")
	weapons.m4.cooldown = t("m4Sec")

# ------------------------------------------------------------------ sound (forwarded to the Sound autoload)
func sfx(sound_name: String, opts: Dictionary = {}) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.play_sfx(sound_name, opts)

func start_music(track: String, fade: float = 1.8) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.play_music(track, fade)

func stop_music(fade: float = 1.2) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.stop_music(fade)

func stinger(stinger_name: String) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.stinger(stinger_name)

## combat intensity for the music (0 exploring, 1 hunted, 2 fighting)
func threat(level: int) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.threat(level)

func reset_threat() -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.reset_threat()

func muffle(on: bool) -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.muffle(on)

func apply_audio() -> void:
	var s := get_node_or_null("/root/Sound")
	if s != null:
		s.apply_settings()

# ------------------------------------------------------------------ moving between scenes
func fade_to(scene_path: String) -> void:
	var tw := create_tween()
	tw.tween_property(_fade, "color:a", 1.0, 0.25)
	await tw.finished
	get_tree().change_scene_to_file(scene_path)
	await get_tree().process_frame
	var tw2 := create_tween()
	tw2.tween_property(_fade, "color:a", 0.0, 0.35)

## go to a floor / dungeon: {kind: "floor"|"dungeon", id, seed?, spawn_tile?, return_floor?, return_tile?}
func go_play(spec: Dictionary) -> void:
	pending = spec
	persist()
	fade_to("res://scenes/play.tscn")

func go_title() -> void:
	persist()
	fade_to("res://scenes/title.tscn")
