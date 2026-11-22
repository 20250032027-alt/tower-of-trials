extends Node2D
## One floor or dungeon: builds the map from data/world.json, puts the player, enemies and objects on it, runs the effects.
## Port of the parts of src/scenes/PlayScene.js that the first playable slice needs.
const Layout = preload("res://scripts/logic/layout.gd")
const Rng = preload("res://scripts/logic/rng.gd")
const Awareness = preload("res://scripts/logic/awareness.gd")
const Progression = preload("res://scripts/logic/progression.gd")
const Player = preload("res://scripts/play/player.gd")
const Enemy = preload("res://scripts/play/enemy.gd")
const Dummy = preload("res://scripts/play/dummy.gd")
const Hud = preload("res://scripts/play/hud.gd")
const Menu = preload("res://scripts/ui/menu.gd")

const TS := 16

var font: Font = Data.font
var spec: Dictionary
var floor_def: Dictionary = {}   # set on a floor
var dun: Dictionary = {}         # set in a dungeon
var layout: Dictionary
var theme_id := "trial"
var seed_value := 1
var frozen := false
var ending := false
var cleared := false
var total_enemies := 0

var tilemap: TileMapLayer
var entities: Node2D
var effects: Node2D
var camera: Camera2D
var hud
var menu
var menu_lock_until := 0
var player
var enemy_list: Array = []
var dummy_list: Array = []
var interactables: Array = []
var pickups: Array = []
var animated: Array = []
var wheel_open := false
var wheel_idx := 0
var _f_down_at := 0
var _f_hold := false
var kick_off := Vector2.ZERO
var shake_amt := 0.0
var shake_t := 0.0
var _stop_until := 0.0

func _ready() -> void:
	spec = Game.pending if not Game.pending.is_empty() else {"kind": "floor", "id": "tutorial"}
	_resolve()
	layout = Layout.build(_layout_def(), seed_value)
	_build_tiles()
	entities = Node2D.new()
	entities.y_sort_enabled = true
	add_child(entities)
	effects = Node2D.new()
	effects.z_index = 20
	add_child(effects)
	_build_objects()
	_build_enemies()
	_build_player()
	_build_camera()
	hud = Hud.new()
	hud.setup(self)
	add_child(hud)
	menu = Menu.new()
	add_child(menu)
	menu.setup(self)
	if not dun.is_empty() and total_enemies == 0:
		_mark_cleared(true)
	hud.toast((String(dun.name) if not dun.is_empty() else String(floor_def.name)).to_upper())

func _resolve() -> void:
	if spec.kind == "floor":
		floor_def = Data.floors[spec.id]
		theme_id = floor_def.theme
		seed_value = Rng.hash_string(spec.id)
	else:
		dun = Data.dungeons[spec.id]
		theme_id = dun.theme
		seed_value = int(spec.get("seed", randi() % 100000 + 1))

func _layout_def() -> Dictionary:
	if not floor_def.is_empty():
		return floor_def.layout
	if dun.kind == "random":
		return Layout.generate_random_def(seed_value, int(dun.get("enemyBonus", 0)))
	return dun.layout

func tile_center(x: int, y: int) -> Vector2:
	return Vector2(x * TS + TS / 2.0, y * TS + TS / 2.0)

func floor_id() -> String:
	return String(floor_def.id) if not floor_def.is_empty() else String(dun.floor)

# ------------------------------------------------------------------ the map
func _build_tiles() -> void:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TS, TS)
	ts.add_physics_layer()
	ts.set_physics_layer_collision_layer(0, 1)
	ts.set_physics_layer_collision_mask(0, 0)
	var src := TileSetAtlasSource.new()
	src.texture = Data.tex("tiles_" + theme_id)
	src.texture_region_size = Vector2i(TS, TS)
	ts.add_source(src, 0)
	for i in 6:
		src.create_tile(Vector2i(i, 0))
		if i >= Layout.WALL_EDGE:
			var td: TileData = src.get_tile_data(Vector2i(i, 0), 0)
			td.add_collision_polygon(0)
			td.set_collision_polygon_points(0, 0, PackedVector2Array([Vector2(-8, -8), Vector2(8, -8), Vector2(8, 8), Vector2(-8, 8)]))
	tilemap = TileMapLayer.new()
	tilemap.tile_set = ts
	tilemap.z_index = -10
	add_child(tilemap)
	var w: int = layout.w
	var h: int = layout.h
	for y in h:
		for x in w:
			tilemap.set_cell(Vector2i(x, y), 0, Vector2i(layout.tiles[y * w + x], 0))
	# torches on the wall edge, where a floor tile lies below
	var torch_col: Color = Data.hex_color(Data.themes[theme_id].get("torch", 0xffa040))
	for y in range(1, h - 1):
		for x in range(1, w - 1):
			if layout.tiles[y * w + x] != Layout.WALL_EDGE or layout.tiles[(y + 1) * w + x] >= Layout.WALL_EDGE:
				continue
			if (x * 7 + y * 13) % 19 != 0:
				continue
			var c := tile_center(x, y)
			var t := Sprite2D.new()
			t.texture = Data.tex("o_torch_0")
			t.position = c + Vector2(0, 1)
			t.z_index = -9
			add_child(t)
			animated.append({"sprite": t, "prefix": "o_torch_", "n": 2, "speed": 5.0 + (x % 3)})
			var g := _glow(c + Vector2(0, 10), torch_col, 1.1)
			g.z_index = -8
			add_child(g)

