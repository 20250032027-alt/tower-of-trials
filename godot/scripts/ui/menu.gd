extends CanvasLayer
## The in-game menu (Tab / Esc / Start): STATUS, LOADOUT, WEAPONS, MAGIC, TOWER, HELP, TUNING, DEMO.
## Port of src/ui/ui.js. Built from Godot Controls, so mouse, keyboard and gamepad (D-pad + A, B closes, LB / RB change tab) all work.
const Stats = preload("res://scripts/logic/stats.gd")
const Progression = preload("res://scripts/logic/progression.gd")
const Theme_ = preload("res://scripts/ui/ui_theme.gd")

const TABS := [["status", "STATUS"], ["traits", "LOADOUT"], ["weapons", "WEAPONS"], ["magic", "MAGIC"], ["tower", "TOWER"], ["help", "HELP"], ["tuning", "TUNING"], ["demo", "DEMO"]]
const TYPE_COLORS := {"Basic": "c9a77a", "Melee": "7fc47f", "Ranger": "6aa6d8", "Magic": "c48bd6", "Secret": "8a7a99"}
const CLASS_COLORS := {"melee": "7fc47f", "ranger": "6aa6d8", "magic": "c48bd6"}
const CLASS_NAMES := {"melee": "MELEE", "ranger": "RANGER", "magic": "MAGIC"}

var world
var is_open := false
var tab := "status"
var trait_filter := "all"
var tower_floor := ""
var lvl_pick := 1
var _focus_id := ""
var _armed := ""
var root: Control
var tab_row: HBoxContainer
var scroll: ScrollContainer
var content: VBoxContainer
var _tab_buttons: Dictionary = {}
var _circles_before := 0

func setup(w) -> void:
	world = w
	layer = 20
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = Theme_.make()
	root.visible = false
	add_child(root)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.7)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(dim)
	var panel := PanelContainer.new()
	panel.position = Vector2(14, 8)
	panel.size = Vector2(452, 254)
	root.add_child(panel)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 3)
	panel.add_child(vb)
	tab_row = HBoxContainer.new()
	tab_row.add_theme_constant_override("separation", 2)
	vb.add_child(tab_row)
	for t in TABS:
		var b := Button.new()
		b.text = t[1]
		b.toggle_mode = false
		var id: String = t[0]
		b.pressed.connect(func(): _set_tab(id))
		tab_row.add_child(b)
		_tab_buttons[id] = b
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	vb.add_child(scroll)
	content = VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 3)
	scroll.add_child(content)
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 4)
	vb.add_child(foot)
	var hint := Label.new()
	hint.text = "TAB / ESC / START CLOSE    LB / RB TABS"
	hint.add_theme_color_override("font_color", Theme_.DIM)
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(hint)
	var b1 := Button.new()
	b1.text = "RESUME"
	b1.pressed.connect(close)
	foot.add_child(b1)
	var b2 := Button.new()
	b2.text = "TITLE"
	b2.pressed.connect(func():
		close()
		Game.go_title())
	foot.add_child(b2)

func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if event.is_action_pressed("menu") or event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()
	elif event.is_action_pressed("skill_wheel"):
		get_viewport().set_input_as_handled()
		_step_tab(-1)
	elif event.is_action_pressed("aura"):
		get_viewport().set_input_as_handled()
		_step_tab(1)

func _step_tab(d: int) -> void:
	var i := 0
	for k in TABS.size():
		if TABS[k][0] == tab:
			i = k
	_set_tab(TABS[(i + d + TABS.size()) % TABS.size()][0])

func open(start_tab: String = "") -> void:
	if is_open:
		return
	is_open = true
	if start_tab != "":
		tab = start_tab
	_circles_before = int(Game.profile.manaCircles)
	Game.muffle(true)
	root.visible = true
	_focus_id = ""
	render()
	Game.sfx("ui")
	(_tab_buttons[tab] as Button).grab_focus()

func close() -> void:
	if not is_open:
		return
	is_open = false
	root.visible = false
	Game.muffle(false)
	Game.persist()
	Game.save_settings()
	world.menu_lock_until = Time.get_ticks_msec() + 300
	if world.player != null:
		world.player.reload_loadout(_circles_before == 0 and int(Game.profile.manaCircles) > 0)
		if Game.pending_heal:
			Game.pending_heal = false
			world.player.hp = world.player.stats.maxHealth
			world.player.stamina = world.player.stats.maxStamina
			world.player.mana = world.player.stats.maxMana
	Game.sfx("ui")

