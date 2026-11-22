extends Node2D
## The title screen: logo, CONTINUE / NEW GAME (or START), a rotating tip, sound switch. The Tower at dusk is drawn by title_backdrop.gd.
const Theme_ = preload("res://scripts/ui/ui_theme.gd")
const Backdrop = preload("res://scripts/ui/title_backdrop.gd")

const TIPS := [
	"Follow the yellow arrow: it always points at your next goal.",
	"Skeletons notice you when you enter THEIR room. A \"?\" means they are unsure.",
	"Walls block sight. Break line of sight and a skeleton gives up and searches.",
	"Fighting is loud: skeletons in the same room will join in.",
	"Bows and spells: HOLD to focus, RELEASE to fire.",
	"Melee users can go Berserk for more damage, at the cost of Force.",
	"Defeated skeletons drop XP orbs. Walk close and they fly to you.",
	"Cracked walls hide secret dungeons. Look for them.",
	"Rarely, a rift opens a Double Dungeon with tougher skeletons.",
	"Every lit window on the Tower is a dungeon you have cleared.",
]

var t := 0.0
var going := false
var tip_i := 0
var tip_label: Label
var snd_button: Button
var new_button: Button
var armed := false
var backdrop

func _ready() -> void:
	backdrop = Backdrop.new()
	add_child(backdrop)
	backdrop.setup()
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = Theme_.make()
	layer.add_child(root)
	var title := Data.constants.GAME_TITLE as String  # "Tower of [Trials]"
	var l1 := RichTextLabel.new()
	l1.bbcode_enabled = true
	l1.fit_content = true
	l1.scroll_active = false
	l1.add_theme_font_override("normal_font", Data.font)
	l1.add_theme_font_size_override("normal_font_size", 20)
	l1.text = "[center][color=#ffe27a]TOWER[/color] [color=#c9a24a]OF[/color] [color=#6fd6c4][[/color][color=#ffe27a]TRIALS[/color][color=#6fd6c4]][/color][/center]"
	l1.position = Vector2(0, 14)
	l1.size = Vector2(480, 24)
	root.add_child(l1)
	var tag := Label.new()
	tag.text = "ELEVEN FLOORS. ONE WAY UP."
	tag.add_theme_color_override("font_color", Color("c9a24a"))
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.position = Vector2(0, 40)
	tag.size = Vector2(480, 12)
	root.add_child(tag)

	var box := VBoxContainer.new()
	box.position = Vector2(170, 176)
	box.size = Vector2(140, 60)
	box.add_theme_constant_override("separation", 3)
	root.add_child(box)
	var save: Dictionary = Game.save_summary()
	var primary: Button
	if save.is_empty():
		primary = _btn("START", func(): _go("start"))
		box.add_child(primary)
	else:
		primary = _btn("CONTINUE", func(): _go("cont"))
		box.add_child(primary)
		var sum := Label.new()
		sum.text = "LV %d   RANK %s   %d KILLS" % [save.level, Data.rank_of_level(int(save.level)), save.kills]
		sum.add_theme_color_override("font_color", Theme_.DIM)
		sum.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(sum)
		new_button = _btn("NEW GAME", _new_game)
		box.add_child(new_button)
	tip_i = randi() % TIPS.size()
	tip_label = Label.new()
	tip_label.text = "TIP  " + TIPS[tip_i]
	tip_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.75))
	tip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tip_label.position = Vector2(20, 244)
	tip_label.size = Vector2(440, 12)
	root.add_child(tip_label)
	var keys := Label.new()
	keys.text = ("L STICK MOVE   RT ATTACK   B ROLL   LB SKILLS   A USE" if Controls.using_pad else "WASD MOVE   CLICK ATTACK   SPACE DODGE   F SKILLS   E USE   TAB MENU")
	keys.add_theme_color_override("font_color", Color(1, 1, 1, 0.4))
	keys.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	keys.position = Vector2(0, 258)
	keys.size = Vector2(480, 12)
	root.add_child(keys)
	snd_button = _btn("", _toggle_sound)
	snd_button.position = Vector2(398, 6)
	snd_button.size = Vector2(76, 14)
	root.add_child(snd_button)
	_update_sound_text()
	var ver := Label.new()
	ver.text = "DEMO BUILD  -  WORKING TITLE"
	ver.add_theme_color_override("font_color", Color(1, 1, 1, 0.3))
	ver.position = Vector2(8, 258)
	ver.size = Vector2(160, 12)
	root.add_child(ver)
	primary.grab_focus()
	Game.start_music("title")

func _btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(140, 16)
	b.pressed.connect(cb)
	return b

func _update_sound_text() -> void:
	snd_button.text = "SOUND: " + ("OFF" if Game.settings.muted else "ON")

func _toggle_sound() -> void:
	Game.settings.muted = not Game.settings.muted
	Game.save_settings()
	Game.apply_audio()
	_update_sound_text()
	if not Game.settings.muted:
		Game.sfx("ui")

func _new_game() -> void:
	if not armed:
		armed = true
		new_button.text = "TAP AGAIN TO ERASE SAVE"
		Game.sfx("deny")
		get_tree().create_timer(3.0).timeout.connect(func():
			armed = false
			if is_instance_valid(new_button):
				new_button.text = "NEW GAME")
		return
	_go("start")

func _go(act: String) -> void:
	if going:
		return
	going = true
	Game.sfx("ui")
	if act == "start":
		Game.start_fresh()
	elif not Game.continue_save():
		Game.start_fresh()
	Game.settings["last"] = act
	backdrop.enter(func(): Game.go_play({"kind": "floor", "id": "tutorial"}))

func _process(dt: float) -> void:
	t += dt
	if int(t / 5.6) != int((t - dt) / 5.6):
		tip_i = (tip_i + 1) % TIPS.size()
		tip_label.text = "TIP  " + TIPS[tip_i]
