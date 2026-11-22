extends CanvasLayer
## The on-screen display: bars, level, weapon, prompts, toasts, sign dialogs, pause screen.
## The web version draws these in HTML (src/ui/hud-dom.js); here it is one Control that draws itself.

var world
var canvas: Control
var font: Font
var prompt := ""
var dialog_open := false
var dialog_title := ""
var dialog_text := ""
var paused := false
var enemies_left := -1
var toasts: Array = []   # {text, t}

func setup(w) -> void:
	world = w
	font = w.font
	layer = 10
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_hud)
	add_child(canvas)
	enemies_left = world.total_enemies

func toast(text: String) -> void:
	toasts.append({"text": text, "t": 3.2})
	if toasts.size() > 3:
		toasts.pop_front()

func show_dialog(title: String, text: String) -> void:
	dialog_open = true
	dialog_title = title
	dialog_text = text

func close_dialog() -> void:
	dialog_open = false

func toggle_pause() -> void:
	paused = not paused

func _process(dt: float) -> void:
	for t in toasts:
		t.t -= dt
	toasts = toasts.filter(func(t): return t.t > 0.0)
	canvas.queue_redraw()

func _text(pos: Vector2, s: String, color: Color = Color.WHITE, size: int = 10, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	canvas.draw_string(font, pos + Vector2(1, 1), s, align, width, size, Color("0a0612"))
	canvas.draw_string(font, pos, s, align, width, size, color)

func _bar(pos: Vector2, w: float, h: float, frac: float, color: Color) -> void:
	canvas.draw_rect(Rect2(pos - Vector2(1, 1), Vector2(w + 2, h + 2)), Color("120d0a"))
	canvas.draw_rect(Rect2(pos, Vector2(w, h)), Color(color.r * 0.3, color.g * 0.3, color.b * 0.3))
	canvas.draw_rect(Rect2(pos, Vector2(w * clampf(frac, 0.0, 1.0), h)), color)

func _draw_hud() -> void:
	var p = world.player
	if p == null or p.stats.is_empty():
		return
	var prof: Dictionary = Game.profile
	# level, rank, bars
	var rank: String = p.stats.rank
	_text(Vector2(8, 15), "LV %d" % prof.level, Color.WHITE)
	_text(Vector2(46, 15), "RANK " + rank, Data.rank_color(rank))
	_bar(Vector2(8, 20), 100, 7, p.hp / p.stats.maxHealth, Color("d9503f"))
	_text(Vector2(112, 27), "%d" % roundi(p.hp), Color("ffb0a0"))
	_bar(Vector2(8, 30), 100, 5, p.stamina / p.stats.maxStamina, Color("5fd07a"))
	var y := 38
	if p.stats.maxMana > 0.0:
		_bar(Vector2(8, y), 100, 5, p.mana / p.stats.maxMana, Color("4f8dff"))
		y += 8
	var Prog = preload("res://scripts/logic/progression.gd")
	_bar(Vector2(8, y), 100, 2, float(prof.xp) / Prog.xp_to_next(prof.level), Color("ffe27a"))
	# where we are
	var name_text: String = String(world.floor_def.name) if not world.floor_def.is_empty() else String(world.dun.name)
	_text(Vector2(472, 15), name_text.to_upper(), Color("f4e7b0"), 10, HORIZONTAL_ALIGNMENT_RIGHT, 200)
	if not world.dun.is_empty():
		var s := "CLEARED" if world.cleared else "ENEMIES %d/%d" % [enemies_left, world.total_enemies]
		_text(Vector2(472, 25), s, Color("aaf0c0") if world.cleared else Color("ffb0a0"), 10, HORIZONTAL_ALIGNMENT_RIGHT, 200)
	# weapon
	var wn: String = String(p.weapon.name).to_upper()
	_text(Vector2(8, 262), wn, Color("f4e7b0"))
	# stamina low hint, key hints
	var pad: bool = Controls.using_pad
	var hint := "B ROLL   Y SWAP   A USE   START MENU" if pad else "SPACE ROLL   Q SWAP   E USE   TAB MENU"
	_text(Vector2(472, 262), hint, Color(1, 1, 1, 0.55), 10, HORIZONTAL_ALIGNMENT_RIGHT, 300)
	# prompt
	if prompt != "" and not dialog_open:
		var key := "A" if pad else "E"
		var s2 := "[%s] %s" % [key, prompt]
		canvas.draw_rect(Rect2(240 - 4 - s2.length() * 3, 232, s2.length() * 6 + 8, 13), Color(0.07, 0.05, 0.04, 0.8))
		_text(Vector2(240 - s2.length() * 3, 242), s2, Color("ffe27a"))
	# toasts
	var ty := 44
	for t in toasts:
		var a := clampf(t.t / 0.6, 0.0, 1.0)
		var w: float = String(t.text).length() * 6.0 + 12.0
		canvas.draw_rect(Rect2(240 - w / 2.0, ty - 9, w, 13), Color(0.07, 0.05, 0.04, 0.8 * a))
		_text(Vector2(240 - w / 2.0 + 6, ty), t.text, Color(1, 0.95, 0.75, a))
		ty += 15
	if dialog_open:
		_draw_dialog()
	if paused:
		_draw_pause()

func _draw_dialog() -> void:
	var r := Rect2(50, 40, 380, 190)
	canvas.draw_rect(r.grow(2), Color("c9a24a"))
	canvas.draw_rect(r, Color("1b1410"))
	_text(Vector2(66, 60), dialog_title, Color("ffe27a"))
	canvas.draw_multiline_string(font, Vector2(66, 82), dialog_text, HORIZONTAL_ALIGNMENT_LEFT, 348, 10, -1, Color("e8dcc0"))
	var key := "A" if Controls.using_pad else "E"
	_text(Vector2(300, 222), "[%s] CLOSE" % key, Color(1, 1, 1, 0.6), 10, HORIZONTAL_ALIGNMENT_RIGHT, 120)

func _draw_pause() -> void:
	canvas.draw_rect(Rect2(0, 0, 480, 270), Color(0, 0, 0, 0.6))
	var lines := [
		"PAUSED",
		"",
		"MOVE  WASD / LEFT STICK        AIM  MOUSE / RIGHT STICK",
		"ATTACK  CLICK / RT / X (HOLD = FOCUS)   ROLL  SPACE / B",
		"USE  E / A      SWAP WEAPON  Q / Y      LOCK-ON  T / R3",
		"",
		"START / TAB  RESUME            M / BACK  QUIT TO TITLE",
	]
	var y := 80
	for l in lines:
		_text(Vector2(0, y), l, Color("f4e7b0") if l != "PAUSED" else Color("ffe27a"), 10, HORIZONTAL_ALIGNMENT_CENTER, 480)
		y += 14