func _set_tab(id: String) -> void:
	tab = id
	_focus_id = ""
	Game.sfx("ui")
	render()
	scroll.scroll_vertical = 0

# ------------------------------------------------------------------ small builders
func _label(text: String, color: Color = Theme_.TEXT, wrap: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.custom_minimum_size.x = 100
	return l

func _add(n: Control) -> Control:
	content.add_child(n)
	return n

func _head(text: String, color: Color = Theme_.GOLD) -> void:
	var sp := Control.new()
	sp.custom_minimum_size.y = 3
	_add(sp)
	_add(_label(text, color))

func _hint(text: String, color: Color = Theme_.DIM) -> void:
	_add(_label(text, color, true))

func _kv(a: String, b: String, note: String = "") -> void:
	var h := HBoxContainer.new()
	var la := _label(a)
	la.custom_minimum_size.x = 150
	var lb := _label(b, Theme_.GOLD_HI)
	lb.custom_minimum_size.x = 96
	h.add_child(la)
	h.add_child(lb)
	if note != "":
		h.add_child(_label(note, Theme_.DIM, true))
	_add(h)

func _button(text: String, id: String, cb: Callable, disabled: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.disabled = disabled
	b.set_meta("fid", id)
	b.pressed.connect(func():
		_focus_id = id
		cb.call())
	return b

func _flow(buttons: Array) -> void:
	var f := HFlowContainer.new()
	f.add_theme_constant_override("h_separation", 3)
	f.add_theme_constant_override("v_separation", 3)
	for b in buttons:
		f.add_child(b)
	_add(f)

func _card(title: String, title_color: Color, lines: Array, btn: Button = null, highlight: bool = false, dim: bool = false) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.box(Color("241a12") if not highlight else Color("2e2414"), Theme_.GOLD_HI if highlight else Color("4a3c28"), 1, 5, 3))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 6)
	p.add_child(h)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 1)
	h.add_child(v)
	v.add_child(_label(title, title_color if not dim else Theme_.DIM))
	for l in lines:
		if l is Array:
			v.add_child(_label(l[0], l[1], true))
		else:
			v.add_child(_label(l, Theme_.TEXT if not dim else Theme_.DIM, true))
	if btn != null:
		btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(btn)
	_add(p)

func _slider(label: String, key: String, value: float, lo: float, hi: float, step: float, on_change: Callable, fmt: Callable) -> void:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 4)
	var l := _label(label)
	l.custom_minimum_size.x = 226
	h.add_child(l)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.value = value
	s.custom_minimum_size = Vector2(120, 10)
	s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	s.set_meta("fid", "sl_" + key)
	h.add_child(s)
	var vl := _label(fmt.call(value), Theme_.GOLD_HI)
	vl.custom_minimum_size.x = 40
	h.add_child(vl)
	s.value_changed.connect(func(v: float):
		_focus_id = "sl_" + key
		vl.text = fmt.call(v)
		on_change.call(v))
	_add(h)

func _pct(v: float, d: int = 0) -> String:
	return ("%." + str(d) + "f%%") % (v * 100.0)

func _fmt_time(s: float) -> String:
	if s >= 60.0:
		var m := s / 60.0
		return (str(int(m)) if is_equal_approx(m, floor(m)) else "%.1f" % m) + "m"
	return str(int(s)) + "s"

func _timing(sk: Dictionary) -> String:
	var a: float = float(sk.active)
	return (_fmt_time(a) + " ACTIVE" if a > 0.0 else "INSTANT") + " / " + _fmt_time(float(sk.cooldown)) + " CD"

func _toast(msg: String) -> void:
	world.toast(msg)

func _changed() -> void:
	Game.persist()
	render()

