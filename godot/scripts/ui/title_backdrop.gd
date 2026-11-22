extends Node2D
## The animated vista behind the title menu: the Tower at dusk seen from its foot, tilted. The sky, ranges, Tower and paving
## are ray-cast pictures exported from the web game (npm run godot:export -> assets/title + data/title.json); this adds the
## living parts: parallax, twinkling stars, a breathing blood moon, storm clouds + lightning + thunder, crows, a skeleton
## march on the far ridge, graves with wisps, red eyes in the dark, torches and embers, lit windows (one per cleared
## dungeon), the beacon, skeleton guards, the hero, bats around the spire, mist, ash and motes. enter() plays the
## "gate opens, camera pushes in" sequence. The picture is 240x135 virtual pixels, shown at 2x.
const Z := 2.0
const AMP := {"sky": 1.4, "far": 3.0, "near": 5.0, "back": 8.0, "stage": 8.0, "fore": 13.0}
const LAYERS := ["sky", "far", "near", "back", "stage", "fore"]
const SCREEN := Vector2(480, 270)

var T: Dictionary
var rig: Node2D
var pivot: Node2D
var C := {}
var mat_add: CanvasItemMaterial
var pad := 10
var W := 240
var H := 135
var t := 0.0
var px := 0.0
var entering := false
var flare := false
var lit_n := 0
var rng := RandomNumberGenerator.new()

var stars: Array = []
var clouds: Array = []
var storm: Array = []
var bolt := {"spr": null, "t": 99.0, "next": 4.5, "soft": false, "n": 0, "cy": 0}
var flash: Sprite2D
var moon_glow: Sprite2D
var ruin_glow: Sprite2D
var march_x := 0.0
var march_units: Array = []
var win_glows: Array = []
var wisps: Array = []
var eyes: Array = []
var torches: Array = []
var guards: Array = []
var hero: Sprite2D
var hero_frame := 0
var bats: Array = []
var flock := {"live": false, "next": 5.0, "x": 0.0, "y": 0.0, "dir": -1, "n": 0, "crows": []}
var fogs: Array = []
var pool: Array = []
var spill: Sprite2D
var beacon := {}
var door: Sprite2D
var shoot_next := 3.0
var mote_t := 0.0
var ash_t := 0.0
var shake_t := 0.0
var door_frames: Array = []

# the "camera" used by enter(): pan (screen px), zoom, rotation
var cam_pan := SCREEN / 2.0:
	set(v):
		cam_pan = v
		_apply_cam()
var cam_zoom := 1.0:
	set(v):
		cam_zoom = v
		_apply_cam()
var cam_rot := 0.0:
	set(v):
		cam_rot = v
		_apply_cam()

func _apply_cam() -> void:
	if rig == null:
		return
	rig.position = SCREEN / 2.0
	rig.rotation = cam_rot
	rig.scale = Vector2(cam_zoom, cam_zoom)
	pivot.position = -cam_pan

# ------------------------------------------------------------------ helpers
func tx(key: String) -> Texture2D:
	return Data.ttex(key)

func spr(layer: String, tex: Texture2D, x: float, y: float, o: Dictionary = {}) -> Sprite2D:
	var s := Sprite2D.new()
	s.texture = tex
	s.centered = o.get("ctr", false)
	s.position = Vector2(x, y)
	var sc: float = o.get("s", 1.0)
	s.scale = Vector2(sc, sc)
	s.flip_h = o.get("flip", false)
	var col: Color = o.get("tint", Color.WHITE)
	col.a = o.get("a", 1.0)
	s.modulate = col
	if o.get("add", false):
		s.material = mat_add
	C[layer].add_child(s)
	return s

func glow(layer: String, x: float, y: float, sc: float, tint: Color, a: float) -> Sprite2D:
	return spr(layer, Data.tex("fx_glow"), x, y, {"ctr": true, "s": sc, "add": true, "tint": tint, "a": a})

func px1(layer: String, tint: Color, a: float = 1.0) -> Sprite2D:
	return spr(layer, tx("px"), 0, 0, {"tint": tint, "a": a})