func _glow(pos: Vector2, color: Color, scale_value: float = 1.0) -> Sprite2D:
	var g := Sprite2D.new()
	g.texture = Data.tex("fx_glow")
	g.position = pos
	g.scale = Vector2.ONE * scale_value
	g.modulate = Color(color.r, color.g, color.b, 0.35)
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	g.material = m
	return g

func is_wall_at(pos: Vector2) -> bool:
	var tx := int(floor(pos.x / TS))
	var ty := int(floor(pos.y / TS))
	if tx < 0 or ty < 0 or tx >= layout.w or ty >= layout.h:
		return true
	return Layout.is_wall(layout.tiles[ty * layout.w + tx])

func has_los(a: Vector2, b: Vector2) -> bool:
	return Awareness.has_line_of_sight(layout, a.x, a.y, b.x, b.y, TS)

func room_at(pos: Vector2) -> String:
	return Awareness.room_at(layout, pos.x, pos.y, TS)

# ------------------------------------------------------------------ things on the map
func _add_interact(pos: Vector2, r: float, prompt: Callable, act: Callable) -> Dictionary:
	var it := {"pos": pos, "r": r, "prompt": prompt, "act": act}
	interactables.append(it)
	return it

func _label(pos: Vector2, text: String, color: Color) -> void:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", 10)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color("120d0a"))
	l.add_theme_constant_override("outline_size", 3)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(160, 12)
	l.position = pos - Vector2(80, 6)
	l.z_index = 30
	add_child(l)

func _flat(key: String, pos: Vector2) -> Sprite2D:
	var s := Sprite2D.new()
	s.texture = Data.tex(key)
	s.position = pos
	s.z_index = -2
	add_child(s)
	return s

func _build_objects() -> void:
	var flags: Dictionary = Game.profile.flags
	for o in layout.objects:
		var c := tile_center(int(o.x), int(o.y))
		match o.type:
			"sign":
				var s := Sprite2D.new()
				s.texture = Data.tex("o_sign")
				s.position = c
				entities.add_child(s)
				var title: String = o.title
				var text: String = o.text
				_add_interact(c, 22.0, func(): return "READ SIGN", func(): hud.show_dialog(title, text))
			"dummy":
				var d = Dummy.new()
				entities.add_child(d)
				d.setup(self, c)
				dummy_list.append(d)
			"altar":
				var key := "o_altar_mana" if o.kind == "mana" else "o_altar_loadout"
				_flat(key, c)
				_label(c + Vector2(0, -17), o.label, Color("d6b0ff") if o.kind == "mana" else Color("9fc8ff"))
				_add_interact(c, 24.0, func(): return ("MANA ALTAR" if o.kind == "mana" else "OPEN LOADOUT"), func(): Game.sfx("ui"); menu.open("magic" if o.kind == "mana" else "traits"))
			"portal":
				var req = o.get("requires")
				var locked: bool = req != null and not flags.get(req, false)
				var hidden: bool = o.get("hidden", false)
				var prefix := "o_hidden_" if hidden else "o_portal_"
				var sp := _flat("o_portal_locked" if locked else prefix + "0", c)
				if not locked:
					animated.append({"sprite": sp, "prefix": prefix, "n": 4, "speed": 6.0})
					add_child(_glow(c, Color("ffd84a") if hidden else Color("4f8dff")))
				var lock_text: String = o.get("lockText", "CLEAR THE TRIAL OF BONES")
				_label(c + Vector2(0, -19), String(o.label) + (" (LOCKED)" if locked else ""), Color("8a7a99") if locked else Color("bfe0ff"))
				var to: Dictionary = o.to
				var tile := Vector2i(int(o.x), int(o.y))
				var lbl: String = o.label
				_add_interact(c, 18.0,
					func(): return ("LOCKED: " + lock_text) if locked else (("TAKE " if to.type == "floor" else "ENTER ") + lbl),
					func(): _use_portal(to, tile, locked, lock_text))
			"exit":
				var sp2 := _flat("o_exit_0", c)
				animated.append({"sprite": sp2, "prefix": "o_exit_", "n": 4, "speed": 6.0})
				add_child(_glow(c, Color("4fd37a")))
				_label(c + Vector2(0, -19), "EXIT", Color("aaf0c0"))
				_add_interact(c, 18.0, func(): return "LEAVE DUNGEON (CLEARED!)" if cleared else "LEAVE DUNGEON (ENEMIES REMAIN)", func(): _leave_dungeon())
			"chest":
				var ch := Sprite2D.new()
				ch.texture = Data.tex("o_chest")
				ch.position = c
				entities.add_child(ch)
				var it := _add_interact(c, 18.0, func(): return "OPEN CHEST", func(): pass)
				it.act = func(): _open_chest(ch, it)
			_:
				pass