# ------------------------------------------------------------------ render
func render() -> void:
	var keep := scroll.scroll_vertical
	for c in content.get_children():
		content.remove_child(c)
		c.queue_free()
	for id in _tab_buttons:
		var b: Button = _tab_buttons[id]
		b.add_theme_color_override("font_color", Theme_.GOLD_HI if id == tab else Theme_.TEXT)
		b.add_theme_stylebox_override("normal", Theme_.box(Color("4a3820"), Theme_.GOLD_HI, 1) if id == tab else Theme_.box(Theme_.BG2, Color("6b5a3a"), 1))
	match tab:
		"status": _r_status()
		"traits": _r_traits()
		"weapons": _r_weapons()
		"magic": _r_magic()
		"tower": _r_tower()
		"help": _r_help()
		"tuning": _r_tuning()
		"demo": _r_demo()
	_after_render.call_deferred(keep)

func _after_render(keep: int) -> void:
	await get_tree().process_frame
	if not is_open:
		return
	scroll.scroll_vertical = keep
	if _focus_id != "":
		for n in _find_fid(content, _focus_id):
			(n as Control).grab_focus()
			break

func _find_fid(n: Node, id: String) -> Array:
	var out: Array = []
	for c in n.get_children():
		if c.has_meta("fid") and c.get_meta("fid") == id and not (c is Button and c.disabled):
			out.append(c)
		out.append_array(_find_fid(c, id))
	return out

# ------------------------------------------------------------------ STATUS
func _r_status() -> void:
	var p: Dictionary = Game.profile
	var s: Dictionary = Stats.compute(int(p.level), int(p.manaCircles), Stats.trait_passives(p.traits), p.extra, {}, p.proficiency)
	var rank: String = Data.rank_of_level(int(p.level))
	var need := Progression.xp_to_next(int(p.level))
	var maxed: bool = int(p.level) >= int(Data.constants.LEVEL_MAX)
	_add(_label("RANK %s    LEVEL %d  (%d-%d IN THIS DEMO)" % [rank, p.level, Data.constants.LEVEL_MIN, Data.constants.LEVEL_MAX], Data.rank_color(rank)))
	_add(_label("MAX LEVEL" if maxed else "%d / %d XP     KILLS %d" % [int(p.xp), need, p.kills], Theme_.GOLD_HI))
	_head("BASIC")
	_kv("Health", str(roundi(s.maxHealth)))
	_kv("Defense", "%.1f" % s.defense, "10% of Health")
	_kv("Stamina", str(roundi(s.maxStamina)))
	_kv("Mana", str(roundi(s.maxMana)), "" if s.maxMana > 0.0 else "needs a Mana Circle")
	_head("RECOVERY PER SECOND (in / out of combat)")
	for k in ["health", "stamina", "mana"]:
		_kv(k.capitalize(), "%s / %s" % [_pct(s.regen[k].combat, 1), _pct(s.regen[k].out, 1)])
	_head("CRITICALS")
	_kv("Crit Rate", _pct(s.critRate, 1))
	_kv("Crit Damage", _pct(s.critDamage, 1))
	_head("MOVEMENT")
	_kv("Movement Speed", _pct(s.moveSpeed))
	_kv("Dodge Distance", _pct(s.dodgeDistance))
	_kv("Dodge Cooldown", "%s secs" % s.dodgeCooldown)
	_kv("Dodge Stamina Use", _pct(s.dodgeStamina, 1))
	_head("DAMAGE MULTIPLIERS")
	_kv("Damage", _pct(s.damage))
	_kv("Melee Damage", _pct(s.meleeDamage))
	_kv("Range Damage", _pct(s.rangeDamage))
	_kv("Magic Damage", _pct(s.magicDamage))
	_kv("Damage Reduction", _pct(s.damageReduction))
	_head("WEAPON TYPE PROFICIENCY")
	_kv("Weapon Proficiency Rate", _pct(s.weaponMastery))
	_kv("Melee Proficiency", _pct(s.proficiency.melee, 1))
	_kv("Ranger Proficiency", _pct(s.proficiency.ranger, 1))
	_kv("Magic Proficiency", _pct(s.proficiency.magic, 1))
	_head("OTHER")
	_kv("Experience Rate", _pct(s.expRate))
	_kv("Focus Speed", _pct(s.focusSpeed), "100%% = %ss to 100%% focus" % Data.constants.FOCUS.secondsTo100)
	_kv("Loot luck", ("+" + _pct(s.lootLuck)) if s.lootLuck > 0.0 else "-")
	_head("LEVEL RANKS")
	var parts := ""
	for r in Data.constants.RANKS:
		parts += "%s %d%s   " % [r.rank, r.min, "+" if float(r.max) >= 1e8 else "-" + str(int(r.max))]
	_hint(parts)
	_hint("Level up growth: +5% every basic stat, +1% every Criticals stat. Trait or Skill rank does not change your Level Rank.")

