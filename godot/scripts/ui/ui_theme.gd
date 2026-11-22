extends RefCounted
## One Godot Theme for every menu: the pixel font, gold-edged dark boxes, a gold focus frame (so a gamepad always shows where it is).
const GOLD := Color("c9a24a")
const GOLD_HI := Color("ffe27a")
const BG := Color("1b1410")
const BG2 := Color("2a2018")
const TEXT := Color("e8dcc0")
const DIM := Color("8a7a99")
const GOOD := Color("aaf0c0")
const BAD := Color("ff8a7a")

static func box(bg: Color, border: Color = Color.TRANSPARENT, bw: int = 0, mx: int = 4, my: int = 2) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.content_margin_left = mx
	s.content_margin_right = mx
	s.content_margin_top = my
	s.content_margin_bottom = my
	s.anti_aliasing = false
	return s

static func _tex(w: int, h: int, c: Color) -> ImageTexture:
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(c)
	return ImageTexture.create_from_image(img)

static func make() -> Theme:
	var th := Theme.new()
	th.default_font = Data.font
	th.default_font_size = 10
	th.set_color("font_color", "Label", TEXT)
	th.set_constant("line_spacing", "Label", 2)
	# buttons
	th.set_stylebox("normal", "Button", box(BG2, Color("6b5a3a"), 1))
	th.set_stylebox("hover", "Button", box(Color("3b2d1c"), GOLD, 1))
	th.set_stylebox("pressed", "Button", box(Color("4a3820"), GOLD_HI, 1))
	th.set_stylebox("disabled", "Button", box(Color("1b1410"), Color("3a2f22"), 1))
	var f := box(Color.TRANSPARENT, GOLD_HI, 1, 4, 2)
	f.draw_center = false
	th.set_stylebox("focus", "Button", f)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		th.set_color(c, "Button", TEXT if c != "font_hover_color" else GOLD_HI)
	th.set_color("font_disabled_color", "Button", Color("5a5048"))
	# panels
	th.set_stylebox("panel", "PanelContainer", box(BG, GOLD, 1, 6, 5))
	th.set_stylebox("panel", "Panel", box(BG, GOLD, 1))
	# slider
	th.set_stylebox("slider", "HSlider", box(Color("120d0a"), Color("6b5a3a"), 1, 0, 1))
	th.set_stylebox("grabber_area", "HSlider", box(Color("c9a24a"), Color.TRANSPARENT, 0, 0, 1))
	th.set_stylebox("grabber_area_highlight", "HSlider", box(GOLD_HI, Color.TRANSPARENT, 0, 0, 1))
	th.set_icon("grabber", "HSlider", _tex(5, 9, GOLD))
	th.set_icon("grabber_highlight", "HSlider", _tex(5, 9, GOLD_HI))
	th.set_icon("grabber_disabled", "HSlider", _tex(5, 9, Color("5a5048")))
	# scrollbar
	th.set_stylebox("scroll", "VScrollBar", box(Color("120d0a"), Color.TRANSPARENT, 0, 3, 0))
	th.set_stylebox("grabber", "VScrollBar", box(Color("6b5a3a"), Color.TRANSPARENT, 0, 3, 0))
	th.set_stylebox("grabber_highlight", "VScrollBar", box(GOLD, Color.TRANSPARENT, 0, 3, 0))
	th.set_stylebox("grabber_pressed", "VScrollBar", box(GOLD_HI, Color.TRANSPARENT, 0, 3, 0))
	th.set_stylebox("focus", "ScrollContainer", StyleBoxEmpty.new())
	return th