func _build_enemies() -> void:
	if dun.is_empty():
		return
	var mult := float(dun.get("statMult", 1.0))
	var rr := Data.rank_range(dun.rank)
	var i := 0
	for e in layout.enemies:
		var rng = Rng.new(seed_value * 31 + i * 977)
		var lvl: int
		if dun.kind == "double":
			lvl = Data.rank_range(String(spec.get("parent_rank", "F"))).max + 5 + rng.int_range(0, 1)
		else:
			lvl = clampi(int(Game.profile.level) + int(dun.levelDelta) + int(e.levelBonus) + rng.int_range(-1, 1), rr.min, rr.max)
		var kind := Data.pick_enemy_type(String(dun.floor), rng.next())
		var en = Enemy.new()
		entities.add_child(en)
		en.setup(self, tile_center(e.x, e.y), lvl, mult, i, String(e.room), kind)
		enemy_list.append(en)
		i += 1
	total_enemies = layout.enemies.size()

func _build_player() -> void:
	player = Player.new()
	player.world = self
	entities.add_child(player)
	var tile: Vector2i = layout.spawn
	if spec.has("spawn_tile"):
		tile = spec.spawn_tile
	player.global_position = tile_center(tile.x, tile.y)

func _build_camera() -> void:
	camera = Camera2D.new()
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = layout.w * TS
	camera.limit_bottom = layout.h * TS
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 9.0
	camera.global_position = player.global_position
	add_child(camera)
	camera.make_current()
	camera.reset_smoothing()

# ------------------------------------------------------------------ targets
func targets() -> Array:
	var out: Array = []
	for e in enemy_list:
		if is_instance_valid(e) and e.alive:
			out.append(e)
	out.append_array(dummy_list)
	return out

func nearest_target(pos: Vector2, max_dist: float):
	var best = null
	var bd := max_dist
	for t in targets():
		var d: float = t.global_position.distance_to(pos)
		if d < bd:
			bd = d
			best = t
	return best

## the target closest to where you aim: inside a cone, in sight
func target_near_aim(pos: Vector2, aim: float, max_dist: float, cone: float):
	var best = null
	var bs := INF
	for t in targets():
		var d: Vector2 = t.global_position - pos
		var dist := d.length()
		if dist > max_dist or dist < 1.0:
			continue
		var off := absf(angle_difference(d.angle(), aim))
		if off > cone or not has_los(pos, t.global_position):
			continue
		var score := off * 120.0 + dist * 0.2
		if score < bs:
			bs = score
			best = t
	return best

func alert_allies(src) -> void:
	for e in enemy_list:
		if is_instance_valid(e) and e != src and e.alive and e.room == src.room and e.room != "":
			e.aggro()

func add_effect(n: Node) -> void:
	effects.add_child(n)