func proj(x: float, y: float, z: float) -> Vector3:
	var c: Dictionary = T.cam
	var vx := x
	var vy := y - float(T.CAM_H)
	var vz := z + float(T.CAM_D)
	var zc: float = vy * float(c.sp) + vz * float(c.cp)
	var b: float = vy * float(c.cp) - vz * float(c.sp)
	var us: float = float(c.F) * vx / zc
	var vs: float = -float(c.F) * b / zc
	return Vector3(float(c.tx) + float(c.cr) * us - float(c.sr) * vs, float(c.ty) + float(c.sr) * us + float(c.cr) * vs, zc)

func at(x: float, y: float, z: float) -> Vector3:
	var p := proj(x, y, z)
	return Vector3(p.x + pad, p.y, p.z)

## is there ground under picture point (sx, sy)? (the eyes only open on the ground)
func on_ground(sx: float, sy: float) -> bool:
	var c: Dictionary = T.cam
	var X := sx + 0.5 - float(c.tx)
	var Y := sy + 0.5 - float(c.ty)
	var us: float = float(c.cr) * X + float(c.sr) * Y
	var vs: float = -float(c.sr) * X + float(c.cr) * Y
	var dx := us
	var dy: float = float(c.F) * float(c.sp) - vs * float(c.cp)
	var dz: float = float(c.F) * float(c.cp) + vs * float(c.sp)
	var l := sqrt(dx * dx + dy * dy + dz * dz)
	return dy / l <= -0.02

func hexc(s: String) -> Color:
	return Color(s)

# ------------------------------------------------------------------ build
func setup() -> void:
	T = Data.title
	pad = int(T.pad)
	W = int(T.W)
	H = int(T.H)
	rng.randomize()
	var flags: Dictionary = Game.save_summary().get("flags", {})
	var n := 0
	for k in flags:
		if flags[k] and String(k).begins_with("cleared_"):
			n += 1
	lit_n = mini(n, int(T.TIERS))
	mat_add = CanvasItemMaterial.new()
	mat_add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	rig = Node2D.new()
	add_child(rig)
	pivot = Node2D.new()
	rig.add_child(pivot)
	for k in LAYERS:
		var l := Node2D.new()
		l.scale = Vector2(Z, Z)
		pivot.add_child(l)
		C[k] = l
	_apply_cam()
	_build_sky()
	_build_far()
	_build_stage()
	_build_front()
	var vg := Sprite2D.new()
	vg.texture = Data.tex("fx_vignette")
	vg.position = SCREEN / 2.0
	vg.scale = Vector2(1.04, 1.04)
	vg.modulate.a = 0.6
	add_child(vg)
	flash = Sprite2D.new()
	flash.texture = tx("px")
	flash.centered = false
	flash.scale = SCREEN
	flash.material = mat_add
	flash.modulate = Color(0.54, 0.63, 1.0, 0.0)
	add_child(flash)
	_shift_layers(0.0)

func _build_sky() -> void:
	spr("sky", tx("sky"), 0, 0)
	for s in T.stars:
		var sp := spr("sky", tx("star_big" if s.big else "px"), s.x, s.y, {"tint": hexc(s.c)})
		stars.append({"s": sp, "sp": float(s.sp), "ph": float(s.ph)})
	for c in T.clouds:
		clouds.append({"s": spr("sky", tx(c.key), c.x, c.by, {"a": 0.85}), "w": float(c.w), "sp": float(c.sp), "by": float(c.by), "x": float(c.x)})
	var mr: float = float(T.moon.r)
	moon_glow = glow("sky", float(T.moon.x) + pad, float(T.moon.y), mr * 6.4 / 48.0, Color("ff2a22"), 0.2)
	for s in T.storm:
		storm.append({"d": spr("sky", tx(s.dark), s.x, s.by), "l": spr("sky", tx(s.lit), s.x, s.by, {"a": 0.0}),
			"w": float(s.w), "h": float(s.h), "sp": float(s.sp), "by": float(s.by), "x": float(s.x), "cy": float(s.by)})

