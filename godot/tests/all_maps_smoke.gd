extends Node
## Builds every floor and every dungeon in the data for a few frames, to catch missing sprites or unknown objects.
## Run:  godot --headless --path godot res://tests/all_maps_smoke.tscn
const KNOWN := ["sign", "dummy", "altar", "portal", "exit", "chest"]

func _ready() -> void:
	var play_scene: PackedScene = load("res://scenes/play.tscn")
	var built := 0
	var bad := 0
	var specs: Array = []
	for id in Data.floors:
		specs.append({"kind": "floor", "id": id})
	for id in Data.dungeons:
		specs.append({"kind": "dungeon", "id": id, "seed": 11})
	for s in specs:
		Game.pending = s
		var p = play_scene.instantiate()
		add_child(p)
		for o in p.layout.objects:
			if not KNOWN.has(o.type):
				bad += 1
				print("unknown object type: ", o.type, " in ", s.id)
		if p.player == null or p.player.global_position == Vector2.ZERO:
			bad += 1
			print("no player in ", s.id)
		if p.is_wall_at(p.player.global_position):
			bad += 1
			print("player spawns inside a wall in ", s.id)
		await get_tree().physics_frame
		await get_tree().physics_frame
		p.queue_free()
		built += 1
	print("built %d maps, %d problems" % [built, bad])
	get_tree().quit(1 if bad > 0 else 0)