# ------------------------------------------------------------------ the frame
func _process(dt: float) -> void:
	for a in animated:
		var f := int(Time.get_ticks_msec() / 1000.0 * a.speed) % int(a.n)
		a.sprite.texture = Data.tex("%s%d" % [a.prefix, f])
	if player != null:
		camera.global_position = player.global_position  # (smoothing and the map limits are on the camera)
	var dt_real := dt / maxf(0.05, Engine.time_scale)
	kick_off = kick_off.lerp(Vector2.ZERO, minf(1.0, dt_real * 12.0))
	if shake_t > 0.0:
		shake_t -= dt
		camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * shake_amt * clampf(shake_t / 0.12, 0.0, 1.0) * Game.shake_scale() / 0.3 + kick_off
	else:
		camera.offset = kick_off
	frozen = hud.dialog_open or ending or menu.is_open
	_drive_wheel()
	if not frozen and not player.dead:
		_check_interact()
		_check_pickups()
	elif hud.dialog_open and (Input.is_action_just_pressed("interact") or Input.is_action_just_pressed("attack") or Input.is_action_just_pressed("menu")):
		hud.close_dialog()
	if Input.is_action_just_pressed("menu") and not hud.dialog_open and not ending and not menu.is_open and Time.get_ticks_msec() > menu_lock_until:
		menu.open()

func _check_interact() -> void:
	var best = null
	var bd := INF
	for it in interactables:
		var d: float = it.pos.distance_to(player.global_position)
		if d < it.r and d < bd:
			bd = d
			best = it
	hud.prompt = String(best.prompt.call()) if best != null else ""
	if best != null and Input.is_action_just_pressed("interact"):
		best.act.call()

func _check_pickups() -> void:
	for p in pickups.duplicate():
		if p.pos.distance_to(player.global_position) < 10.0:
			player.heal(player.stats.maxHealth * 0.25)
			float_text(player.global_position + Vector2(0, -14), "+HP", Color("7fe08a"))
			p.sprite.queue_free()
			pickups.erase(p)

# ------------------------------------------------------------------ rules: portals, chests, xp, clearing, dying
## go to a floor from the menu (the TOWER tab)
func travel(id: String) -> void:
	if ending:
		return
	ending = true
	Game.go_play({"kind": "floor", "id": id})

func _use_portal(to: Dictionary, tile: Vector2i, locked: bool, lock_text: String) -> void:
	if locked:
		hud.toast("THE STAIRS ARE SEALED. CLEAR: " + lock_text.to_upper())
		return
	if ending:
		return
	ending = true
	if to.type == "floor":
		Game.go_play({"kind": "floor", "id": to.id, "arrive_from": floor_id()})
	else:
		Game.profile.flags["seen_" + String(to.id)] = true
		Game.go_play({"kind": "dungeon", "id": to.id, "return_floor": floor_id(), "return_tile": tile})

func _leave_dungeon() -> void:
	if ending:
		return
	ending = true
	var next := {"kind": "floor", "id": spec.get("return_floor", dun.floor)}
	if spec.has("return_tile"):
		next["spawn_tile"] = spec.return_tile
	Game.go_play(next)

func _open_chest(sprite: Sprite2D, it: Dictionary) -> void:
	sprite.texture = Data.tex("o_chest_open")
	interactables.erase(it)
	var lv: int = Game.profile.level
	var rare: bool = Game.rng.chance(0.2 + float(player.stats.lootLuck))
	if rare:
		var xp := 60 + lv * 14
		float_text(sprite.position + Vector2(0, -12), "RARE LOOT!", Color("ffd84a"), 1.5)
		hud.toast("RARE LOOT! +%d XP, full recovery." % xp)
		spawn_orbs(sprite.position, xp)
		player.heal(player.stats.maxHealth)
		player.stamina = player.stats.maxStamina
		ring_fx(sprite.position, Color("ffd84a"))
	else:
		var xp2 := 20 + lv * 5
		hud.toast("CHEST: +%d XP AND SOME HEALTH." % xp2)
		spawn_orbs(sprite.position, xp2)
		player.heal(player.stats.maxHealth * 0.3)

func spawn_orbs(pos: Vector2, amount: int) -> void:
	var n := 3
	for i in n:
		var o := Sprite2D.new()
		o.texture = Data.tex("fx_orb_%d" % (i % 3))
		o.position = pos + Vector2(randf_range(-6, 6), randf_range(-6, 6))
		effects.add_child(o)
		var share := float(amount) / n
		var tw := create_tween()
		tw.tween_interval(0.25 + i * 0.08)
		tw.tween_method(func(u: float): o.position = o.position.lerp(player.global_position, u), 0.0, 1.0, 0.45)
		tw.tween_callback(func():
			if is_instance_valid(player):
				gain_xp(share)
			o.queue_free())

