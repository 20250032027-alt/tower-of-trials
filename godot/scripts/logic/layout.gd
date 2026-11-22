extends RefCounted
## Turns a room / corridor description (data/world.json) into a tile grid plus the things standing on it.
## Port of src/logic/layout.js: same steps, same random calls, so the same seed gives the same map.

const Rng = preload("res://scripts/logic/rng.gd")

const FLOOR_A := 0
const FLOOR_B := 1
const FLOOR_C := 2
const WALL_EDGE := 3
const WALL_DEEP := 4
const CRACK := 5

static func is_wall(t: int) -> bool:
	return t >= WALL_EDGE

static func _center(r: Dictionary) -> Vector2i:
	return Vector2i(int(r.x) + int(floor(int(r.w) / 2.0)), int(r.y) + int(floor(int(r.h) / 2.0)))

static func _carve(solid: PackedByteArray, w: int, h: int, x0: int, y0: int, x1: int, y1: int) -> void:
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if x >= 1 and y >= 1 and x < w - 1 and y < h - 1:
				solid[y * w + x] = 0

static func build(def: Dictionary, seed_value: int = 1) -> Dictionary:
	var rng = Rng.new(seed_value)
	var w := int(def.w)
	var h := int(def.h)
	var cw := int(def.get("corridor", 2))
	var solid := PackedByteArray()
	solid.resize(w * h)
	solid.fill(1)
	var rooms_def: Array = def.rooms
	var by_id := {}
	for r in rooms_def:
		by_id[r.id] = r
	for r in rooms_def:
		_carve(solid, w, h, int(r.x), int(r.y), int(r.x) + int(r.w) - 1, int(r.y) + int(r.h) - 1)
	for link in def.get("links", []):
		var a := _center(by_id[link[0]])
		var b := _center(by_id[link[1]])
		var mode: String = link[2] if link.size() > 2 else "h"
		if mode == "h":
			_carve(solid, w, h, mini(a.x, b.x), a.y, maxi(a.x, b.x), a.y + cw - 1)
			_carve(solid, w, h, b.x, mini(a.y, b.y), b.x + cw - 1, maxi(a.y, b.y))
		else:
			_carve(solid, w, h, a.x, mini(a.y, b.y), a.x + cw - 1, maxi(a.y, b.y))
			_carve(solid, w, h, mini(a.x, b.x), b.y, maxi(a.x, b.x), b.y + cw - 1)
	# pillars: 2x2 blocks of wall inside a room
	for r in rooms_def:
		for p in r.get("pillars", []):
			for yy in 2:
				for xx in 2:
					var px := int(r.x) + int(p[0]) + xx
					var py := int(r.y) + int(p[1]) + yy
					if px >= 1 and py >= 1 and px < w - 1 and py < h - 1:
						solid[py * w + px] = 1
	var cracks: Array = []
	for c in def.get("cracks", []):
		cracks.append({"x": int(c.x), "y": int(c.y)})
		solid[int(c.y) * w + int(c.x)] = 1

	var tiles := PackedInt32Array()
	tiles.resize(w * h)
	for y in h:
		for x in w:
			if solid[y * w + x] == 0:
				var hsh: int = ((x * 73856093) ^ (y * 19349663) ^ (seed_value * 83492791)) & 0xFFFFFFFF
				var v := hsh % 100
				tiles[y * w + x] = FLOOR_A if v < 76 else (FLOOR_B if v < 94 else FLOOR_C)
			else:
				var near := false
				for oy in range(-1, 2):
					for ox in range(-1, 2):
						var fx := x + ox
						var fy := y + oy
						if fx >= 0 and fy >= 0 and fx < w and fy < h and solid[fy * w + fx] == 0:
							near = true
				tiles[y * w + x] = WALL_EDGE if near else WALL_DEEP
	for c in cracks:
		tiles[c.y * w + c.x] = CRACK

	# things standing in rooms
	var occupied := {}
	var objects: Array = []
	var enemies: Array = []
	var rooms: Array = []
	for r in rooms_def:
		var c := _center(r)
		rooms.append({"id": r.id, "x": int(r.x), "y": int(r.y), "w": int(r.w), "h": int(r.h), "role": r.get("role", ""), "cx": c.x, "cy": c.y, "enemies": int(r.get("enemies", 0))})
	for r in rooms_def:
		for o in r.get("objects", []):
			var obj: Dictionary = o.duplicate(true)
			obj["type"] = obj["t"]
			var ox := int(r.x) + int(obj["dx"])
			var oy := int(r.y) + int(obj["dy"])
			obj.erase("t")
			obj.erase("dx")
			obj.erase("dy")
			obj["x"] = ox
			obj["y"] = oy
			objects.append(obj)
			occupied["%d,%d" % [ox, oy]] = true

	var spawn := Vector2i(-1, -1)
	for r in rooms_def:
		var c := _center(r)
		if r.get("role", "") == "start":
			spawn = c
		if r.get("role", "") == "exit":
			objects.append({"type": "exit", "x": c.x, "y": c.y})
			occupied["%d,%d" % [c.x, c.y]] = true
	if spawn.x < 0:
		spawn = _center(rooms_def[0])
	occupied["%d,%d" % [spawn.x, spawn.y]] = true

	for r in rooms_def:
		var placed: Array = []
		for i in int(r.get("enemies", 0)):
			var p = _random_floor_tile(rng, solid, w, h, r, 1, placed, occupied)
			if p == null:
				continue
			placed.append(p)
			occupied["%d,%d" % [p.x, p.y]] = true
			enemies.append({"x": p.x, "y": p.y, "room": r.id, "levelBonus": int(r.get("levelBonus", 0))})
		var chests := (1 if r.get("chest", false) else 0) + int(r.get("extraChests", 0))
		for i in chests:
			var p = _random_floor_tile(rng, solid, w, h, r, 1, [], occupied)
			if p == null:
				continue
			occupied["%d,%d" % [p.x, p.y]] = true
			objects.append({"type": "chest", "x": p.x, "y": p.y})
	return {"w": w, "h": h, "tiles": tiles, "spawn": spawn, "objects": objects, "enemies": enemies, "rooms": rooms, "cracks": cracks, "seed": seed_value}

