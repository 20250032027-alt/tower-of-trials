extends RefCounted
## How enemies notice the player. Port of src/logic/awareness.js.
const Layout = preload("res://scripts/logic/layout.gd")

## id of the room that holds world position (x, y), or "" in a corridor
static func room_at(layout: Dictionary, x: float, y: float, ts: int) -> String:
	var tx := int(floor(x / ts))
	var ty := int(floor(y / ts))
	for r in layout.rooms:
		if tx >= r.x and tx < r.x + r.w and ty >= r.y and ty < r.y + r.h:
			return r.id
	return ""

## true when no wall tile lies on the straight line between two world points
static func has_line_of_sight(layout: Dictionary, x0: float, y0: float, x1: float, y1: float, ts: int) -> bool:
	var dx := x1 - x0
	var dy := y1 - y0
	var dist := sqrt(dx * dx + dy * dy)
	var steps := maxi(1, int(ceil(dist / (ts / 3.0))))
	for i in range(1, steps):
		var t := float(i) / steps
		var tx := int(floor((x0 + dx * t) / ts))
		var ty := int(floor((y0 + dy * t) / ts))
		if tx < 0 or ty < 0 or tx >= layout.w or ty >= layout.h:
			return false
		if Layout.is_wall(layout.tiles[ty * layout.w + tx]):
			return false
	return true

## suspicion gained per second (1.0 = notices)
static func alert_rate(sees: bool, hears: bool, dist: float, p: Dictionary) -> float:
	if not sees and not hears:
		return -float(p.calmRate)
	var near := maxf(0.35, minf(1.0, dist / float(p.sightRange)))
	var base := 1.0 / (float(p.noticeTime) * near)
	return base if sees else base * 0.6