func gain_xp(amount: float) -> void:
	var gained := Progression.add_xp(Game.profile, amount, player.stats.expRate * Game.t("xpRate"), Game.rng)
	if gained > 0:
		player.refresh_stats()
		player.hp = player.stats.maxHealth
		float_text(player.global_position + Vector2(0, -20), "LEVEL UP", Color("ffe27a"))
		hud.toast("LEVEL UP!  LV %d  RANK %s" % [Game.profile.level, Data.rank_of_level(Game.profile.level)])
		ring_fx(player.global_position, Color("ffe27a"))
		for stat in Progression.last_adaptive:
			hud.toast("ADAPTIVE GROWTH: +10% %s" % String(stat).to_upper())
		Game.persist()

func on_enemy_killed(e) -> void:
	Game.profile.kills += 1
	player.on_kill()
	spawn_orbs(e.global_position, Progression.xp_from_enemy(e.def, e.level, float(dun.get("xpBonus", 1.0))))
	if Game.rng.chance(float(e.def.healDropChance)):
		var img := Sprite2D.new()
		img.texture = Data.tex("fx_heal")
		img.position = e.global_position
		entities.add_child(img)
		pickups.append({"sprite": img, "pos": e.global_position})
	var left := 0
	for x in enemy_list:
		if is_instance_valid(x) and x.alive and x != e:
			left += 1
	hud.enemies_left = left
	if left == 0:
		_mark_cleared(false)

func _mark_cleared(silent: bool) -> void:
	if cleared:
		return
	cleared = true
	Game.profile.flags["cleared_" + String(dun.id)] = true
	if dun.has("clearFlag"):
		Game.profile.flags[dun.clearFlag] = true
	if silent:
		return
	var bonus := roundi((30 + Game.profile.level * 6 + total_enemies * 8) * float(dun.xpBonus))
	hud.toast("DUNGEON CLEARED!  BONUS +%d XP" % bonus)
	gain_xp(bonus)
	if dun.id == "trial":
		hud.toast("THE STAIRS TO FLOOR 1 ARE NOW UNLOCKED!")

func on_player_death() -> void:
	if ending:
		return
	ending = true
	hud.toast("YOU FELL...  THE TOWER SENDS YOU BACK.")
	await get_tree().create_timer(1.4).timeout
	Game.profile.traits = Progression.roll_run_traits(Game.rng, int(Data.constants.TRAIT_SLOTS))
	Game.go_play({"kind": "floor", "id": floor_id()})

# ------------------------------------------------------------------ effects (all cheap sprites + tweens)
func _particle(tex_key: String, pos: Vector2, vel: Vector2, life: float, color: Color = Color.WHITE, end_scale: float = 1.0, additive: bool = false) -> Sprite2D:
	var s := Sprite2D.new()
	s.texture = Data.tex(tex_key)
	s.position = pos
	s.modulate = color
	if additive:
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		s.material = m
	effects.add_child(s)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(s, "position", pos + vel * life * 0.7, life).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(s, "modulate:a", 0.0, life)
	if end_scale != 1.0:
		tw.tween_property(s, "scale", Vector2.ONE * end_scale, life)
	tw.chain().tween_callback(s.queue_free)
	return s

func burst(pos: Vector2, color: Color, count: int, speed: float, tex_key: String = "fx_dot") -> void:
	for i in count:
		_particle(tex_key, pos, Vector2.from_angle(randf() * TAU) * randf_range(0.4, 1.0) * speed, randf_range(0.25, 0.5), color)

func float_text(pos: Vector2, text: String, color: Color = Color.WHITE, size: float = 1.0) -> void:
	var l := Label.new()
	l.text = text + ("!" if size > 1.0 and text.is_valid_int() else "")
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", 10)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color("0a0612"))
	l.add_theme_constant_override("outline_size", 3)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(60, 12)
	l.position = (pos - Vector2(30, 12)).round()
	effects.add_child(l)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(l, "position:y", l.position.y - 8.0, 0.52).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "modulate:a", 0.0, 0.52)
	tw.chain().tween_callback(l.queue_free)

func hit_fx(pos: Vector2, angle: float, crit: bool) -> void:
	var n := 7 if crit else 4
	for i in n:
		var a := angle + randf_range(-0.7, 0.7)
		_particle("fx_spark" if i % 2 == 0 else "fx_bone", pos, Vector2.from_angle(a) * randf_range(30, 70), 0.3, Color("ffe9a8") if crit else Color.WHITE)

