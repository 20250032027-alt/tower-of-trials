extends Node
## Plays the game for a few seconds with pretend key presses and prints what happened. Used by `npm run godot:test` / CI.
## Run:  godot --headless --path godot res://tests/play_smoke.tscn
## Add `-- shots` and a real display (xvfb) to also save screenshots to /tmp/godot_shots.
var frames := 0
var stage := 0
var play
var shots := false
var out_dir := "/tmp/godot_shots"
var log_lines: Array = []

func _ready() -> void:
	shots = "shots" in OS.get_cmdline_user_args()
	if shots:
		DirAccess.make_dir_recursive_absolute(out_dir)
	Game.pending = {"kind": "floor", "id": "tutorial"}
	var scene: PackedScene = load("res://scenes/play.tscn")
	play = scene.instantiate()
	add_child(play)
	print("play scene built: ", play.layout.w, "x", play.layout.h, " player at ", play.player.global_position, " enemies ", play.enemy_list.size(), " dummies ", play.dummy_list.size(), " interactables ", play.interactables.size())

func _shot(name: String) -> void:
	if not shots:
		return
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out_dir, name])

func _physics_process(_dt: float) -> void:
	frames += 1
	var p = play.player
	if frames == 5:
		Input.action_press("move_right")
	if frames == 60:
		Input.action_release("move_right")
		print("after walking right: ", p.global_position, " stamina ", snappedf(p.stamina, 0.1))
		_shot("tutorial_start")
	if frames == 70:
		Input.action_press("dodge")
	if frames == 72:
		Input.action_release("dodge")
	if frames == 75:
		print("dodging: ", p.dodging > 0.0, " invuln ", p.invuln > 0.0, " stamina ", snappedf(p.stamina, 0.1))
	if frames == 140:
		# teleport next to the first dummy and hit it
		var d = play.dummy_list[0]
		p.global_position = d.global_position + Vector2(-22, 0)
		Controls.using_pad = true # aim by auto-aim (no real mouse in a headless run)
		Input.action_press("attack")
	if frames == 150:
		print("dummy hits so far: ", d_hits())
	if frames == 200:
		Input.action_release("attack")
		print("dummy hits: ", d_hits(), " total ", snappedf(play.dummy_list[0].total, 0.1))
		_shot("dummy_fight")
		# try every weapon: swap and fire a few frames
	if frames == 210:
		for i in 8:
			p.swap_weapon()
		print("weapon after 8 swaps: ", p.weapon_id)
	if frames == 220:
		# go to the Trial of Bones and fight skeletons for real
		Game.pending = {"kind": "dungeon", "id": "trial", "seed": 7}
		play.queue_free()
		var scene: PackedScene = load("res://scenes/play.tscn")
		play = scene.instantiate()
		add_child(play)
		print("trial built: enemies ", play.enemy_list.size(), " chests/portals/exits ", play.interactables.size())
	if frames > 220 and frames < 1500:
		_fight(p)
	if frames == 1500:
		print("done. kills ", Game.profile.kills, " level ", Game.profile.level, " xp ", snappedf(Game.profile.xp, 0.1), " hp ", snappedf(play.player.hp, 0.1))
		get_tree().quit(0)

func d_hits() -> int:
	return play.dummy_list[0].hits

var _arch := 0
func _fight(_old) -> void:
	var p = play.player
	if p == null or not is_instance_valid(p) or p.dead:
		return
	# walk towards the nearest living enemy and swing at it (a very dumb bot)
	var t = play.nearest_target(p.global_position, 9999.0)
	if t == null:
		Input.action_release("attack")
		Input.action_release("move_right")
		return
	var d: Vector2 = t.global_position - p.global_position
	p.aim = d.angle()
	Controls.using_pad = true
	Input.action_release("move_left")
	Input.action_release("move_right")
	Input.action_release("move_up")
	Input.action_release("move_down")
	if d.length() > 40.0:
		p.global_position = t.global_position - d.normalized() * 22.0 # the bot is not a pathfinder: hop next to it
	Input.action_press("attack")
	p.hp = maxf(p.hp, 50.0) # keep the bot alive
	if frames % 300 == 0 and shots:
		_shot("trial_%d" % frames)