# ------------------------------------------------------------------ LOADOUT
func _trait_card(t: Dictionary, read_only: bool) -> void:
	var equipped: bool = Game.profile.traits.has(t.id)
	var col := Color(TYPE_COLORS[t.type])
	if t.get("secret", false):
		_card("??? (SECRET)", Color(TYPE_COLORS.Secret), [["PASSIVE ???", Theme_.DIM], ["Find the way to unlock it.", Theme_.DIM]], null, false, true)
		return
	var rank_text := "?" if t.type == "Magic" else String(t.rank)
	var rk_col: Color = col if t.type == "Magic" else Data.rank_color(t.rank)
	var btn: Button = null
	if read_only:
		btn = null
	else:
		btn = _button("EQUIPPED" if equipped else "EQUIP", "eq_" + t.id, func():
			Game.profile.traits = [t.id]
			Game.profile.awakened = false
			Game.first_run = false
			Game.sfx("ui")
			_changed())
	_card("[%s] %s  (%s)" % [rank_text, String(t.name).to_upper(), String(t.type).to_upper()], rk_col, ["PASSIVE  " + String(t.effects)], btn, equipped)

func _r_traits() -> void:
	var p: Dictionary = Game.profile
	var random: bool = Game.settings.trait_mode != "pick"
	if random:
		_hint("You carry ONE trait per run: a passive that is always on. It is dealt by rarity (F is common, S is very rare) when you start a new game, fall, or leave a dungeon, and you get one reroll. Skills are separate: you own all of them and use them from the skill wheel (F).", Theme_.GOLD_HI if Game.first_run else Theme_.DIM)
	_flow([
		_button("RANDOM EACH RUN" + (" *" if random else ""), "m_rand", func(): _trait_mode("random")),
		_button("PICK MYSELF" + (" *" if not random else ""), "m_pick", func(): _trait_mode("pick")),
	])
	_head("YOUR TRAIT")
	var t = Data.trait_by_id.get(p.traits[0]) if not p.traits.is_empty() else null
	if t == null:
		_add(_label("NO TRAIT.  " + ("Nothing dealt yet." if random else "Pick one in the list below."), Theme_.DIM))
	else:
		_card(String(t.name).to_upper(), Data.rank_color(t.rank) if t.type != "Magic" else Color(TYPE_COLORS.Magic), [String(t.effects), [("INNATE TALENT" if t.type == "Magic" else "RANK " + String(t.rank)), Theme_.DIM]],
			null if random else _button("REMOVE", "rm", func():
				p.traits = []
				_changed()), true)
	if random:
		var left: int = int(p.rerolls)
		_flow([_button("REROLL TRAIT (%d LEFT)" % left, "reroll", func():
			Game.profile.traits = Progression.roll_run_traits(Game.rng, 1, Game.profile.traits)
			Game.profile.rerolls = int(Game.profile.rerolls) - 1
			Game.profile.awakened = false
			Game.first_run = false
			Game.sfx("levelup")
			_toast("NEW TRAIT: " + String(Data.trait_by_id[Game.profile.traits[0]].name).to_upper())
			_changed(), left <= 0)])
	_head("SKILLS (%d)" % Data.skills.size())
	_hint("Press F (LB on a pad) in the game to open the skill wheel. Scroll round it, then use the one at the top. The game slows down while it is open.")
	for sd in Data.skills:
		var sk: Dictionary = sd.skill
		_card(String(sd.name).to_upper() + "  (" + String(sd.type).to_upper() + ")", Color(TYPE_COLORS[sd.type]), [String(sk.text), [_timing(sk), Theme_.DIM]])
	_head("TRAIT CODEX" if random else "TRAIT LIBRARY")
	var chips: Array = []
	for f in ["all", "Basic", "Melee", "Ranger", "Magic", "Secret"]:
		var id: String = f
		chips.append(_button(String(f).to_upper() + (" *" if trait_filter == f else ""), "f_" + f, func():
			trait_filter = id
			render()))
	_flow(chips)
	var shown: Array = Data.traits.filter(func(x): return trait_filter == "all" or x.type == trait_filter or (trait_filter == "Secret" and x.get("secret", false)))
	for r in Data.constants.RANK_ORDER:
		var ts: Array = shown.filter(func(x): return x.rank == r and x.type != "Magic")
		if ts.is_empty():
			continue
		_head("%s RANK" % r, Data.rank_color(r))
		for x in ts:
			_trait_card(x, random)
	var magic: Array = shown.filter(func(x): return x.type == "Magic")
	if not magic.is_empty():
		_head("INNATE TALENTS", Color(TYPE_COLORS.Magic))
		for x in magic:
			_trait_card(x, random)
	var B: Dictionary = Data.constants.BERSERK
	_head("SWORD AURA  [R]")
	_hint("Physical Force is split into %d Aura Cores (25%% each). Each Berserk activation burns one Core, then Force drains %s per second. Empty = Life Force Decay (damage taken, move speed -70%%). Ending it early = Exhaustion (lighter penalties). A Core comes back after 15s without activation. Melee weapons only." % [B.maxCores, _pct(float(B.drainPerSecond), 1)])