func impact_fx(pos: Vector2, angle: float) -> void:
	for i in 3:
		_particle("fx_spark", pos, Vector2.from_angle(angle + PI + randf_range(-0.8, 0.8)) * randf_range(20, 50), 0.22)

func death_fx(pos: Vector2, angle: float, crit: bool) -> void:
	for k in ["fx_skull", "fx_rib", "fx_femur", "fx_chunk", "fx_chunk", "fx_bone"]:
		_particle(k, pos, Vector2.from_angle(angle + randf_range(-1.0, 1.0)) * randf_range(25, 80), 0.7)
	burst(pos, Color("e2dcc6"), 8, 40, "fx_bone")
	if crit:
		ring_fx(pos, Color("ffd84a"))

func slash_fx(pos: Vector2, angle: float, reach: float, dir: float, shape: String, color: Color = Color.WHITE) -> void:
	var key := "fx_slash_s"
	var base := 29.0
	var s := Sprite2D.new()
	if shape == "large":
		key = "fx_slash_l"
		base = 38.0
	if shape == "thrust":
		key = "fx_thrust"
		base = 60.0
		s.centered = false
		s.offset = Vector2(0, -4.5)
	s.texture = Data.tex(key)
	s.modulate = color
	s.rotation = angle
	var sc := maxf(1.0, roundf(reach / base))
	s.scale = Vector2(sc, sc * (-1.0 if dir < 0.0 else 1.0))
	s.position = pos + (Vector2.from_angle(angle) * 6.0 if shape == "thrust" else Vector2.ZERO)
	effects.add_child(s)
	var tw := create_tween()
	tw.tween_property(s, "modulate:a", 0.0, 0.15)
	tw.tween_callback(s.queue_free)

func ring_fx(pos: Vector2, color: Color) -> void:
	var s := Sprite2D.new()
	s.texture = Data.tex("fx_ring")
	s.position = pos
	s.modulate = color
	s.scale = Vector2.ONE * 0.2
	effects.add_child(s)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(s, "scale", Vector2.ONE * 0.9, 0.35).set_ease(Tween.EASE_OUT)
	tw.tween_property(s, "modulate:a", 0.0, 0.35)
	tw.chain().tween_callback(s.queue_free)

func muzzle_flash(pos: Vector2, angle: float) -> void:
	var s := _particle("fx_muzzle", pos, Vector2.ZERO, 0.07, Color("fff2d0"), 1.0, true)
	s.rotation = angle

func dust(pos: Vector2) -> void:
	for i in 4:
		_particle("fx_puff", pos + Vector2(0, 4), Vector2.from_angle(randf() * TAU) * 18.0, 0.35, Color(1, 1, 1, 0.6), 2.0)

func step_dust(pos: Vector2, vel: Vector2) -> void:
	_particle("fx_puff", pos + Vector2(0, 5) - vel.normalized() * 4.0, -vel.normalized() * 8.0, 0.3, Color(1, 1, 1, 0.5), 1.8)

func shake(amount: float, seconds: float) -> void:
	shake_amt = maxf(shake_amt * clampf(shake_t / 0.12, 0.0, 1.0), amount * 0.5)
	shake_t = maxf(shake_t, seconds)

## freeze the action for a moment on a big hit
func hit_stop(seconds: float) -> void:
	if Engine.time_scale < 0.5:
		return
	Engine.time_scale = 0.05
	await get_tree().create_timer(seconds, true, false, true).timeout
	Engine.time_scale = 1.0

func toast(text: String) -> void:
	hud.toast(text)

func _exit_tree() -> void:
	Engine.time_scale = 1.0

# ------------------------------------------------------------------ noise, kick, and the FX the skills and magic use
## fighting is loud: sleeping skeletons in the same room start to notice
func noise(pos: Vector2) -> void:
	var rid := room_at(pos)
	if rid == "":
		return
	for e in enemy_list:
		if is_instance_valid(e) and e.alive and e.room == rid and (e.state == "idle" or e.state == "search"):
			e.alert = maxf(e.alert, 0.6)
			e.sense_t = 0.0

## the camera is pushed a little (recoil, a hard hit)
func kick(angle: float, px: float) -> void:
	kick_off += Vector2.from_angle(angle) * px * 0.4

func flash_hurt(a: float) -> void:
	hud.hurt_a = maxf(hud.hurt_a, a)

