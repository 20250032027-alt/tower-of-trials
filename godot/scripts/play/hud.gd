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
var enemies_left := -1
var obj_text := ""
var obj_dist := -1
var minimap
var toasts: Array = []   # {text, t}
var hurt_a := 0.0
var skill_flash := 0.0
var skill_flash_kind := ""
const TYPE_COLORS := {"Basic": "c9a77a", "Melee": "7fc47f", "Ranger": "6aa6d8", "Magic": "c48bd6", "Secret": "8a7a99"}
const SKILL_COLORS := {"heal": "7fe8a0", "secondwind": "7fe8a0", "mana": "6fa8ff", "shield": "9fd8ff", "mark": "ff6a5a", "cdcut": "c9a6ff", "bloodlust": "ff4a4a", "lifesteal": "ff4a6a", "predator": "ffb04a", "berserk": "ff3a2a", "buff": "ffe27a"}

func setup(w) -> void:
	world = w
	font = w.font
	layer = 10
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_hud)
	add_child(canvas)
	enemies_left = world.enemy_list.size()
	minimap = preload("res://scripts/ui/minimap.gd").new()
	add_child(minimap)
	minimap.setup(world, font)
	world.minimap = minimap

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

func flash_skill(kind: String) -> void:
	skill_flash = 1.0
	skill_flash_kind = kind

func _process(dt: float) -> void:
	var real_dt := dt / maxf(0.05, Engine.time_scale)
	hurt_a = maxf(0.0, hurt_a - real_dt * 2.4)
	skill_flash = maxf(0.0, skill_flash - real_dt * 2.5)
	for t in toasts:
		t.t -= real_dt
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
	_draw_objective()
	# weapon
	var wn: String = String(p.weapon.name).to_upper()
	_text(Vector2(8, 262), wn, Color("f4e7b0"))
	_draw_status(p)
	_draw_skill_box(p)
	# stamina low hint, key hints
	var pad: bool = Controls.using_pad
	var hint := "B ROLL   Y SWAP   A USE   BACK MAP   START MENU" if pad else "SPACE ROLL  Q SWAP  E USE  M MAP  TAB MENU"
	_text(Vector2(472, 262), hint, Color(1, 1, 1, 0.55), 10, HORIZONTAL_ALIGNMENT_RIGHT, 300)
	# prompt
	if prompt != "" and not dialog_open:
		var key := "A" if pad else "E"
		var s2 := "[%s] %s" % [key, prompt]
		canvas.draw_rect(Rect2(240 - 4 - s2.length() * 3, 232, s2.length() * 6 + 8, 13), Color(0.07, 0.05, 0.04, 0.8))
		_text(Vector2(240 - s2.length() * 3, 242), s2, Color("ffe27a"))
	if hurt_a > 0.0:
		canvas.draw_texture_rect(Data.tex("fx_vignette_red"), Rect2(0, 0, 480, 270), false, Color(1, 1, 1, hurt_a))
	# toasts
	var ty := 44
	for t in toasts:
		var a := clampf(t.t / 0.6, 0.0, 1.0)
		var w: float = String(t.text).length() * 6.0 + 12.0
		canvas.draw_rect(Rect2(240 - w / 2.0, ty - 9, w, 13), Color(0.07, 0.05, 0.04, 0.8 * a))
		_text(Vector2(240 - w / 2.0 + 6, ty), t.text, Color(1, 0.95, 0.75, a))
		ty += 15
	if world.wheel_open:
		_draw_wheel()
	if dialog_open:
		_draw_dialog()

## the goal chip at the top: "! text  12m"
func _draw_objective() -> void:
	if obj_text == "" or world.minimap.big_open:
		return
	var s := obj_text.to_upper()
	var dist := "  %dM" % obj_dist if obj_dist >= 0 else ""
	var w := (s.length() + dist.length()) * 6.0 + 26.0
	var r := Rect2(240.0 - w / 2.0, 5, w, 14)
	canvas.draw_rect(r, Color(0.07, 0.05, 0.04, 0.82))
	canvas.draw_rect(r, Color("c9a77a"), false, 1.0)
	canvas.draw_rect(Rect2(r.position + Vector2(3, 3), Vector2(8, 8)), Color("ffe27a"))
	_text(r.position + Vector2(5, 11), "!", Color("1a1208"))
	_text(r.position + Vector2(15, 11), s, Color("fff2c4"))
	if dist != "":
		_text(r.position + Vector2(15 + s.length() * 6.0, 11), dist, Color("9fc8ff"))

