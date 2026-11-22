extends Node
## Run-wide state: the player profile, settings, live tuning numbers, and moving between scenes.
const Rng = preload("res://scripts/logic/rng.gd")
const Progression = preload("res://scripts/logic/progression.gd")

var profile: Dictionary
var rng
var settings := {"auto_aim": true, "lock_on": true, "rumble": true}
var tuning: Dictionary = {}
var weapons: Dictionary = {}   # Data.weapons with the tuning numbers applied
var pending: Dictionary = {}   # what the Play scene should build next
var runs: Dictionary = {}
var _fade: ColorRect

func _ready() -> void:
	rng = Rng.new(randi())
	for g in Data.tuning_groups:
		for it in g.items:
			tuning[it.key] = float(it.def)
	apply_tuning()
	new_game()
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_fade)

func new_game() -> void:
	profile = Progression.create_profile()
	profile.traits = Progression.roll_run_traits(rng, int(Data.constants.TRAIT_SLOTS))
	runs.clear()

## a tuning number (see data/tuning.json)
func t(key: String) -> float:
	return float(tuning.get(key, 1.0))

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
	fade_to("res://scenes/play.tscn")

func go_title() -> void:
	fade_to("res://scenes/title.tscn")