func glow_pop(pos: Vector2, color: Color, scale_value: float = 0.6, seconds: float = 0.14, alpha: float = 0.55) -> void:
	var g := _glow(pos.round(), color, scale_value)
	g.modulate = Color(color.r, color.g, color.b, alpha)
	g.z_index = 5
	effects.add_child(g)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(g, "modulate:a", 0.0, seconds).set_ease(Tween.EASE_OUT)
	tw.tween_property(g, "scale", Vector2.ONE * scale_value * 1.35, seconds)
	tw.chain().tween_callback(g.queue_free)

func rise_fx(pos: Vector2, color: Color, n: int = 8, spread: float = 9.0, height: float = 22.0) -> void:
	for i in n:
		var d := Sprite2D.new()
		d.texture = Data.tex("fx_dot")
		d.position = (pos + Vector2(randf_range(-spread, spread), 3.0 + randf() * 4.0)).round()
		d.modulate = Color(color.r, color.g, color.b, 0.0) if i % 3 != 0 else Color(1, 1, 1, 0.0)
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		d.material = m
		effects.add_child(d)
		var delay := i * 0.038
		var dur := 0.52 + randf() * 0.26
		var tw := create_tween().set_parallel(true)
		tw.tween_property(d, "modulate:a", 1.0, 0.09).set_delay(delay)
		tw.tween_property(d, "position", d.position + Vector2(randf_range(-3, 3), -height - randf() * 10.0), dur).set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE)
		tw.tween_property(d, "modulate:a", 0.0, 0.4).set_delay(delay + 0.33)
		tw.chain().tween_callback(d.queue_free)

func skill_fx(pos: Vector2, kind: String) -> Color:
	var table := {"heal": "7fe8a0", "secondwind": "7fe8a0", "mana": "6fa8ff", "shield": "9fd8ff", "mark": "ff6a5a", "cdcut": "c9a6ff", "bloodlust": "ff4a4a", "lifesteal": "ff4a6a", "predator": "ffb04a", "berserk": "ff3a2a", "buff": "ffe27a"}
	var c := Color(table.get(kind, table.buff))
	ring_fx(pos, c)
	glow_pop(pos, c, 1.0, 0.26, 0.6)
	match kind:
		"heal", "secondwind":
			rise_fx(pos, c, 12, 9.0, 26.0)
		"mana":
			rise_fx(pos, c, 10, 8.0, 24.0)
		"shield":
			shockwave(pos, c, 0.35)
		"mark":
			ring_fx(pos, c)
		_:
			rise_fx(pos, c, 9, 8.0, 22.0)
	return c

func shockwave(pos: Vector2, color: Color, pw: float) -> void:
	ring_fx(pos, color)
	var n := 6 + roundi(pw * 8.0)
	for i in n:
		var a := float(i) / n * TAU + randf() * 0.4
		var r := 10.0 + pw * 14.0 + randf() * 6.0
		_particle("fx_puff" if i % 3 != 0 else "fx_dot", pos + Vector2(0, 2), Vector2(cos(a), sin(a) * 0.5) * r / 0.7 / 0.32, 0.32, Color(0.81, 0.78, 0.69, 0.5))
	var rocks := roundi(2.0 + pw * 5.0)
	for i in rocks:
		var a2 := randf() * TAU
		var sp := 14.0 + randf() * 26.0 * (0.5 + pw)
		_particle("fx_rust", pos, Vector2(cos(a2), sin(a2) * 0.6) * sp / 0.7 + Vector2(0, -randf_range(20, 50)), 0.34 + randf() * 0.12)

func ember_fx(pos: Vector2, color: Color) -> void:
	var c := Color("ffe9a0") if randf() < 0.3 else color
	var life := 0.7 + randf() * 0.5
	_particle("fx_dot", pos + Vector2(randf_range(-2, 2), 0), Vector2(randf_range(-4, 4), -(10.0 + randf() * 8.0)) / (0.7 * life), life, c, 1.0, true)

func float_mote(pos: Vector2, color: Color) -> void:
	_particle("fx_dot", pos.round(), Vector2(0, -8) / 0.49, 0.7, color, 1.0, true)

func gather_fx(tip: Vector2, color: Color, r: float = 16.0) -> void:
	var a := randf() * TAU
	var d := Sprite2D.new()
	d.texture = Data.tex("fx_dot")
	d.position = (tip + Vector2(cos(a), sin(a)) * r).round()
	d.modulate = color
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	d.material = m
	effects.add_child(d)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(d, "position", tip, 0.2).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(d, "modulate:a", 0.2, 0.2)
	tw.chain().tween_callback(d.queue_free)