func _draw_dialog() -> void:
	var r := Rect2(50, 40, 380, 190)
	canvas.draw_rect(r.grow(2), Color("c9a24a"))
	canvas.draw_rect(r, Color("1b1410"))
	_text(Vector2(66, 60), dialog_title, Color("ffe27a"))
	canvas.draw_multiline_string(font, Vector2(66, 82), dialog_text, HORIZONTAL_ALIGNMENT_LEFT, 348, 10, -1, Color("e8dcc0"))
	var key := "A" if Controls.using_pad else "E"
	_text(Vector2(300, 222), "[%s] CLOSE" % key, Color(1, 1, 1, 0.6), 10, HORIZONTAL_ALIGNMENT_RIGHT, 120)

# ------------------------------------------------------------------ shield, buffs, Berserk cores
func _draw_status(p) -> void:
	# a shield sits over the health bar as a pale blue line
	if p.shield > 0.0:
		canvas.draw_rect(Rect2(8, 18, 100.0 * clampf(p.shield / p.stats.maxHealth, 0.0, 1.0), 2), Color("9fd8ff"))
	# the skills that are running, with the seconds they have left
	var y := 64 if p.stats.maxMana > 0.0 else 56
	for a in p.active_skills():
		var sd: Dictionary = Data.skill_by_id[a.id]
		var col := Color(SKILL_COLORS.get(sd.skill.kind, "ffe27a"))
		_text(Vector2(8, y), "%s %ds" % [String(sd.name).to_upper(), ceili(a.left)], col)
		y += 10
	if p.bloodlust.until > p.t:
		_text(Vector2(8, y), "BLOODLUST x%d" % p.bloodlust.stacks, Color("ff4a4a"))
		y += 10
	# Sword Aura: four cores and the state
	var b = p.berserk
	if p.weapon.cls == "melee" or b.active or b.decay or b.exhaustion > 0.0:
		var x := 8
		var cores: int = b.cores()
		for i in 4:
			var on: bool = i < cores
			canvas.draw_rect(Rect2(x + i * 9 - 1, 244, 9, 6), Color("120d0a"))
			canvas.draw_rect(Rect2(x + i * 9, 245, 7, 4), Color("ff3a2a") if on else Color("3a1a16"))
		var st: String = b.status()
		if st != "READY":
			_text(Vector2(46, 250), st if not (st == "EXHAUSTED") else "EXHAUSTED %ds" % ceili(b.exhaustion), Color("ff9a8a") if st == "BERSERK" else Color("b48aff") if st.begins_with("LIFE") else Color("b0b0c0"))
		elif b.force < 1.0:
			_text(Vector2(46, 250), "AURA %d%%" % roundi(b.force * 100.0), Color(1, 1, 1, 0.5))

func _draw_skill_box(p) -> void:
	var id = Game.profile.selSkill
	var sd = Data.skill_by_id.get(id) if id != null else null
	var w := 118.0
	var r := Rect2(240.0 - w / 2.0, 249, w, 18)
	var flash := skill_flash
	canvas.draw_rect(r.grow(1), Color("c9a24a") if flash <= 0.0 else Color("c9a24a").lerp(Color("ffffff"), flash))
	canvas.draw_rect(r, Color("1b1410"))
	var key := "LB" if Controls.using_pad else "F"
	if sd == null:
		_text(Vector2(r.position.x, 261), "[%s] SKILLS" % key, Color(1, 1, 1, 0.6), 10, HORIZONTAL_ALIGNMENT_CENTER, w)
		return
	var cd_left: float = float(p.cd.get(id, 0.0))
	var cd_max: float = maxf(0.001, float(p.cd_max.get(id, 1.0)))
	var kind := String(sd.skill.kind)
	var col := Color(SKILL_COLORS.get(kind, "ffe27a"))
	if cd_left > 0.0:
		canvas.draw_rect(Rect2(r.position, Vector2(w * (1.0 - cd_left / cd_max), 18)), Color(col.r, col.g, col.b, 0.22))
	_text(Vector2(r.position.x + 4, 258), String(sd.name).to_upper(), col if cd_left <= 0.0 else Color(1, 1, 1, 0.5), 10, HORIZONTAL_ALIGNMENT_LEFT, w - 30)
	_text(Vector2(r.position.x, 258), ("%ds" % ceili(cd_left)) if cd_left > 0.0 else "[%s]" % key, Color("ffe27a") if cd_left <= 0.0 else Color(1, 1, 1, 0.6), 10, HORIZONTAL_ALIGNMENT_RIGHT, w - 4)