func _build_far() -> void:
	spr("far", tx("far"), 0, 0)
	spr("near", tx("near"), 0, 0)
	var r: Dictionary = T.ruin
	spr("far", tx("ruin"), r.x, r.y)
	ruin_glow = glow("far", r.gx, r.gy, 0.5, Color("ff8a30"), 0.4)
	var mc: Dictionary = T.march
	march_x = float(mc.x)
	for u in mc.units:
		var k: int = int(u.kind)
		var im := spr("far", tx("march%d0" % k), 0, 0)
		var g: Sprite2D = glow("far", 0, 0, 0.2, Color("ffa040"), 0.7) if k == 1 else null
		march_units.append({"s": im, "g": g, "kind": k, "ph": float(u.ph), "off": float(u.off)})

func _build_stage() -> void:
	var world := spr("stage", tx("world%d" % lit_n), 0, 0)
	world.name = "World"
	for w in T.windows:
		var lit: bool = int(w.tier) < lit_n
		var nxt: bool = int(w.tier) == lit_n
		if not (lit or nxt) or not w.vis:
			continue
		var d := maxf(5.0, float(w.w) * 2.6 + 4.0)
		win_glows.append({"s": glow("stage", w.x, w.y, d / 48.0, Color("ffc860") if lit else Color("ffd890"), 0.0), "lit": lit, "ph": rng.randf() * 6.0})
	for g in T.graves:
		spr("stage", tx(g.skey), g.sx, g.sy)
		spr("stage", tx(g.key), g.x, g.y)
	var picks: Array = []
	for i in T.graves.size():
		var g: Dictionary = T.graves[i]
		if int(g.h) >= 6 and i % 3 == 0 and picks.size() < 6:
			picks.append(g)
	for g in picks:
		wisps.append({"x": float(g.cx), "y": float(g.fy) - float(g.h) - 5.0, "ph": rng.randf() * 6.28,
			"halo": glow("stage", 0, 0, 0.34, Color("6ff0d6"), 0.5), "core": px1("stage", Color("d8fff6"))})
	for i in 5:
		eyes.append({"a": px1("stage", Color("ff3a30"), 0.0), "b": px1("stage", Color("ff3a30"), 0.0), "halo": glow("stage", 0, 0, 0.2, Color("ff2a20"), 0.0),
			"t": rng.randf() * 6.0, "open": false, "x": 0.0, "y": 0.0, "age": 0.0})
	for q in T.torches:
		var im := spr("stage", Data.tex("o_torch_0"), q.x, q.y)
		var halo := glow("stage", q.hx, q.hy, 0.62, Color("ff9a3a"), 0.6)
		torches.append({"s": im, "halo": halo, "x": float(q.hx), "y": float(q.hy), "ph": float(q.ph), "ember": rng.randf()})
	spill = spr("stage", tx("spill"), T.spill.x, T.spill.y, {"add": true, "a": 0.0})
	for g in T.guards:
		spr("stage", tx("shadow9"), g.sx, g.sy)
		var im := spr("stage", tx("guard"), g.x, g.y, {"flip": g.flip})
		guards.append({"s": im, "y": float(g.y), "ph": float(g.ph), "eye": glow("stage", g.ex, g.ey, 0.13, Color("ff4a3a"), 0.5)})
	spr("stage", tx("shadow9"), T.hero.sx, T.hero.sy)
	hero = spr("stage", tx("hero0"), T.hero.x, T.hero.y)
	for i in 4:
		bats.append({"s": spr("stage", tx("bat0"), 0, 0), "rad": 7.5 + (i % 3) * 1.6, "yy": float(T.APEX_Y) - 11.0 + i * 2.4,
			"sp": 0.5 + i * 0.13, "ph": i * 1.7, "f": 0, "layer": "stage"})
	for i in 8:
		flock.crows.append({"s": spr("back", tx("crow0"), 0, 0, {"a": 0.0}), "i": i, "on": false, "f": 0, "dx": 0.0, "dy": 0.0})
	# beacon
	var b: Dictionary = T.beacon
	var gx: float = b.x
	var gy: float = b.y
	beacon = {
		"beam": spr("stage", tx("beam"), 0, 0, {"add": true, "a": 0.7}),
		"gem": spr("stage", tx("gem"), roundf(gx) - 2, roundf(gy) - 2),
		"glow": glow("stage", gx, gy, 0.5, Color("4fe8cf"), 0.6),
		"ring": spr("stage", Data.tex("fx_ring"), gx, gy, {"ctr": true, "s": 0.0, "add": true, "tint": Color("6ff0d6"), "a": 0.0}),
		"next": 1.5, "ring_t": -1.0,
	}
	door = spr("stage", tx("door1"), T.door.x, T.door.y, {"a": 0.0})
	var wi: Node = C.stage.get_node("World")
	C.stage.move_child(door, wi.get_index() + 1)   # behind the guards and the hero, in front of the wall

