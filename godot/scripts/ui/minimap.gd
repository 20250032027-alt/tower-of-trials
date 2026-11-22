extends Control
## The round radar (always centred on you), the fog of war it is drawn from, and the full-screen map (M / Back).
## Port of the minimap in src/ui/hud-dom.js. Explored tiles are kept in Game.explored[map_key] so they are still there when you come back.
const PAD := 16                 # empty tiles around the terrain image, so the radar window can hang over the edge
const WIN := 32                 # tiles shown by the radar
const PX := 2                   # screen pixels per tile on the radar
const RADAR_POS := Vector2(408, 32)
const COL_FLOOR := Color8(112, 94, 72)
const COL_WALL := Color8(178, 154, 120)
const COL_DEEP := Color8(36, 28, 22)
const MARK := {"player": "ffffff", "portal": "7fd0ff", "exit": "5fe08a", "goal": "ffe27a", "enemy": "ff5a5a", "rift": "d08aff", "chest": "ffb84a", "hidden": "ffd84a"}

var world
var font: Font
var w := 1
var h := 1
var tiles: PackedInt32Array
var explored: PackedByteArray
var image: Image
var tex: ImageTexture
var markers: Array = []
var big_open := false
var _last_tile := Vector2i(-99, -99)
var radar: Control
var big: Control

func setup(wd, f: Font) -> void:
	world = wd
	font = f
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	w = world.layout.w
	h = world.layout.h
	tiles = world.layout.tiles
	var key: String = world.map_key
	if not Game.explored.has(key) or (Game.explored[key] as PackedByteArray).size() != w * h:
		var fresh := PackedByteArray()
		fresh.resize(w * h)
		Game.explored[key] = fresh
	explored = Game.explored[key]
	image = Image.create(w + PAD * 2, h + PAD * 2, false, Image.FORMAT_RGBA8)
	for i in w * h:
		if explored[i] != 0:
			_paint(i)
	tex = ImageTexture.create_from_image(image)
	radar = Control.new()
	radar.position = RADAR_POS
	radar.size = Vector2(WIN * PX, WIN * PX)
	radar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	sh.code = "shader_type canvas_item;\nvarying vec2 lp;\nvoid vertex() { lp = VERTEX; }\nvoid fragment() { if (distance(lp, vec2(32.0)) > 32.0) { discard; } }\n"
	var mat := ShaderMaterial.new()
	mat.shader = sh
	radar.material = mat
	radar.draw.connect(_draw_radar)
	add_child(radar)
	big = Control.new()
	big.set_anchors_preset(Control.PRESET_FULL_RECT)
	big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	big.draw.connect(_draw_big)
	big.visible = false
	add_child(big)

func _paint(i: int) -> void:
	var t: int = tiles[i]
	var c := COL_FLOOR if t <= 2 else (COL_WALL if t == 3 or t == 5 else COL_DEEP)
	image.set_pixel(i % w + PAD, i / w + PAD, c)

## walk past it and it is on the map (radius in tiles)
func reveal(tx: int, ty: int, radius: int = 6) -> void:
	if Vector2i(tx, ty) == _last_tile:
		return
	_last_tile = Vector2i(tx, ty)
	var changed := false
	for y in range(maxi(0, ty - radius), mini(h - 1, ty + radius) + 1):
		for x in range(maxi(0, tx - radius), mini(w - 1, tx + radius) + 1):
			if (x - tx) * (x - tx) + (y - ty) * (y - ty) > radius * radius + 1:
				continue
			var i := y * w + x
			if explored[i] == 0:
				explored[i] = 1
				_paint(i)
				changed = true
	if changed:
		tex.update(image)
	Game.explored[world.map_key] = explored

func is_explored(tx: int, ty: int) -> bool:
	return tx >= 0 and ty >= 0 and tx < w and ty < h and explored[ty * w + tx] != 0

## a wall turned to floor (the cracked wall)
func repaint(tx: int, ty: int) -> void:
	var i := ty * w + tx
	if explored[i] != 0:
		_paint(i)
		tex.update(image)

func set_big(v: bool) -> void:
	big_open = v
	big.visible = v
	big.queue_redraw()

func explored_count() -> int:
	var n := 0
	for v in explored:
		n += 1 if v != 0 else 0
	return n

func _process(_dt: float) -> void:
	radar.visible = Game.settings.minimap and not big_open
	if radar.visible:
		radar.queue_redraw()
	if big_open:
		big.queue_redraw()

func _marker_color(kind: String) -> Color:
	return Color(MARK.get(kind, "ffffff"))

