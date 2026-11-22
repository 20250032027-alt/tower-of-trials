extends Node
var step := 0
var wait := 0.0
var play

func say(s: String) -> void:
	print("[flow] ", s)

func fail(s: String) -> void:
	print("[flow] FAIL: ", s)
	get_tree().quit(1)

func current():
	var c = get_tree().current_scene
	return c if c != null and c.name == "Play" else null

func press_interact() -> void:
	Input.action_press("interact")
	await get_tree().create_timer(0.1).timeout
	Input.action_release("interact")

func go_to(prompt_part: String) -> bool:
	for it in play.interactables:
		if String(it.prompt.call()).contains(prompt_part):
			play.player.global_position = it.pos
			return true
	return false

func _process(dt: float) -> void:
	wait -= dt
	if wait > 0.0:
		return
	match step:
		0: # waiting for the Tutorial Floor
			if current() != null and current().has_node("."):
				play = current()
				if play.player == null:
					return
				say("tutorial floor loaded: %s, player at %s" % [play.floor_def.name, play.player.global_position])
				step = 1
				wait = 0.5
		1: # a sign
			if not go_to("READ SIGN"):
				return fail("no sign")
			wait = 0.2
			step = 2
		2:
			press_interact()
			wait = 0.3
			step = 3
		3:
			say("sign dialog open: %s" % play.hud.dialog_open)
			if not play.hud.dialog_open:
				return fail("sign did not open")
			press_interact()
			wait = 0.3
			step = 4
		4:
			say("sign closed: %s" % (not play.hud.dialog_open))
			if not go_to("TRIAL OF BONES"):
				return fail("no trial portal")
			wait = 0.3
			step = 5
		5:
			press_interact()
			wait = 3.0
			step = 6
		6:
			var c = current()
			if c == null or c.dun.is_empty():
				return fail("did not arrive in the dungeon")
			play = c
			say("in dungeon %s with %d enemies" % [play.dun.name, play.enemy_list.size()])
			if play.enemy_list.size() != 7:
				return fail("expected 7 enemies")
			for e in play.enemy_list.duplicate():
				e.hurt(99999.0, false, e.global_position + Vector2(10, 0), 0.0, {})
			wait = 1.0
			step = 7
		7:
			say("cleared: %s, flag trialCleared: %s, level %d xp %.1f" % [play.cleared, Game.profile.flags.get("trialCleared", false), Game.profile.level, Game.profile.xp])
			if not play.cleared:
				return fail("dungeon not cleared")
			if not go_to("LEAVE DUNGEON"):
				return fail("no exit")
			wait = 0.3
			step = 8
		8:
			press_interact()
			wait = 3.0
			step = 9
		9:
			var c2 = current()
			if c2 == null or c2.floor_def.is_empty():
				return fail("did not come back to the floor")
			play = c2
			say("back on %s" % play.floor_def.name)
			if not go_to("TAKE STAIRS TO FLOOR 1"):
				return fail("stairs to floor 1 not open (prompt missing)")
			wait = 0.3
			step = 10
		10:
			press_interact()
			wait = 3.0
			step = 11
		11:
			var c3 = current()
			if c3 == null or c3.floor_def.is_empty() or c3.floor_def.id != "floor1":
				return fail("did not arrive on floor 1")
			say("arrived on %s. ALL GOOD" % c3.floor_def.name)
			get_tree().quit(0)