func _build_front() -> void:
	for tr in T.trees:
		spr("fore", tx(tr.key), tr.x, tr.y)
	for f in T.fogs:
		var k: String = f.key
		fogs.append({"a1": spr(f.L, tx(k), 0, f.y, {"a": f.a}), "a2": spr(f.L, tx(k), float(T.fw), f.y, {"a": f.a}), "x": 0.0, "sp": float(f.sp), "y": float(f.y)})
	for i in 96:
		var s := px1("fore", Color.WHITE, 0.0)
		pool.append({"s": s, "life": 0.0, "max": 1.0, "x": 0.0, "y": 0.0, "vx": 0.0, "vy": 0.0, "ember": false})

func _shift_layers(p: float) -> void:
	for k in LAYERS:
		C[k].position.x = (-pad + roundf(p * float(AMP[k]))) * Z

# ------------------------------------------------------------------ per frame
func _process(delta: float) -> void:
	if T.is_empty():
		return
	var dt := minf(0.05, delta)
	t += dt
	if not entering:
		var mx := get_viewport().get_mouse_position().x
		var tgt := (clampf((mx / SCREEN.x - 0.5) * 2.0, -1.0, 1.0) if Controls.mouse_seen else 0.0) + sin(t * 0.21) * 0.28
		px += (tgt - px) * minf(1.0, dt * 2.4)
		_shift_layers(px)
	if shake_t > 0.0:
		shake_t -= dt
		pivot.position = -cam_pan + Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1)) * 0.8 * (shake_t / 0.52)
	moon_glow.modulate.a = 0.2 + 0.07 * sin(t * 0.7)
	ruin_glow.modulate.a = 0.32 + 0.1 * sin(t * 5.3) + 0.06 * sin(t * 13.0)
	_storm(dt)
	_crows(dt)
	_march(dt)
	_ground(dt)
	for st in stars:
		st.s.modulate.a = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * st.sp + st.ph))
	for c in clouds:
		c.x += c.sp * dt
		if c.x > W + pad * 2:
			c.x = -c.w
		c.s.position = Vector2(roundf(c.x), roundf(c.by + float(T.tilt) * (c.x - W / 2.0)))
	shoot_next -= dt
	if shoot_next <= 0.0 and not entering:
		shoot_next = 8.0 + rng.randf() * 9.0
		_shooting_star()
	for f in fogs:
		f.x += f.sp * dt
		var fw := float(T.fw)
		if f.x > fw:
			f.x -= fw
		if f.x < -fw:
			f.x += fw
		f.a1.position.x = roundf(f.x)
		f.a2.position.x = roundf(f.x) + fw * -signf(f.sp)
	for q in torches:
		q.s.texture = Data.tex("o_torch_1" if int(t * 6.0 + q.ph) % 2 == 1 else "o_torch_0")
		q.halo.modulate.a = 0.85 if entering else 0.5 + 0.18 * sin(t * 9.0 + q.ph) + 0.08 * sin(t * 23.0 + q.ph * 3.0)
		q.ember -= dt
		if q.ember <= 0.0:
			q.ember = 0.16 + rng.randf() * 0.3
			_spawn(q.x + (rng.randf() - 0.5) * 2.0, q.y - 2.0, (rng.randf() - 0.5) * 5.0, -(7.0 + rng.randf() * 8.0), 0.8 + rng.randf() * 0.9, Color("ff9a3c") if rng.randf() < 0.5 else Color("ffd86a"), true)
	for g in win_glows:
		g.s.modulate.a = (0.42 + 0.12 * sin(t * 2.3 + g.ph) + 0.06 * sin(t * 7.1 + g.ph * 2.0)) if g.lit else 0.1 + 0.2 * (0.5 + 0.5 * sin(t * 1.7 + g.ph))
	_beacon(dt)
	for g in guards:
		g.s.position.y = g.y + (1.0 if sin(t * 1.5 + g.ph) > 0.55 else 0.0)
		if not flare:
			g.eye.modulate.a = 0.35 + 0.2 * sin(t * 3.0 + g.ph)
	var hf := int(t * 3.2) % 2
	if hf != hero_frame:
		hero_frame = hf
		hero.texture = tx("hero%d" % hf)
	_bats()
	_motes(dt)

