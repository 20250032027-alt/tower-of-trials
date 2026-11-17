# glyph bitmaps (json) -> TrueType font. 1 font pixel = 100 units, em = 1000 (10 rows), baseline after row 6.
# Proportional spacing.
import json, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

glyphs = json.load(open(sys.argv[1]))
PX = 100
order = ['.notdef', 'space'] + [f'g{ord(c):04x}' for c in glyphs]
cmap = {32: 'space'}
for c in glyphs: cmap[ord(c)] = f'g{ord(c):04x}'

def bounds(rows):
    cols = [x for row in rows for x, ch in enumerate(row) if ch == '#']
    return (min(cols), max(cols)) if cols else (0, 0)

def draw(rows, shift=0):
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == '#':
                x0 = x
                while x < len(row) and row[x] == '#': x += 1
                top, bot = (7 - r) * PX, (6 - r) * PX
                a, b = (x0 - shift) * PX, (x - shift) * PX
                pen.moveTo((a, bot)); pen.lineTo((a, top)); pen.lineTo((b, top)); pen.lineTo((b, bot)); pen.closePath()
            else: x += 1
    return pen.glyph()

gs = {'.notdef': draw(['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']), 'space': TTGlyphPen(None).glyph()}
adv = {'.notdef': 600, 'space': 400}
for c, rows in glyphs.items():
    lo, hi = bounds(rows)
    shift, w = lo, hi - lo + 2          # proportional: glyph width + 1px gap
    gs[f'g{ord(c):04x}'] = draw(rows, shift)
    adv[f'g{ord(c):04x}'] = w * PX

fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(gs)
fb.setupHorizontalMetrics({n: (adv[n], 0) for n in order})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'PixelUI', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.save(sys.argv[2])
