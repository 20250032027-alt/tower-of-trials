extends RefCounted
## Focus system (Ranger). Port of src/logic/focus.js.

## advance focus by dt seconds. Returns {focus, staminaFrac}
static func tick(focus: float, dt: float, focus_speed: float, weapon_rate: float = 1.0, can_pay_stamina: bool = true) -> Dictionary:
	var F: Dictionary = Data.constants.FOCUS
	var rate: float = (1.0 / float(F.secondsTo100)) * focus_speed * weapon_rate
	var target := focus + rate * dt
	var ceiling: float = float(F.maxFocus) if can_pay_stamina else float(F.overFocusStart)
	if target > ceiling:
		target = maxf(focus, ceiling)
	var over := maxf(0.0, target - maxf(focus, float(F.overFocusStart)))
	return {"focus": target, "staminaFrac": (over / 0.1) * float(F.staminaPer10Over)}