## where the rift of a double dungeon opens: inside a room with enemies (web: pickRiftSpot)
static func pick_rift_spot(layout: Dictionary, rng) -> Dictionary:
	var pool: Array = []
	for r in layout.rooms:
		if String(r.role) == "" and int(r.enemies) > 0:
			pool.append(r)
	if pool.is_empty():
		for r in layout.rooms:
			if String(r.role) != "start":
				pool.append(r)
	var room: Dictionary = rng.pick(pool)
	var taken := {}
	for o in layout.objects:
		taken["%d,%d" % [int(o.x), int(o.y)]] = true
	var w: int = layout.w
	for tries in 60:
		var x: int = rng.int_range(int(room.x) + 1, int(room.x) + int(room.w) - 2)
		var y: int = rng.int_range(int(room.y) + 1, int(room.y) + int(room.h) - 2)
		if not is_wall(layout.tiles[y * w + x]) and not taken.has("%d,%d" % [x, y]):
			return {"x": x, "y": y, "room": room.id}
	return {"x": int(room.cx), "y": int(room.cy), "room": room.id}

static func _random_floor_tile(rng, solid: PackedByteArray, w: int, h: int, r: Dictionary, margin: int, avoid: Array, occupied: Dictionary) -> Variant:
	for tries in 80:
		var x: int = rng.int_range(int(r.x) + margin, int(r.x) + int(r.w) - 1 - margin)
		var y: int = rng.int_range(int(r.y) + margin, int(r.y) + int(r.h) - 1 - margin)
		var floor_here := x >= 0 and y >= 0 and x < w and y < h and solid[y * w + x] == 0
		if not floor_here or occupied.has("%d,%d" % [x, y]):
			continue
		var too_close := false
		for p in avoid:
			if absi(p.x - x) + absi(p.y - y) < 3:
				too_close = true
		if too_close:
			continue
		return Vector2i(x, y)
	return null

## a random dungeon description, like generateRandomDef in layout.js
static func generate_random_def(seed_value: int, enemy_bonus: int = 0) -> Dictionary:
	var rng = Rng.new(seed_value)
	var w := 72
	var h := 46
	var target: int = rng.int_range(7, 9)
	var rooms: Array = []
	var attempt := 0
	while attempt < 400 and rooms.size() < target:
		attempt += 1
		var rw: int = rng.int_range(8, 14)
		var rh: int = rng.int_range(7, 11)
		var x: int = rng.int_range(3, w - rw - 4)
		var y: int = rng.int_range(3, h - rh - 4)
		var clash := false
		for r in rooms:
			if x < r.x + r.w + 4 and x + rw + 4 > r.x and y < r.y + r.h + 4 and y + rh + 4 > r.y:
				clash = true
		if not clash:
			rooms.append({"id": "r%d" % rooms.size(), "x": x, "y": y, "w": rw, "h": rh})
	rooms.sort_custom(func(p, q): return p.x < q.x)
	for i in rooms.size():
		rooms[i]["id"] = "r%d" % i
	rooms[0]["role"] = "start"
	rooms[rooms.size() - 1]["role"] = "exit"
	var links: Array = []
	for i in rooms.size() - 1:
		links.append([rooms[i].id, rooms[i + 1].id, "v" if i % 2 == 1 else "h"])
	for k in 2:
		var a: int = rng.int_range(0, rooms.size() - 3)
		var b: int = rng.int_range(a + 2, rooms.size() - 1)
		links.append([rooms[a].id, rooms[b].id, "h" if rng.chance(0.5) else "v"])
	var chests := 0
	for i in rooms.size():
		var r: Dictionary = rooms[i]
		if i == 0:
			continue
		r["enemies"] = rng.int_range(2, 4) + (1 if r.w * r.h > 90 else 0) + enemy_bonus
		if r.get("role", "") == "exit":
			r["enemies"] += 2
		if not r.has("role") and chests < 3 and rng.chance(0.4):
			r["chest"] = true
			chests += 1
		if r.w >= 11 and r.h >= 9 and rng.chance(0.5):
			r["pillars"] = [[2, 2], [r.w - 4, 2], [2, r.h - 4], [r.w - 4, r.h - 4]]
	if chests == 0 and rooms.size() > 2:
		rooms[1]["chest"] = true
	return {"w": w, "h": h, "corridor": 2, "rooms": rooms, "links": links}