func _shooting_star() -> void:
	var x0 := W * (0.15 + rng.randf() * 0.7) + pad
	var y0 := 3.0 + rng.randf() * float(T.horizon) * 0.3
	for i in 9:
		var s := spr("sky", tx("px"), roundf(x0 - i * 2.4), roundf(y0 - i * 1.2), {"a": 0.0})
		var peak := 0.95 - i * 0.09
		var tw := create_tween()
		tw.tween_interval((8 - i) * 0.03)
		tw.tween_callback(func(): s.modulate.a = peak)
		tw.tween_property(s, "modulate:a", 0.0, 0.3)
		tw.tween_callback(s.queue_free)

func _beacon(dt: float) -> void:
	beacon.glow.modulate.a = 0.45 + 0.25 * sin(t * 2.0)
	beacon.beam.modulate.a = 0.55 + 0.2 * sin(t * 1.3)
	beacon.next -= dt
	if beacon.next <= 0.0:
		beacon.next = 4.0
		beacon.ring_t = 0.0
	if beacon.ring_t >= 0.0:
		beacon.ring_t += dt
		var k: float = minf(1.0, beacon.ring_t / 1.6)
		var e := 1.0 - pow(1.0 - k, 2.0)
		beacon.ring.scale = Vector2.ONE * lerpf(0.1, 0.9, e)
		beacon.ring.modulate.a = 0.7 * (1.0 - e)
		if k >= 1.0:
			beacon.ring_t = -1.0
			beacon.ring.modulate.a = 0.0

func _bats() -> void:
	for bt in bats:
		var a: float = t * bt.sp + bt.ph
		var wx: float = cos(a) * bt.rad
		var wz: float = sin(a) * bt.rad
		var wy: float = bt.yy + sin(a * 2.3) * 1.3
		var P := at(wx, wy, wz)
		var layer := "back" if wz > 0.0 else "stage"
		var s: Sprite2D = bt.s
		if layer != bt.layer:
			bt.layer = layer
			s.get_parent().remove_child(s)
			C[layer].add_child(s)
		s.position = Vector2(roundf(P.x - 2.5), roundf(P.y - 1.5))
		s.flip_h = cos(a) * -1.0 > 0.0
		var f := int(t * 9.0 + bt.ph * 3.0) % 2
		if f != bt.f:
			bt.f = f
			s.texture = tx("bat%d" % f)

func _spawn(x: float, y: float, vx: float, vy: float, life: float, col: Color, ember: bool) -> void:
	for p in pool:
		if p.life <= 0.0:
			p.x = x
			p.y = y
			p.vx = vx
			p.vy = vy
			p.life = life
			p.max = life
			p.ember = ember
			p.s.modulate = Color(col.r, col.g, col.b, 0.0)
			return

