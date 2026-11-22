extends Node
## Walks the loop of the demo's first part with pretend input: Tutorial Floor -> read a sign -> Trial of Bones -> clear it ->
## back out -> the stairs to Floor 1 open and work.   Run:  godot --headless --path godot res://tests/flow_smoke.tscn
func _ready() -> void:
	var driver := Node.new()
	driver.set_script(load("res://tests/flow_driver.gd"))
	get_tree().root.add_child.call_deferred(driver)
	Game.go_play({"kind": "floor", "id": "tutorial"})
