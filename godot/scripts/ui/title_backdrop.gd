extends Node2D
## Placeholder backdrop until the Tower-at-dusk art is exported (next step in the port).
var t := 0.0
func setup() -> void:
	pass
func enter(done: Callable) -> void:
	done.call()
func _draw() -> void:
	draw_rect(Rect2(0, 0, 480, 270), Color("0a0814"))
