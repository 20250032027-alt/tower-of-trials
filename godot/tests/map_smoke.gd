extends Node
## Goal text + arrow, minimap, fog of war, the full map, cracked walls and the hidden vault, rifts (double dungeons). Run:
##   godot --headless --path godot res://tests/map_smoke.tscn
const Layout = preload("res://scripts/logic/layout.gd")
const Guide = preload("res://scripts/logic/guide.gd")
var play
var fails := 0

func check(ok: bool, what: String) -> void:
	if not ok:
		fails += 1
		print("FAIL ", what)

func frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame
		await get_tree().process_frame

func load_play(spec: Dictionary) -> void:
	if play != null:
		play.queue_free()
		await get_tree().process_frame
	Game.pending = spec
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await frames(2)

## can you walk from `a` to `b` (tile coordinates) without crossing a wall?
func reachable(a: Vector2i, b: Vector2i) -> bool:
	var L: Dictionary = play.layout
	var seen := {a: true}
	var queue: Array = [a]
	while not queue.is_empty():
		var c: Vector2i = queue.pop_back()
		if c == b:
			return true
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = c + d
			if n.x < 0 or n.y < 0 or n.x >= L.w or n.y >= L.h or seen.has(n):
				continue
			if Layout.is_wall(L.tiles[n.y * L.w + n.x]):
				continue
			seen[n] = true
			queue.append(n)
	return false

