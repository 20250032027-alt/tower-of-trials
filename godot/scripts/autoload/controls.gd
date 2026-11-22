extends Node
## Keyboard + mouse + gamepad, all through Godot's InputMap (so the actions show up as plain names everywhere).
## Gamepad (standard layout):  left stick / D-pad move, right stick aim, RT or X attack, B or LT roll, A use,
## LB skill wheel, RB aura, Y swap weapon, R3 lock-on, Back map, Start menu.
signal device_changed(using_pad: bool)

var using_pad := false

func _ready() -> void:
	_stick("move_left", JOY_AXIS_LEFT_X, -1.0, [KEY_A, KEY_LEFT], JOY_BUTTON_DPAD_LEFT)
	_stick("move_right", JOY_AXIS_LEFT_X, 1.0, [KEY_D, KEY_RIGHT], JOY_BUTTON_DPAD_RIGHT)
	_stick("move_up", JOY_AXIS_LEFT_Y, -1.0, [KEY_W, KEY_UP], JOY_BUTTON_DPAD_UP)
	_stick("move_down", JOY_AXIS_LEFT_Y, 1.0, [KEY_S, KEY_DOWN], JOY_BUTTON_DPAD_DOWN)
	_stick("aim_left", JOY_AXIS_RIGHT_X, -1.0, [], -1)
	_stick("aim_right", JOY_AXIS_RIGHT_X, 1.0, [], -1)
	_stick("aim_up", JOY_AXIS_RIGHT_Y, -1.0, [], -1)
	_stick("aim_down", JOY_AXIS_RIGHT_Y, 1.0, [], -1)
	_action("attack", [], JOY_BUTTON_X, MOUSE_BUTTON_LEFT)
	_axis_only("attack", JOY_AXIS_TRIGGER_RIGHT)
	_action("dodge", [KEY_SPACE], JOY_BUTTON_B)
	_axis_only("dodge", JOY_AXIS_TRIGGER_LEFT)
	_action("interact", [KEY_E], JOY_BUTTON_A)
	_action("swap_weapon", [KEY_Q], JOY_BUTTON_Y)
	_action("skill_wheel", [KEY_F], JOY_BUTTON_LEFT_SHOULDER)
	_action("aura", [KEY_R], JOY_BUTTON_RIGHT_SHOULDER)
	_action("lock_on", [KEY_T], JOY_BUTTON_RIGHT_STICK)
	_action("full_map", [KEY_M], JOY_BUTTON_BACK)
	_action("menu", [KEY_TAB, KEY_ESCAPE], JOY_BUTTON_START)
	for a in ["move_left", "move_right", "move_up", "move_down", "aim_left", "aim_right", "aim_up", "aim_down"]:
		InputMap.action_set_deadzone(a, 0.25)
	InputMap.action_set_deadzone("attack", 0.3)
	InputMap.action_set_deadzone("dodge", 0.3)

func _ensure(action: String) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, 0.5)

func _key(action: String, code: Key) -> void:
	var e := InputEventKey.new()
	e.physical_keycode = code
	InputMap.action_add_event(action, e)

func _button(action: String, b: JoyButton) -> void:
	var e := InputEventJoypadButton.new()
	e.button_index = b
	InputMap.action_add_event(action, e)

func _axis_only(action: String, axis: JoyAxis, sign_value: float = 1.0) -> void:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = sign_value
	InputMap.action_add_event(action, e)

func _action(action: String, keys: Array, button: int, mouse_button: int = -1) -> void:
	_ensure(action)
	for k in keys:
		_key(action, k)
	if button >= 0:
		_button(action, button)
	if mouse_button >= 0:
		var m := InputEventMouseButton.new()
		m.button_index = mouse_button
		InputMap.action_add_event(action, m)

func _stick(action: String, axis: JoyAxis, sign_value: float, keys: Array, dpad: int) -> void:
	_action(action, keys, dpad)
	_axis_only(action, axis, sign_value)

func _input(event: InputEvent) -> void:
	var pad := using_pad
	if event is InputEventJoypadButton:
		pad = true
	elif event is InputEventJoypadMotion:
		if absf(event.axis_value) > 0.5:
			pad = true
	elif event is InputEventKey or event is InputEventMouseButton:
		pad = false
	elif event is InputEventMouseMotion and event.relative.length() > 1.0:
		pad = false
	if pad != using_pad:
		using_pad = pad
		device_changed.emit(using_pad)

func move_vector() -> Vector2:
	return Input.get_vector("move_left", "move_right", "move_up", "move_down")

func aim_vector() -> Vector2:
	return Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down")

## short rumble on a gamepad (does nothing without one, or when switched off in settings)
func rumble(strong: float, weak: float, seconds: float) -> void:
	if not using_pad or not Game.settings.rumble:
		return
	for id in Input.get_connected_joypads():
		Input.start_joy_vibration(id, clampf(weak, 0.0, 1.0), clampf(strong, 0.0, 1.0), seconds)
