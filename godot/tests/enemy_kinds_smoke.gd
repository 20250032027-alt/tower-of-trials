extends Node
## Puts one skeleton of each kind against the player and checks that every kind can hurt (melee reach, arrows, orbs).
## Run:  godot --headless --path godot res://tests/enemy_kinds_smoke.tscn
const Enemy = preload("res://scripts/play/enemy.gd")
const Projectile = preload("res://scripts/play/projectile.gd")
var play
var kinds := ["skeleton_soldier", "skeleton_lancer", "skeleton_brute", "skeleton_archer", "skeleton_mage"]
var idx := 0
var frames := 0
var e
var hp_lost := 0.0
var saw_projectile := false
var results := {}

func _ready() -> void:
	Game.pending = {"kind": "dungeon", "id": "trial", "seed": 7}
	play = load("res://scenes/play.tscn").instantiate()
	add_child(play)
	await get_tree().physics_frame
	for x in play.enemy_list:
		x.queue_free()
	play.enemy_list.clear()
	_next()

func _next() -> void:
	if idx >= kinds.size():
		var bad := 0
		for k in kinds:
			print("%-18s hurt the player for %6.1f %s" % [k, results[k].hp, "(fired shots)" if results[k].shots else ""])
			if results[k].hp <= 0.0:
				bad += 1
		print("%d kinds, %d never hurt" % [kinds.size(), bad])
		get_tree().quit(1 if bad > 0 else 0)
		return
	if e != null and is_instance_valid(e):
		e.queue_free()
		play.enemy_list.clear()
	var p = play.player
	p.global_position = play.tile_center(18, 14)
	p.hp = p.stats.maxHealth
	p.invuln = 0.0
	e = Enemy.new()
	play.entities.add_child(e)
	e.setup(play, p.global_position + Vector2(60, 0), 1, 1.0, idx, "b", kinds[idx])
	play.enemy_list.append(e)
	e.notice()
	hp_lost = 0.0
	saw_projectile = false
	frames = 0

func _physics_process(_dt: float) -> void:
	if e == null or idx >= kinds.size():
		return
	frames += 1
	var p = play.player
	for c in play.effects.get_children():
		if c is Projectile and not c.from_player:
			saw_projectile = true
	if p.hp < p.stats.maxHealth:
		hp_lost += p.stats.maxHealth - p.hp
		p.hp = p.stats.maxHealth
	if frames > 420:
		results[kinds[idx]] = {"hp": hp_lost, "shots": saw_projectile}
		idx += 1
		_next()