func _motes(dt: float) -> void:
	var hz := float(T.horizon)
	mote_t -= dt
	if mote_t <= 0.0:
		mote_t = 0.35 + rng.randf() * 0.5
		_spawn(rng.randf() * W + pad, hz + 6.0 + rng.randf() * (H - hz - 6.0) * 0.9, (rng.randf() - 0.5) * 3.0, -(3.0 + rng.randf() * 4.0), 3.0 + rng.randf() * 3.0, Color("6ff0d6") if rng.randf() < 0.7 else Color("9fb4ff"), false)
	ash_t -= dt
	if ash_t <= 0.0:
		ash_t = 0.07 + rng.randf() * 0.12
		_spawn(rng.randf() * (W + pad) + pad * 0.5, rng.randf() * H * 0.75, -(9.0 + rng.randf() * 11.0), 1.5 + rng.randf() * 4.5, 5.0 + rng.randf() * 5.0, Color("ff8a3c") if rng.randf() < 0.22 else Color("b9aebd"), false)
	for p in pool:
		if p.life <= 0.0:
			continue
		p.life -= dt
		p.x += p.vx * dt
		p.y += p.vy * dt
		p.vx += sin(t * 3.0 + p.y) * 0.4 * dt
		var k: float = p.life / p.max
		var want: Node = C.stage if p.ember else C.fore
		var s: Sprite2D = p.s
		if s.get_parent() != want:
			s.get_parent().remove_child(s)
			want.add_child(s)
		s.position = Vector2(roundf(p.x), roundf(p.y))
		s.modulate.a = 0.0 if p.life <= 0.0 else (k if p.ember else minf(1.0, minf(k * 2.0, (1.0 - k) * 4.0)) * 0.75)

# ------------------------------------------------------------------ the storm
func _storm(dt: float) -> void:
	var span := float(W + pad * 2)
	for c in storm:
		c.x += c.sp * dt
		if c.x < -c.w:
			c.x = span + 4.0
		c.cy = roundf(c.by + float(T.tilt) * (c.x - W / 2.0) * 0.5)
		c.d.position = Vector2(roundf(c.x), c.cy)
		c.l.position = c.d.position
	if entering:
		return
	if bolt.spr == null and not bolt.soft:
		bolt.next -= dt
		if bolt.next <= 0.0:
			_strike()
		return
	bolt.t += dt
	var tt: float = bolt.t
	var f1 := tt / 0.05 if tt < 0.05 else exp(-(tt - 0.05) * 7.0)
	var f2 := 0.5 * minf(1.0, (tt - 0.26) / 0.03) * exp(-(tt - 0.29) * 9.0) if tt > 0.26 else 0.0
	var fl := maxf(f1, f2) * (0.45 if bolt.soft else 1.0)
	flash.modulate.a = 0.0 if bolt.soft else 0.13 * fl
	for c in storm:
		c.l.modulate.a = minf(0.95, fl * 1.1)
	if bolt.spr != null:
		var a := 1.0 if tt < 0.08 else 0.3 if tt < 0.13 else 0.95 if tt < 0.28 else 0.95 * (1.0 - (tt - 0.28) / 0.14) if tt < 0.42 else 0.0
		bolt.spr.modulate.a = a
	if tt > 1.3:
		if bolt.spr != null:
			bolt.spr.queue_free()
			bolt.spr = null
		bolt.soft = false
		flash.modulate.a = 0.0
		for c in storm:
			c.l.modulate.a = 0.0
		bolt.next = 7.0 + rng.randf() * 8.0

