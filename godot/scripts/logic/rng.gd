extends RefCounted
## Seeded random numbers (mulberry32), the same sequence as src/logic/rng.js, so a seed builds the same dungeon in both versions.

var a: int = 1

func _init(seed_value: int = 1) -> void:
	a = seed_value & 0xFFFFFFFF
	if a == 0:
		a = 1

static func _imul(x: int, y: int) -> int:
	return ((x & 0xFFFFFFFF) * (y & 0xFFFFFFFF)) & 0xFFFFFFFF

func next() -> float:
	a = (a + 0x6d2b79f5) & 0xFFFFFFFF
	var t: int = a
	t = _imul(t ^ (t >> 15), t | 1)
	t = t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

func float_range(lo: float = 0.0, hi: float = 1.0) -> float:
	return lo + next() * (hi - lo)

## whole number from lo to hi, both included
func int_range(lo: int, hi: int) -> int:
	return lo + int(floor(next() * (hi - lo + 1)))

func chance(p: float) -> bool:
	return next() < p

func pick(arr: Array) -> Variant:
	return arr[int(floor(next() * arr.size()))]

static func hash_string(s: String) -> int:
	var h: int = 2166136261
	for i in s.length():
		h ^= s.unicode_at(i)
		h = (h * 16777619) & 0xFFFFFFFF
	return h