func _trait_mode(m: String) -> void:
	Game.settings.trait_mode = m
	Game.save_settings()
	Game.sfx("ui")
	_toast("YOU CHOOSE YOUR TRAIT." if m == "pick" else "A TRAIT IS DEALT AGAIN FROM YOUR NEXT RUN.")
	render()

# ------------------------------------------------------------------ WEAPONS
func _r_weapons() -> void:
	var p: Dictionary = Game.profile
	_hint("Every Training weapon is unlocked for the demo. Switch in the game with Q (Y on a pad).")
	for cls in ["melee", "ranger", "magic"]:
		_head(CLASS_NAMES[cls], Color(CLASS_COLORS[cls]))
		for id in Data.weapons:
			var w: Dictionary = Data.weapons[id]
			if w.cls != cls:
				continue
			var eq: bool = p.weapon == w.id
			var blocked: bool = cls == "magic" and int(p.manaCircles) <= 0
			var sheet := ""
			for k in w.sheet:
				sheet += "%s: %s   " % [k, w.sheet[k]]
			var lines: Array = [sheet]
			if cls == "magic":
				var extra := ("+%d" % int(w.charge.extraMana)) if w.has("charge") else ""
				lines.append([("Mana cost %d%s, %s" % [int(w.mana), extra, "hold to charge, release to slam" if w.has("charge") else "floats beside you, hold to cast"]), Theme_.DIM])
			var wid: String = w.id
			_card("%s  (%s)" % [String(w.name).to_upper(), String(w.type)], Theme_.GOLD_HI if eq else Theme_.TEXT, lines,
				_button("EQUIPPED" if eq else ("NEEDS MANA" if blocked else "EQUIP"), "w_" + wid, func():
					Game.profile.weapon = wid
					Game.sfx("ui")
					_changed(), blocked and not eq), eq)

# ------------------------------------------------------------------ MAGIC
func _r_magic() -> void:
	var p: Dictionary = Game.profile
	var talent = Progression.innate_talent(p)
	_hint("Magic and Mana cannot be acquired by any means without the proper affinity and talent. Only select Innate Talents (Magic-type traits) can manifest Mana Circles in their hearts. Mana is the essence given by a Constellation.")
	_add(_label("MANA CIRCLES: %d" % p.manaCircles, Theme_.GOLD_HI))
	_add(_label(("Innate Talent: " + String(talent.name)) if talent != null else "No Innate Talent in your traits. Get a Magic trait first (LOADOUT tab).", Color(TYPE_COLORS.Magic) if talent != null else Theme_.DIM, true))
	_flow([
		_button("AWAKEN MANA CIRCLES", "awaken", _awaken, talent == null),
		_button("RESET (DEMO)", "resetc", func():
			p.manaCircles = 0
			p.manaType = null
			p.awakened = false
			_changed(), int(p.manaCircles) == 0),
	])
	_hint("Demo: you can re-roll as many times as you like. Mana = %s per circle at level 1 [placeholder value]." % Data.constants.UNITS.manaPerCircle)
	_head("TYPES OF MANA")
	for id in Data.constants.MANA_TYPES:
		var m: Dictionary = Data.constants.MANA_TYPES[id]
		var mid: String = id
		var chosen: bool = p.manaType == id
		_card(String(m.name), Color(m.color), [String(m.desc), ["Magic: " + ", ".join(m.magic), Theme_.DIM]],
			_button("CHOSEN" if chosen else "CHOOSE", "mt_" + mid, func():
				Game.profile.manaType = mid
				Game.sfx("ui")
				_changed(), int(p.manaCircles) <= 0), chosen)
	_head("MAGIC OF YOUR MANA")
	if p.manaType != null:
		for m in Data.constants.MANA_TYPES[p.manaType].magic:
			_add(_label(String(m).to_upper() + "   LOCKED - spell stats are blank in the plan", Theme_.DIM))
	else:
		_add(_label("Choose a mana type to see its magic.", Theme_.DIM))
	_hint("The Book (quick, floats beside you) and the Staff (hold to charge, then slam) cast in the look of your mana type.")

