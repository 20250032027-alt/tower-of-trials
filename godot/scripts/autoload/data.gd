extends Node
## Loads the JSON that tools/godot/export.mjs wrote from the web game (data/*.json) and the sprites (assets/art/*.png).
## To change a number for both versions, edit the web source and run `npm run godot:export`.

const TS := 16 # tile size in pixels

var constants: Dictionary
var weapons: Dictionary
var enemies: Dictionary
var enemy_mix: Dictionary
var traits: Array
var trait_by_id: Dictionary = {}
var skills: Array
var tuning_groups: Array
var themes: Dictionary
var floors: Dictionary
var dungeons: Dictionary
var rift_of: Dictionary
var tower: Array
var _tex: Dictionary = {}
## the web game's pixel font. 10 px = one pixel per font cell, 20 px = double.
var font: FontFile

func _init() -> void:
	font = load("res://assets/fonts/pixel-ui.ttf")
	font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
	font.hinting = TextServer.HINTING_NONE
	font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	constants = _read("constants")
	weapons = _read("weapons")
	var e: Dictionary = _read("enemies")
	enemies = e.ENEMIES
	enemy_mix = e.ENEMY_MIX
	traits = _read("traits").TRAITS
	for t in traits:
		trait_by_id[t.id] = t
	skills = _read("skills").SKILLS
	tuning_groups = _read("tuning")
	themes = _read("themes")
	var w: Dictionary = _read("world")
	floors = w.FLOORS
	dungeons = w.DUNGEONS
	rift_of = w.RIFT_OF
	tower = w.TOWER

func _read(name: String) -> Variant:
	var path := "res://data/%s.json" % name
	var f := FileAccess.open(path, FileAccess.READ)
	assert(f != null, "missing " + path + " (run: npm run godot:export)")
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	assert(parsed != null, "bad json in " + path)
	return parsed

## a sprite by its name in the web catalog, e.g. tex("player") or tex("w_sword")
func tex(key: String) -> Texture2D:
	if _tex.has(key):
		return _tex[key]
	var t: Texture2D = load("res://assets/art/%s.png" % key)
	_tex[key] = t
	return t

func rank_of_level(level: int) -> String:
	for r in constants.RANKS:
		if level >= int(r.min) and level <= int(r.max):
			return r.rank
	return "F"

func rank_range(rank: String) -> Dictionary:
	for r in constants.RANKS:
		if r.rank == rank:
			return {"min": int(r.min), "max": int(r.max)}
	return {"min": 1, "max": 10}

func rank_color(rank: String) -> Color:
	return Color(constants.RANK_COLORS.get(rank, "#ffffff"))

## which skeleton stands at a spawn on this floor; u is a random number in [0, 1)
func pick_enemy_type(floor_id: String, u: float) -> String:
	var mix: Dictionary = enemy_mix.get(floor_id, enemy_mix.later)
	var total := 0.0
	for id in mix:
		total += float(mix[id])
	var x := u * total
	for id in mix:
		x -= float(mix[id])
		if x < 0.0:
			return id
	return mix.keys()[0]

## "#rrggbb" or 0xrrggbb -> Color
func hex_color(v: Variant) -> Color:
	if v is String:
		return Color(v)
	return Color.hex((int(v) << 8) | 0xFF)