func _strike(force := false) -> void:
	var vis: Array = []
	for c in storm:
		var cx: float = c.x + c.w / 2.0 - pad
		if cx > W * 0.25 and cx < W * 0.97:
			vis.append(c)
	var c: Dictionary = vis[rng.randi() % vis.size()] if vis.size() > 0 else storm[0]
	bolt.t = 0.0
	bolt.soft = not force and rng.randf() < 0.22
	if not bolt.soft:
		var bx := int(roundf(c.x + c.w * (0.3 + rng.randf() * 0.4)))
		var y0: float = c.cy + c.h - 5.0
		var ridge: Array = T.ridge
		var ground: float = float(ridge[clampi(bx, 0, ridge.size() - 1)])
		if ground <= 0.0:
			ground = H * 0.6
		var ln := maxf(14.0, minf(roundf(H * 0.6), ground - y0 - 1.0 - float(rng.randi() % 5)))
		bolt.n += 1
		var b: Dictionary = T.bolts[bolt.n % T.bolts.size()]
		var s := spr("sky", tx(b.key), bx - int(b.ox), y0, {"a": 0.0})
		s.region_enabled = true
		s.region_rect = Rect2(0, 0, Data.ttex(b.key).get_width(), minf(ln, float(b.len)))
		bolt.spr = s
	var delay := 0.45 + rng.randf() * 1.1
	var soft: bool = bolt.soft
	get_tree().create_timer(delay).timeout.connect(func():
		if not entering and is_inside_tree():
			Game.sfx("thunder", {"vol": 0.45 if soft else 0.9}))

# ------------------------------------------------------------------ crows
func _crows(dt: float) -> void:
	var span := float(W + pad * 2)
	var fk := flock
	if not fk.live:
		fk.next -= dt
		if fk.next > 0.0 or entering:
			return
		fk.live = true
		fk.dir = -1 if rng.randf() < 0.8 else 1
		fk.x = span + 14.0 if fk.dir < 0 else -14.0
		fk.y = float(T.moon.y) + (rng.randf() - 0.5) * float(T.moon.r) * 1.5 if rng.randf() < 0.55 else H * (0.32 + rng.randf() * 0.2)
		fk.n = 5 + rng.randi() % 4
		for c in fk.crows:
			c.dx = c.i * (3.5 + rng.randf() * 3.5)
			c.dy = (rng.randf() - 0.5) * 11.0 + absf(c.i - fk.n / 2.0) * 0.6
			c.on = c.i < fk.n
	fk.x += fk.dir * 26.0 * dt
	var any := false
	for c in fk.crows:
		if not c.on:
			c.s.modulate.a = 0.0
			continue
		var cx: float = fk.x - fk.dir * c.dx
		var cy: float = fk.y + c.dy + sin(t * 1.6 + c.i) * 1.5 + (span / 2.0 - fk.x) * 0.02 * fk.dir
		var f := int(t * 7.0 + c.i * 0.9) % 2
		if f != c.f:
			c.f = f
			c.s.texture = tx("crow%d" % f)
		c.s.position = Vector2(roundf(cx - 3.0), roundf(cy))
		c.s.modulate.a = 1.0
		if cx > -16.0 and cx < span + 16.0:
			any = true
	if not any and ((fk.x < span * 0.5) if fk.dir < 0 else (fk.x > span * 0.5)):
		fk.live = false
		fk.next = 9.0 + rng.randf() * 12.0
		for c in fk.crows:
			c.s.modulate.a = 0.0

# ------------------------------------------------------------------ the march on the far ridge
func _march(dt: float) -> void:
	var R: Array = T.ridge
	march_x -= float(T.march.sp) * dt
	var last: float = march_units[march_units.size() - 1].off
	if march_x + last < -14.0:
		march_x = W + pad + 12.0
	for u in march_units:
		var xi := int(roundf(march_x + u.off))
		var vis := xi > 3 and xi < R.size() - 3
		u.s.visible = vis
		if u.g != null:
			u.g.visible = vis
		if not vis:
			continue
		var f := int(t * 2.4 + u.ph) % 2
		var top: float = float(R[xi]) - 8.0 + (0.0 if f == 1 else 1.0)
		u.s.texture = tx("march%d%d" % [u.kind, f])
		u.s.position = Vector2(xi - 3, top)
		if u.g != null:
			u.g.position = Vector2(xi + 1.5, top + 0.5)
			u.g.modulate.a = 0.55 + 0.2 * sin(t * 8.0 + u.ph * 5.0)