func _awaken() -> void:
	var p: Dictionary = Game.profile
	var talent = Progression.innate_talent(p)
	if talent == null:
		return
	var n := Progression.roll_mana_circles(talent.rank, Game.rng)
	p.manaCircles = n
	p.awakened = true
	if n == 0:
		p.manaType = null
		_toast("%s: NO MANA CIRCLE FORMED. THE AFFINITY WAS TOO WEAK THIS TIME." % String(talent.name).to_upper())
		Game.sfx("deny")
	else:
		Game.sfx("levelup")
		_toast("%d MANA CIRCLE%s FORMED IN YOUR HEART!" % [n, "S" if n > 1 else ""])
		if talent.rank == "S":
			_toast(String(Data.constants.GEMINI_NOTICE))
		if p.manaType == null:
			p.manaType = "natural"
	_changed()

# ------------------------------------------------------------------ TOWER
func _r_tower() -> void:
	var p: Dictionary = Game.profile
	var here: String = world.floor_id()
	var sel: String = tower_floor if tower_floor != "" else ("floor1" if here == "tutorial" else here)
	var cleared := func(id: String) -> bool:
		return bool(p.flags.get("trialCleared", false)) if id == "tutorial" else bool(p.flags.get(id + "Cleared", false))
	_hint("The Tower has 11 Floors: 1 Tutorial Floor and 10 Main Floors. Clear a floor's main dungeon to open its stairs up. (Floors 2-10 are placeholder designs until the plan fills them in.)")
	for i in Data.tower.size():
		var f: Dictionary = Data.tower[i]
		var fid: String = f.id
		var cur: bool = here == fid
		var ds: Array = _dungeons_of(fid)
		var done := 0
		for d in ds:
			if p.flags.get("cleared_" + d.id, false):
				done += 1
		var open: bool = i == 0 or (i == 1 and cleared.call("tutorial")) or (i > 1 and cleared.call(Data.tower[i - 1].id))
		var sub := "Tutorial Floor" if fid == "tutorial" else ("CLEARED" if cleared.call(fid) else ("OPEN" if open else "LOCKED"))
		if fid != "tutorial" and not ds.is_empty():
			sub += " - %d/%d dungeons done" % [done, ds.size()]
		var fname: String = String(Data.floors[fid].name) if Data.floors.has(fid) else String(f.label)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 3)
		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.add_child(_label(fname.to_upper(), Theme_.GOLD_HI if cur else (Theme_.TEXT if open else Theme_.DIM)))
		info.add_child(_label(sub, Theme_.DIM))
		row.add_child(info)
		row.add_child(_button("DUNGEONS", "ts_" + fid, func():
			tower_floor = fid
			render()))
		row.add_child(_button("RESTART" if cur else ("TRAVEL" if open else "TRAVEL (DEMO)"), "tr_" + fid, func():
			close()
			world.travel(fid)))
		_add(row)
	_head(("%s: DUNGEONS" % (String(Data.floors[sel].name) if Data.floors.has(sel) else sel)).to_upper())
	var list := _dungeons_of(sel)
	if list.is_empty():
		_hint("No dungeons here, just the way up.")
	for d in list:
		var hidden: bool = d.kind == "hidden" and not p.flags.get("seen_" + d.id, false)
		var done2: bool = p.flags.get("cleared_" + d.id, false)
		_add(_label("%s  %s  %s  %s" % [("HIDDEN" if hidden else String(d.kind).to_upper()), ("???" if hidden else String(d.name)), ("" if hidden else "RANK " + String(d.rank)), ("CLEARED" if done2 else "")], Theme_.DIM if hidden else (Theme_.GOOD if done2 else Theme_.TEXT)))
	_hint("DOUBLE  Rifts: appear rarely inside preset (very low chance) and randomized (low chance) dungeons.")