## a little mote that drifts off a blessed Trialist: a leaf, light rising, a spark, something drawn into the void
func ambient_mote(type: String, pos: Vector2, color: Color) -> void:
	var a := randf() * TAU
	var r := 6.0 + randf() * 8.0
	var p := (pos + Vector2(cos(a) * r, sin(a) * r * 0.7)).round()
	var d := Sprite2D.new()
	d.texture = Data.tex("fx_dot")
	d.position = p
	d.modulate = Color("6ed48a") if type == "natural" else color
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	d.material = m
	effects.add_child(d)
	var tw := create_tween().set_parallel(true)
	match type:
		"natural":
			tw.tween_property(d, "position", p + Vector2(-6, 12), 1.1).set_trans(Tween.TRANS_SINE)
			tw.tween_property(d, "modulate:a", 0.0, 1.1)
		"divine":
			tw.tween_property(d, "position", p + Vector2(0, -14), 1.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
			tw.tween_property(d, "modulate:a", 0.0, 1.0)
		"arcane":
			tw.tween_property(d, "position", p + Vector2(cos(a + 1.4), sin(a + 1.4) * 0.7) * 10.0, 0.7).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
			tw.tween_property(d, "modulate:a", 0.0, 0.7)
		_:
			d.position = (pos + Vector2(cos(a) * 20.0, sin(a) * 14.0)).round()
			tw.tween_property(d, "position", pos.round(), 0.8).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
			tw.tween_property(d, "modulate:a", 0.0, 0.8)
	tw.chain().tween_callback(d.queue_free)

# ------------------------------------------------------------------ the skill wheel (F / LB): the world slows right down while you choose
func open_wheel() -> void:
	if Data.skills.is_empty():
		hud.toast("NO SKILLS YET.")
		return
	var sel = Game.profile.selSkill
	wheel_idx = 0
	for i in Data.skills.size():
		if Data.skills[i].id == sel:
			wheel_idx = i
	wheel_open = true
	Engine.time_scale = 0.2
	_f_down_at = Time.get_ticks_msec()
	_f_hold = true
	Game.sfx("wheelopen")

func close_wheel(quiet: bool = false) -> void:
	if not wheel_open:
		return
	wheel_open = false
	Engine.time_scale = 1.0
	if not quiet:
		Game.sfx("wheelclose")

func wheel_step(d: int) -> void:
	var n: int = Data.skills.size()
	wheel_idx = (wheel_idx + d + n) % n
	Game.sfx("wheeltick")

func confirm_wheel() -> void:
	var id: String = Data.skills[wheel_idx].id
	Game.profile.selSkill = id
	if player.use_skill(id):
		close_wheel(true)

## while the wheel is open: Q / E (or the mouse wheel, or the pad's D-pad) scroll, F or ENTER or A uses, ESC or B closes;
## holding F and letting go also uses
func _drive_wheel() -> void:
	if not wheel_open:
		if Input.is_action_just_pressed("skill_wheel") and not player.dead and not menu.is_open and not hud.dialog_open and not ending:
			open_wheel()
		return
	if player.dead or menu.is_open or ending:
		close_wheel(true)
		return
	var pad := Controls.using_pad
	if Input.is_action_just_pressed("skill_wheel"):
		confirm_wheel()
		_f_hold = false
	elif Input.is_action_just_pressed("ui_accept") or (pad and Input.is_action_just_pressed("interact")):
		confirm_wheel()
	elif Input.is_action_just_pressed("menu") or (pad and Input.is_action_just_pressed("dodge")):
		close_wheel()
		menu_lock_until = Time.get_ticks_msec() + 250
	elif _f_hold and not Input.is_action_pressed("skill_wheel"):
		if Time.get_ticks_msec() - _f_down_at > 350:
			confirm_wheel()
		_f_hold = false
	if not pad:
		if Input.is_action_just_pressed("swap_weapon"):
			wheel_step(-1)
		if Input.is_action_just_pressed("interact"):
			wheel_step(1)
	else:
		for a in ["move_left", "move_up"]:
			if Input.is_action_just_pressed(a):
				wheel_step(-1)
		for a in ["move_right", "move_down"]:
			if Input.is_action_just_pressed(a):
				wheel_step(1)

func _unhandled_input(event: InputEvent) -> void:
	if wheel_open and event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			wheel_step(1)
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			wheel_step(-1)
