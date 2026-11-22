extends Node
## Run:  godot --headless --path godot res://tests/run_tests.tscn   (it must run as a scene so the Data / Game autoloads exist)
## Checks the GDScript logic against the web game: the layouts that src/logic/layout.js built (tests/fixtures, written by
## `npm run godot:export`) must come out identical here, plus the damage / stats maths.
const Layout = preload("res://scripts/logic/layout.gd")
const Rng = preload("res://scripts/logic/rng.gd")
const Stats = preload("res://scripts/logic/stats.gd")
const Combat = preload("res://scripts/logic/combat.gd")
const FocusLogic = preload("res://scripts/logic/focus.gd")

var fails := 0
var checks := 0
var data
var game

func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		fails += 1
		print("  FAIL: ", msg)

func near(a: float, b: float, eps: float = 1e-6) -> bool:
	return absf(a - b) <= eps

func _ready() -> void:
	data = get_tree().root.get_node_or_null("Data")
	game = get_tree().root.get_node_or_null("Game")
	ok(data != null, "autoload Data exists")
	if data == null:
		get_tree().quit(1)
		return
	test_rng()
	test_layouts()
	test_random_def()
	test_maths()
	test_data()
	print("%d checks, %d failed" % [checks, fails])
	get_tree().quit(1 if fails > 0 else 0)

func test_rng() -> void:
	print("rng")
	# first values of makeRng(1) in src/logic/rng.js (mulberry32)
	var r = Rng.new(1)
	var got := [r.next(), r.next(), r.next()]
	var want := [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]
	for i in 3:
		ok(near(got[i], want[i], 1e-9), "mulberry32 value %d: %s vs %s" % [i, got[i], want[i]])
	var r2 = Rng.new(5)
	for i in 100:
		var v: int = r2.int_range(3, 7)
		ok(v >= 3 and v <= 7, "int_range stays inside")

func _fixture(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/%s.json" % name))

func _same_layout(name: String, built: Dictionary, fx: Dictionary) -> void:
	ok(built.w == int(fx.w) and built.h == int(fx.h), name + ": size")
	var same_tiles := true
	var first_bad := -1
	for i in built.tiles.size():
		if built.tiles[i] != int(fx.tiles[i]):
			same_tiles = false
			first_bad = i
			break
	ok(same_tiles, name + ": tiles (first difference at %d)" % first_bad)
	ok(built.spawn.x == int(fx.spawn.x) and built.spawn.y == int(fx.spawn.y), name + ": spawn")
	ok(built.objects.size() == fx.objects.size(), name + ": object count %d vs %d" % [built.objects.size(), fx.objects.size()])
	for i in mini(built.objects.size(), fx.objects.size()):
		var a: Dictionary = built.objects[i]
		var b: Dictionary = fx.objects[i]
		ok(a.type == b.type and a.x == int(b.x) and a.y == int(b.y), name + ": object %d %s@%s,%s vs %s@%s,%s" % [i, a.type, a.x, a.y, b.type, b.x, b.y])
	ok(built.enemies.size() == fx.enemies.size(), name + ": enemy count %d vs %d" % [built.enemies.size(), fx.enemies.size()])
	for i in mini(built.enemies.size(), fx.enemies.size()):
		var a: Dictionary = built.enemies[i]
		var b: Dictionary = fx.enemies[i]
		ok(a.x == int(b.x) and a.y == int(b.y) and a.room == b.room, name + ": enemy %d at %d,%d vs %d,%d" % [i, a.x, a.y, int(b.x), int(b.y)])

func test_layouts() -> void:
	print("layouts (same seed = same map as the web game)")
	for name in ["layout_tutorial", "layout_trial", "layout_main", "layout_random_42"]:
		var fx := _fixture(name)
		var built: Dictionary = Layout.build(fx.def, int(fx.seed))
		_same_layout(name, built, fx)
		var spot: Dictionary = Layout.pick_rift_spot(built, Rng.new(int(fx.seed) ^ 0x9e3779b9))
		ok(spot.x == int(fx.rift.x) and spot.y == int(fx.rift.y) and String(spot.room) == String(fx.rift.room), "%s: the rift opens in the same place (%d,%d)" % [name, spot.x, spot.y])

func test_random_def() -> void:
	print("random dungeon description")
	var fx := _fixture("layout_random_42")
	var def: Dictionary = Layout.generate_random_def(42, 1)
	ok(def.rooms.size() == fx.def.rooms.size(), "random_42: room count %d vs %d" % [def.rooms.size(), fx.def.rooms.size()])
	for i in mini(def.rooms.size(), fx.def.rooms.size()):
		var a: Dictionary = def.rooms[i]
		var b: Dictionary = fx.def.rooms[i]
		ok(a.x == int(b.x) and a.y == int(b.y) and a.w == int(b.w) and a.h == int(b.h), "random_42: room %d geometry" % i)
		ok(int(a.get("enemies", 0)) == int(b.get("enemies", 0)), "random_42: room %d enemies" % i)
	ok(def.links.size() == fx.def.links.size(), "random_42: link count")

func test_maths() -> void:
	print("maths")
	var s: Dictionary = Stats.compute(1)
	ok(near(s.maxHealth, 100.0), "level 1 health 100")
	ok(near(s.defense, 10.0), "level 1 defense 10")
	ok(near(s.critRate, 0.15), "level 1 crit rate")
	var s10: Dictionary = Stats.compute(11)
	ok(near(s10.maxHealth, 150.0), "level 11 health +50%%: %s" % s10.maxHealth)
	ok(s10.rank == "E", "level 11 is rank E")
	ok(near(Combat.apply_defense(100.0, 100.0), 50.0), "defense 100 halves damage")
	var f: Dictionary = FocusLogic.tick(0.0, 1.0, 1.0, 1.0, true)
	ok(near(f.focus, 0.4), "focus after 1s at 100%% speed is 40%%: %s" % f.focus)
	var d: Dictionary = data.enemies.skeleton_soldier
	var es: Dictionary = Stats.compute_enemy(d, 3, 1.0)
	ok(near(es.maxHealth, 60.0 * 1.1), "skeleton at level 3 has +10%% health")
	var rng = Rng.new(3)
	var atk: Dictionary = Combat.player_attack(game.weapons.training_sword, Stats.compute(1), 1.0, {}, rng)
	ok(atk.damage >= 12.0 * 0.99, "sword hit is about 12 or more: %s" % atk.damage)

func test_data() -> void:
	print("data")
	ok(data.floors.size() == 11, "11 floors")
	ok(data.dungeons.has("trial") and data.dungeons.has("main"), "dungeons loaded")
	ok(data.weapons.size() >= 9, "weapons loaded")
	ok(data.traits.size() > 20, "traits loaded: %d" % data.traits.size())
	ok(data.skills.size() > 20, "skills loaded: %d" % data.skills.size())
	ok(data.pick_enemy_type("tutorial", 0.9) == "skeleton_soldier", "tutorial: soldiers only")
	ok(data.tex("player") != null, "sprite player loads")
	ok(data.tex("tiles_trial") != null, "tileset loads")