func _dungeons_of(floor_id: String) -> Array:
	var out: Array = []
	for id in Data.dungeons:
		if Data.dungeons[id].floor == floor_id:
			out.append(Data.dungeons[id])
	return out

# ------------------------------------------------------------------ HELP
func _r_help() -> void:
	var S: Dictionary = Game.settings
	_head("CONTROLS")
	for r in [["W A S D", "Move (arrow keys work too)"], ["MOUSE", "Aim"], ["CLICK", "Attack. Hold to Focus / Cast"], ["SPACE", "Dodge roll"],
			["F", "Skill wheel: Q / E or the mouse wheel to scroll, F or ENTER to use"], ["T", "Lock-on on / off"], ["R", "Sword Aura (Berserk)"], ["Q", "Swap weapon"],
			["E", "Use / open / read"], ["M", "Full map"], ["TAB", "Menu (ESC too)"], ["N", "Sound on / off"]]:
		_kv(r[0], "", r[1])
	_head("CONTROLLER")
	for r in [["L STICK", "Move (D-pad too)"], ["R STICK", "Aim. Let go and it faces your target"], ["RT / X", "Attack. Hold to Focus / Cast"], ["B / LT", "Dodge roll"],
			["LB", "Skill wheel: D-pad or sticks scroll, A or LB uses, B closes"], ["A", "Use / open / read"], ["RB", "Sword Aura (Berserk)"], ["Y", "Swap weapon"], ["R3", "Lock-on on / off"], ["BACK", "Full map"], ["START", "Menu"]]:
		_kv(r[0], "", r[1])
	_hint("Menus with a controller: D-pad moves the highlight, A presses, B or START closes, LB / RB change tab.")
	_hint("Tip: the yellow arrow always points at your next goal. If you ever feel lost, just follow it.")
	_head("ENEMIES")
	_kv("Skeletons notice you", "", "when you are in THEIR room and they can see you, or right beside them")
	_kv("?  above a skeleton", "", "unsure: it is about to notice you. Back out of the room to stay hidden")
	_kv("!  above a skeleton", "", "it spotted you and is coming")
	_kv("Walls block sight", "", "break line of sight and it gives up and searches")
	_kv("Fighting is loud", "", "other skeletons in the same room join in")
	_head("AUDIO")
	_slider("MUSIC", "music", float(S.music_vol) * 100.0, 0, 100, 5, func(v: float):
		S.music_vol = v / 100.0
		Game.apply_audio(), func(v: float): return str(int(v)))
	_slider("EFFECTS", "sfx", float(S.sfx_vol) * 100.0, 0, 100, 5, func(v: float):
		S.sfx_vol = v / 100.0
		Game.apply_audio(), func(v: float): return str(int(v)))
	_slider("SCREEN SHAKE", "shake", float(S.shake) * 100.0, 0, 100, 5, func(v: float): S.shake = v / 100.0, func(v: float): return str(int(v)))
	_flow([_button("SOUND: " + ("OFF" if S.muted else "ON"), "snd", func():
		S.muted = not S.muted
		Game.apply_audio()
		render())])
	_head("GUIDE & DISPLAY")
	var toggles: Array = []
	for t in [["guide", "GOAL ARROW"], ["minimap", "MINIMAP"], ["auto_aim", "AUTO-AIM (PAD)"], ["rumble", "RUMBLE"], ["lock_on", "LOCK-ON (T)"]]:
		var k: String = t[0]
		toggles.append(_button("%s: %s" % [t[1], "ON" if S[k] else "OFF"], "o_" + k, func():
			S[k] = not S[k]
			Game.sfx("ui")
			render()))
	toggles.append(_button("TOUCH CONTROLS: " + String(S.get("touch", "auto")).to_upper(), "o_touch", func():
		S.touch = {"auto": "on", "on": "off", "off": "auto"}[String(S.get("touch", "auto"))]
		Game.sfx("ui")
		render()))
	toggles.append(_button("SHOW TIPS AGAIN", "tips", func():
		for f in Game.profile.flags.keys():
			if String(f).begins_with("tip_"):
				Game.profile.flags.erase(f)
		_toast("TIPS WILL SHOW AGAIN.")))
	_flow(toggles)

