extends RefCounted
## "What do I do next?": picks the current goal (a short text and where it is) from the player's progress.
## Port of src/game/guide.js. `world` is the Play scene (needs: floor_def, dun, poi, dummy_list, enemy_list, cleared, player, crack_target()).

static func _nearest(list: Array, p: Vector2) -> Variant:
	var best = null
	var bd := INF
	for e in list:
		var pos: Vector2 = e if e is Vector2 else e.global_position
		var d := pos.distance_to(p)
		if d < bd:
			bd = d
			best = pos
	return best

## {"text": String, "target": Vector2 or null}
static func objective(world) -> Dictionary:
	var prof: Dictionary = Game.profile
	var f: Dictionary = prof.flags
	var poi: Dictionary = world.poi
	var pad: bool = Controls.using_pad
	var me: Vector2 = world.player.global_position

	if not world.floor_def.is_empty() and world.floor_def.id == "tutorial":
		if not f.get("tutMoved", false):
			return {"text": "Move with the left stick" if pad else "Move with WASD", "target": null}
		if prof.traits.is_empty():
			return {"text": "Equip traits at LOADOUT", "target": poi.get("loadout")}
		if not f.get("tutHit", false):
			return {"text": "Hit a dummy: hold RT" if pad else "Hit a dummy: hold click", "target": _nearest(world.dummy_list, me)}
		if not f.get("tutDodged", false):
			return {"text": "Roll with B" if pad else "Roll with SPACE", "target": null}
		if not f.get("trialCleared", false):
			return {"text": "Clear the Trial of Bones" if f.get("seen_trial", false) else "Enter the Trial of Bones", "target": poi.get("portal:trial")}
		return {"text": "Take the stairs to Floor 1", "target": poi.get("portal:floor1")}

	if not world.floor_def.is_empty():  # floors 1-10
		var fl: Dictionary = world.floor_def
		var main = Data.dungeons.get(String(fl.get("mainId", "")))
		if fl.id == "floor1" and not f.get("cleared_bone_hall", false) and int(prof.level) < 5:
			return {"text": "Warm up in BONE HALL", "target": poi.get("portal:bone_hall")}
		if main != null and not f.get(String(fl.id) + "Cleared", false):
			return {"text": "Enter the " + String(main.name).to_upper(), "target": poi.get("portal:" + String(fl.mainId))}
		var nxt := "floor%d" % (int(fl.n) + 1)
		if poi.has("portal:" + nxt) and not f.get("seen_" + nxt, false):
			return {"text": "Take the stairs to Floor %d" % (int(fl.n) + 1), "target": poi["portal:" + nxt]}
		var ct = world.crack_target()
		if not f.get("cracked_" + String(fl.id), false) and ct != null:
			return {"text": "Look for the cracked wall", "target": ct}
		var hid: String = String(fl.get("hiddenId", ""))
		if hid != "" and not f.get("cleared_" + hid, false) and poi.has("portal:" + hid):
			return {"text": "Enter the hidden dungeon", "target": poi["portal:" + hid]}
		return {"text": "You reached the top! Try any dungeon" if int(fl.n) >= 10 else "Floor %d done! Try any dungeon" % int(fl.n), "target": null}

	# inside a dungeon
	var alive: Array = []
	for e in world.enemy_list:
		if is_instance_valid(e) and e.alive:
			alive.append(e)
	if not world.cleared:
		return {"text": "Defeat the skeletons (%d)" % alive.size(), "target": _nearest(alive, me) if alive.size() <= 6 else null}
	return {"text": "Leave through the EXIT", "target": poi.get("exit")}