func _ready() -> void:
	Game.start_fresh()
	# ---- the tutorial goal, step by step
	await load_play({"kind": "floor", "id": "tutorial"})
	var f: Dictionary = Game.profile.flags
	check(Guide.objective(play).text.begins_with("Move"), "first goal: move")
	play.player.global_position += Vector2(60, 0)
	await frames(3)
	check(f.get("tutMoved", false), "walking sets tutMoved")
	Game.profile.traits = []
	var o: Dictionary = Guide.objective(play)
	check(o.text.contains("LOADOUT") and o.target != null, "no traits: go to the loadout altar")
	Game.profile.traits = ["quick_study"] if Data.trait_by_id.has("quick_study") else [Data.traits[0].id]
	o = Guide.objective(play)
	check(o.text.contains("Hit a dummy") and o.target is Vector2, "then: hit a dummy (points at it)")
	f["tutHit"] = true
	check(Guide.objective(play).text.contains("Roll"), "then: roll")
	f["tutDodged"] = true
	check(Guide.objective(play).text.contains("Trial of Bones") and Guide.objective(play).target != null, "then: the Trial")
	f["trialCleared"] = true
	check(Guide.objective(play).text.contains("Floor 1"), "then: the stairs to Floor 1")
	# ---- fog of war and the minimap
	var mm = play.minimap
	var seen0: int = mm.explored_count()
	check(seen0 > 0, "the ground around you is explored at the start (%d tiles)" % seen0)
	check(Game.explored.has(play.map_key), "explored tiles are kept in Game.explored")
	check(mm.markers.size() > 0 and mm.markers[mm.markers.size() - 1].kind == "player", "the player is a marker")
	mm.reveal(play.layout.w - 3, play.layout.h - 3)
	check(mm.explored_count() > seen0, "walking somewhere new reveals more")
	await get_tree().process_frame
	# ---- the full map pauses the world
	mm.set_big(true)
	await frames(2)
	check(play.frozen, "the world waits while the full map is open")
	mm.set_big(false)
	await frames(2)
	check(not play.frozen, "and goes on when it closes")
	# ---- Floor 1: the arrow, the cracked wall, the hidden vault
	Game.profile.level = 3
	await load_play({"kind": "floor", "id": "floor1"})
	f = Game.profile.flags
	o = Guide.objective(play)
	check(o.text.contains("BONE HALL") and o.target != null, "floor 1 goal: warm up in the Bone Hall")
	await frames(2)
	check(play.pointer.visible != play.goal_ring.visible, "exactly one of the arrow and the ring shows")
	Game.settings.guide = false
	await frames(2)
	check(not play.pointer.visible and not play.goal_ring.visible and play.hud.obj_text == "", "guide off: no arrow, no chip")
	Game.settings.guide = true
	check(play.crack_hp.size() == 1, "floor 1 has one sealed crack")
	var hidden_key: String = play.poi_hidden.keys()[0]
	var hp_tile := Vector2i(int(play.poi[hidden_key].x / 16), int(play.poi[hidden_key].y / 16))
	var spawn: Vector2i = play.layout.spawn
	check(not reachable(spawn, hp_tile), "the vault is sealed off")
	check(play.poi_hidden.size() == 1 and not mm_explored(hp_tile), "the vault is not on the map yet")
	var ck: Vector2i = play.crack_hp.keys()[0]
	var cpos: Vector2 = play.tile_center(ck.x, ck.y)
	play.hit_crack_tile(ck.x, ck.y)
	play.wall_hit(cpos)                                   # a shot hitting the wall
	check(play.crack_hp.has(ck) and play.crack_hp[ck] == 1, "two hits leave the wall standing")
	play.crack_hit(cpos + Vector2(-14, 0), 0.0, 40.0, 0.8)  # a sword swing
	check(not play.crack_hp.has(ck), "the third hit breaks it")
	check(f.get("cracked_floor1", false) and f.get("hiddenOpened", false), "the flags remember it")
	check(reachable(spawn, hp_tile), "now you can walk to the hidden vault")
	await load_play({"kind": "floor", "id": "floor1"})
	check(play.crack_hp.is_empty(), "the wall stays open when you come back")
	# ---- a rift: roll, enter, state kept, leave
	Game.profile.demo.doubleAlways = true
	var dspec := {"kind": "dungeon", "id": "bone_hall", "return_floor": "floor1", "return_tile": Vector2i(10, 10)}
	await load_play(dspec)
	check(play.run.get("rift") != null, "demo switch: this dungeon holds a rift")
	var rift: Dictionary = play.run.rift
	check(play.poi.has("rift") and not Layout.is_wall(play.layout.tiles[rift.y * play.layout.w + rift.x]), "the rift stands on floor")
	var first_enemy = play.enemy_list[0]
	var idx: int = first_enemy.idx
	first_enemy._die(false)
	check(play.run.killed.has(idx), "a kill is written into the run")
	var rs: Dictionary = play.rift_spec()
	check(rs.kind == "dungeon" and Data.dungeons[rs.id].kind == "double", "the rift leads to a double dungeon (%s)" % rs.id)
	check(rs.parent.id == "bone_hall" and rs.parent.tile == Vector2i(rift.x, rift.y) and rs.return_floor == "floor1", "it remembers the way back")
	var seed1: int = play.seed_value
	await load_play(rs)
	check(play.dun.kind == "double" and play.run_key != "", "inside the double dungeon")
	check(play.run.get("rift") == null and not play.run.has("rift"), "no rift inside a rift")
	check(play.enemy_list.size() > 0, "it has skeletons")
	var back: Dictionary = play.leave_spec()
	check(back.id == "bone_hall" and back.seed == seed1 and back.spawn_tile == Vector2i(rift.x, rift.y), "the exit goes back to the same dungeon, at the rift")
	check(Game.runs["bone_hall:%d" % seed1].get("rift") != null, "an uncleared rift stays open")
	await load_play(back)
	check(play.seed_value == seed1 and play.run.killed.has(idx), "the dungeon is as you left it (the dead stay dead)")
	check(play.enemy_list.size() == play.layout.enemies.size() - 1, "one skeleton fewer")
	check(play.player.global_position.distance_to(play.tile_center(rift.x, rift.y)) < 2.0, "you step out of the rift")
	# clear the rift for good
	await load_play(rs)
	play.cleared = true
	back = play.leave_spec()
	check(Game.runs["bone_hall:%d" % seed1].get("rift") == null, "a cleared rift closes")
	await load_play(back)
	check(not play.poi.has("rift"), "and is gone from the dungeon")
	# leaving a dungeon for good ends its run
	var out: Dictionary = play.leave_spec()
	check(out.kind == "floor" and out.id == "floor1" and not Game.runs.has("bone_hall:%d" % seed1), "leaving the dungeon ends its run")
	# hidden vault + its music flag come from the data
	await load_play({"kind": "dungeon", "id": "hidden_vault", "return_floor": "floor1"})
	check(play.dun.kind == "hidden", "the hidden vault loads")
	print("map smoke: ", "ALL OK" if fails == 0 else "%d FAILED" % fails)
	get_tree().quit(1 if fails > 0 else 0)

func mm_explored(t: Vector2i) -> bool:
	return play.minimap.is_explored(t.x, t.y)