# ------------------------------------------------------------------ TUNING
func _r_tuning() -> void:
	_hint("Change the numbers and play on: they apply at once and are saved. Lock-on and the rest are on the HELP tab.")
	_flow([
		_button("COPY ALL (JSON)", "tcopy", func():
			DisplayServer.clipboard_set(Game.tune_json())
			_toast("TUNING COPIED.")),
		_button("RESET ALL", "treset", func():
			Game.reset_tune()
			_toast("TUNING BACK TO THE DEFAULTS.")
			render()),
	])
	for g in Data.tuning_groups:
		_head(String(g.name))
		_hint(String(g.note))
		for it in g.items:
			var key: String = it.key
			var item: Dictionary = it
			var h := HBoxContainer.new()
			h.add_theme_constant_override("separation", 4)
			var l := _label(String(item.label), Theme_.GOLD_HI if Game.tune_changed(key) else Theme_.TEXT)
			l.custom_minimum_size.x = 226
			h.add_child(l)
			var s := HSlider.new()
			s.min_value = float(item.min)
			s.max_value = float(item.max)
			s.step = float(item.step)
			s.value = Game.t(key)
			s.custom_minimum_size = Vector2(90, 10)
			s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			s.set_meta("fid", "tn_" + key)
			h.add_child(s)
			var vl := _label(Game.tune_text(item, Game.t(key)), Theme_.GOLD_HI)
			vl.custom_minimum_size.x = 36
			h.add_child(vl)
			s.value_changed.connect(func(v: float):
				_focus_id = "tn_" + key
				Game.set_tune(key, v)
				vl.text = Game.tune_text(item, Game.t(key))
				l.add_theme_color_override("font_color", Theme_.GOLD_HI if Game.tune_changed(key) else Theme_.TEXT))
			h.add_child(_button("RESET", "tr_" + key, func():
				Game.reset_tune(key)
				render()))
			_add(h)

# ------------------------------------------------------------------ DEMO
func _r_demo() -> void:
	var p: Dictionary = Game.profile
	_slider("LEVEL", "lvl", lvl_pick, float(Data.constants.LEVEL_MIN), float(Data.constants.LEVEL_MAX), 1, func(v: float): lvl_pick = int(v), func(v: float): return str(int(v)))
	_flow([
		_button("SET LEVEL", "setlvl", func():
			Progression.set_level(p, lvl_pick)
			Game.pending_heal = true
			_changed()),
		_button("+200 XP", "xp", func():
			Progression.add_xp(p, 200.0, 1.0, Game.rng)
			Game.pending_heal = true
			_changed()),
		_button("FULL HEAL", "heal", func():
			Game.pending_heal = true
			_toast("FULLY HEALED.")),
		_button("UNLOCK ALL STAIRS", "unlock", func():
			p.flags["trialCleared"] = true
			for i in range(1, 11):
				p.flags["floor%dCleared" % i] = true
			_toast("ALL STAIRS UNLOCKED (RE-ENTER THE FLOOR TO SEE THEM).")
			_changed()),
	])
	_flow([_button("DOUBLE DUNGEON RIFTS: " + ("ALWAYS" if p.demo.doubleAlways else "RARE (NORMAL)"), "dbl", func():
		p.demo.doubleAlways = not p.demo.doubleAlways
		_changed())])
	_hint("Rifts: turn this to ALWAYS, then enter any preset or randomized dungeon and look for the purple portal.")
	var armed: bool = _armed == "reset"
	_flow([_button("TAP AGAIN TO ERASE EVERYTHING" if armed else "RESET ALL PROGRESS", "reset", func():
		if not armed:
			_armed = "reset"
			Game.sfx("deny")
			render()
			get_tree().create_timer(3.0).timeout.connect(func():
				_armed = ""
				if is_open and tab == "demo":
					render())
			return
		_armed = ""
		Game.start_fresh()
		Game.first_run = false
		close()
		world.travel("tutorial"))])