# ------------------------------------------------------------------ wisps over the graves, eyes in the dark
func _ground(dt: float) -> void:
	var hz := float(T.horizon)
	for w in wisps:
		var x: float = w.x + sin(t * 0.9 + w.ph) * 1.6
		var y: float = w.y + sin(t * 1.3 + w.ph * 2.0) * 1.8 - (1.0 if sin(t * 0.37 + w.ph) > 0.6 else 0.0)
		w.core.position = Vector2(roundf(x), roundf(y))
		w.core.modulate.a = 0.7 + 0.3 * sin(t * 6.0 + w.ph)
		w.halo.position = Vector2(x, y)
		w.halo.modulate.a = 0.32 + 0.2 * sin(t * 3.1 + w.ph)
	for e in eyes:
		e.t -= dt
		if e.t <= 0.0:
			if not e.open:
				for k in 20:
					if e.open:
						break
					var sx := W * (rng.randf() * 0.14 + 0.02 if rng.randf() < 0.25 else 0.46 + rng.randf() * 0.5)
					var sy := hz + 10.0 + rng.randf() * (H - hz - 16.0)
					if on_ground(sx, sy):
						e.x = roundf(sx) + pad
						e.y = roundf(sy)
						e.open = true
						e.age = 0.0
						e.t = 2.0 + rng.randf() * 2.5
				if not e.open:
					e.t = 1.0
			else:
				e.open = false
				e.t = 3.0 + rng.randf() * 6.0
		var gap := 4.0 if e.y > H * 0.8 else 3.0
		var a := 0.0
		if e.open:
			e.age += dt
			a = minf(1.0, e.age / 0.3) * (e.t / 0.3 if e.t < 0.3 else 1.0)
			if absf(e.age - 1.1) < 0.07:
				a = 0.0
		e.a.position = Vector2(e.x, e.y)
		e.a.modulate.a = a
		e.b.position = Vector2(e.x + gap, e.y)
		e.b.modulate.a = a
		e.halo.position = Vector2(e.x + gap / 2.0 + 0.5, e.y + 0.5)
		e.halo.modulate.a = a * 0.55

# ------------------------------------------------------------------ the start sequence
## Guards flare, the gate swings open frame by frame, the camera pushes into the light (and levels out), then cream and done().
func enter(done: Callable) -> void:
	entering = true
	flare = true
	flash.modulate.a = 0.0
	Game.stinger("start")
	Game.sfx("crumble", {"vol": 0.8})
	for g in guards:
		var tw := create_tween().set_parallel(true)
		tw.tween_property(g.eye, "modulate:a", 1.0, 0.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(g.eye, "scale", Vector2(0.4, 0.4), 0.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	shake_t = 0.52
	var n := int(T.door.n)
	for i in n:
		get_tree().create_timer(0.34 + i * 0.12).timeout.connect(func():
			door.texture = tx("door%d" % (i + 1))
			door.modulate.a = 1.0
			if i == 0:
				Game.sfx("portal", {"vol": 0.7}))
	create_tween().tween_property(spill, "modulate:a", 0.9, 0.8).set_delay(0.48)
	var mid: Dictionary = T.doorMid
	var target: Vector2 = C.stage.position + Vector2(float(mid.x), float(mid.y)) * Z
	var dur := 1.35
	var t0 := 0.52
	var tw2 := create_tween().set_parallel(true)
	tw2.tween_property(self, "cam_pan", target, dur).set_delay(t0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw2.tween_property(self, "cam_zoom", 3.4, dur).set_delay(t0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw2.tween_property(self, "cam_rot", -float(T.roll) * 0.9, dur).set_delay(t0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var cl := CanvasLayer.new()
	cl.layer = 90
	add_child(cl)
	var fade := ColorRect.new()
	fade.color = Color(1.0, 0.957, 0.839, 0.0)
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cl.add_child(fade)
	create_tween().tween_property(fade, "color:a", 1.0, 0.3).set_delay(t0 + dur - 0.28)
	get_tree().create_timer(t0 + dur + 0.06).timeout.connect(done)

## (for tests) call down a lightning bolt right now
func strike_now() -> void:
	_strike(true)
