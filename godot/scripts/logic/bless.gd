extends RefCounted
## The four blessings of Mana (and "none" before a Mana Circle is awakened). Port of BLESS in src/art/figures.js.
## The book, staff, spells and the Trialist's own look all follow the blessing.
const TYPES := ["none", "natural", "divine", "arcane", "extraplanar"]
const SPELL := {"none": "9fb4ff", "natural": "6ed48a", "divine": "ffe27a", "arcane": "6fb4ff", "extraplanar": "c27bff"}

static func spell_color(type: String) -> Color:
	return Color(SPELL.get(type, "9fb4ff"))

## the blessing the book, staff and spells follow ('none' until a Mana Circle has been awakened)
static func of_profile(profile: Dictionary) -> String:
	var t = profile.get("manaType")
	return String(t) if int(profile.manaCircles) > 0 and t != null and SPELL.has(String(t)) else "none"