# ------------------------------------------------------------------ the skill wheel
func _initials(n: String) -> String:
	var out := ""
	for w in n.split(" "):
		if w != "":
			out += w.substr(0, 1).to_upper()
	return out.substr(0, 2)

func _draw_wheel() -> void:
	var n: int = Data.skills.size()
	var sel: int = world.wheel_idx
	var p = world.player
	canvas.draw_rect(Rect2(0, 0, 480, 270), Color(0, 0, 0, 0.55))
	var c := Vector2(240, 112)
	var R := 62.0
	canvas.draw_arc(c, R, 0.0, TAU, 64, Color(0.79, 0.64, 0.29, 0.35), 1.0)
	for i in n:
		var k := (i - sel + n) % n
		if k > n / 2:
			k -= n
		var ang := -PI / 2.0 + float(k) * TAU / n
		var pos := c + Vector2(cos(ang), sin(ang)) * R
		var sd: Dictionary = Data.skills[i]
		var col := Color(TYPE_COLORS.get(sd.type, "c9a77a"))
		var cd_left: float = float(p.cd.get(sd.id, 0.0))
		var is_sel := k == 0
		var rad := 11.0 if is_sel else 6.5
		canvas.draw_circle(pos, rad + 1.0, Color("c9a24a") if is_sel else Color("120d0a"))
		canvas.draw_circle(pos, rad, Color(col.r * 0.45, col.g * 0.45, col.b * 0.45) if cd_left <= 0.0 else Color(0.2, 0.2, 0.22))
		if float(p.active_until.get(sd.id, 0.0)) > p.t:
			canvas.draw_arc(pos, rad + 2.0, 0.0, TAU, 20, Color("ffe27a"), 1.0)
		if is_sel or n <= 12:
			_text(pos + Vector2(-10, 4), _initials(sd.name), col if cd_left <= 0.0 else Color(0.6, 0.6, 0.6), 10, HORIZONTAL_ALIGNMENT_CENTER, 20)
	var s: Dictionary = Data.skills[sel]
	var sk: Dictionary = s.skill
	var kind := String(sk.kind)
	var cd_s: float = float(p.cd.get(s.id, 0.0))
	var box := Rect2(60, 188, 360, 70)
	canvas.draw_rect(box.grow(1), Color("c9a24a"))
	canvas.draw_rect(box, Color("1b1410"))
	_text(box.position + Vector2(8, 13), String(s.name).to_upper(), Color(SKILL_COLORS.get(kind, "ffe27a")))
	_text(box.position + Vector2(box.size.x - 8 - 200, 13), "%s   (%d/%d)" % [String(s.type).to_upper(), sel + 1, n], Color(TYPE_COLORS.get(s.type, "c9a77a")), 10, HORIZONTAL_ALIGNMENT_RIGHT, 200)
	canvas.draw_multiline_string(font, box.position + Vector2(8, 28), String(sk.text), HORIZONTAL_ALIGNMENT_LEFT, 344, 10, 2, Color("e8dcc0"))
	var a := float(sk.active)
	var info := ("%ds ACTIVE" % int(a) if a > 0.0 else "INSTANT") + " / %ds CD" % int(float(sk.cooldown))
	var state := "READY" if cd_s <= 0.0 else "COOLDOWN %ds" % ceili(cd_s)
	_text(box.position + Vector2(8, 54), info + "    " + state, Color("aaf0c0") if cd_s <= 0.0 else Color("ff9a8a"))
	var hint := "A USE   D-PAD SCROLL   B CLOSE" if Controls.using_pad else "F / ENTER USE   Q E OR WHEEL SCROLL   ESC CLOSE"
	_text(Vector2(0, 266), hint, Color(1, 1, 1, 0.55), 10, HORIZONTAL_ALIGNMENT_CENTER, 480)