func _draw_radar() -> void:
	if world == null or world.player == null:
		return
	var p: Vector2 = world.player.global_position / world.TS
	var ox := roundi(p.x - WIN / 2.0)
	var oy := roundi(p.y - WIN / 2.0)
	var half := WIN * PX / 2.0
	radar.draw_circle(Vector2(half, half), half, Color(0.05, 0.04, 0.03, 0.82))
	radar.draw_texture_rect_region(tex, Rect2(0, 0, WIN * PX, WIN * PX), Rect2(ox + PAD, oy + PAD, WIN, WIN))
	var cx := ox + WIN / 2.0
	var cy := oy + WIN / 2.0
	var rim := WIN / 2.0 - 2.0
	for m in markers:
		var mx: float = m.x
		var my: float = m.y
		if m.kind == "goal":   # the goal always shows: beyond the radar it is pinned to the rim, pointing the way
			var dx := mx - cx
			var dy := my - cy
			var d := sqrt(dx * dx + dy * dy)
			if d > rim:
				mx = cx + dx / d * rim
				my = cy + dy / d * rim
		elif mx < ox - 1 or mx > ox + WIN + 1 or my < oy - 1 or my > oy + WIN + 1:
			continue
		var pos := Vector2(roundf((mx - ox) * PX), roundf((my - oy) * PX))
		var s := 5.0 if m.kind == "player" else (3.0 if m.kind == "enemy" else 4.0)
		if m.kind == "player":
			radar.draw_rect(Rect2(pos - Vector2(3, 3), Vector2(7, 7)), Color("0b0806"))
		radar.draw_rect(Rect2(pos - Vector2(s, s) / 2.0, Vector2(s, s)), _marker_color(m.kind))
	radar.draw_arc(Vector2(half, half), half - 1.0, 0.0, TAU, 56, Color("120d0a"), 2.0)
	radar.draw_arc(Vector2(half, half), half - 2.5, 0.0, TAU, 56, Color("c9a77a"), 1.0)

func _draw_big() -> void:
	big.draw_rect(Rect2(0, 0, 480, 270), Color(0.03, 0.02, 0.02, 0.95))
	var s := maxi(1, mini(440 / w, 200 / h))
	var size := Vector2(w * s, h * s)
	var org := Vector2(roundf(240.0 - size.x / 2.0), roundf(138.0 - size.y / 2.0))
	big.draw_rect(Rect2(org - Vector2(3, 3), size + Vector2(6, 6)), Color("120d0a"))
	big.draw_rect(Rect2(org - Vector2(2, 2), size + Vector2(4, 4)), Color("c9a77a"), false, 1.0)
	big.draw_rect(Rect2(org, size), Color(0.07, 0.05, 0.04))
	big.draw_texture_rect_region(tex, Rect2(org, size), Rect2(PAD, PAD, w, h))
	for m in markers:
		var pos := org + Vector2(roundf(m.x * s), roundf(m.y * s))
		var sz := float(maxi(3, s + 1))
		if m.kind == "player":
			sz += 2.0
			big.draw_rect(Rect2(pos - Vector2(sz, sz) / 2.0 - Vector2(1, 1), Vector2(sz, sz) + Vector2(2, 2)), Color("0b0806"))
		big.draw_rect(Rect2(pos - Vector2(sz, sz) / 2.0, Vector2(sz, sz)), _marker_color(m.kind))
	var name_text: String = String(world.floor_def.name) if not world.floor_def.is_empty() else String(world.dun.name)
	_text(big, Vector2(240, 22), name_text.to_upper(), Color("f4e7b0"))
	var key := "BACK" if Controls.using_pad else "M"
	_text(big, Vector2(240, 262), "PRESS %s TO CLOSE" % key, Color(1, 1, 1, 0.7))
	_legend(big, minf(org.y + size.y + 14.0, 246.0))

func _legend(c: Control, y: float) -> void:
	var items := [["player", "YOU"], ["portal", "PORTAL"], ["exit", "EXIT"], ["enemy", "ENEMY"], ["rift", "RIFT"]]
	var x := 240.0 - 150.0
	for it in items:
		c.draw_rect(Rect2(x, y - 6, 5, 5), _marker_color(it[0]))
		c.draw_string(font, Vector2(x + 8, y), it[1], HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.75))
		x += 64.0

func _text(c: Control, pos: Vector2, s: String, color: Color) -> void:
	c.draw_string(font, pos - Vector2(149, -1), s, HORIZONTAL_ALIGNMENT_CENTER, 300, 10, Color("0a0612"))
	c.draw_string(font, pos - Vector2(150, 0), s, HORIZONTAL_ALIGNMENT_CENTER, 300, 10, color)
