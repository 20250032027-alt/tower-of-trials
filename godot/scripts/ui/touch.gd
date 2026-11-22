extends Control
## Touch controls: a floating move stick on the left, a floating aim-and-attack stick on the right (hold = attack, drag = aim,
## a bare tap attacks the nearest skeleton), and buttons for roll, skill, aura, weapon swap, use, map and menu.
## They press the same input actions as the keyboard and gamepad, so everything else in the game works as is.
## Shown when Settings > TOUCH CONTROLS is ON, or AUTO on a device with a touch screen (a real mouse moving hides them).
const STICK_R := 30.0
const BUTTONS := [
	{"id": "dodge", "pos": Vector2(446, 228), "r": 19.0, "label": "ROLL", "action": "dodge"},
	{"id": "skill", "pos": Vector2(404, 242), "r": 16.0, "label": "SKILL", "action": "skill_wheel"},
	{"id": "aura", "pos": Vector2(446, 186), "r": 15.0, "label": "AURA", "action": "aura"},
	{"id": "swap", "pos": Vector2(406, 200), "r": 13.0, "label": "SWAP", "action": "swap_weapon"},
	{"id": "use", "pos": Vector2(364, 238), "r": 15.0, "label": "USE", "action": "interact"},
	{"id": "map", "pos": Vector2(22, 100), "r": 11.0, "label": "MAP", "action": "full_map"},
	{"id": "menu", "pos": Vector2(22, 126), "r": 11.0, "label": "MENU", "action": "menu"},
]
const RADAR := Rect2(404, 28, 72, 72)   # tap the minimap for the full map

var world
var font: Font
var touches: Dictionary = {}   # touch index -> {kind, origin, pos, id?}
var enabled := false
var _tap_close := 0

func setup(w) -> void:
	world = w
	font = w.font
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	z_index = 90

## should the overlay be on right now
static func wanted() -> bool:
	var mode := String(Game.settings.get("touch", "auto"))
	if mode == "on":
		return true
	if mode == "off":
		return false
	return DisplayServer.is_touchscreen_available() and not Controls.mouse_seen

func _process(_dt: float) -> void:
	var on := wanted()
	if on != enabled:
		enabled = on
		Controls.set_touch_mode(on)
		if not on:
			_release_all()
	visible = enabled
	if enabled:
		queue_redraw()

func _blocked() -> bool:
	return world.menu.is_open or world.hud.dialog_open or world.minimap.big_open

func _input(event: InputEvent) -> void:
	if not enabled:
		return
	if event is InputEventScreenTouch:
		if event.pressed:
			_down(event.index, event.position)
		else:
			_up(event.index)
	elif event is InputEventScreenDrag:
		_drag(event.index, event.position)

func _down(idx: int, pos: Vector2) -> void:
	Controls.touch_began()
	if _blocked():
		# a tap closes a message or the map (the menu has its own buttons, which get the emulated mouse click)
		if world.hud.dialog_open or world.minimap.big_open:
			Input.action_press("interact")
			_tap_close = 3
		return
	for b in BUTTONS:
		if pos.distance_to(b.pos) <= float(b.r) + 6.0:
			touches[idx] = {"kind": "btn", "id": b.id}
			Input.action_press(b.action)
			return
	if RADAR.has_point(pos) and Game.settings.minimap:
		touches[idx] = {"kind": "btn", "id": "map"}
		Input.action_press("full_map")
		return
	if pos.x < 240.0:
		if _has_kind("move"):
			return
		touches[idx] = {"kind": "move", "origin": pos, "pos": pos}
	else:
		if _has_kind("aim"):
			return
		touches[idx] = {"kind": "aim", "origin": pos, "pos": pos, "dragged": false}
		Input.action_press("attack")

func _has_kind(k: String) -> bool:
	for t in touches.values():
		if t.kind == k:
			return true
	return false

func _drag(idx: int, pos: Vector2) -> void:
	if not touches.has(idx):
		return
	var t: Dictionary = touches[idx]
	t.pos = pos
	var v: Vector2 = (pos - t.origin)
	var k := minf(1.0, v.length() / STICK_R)
	var dir := v.normalized() if v.length() > 1.0 else Vector2.ZERO
	if t.kind == "move":
		_set_axis("move", dir * k)
	elif t.kind == "aim":
		if v.length() > 7.0:
			t.dragged = true
			_set_axis("aim", dir)
		else:
			_set_axis("aim", Vector2.ZERO)

func _up(idx: int) -> void:
	if not touches.has(idx):
		return
	var t: Dictionary = touches[idx]
	touches.erase(idx)
	match t.kind:
		"move":
			_set_axis("move", Vector2.ZERO)
		"aim":
			_set_axis("aim", Vector2.ZERO)
			Input.action_release("attack")
		"btn":
			for b in BUTTONS:
				if b.id == t.id:
					Input.action_release(b.action)
			if t.id == "map":
				Input.action_release("full_map")

func _set_axis(prefix: String, v: Vector2) -> void:
	_strength(prefix + "_left", maxf(0.0, -v.x))
	_strength(prefix + "_right", maxf(0.0, v.x))
	_strength(prefix + "_up", maxf(0.0, -v.y))
	_strength(prefix + "_down", maxf(0.0, v.y))

func _strength(action: String, s: float) -> void:
	if s > 0.01:
		Input.action_press(action, s)
	else:
		Input.action_release(action)

func _release_all() -> void:
	for idx in touches.keys():
		_up(idx)
	touches.clear()
	_set_axis("move", Vector2.ZERO)
	_set_axis("aim", Vector2.ZERO)
	Input.action_release("attack")

func _physics_process(_dt: float) -> void:
	if _tap_close > 0:
		_tap_close -= 1
		if _tap_close == 0:
			Input.action_release("interact")

# ------------------------------------------------------------------ drawing
func _draw() -> void:
	if world == null or _blocked():
		return
	for b in BUTTONS:
		var down := false
		for t in touches.values():
			if t.kind == "btn" and t.id == b.id:
				down = true
		var c := Color(1, 1, 1, 0.5 if down else 0.2)
		draw_circle(b.pos, b.r, Color(0.07, 0.05, 0.04, 0.45))
		draw_arc(b.pos, b.r, 0.0, TAU, 28, c, 1.5 if not down else 2.5)
		var w := float(String(b.label).length()) * 6.0
		draw_string(font, b.pos + Vector2(-w / 2.0, 4), b.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.75 if down else 0.45))
	for t in touches.values():
		if t.kind == "btn":
			continue
		var base: Vector2 = t.origin
		var knob: Vector2 = base + (t.pos - base).limit_length(STICK_R)
		draw_circle(base, STICK_R, Color(1, 1, 1, 0.08))
		draw_arc(base, STICK_R, 0.0, TAU, 32, Color(1, 1, 1, 0.3), 1.5)
		draw_circle(knob, 10.0, Color(1, 1, 1, 0.28))
	if not touches.is_empty():
		return
	# the first time: say what the two halves do
	if not Game.profile.flags.get("tutMoved", false):
		draw_string(font, Vector2(40, 190), "MOVE", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.35))
		draw_string(font, Vector2(290, 190), "HOLD TO ATTACK", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.35))
