// Arms and hands. Sleeves run from the shoulders to the grip points of whatever is held, so the hands
// really hold the weapon instead of floating beside it. Everything is stamped pixel by pixel on the
// world grid (no smooth lines), so it matches the rest of the pixel art.

const OUT = 0x14101f;

export const LOOK = {
  hero: { thick: 2, sleeve: 0x3a5c74, sleeveLo: 0x24405a, cuff: 0xb98a3e, glove: 0xa8703f, gloveHi: 0xd09a62, gloveLo: 0x6f4526 },
  bone: { thick: 1, sleeve: 0xcfc8b0, sleeveLo: 0x9b937c, cuff: null, glove: 0xe9e2cc, gloveHi: 0xfbf7ea, gloveLo: 0xb9b19a },
};

function bres(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 80; n++) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

export class HandRig {
  // depth: where the sleeves sit (gloves + extras go above the weapon, 1.5 higher)
  constructor(scene, look, depth, overDepth = depth + 1.5) {
    this.look = look;
    this.under = scene.add.graphics().setDepth(depth);
    this.over = scene.add.graphics().setDepth(overDepth);
  }

  // cx,cy body centre · ang body facing · hands [{x,y}] world grip points (index 0 = right arm)
  // o: { alpha, flash, lean } (lean pushes the shoulders forward a little, for lunges and thrusts)
  draw(cx, cy, ang, hands, o = {}) {
    const L = this.look, u = this.under, g = this.over;
    u.clear(); g.clear();
    const a = o.alpha == null ? 1 : o.alpha;
    u.setAlpha(a); g.setAlpha(a);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lean = o.lean || 0;
    const t = L.thick, ot = t + 2;
    const half = Math.floor(t / 2), ohalf = Math.floor(ot / 2);
    const flash = !!o.flash;
    const arms = hands.map((h, i) => {
      const side = i === 0 ? 1 : -1;
      const sx = cx + ca * (0.5 + lean) - sa * 5.5 * side;
      const sy = cy + sa * (0.5 + lean) + ca * 5.5 * side;
      return { pts: bres(Math.round(sx), Math.round(sy), Math.round(h.x), Math.round(h.y)), h };
    });
    u.fillStyle(OUT, 1);
    for (const arm of arms) for (const [x, y] of arm.pts) u.fillRect(x - ohalf, y - ohalf, ot, ot);
    for (const arm of arms) {
      const n = arm.pts.length;
      arm.pts.forEach(([x, y], k) => {
        const cuff = L.cuff && k >= n - 3;
        u.fillStyle(flash ? 0xff6a6a : cuff ? L.cuff : L.sleeve, 1).fillRect(x - half, y - half, t, t);
        if (t > 1 && !flash && !cuff) u.fillStyle(L.sleeveLo, 1).fillRect(x - half + t - 1, y - half + t - 1, 1, 1);
      });
    }
    for (const arm of arms) {
      const x = Math.round(arm.h.x), y = Math.round(arm.h.y);
      g.fillStyle(OUT, 1).fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle(flash ? 0xff9a9a : L.glove, 1).fillRect(x - 1, y - 1, 3, 3);
      if (!flash) {
        g.fillStyle(L.gloveHi, 1).fillRect(x - 1, y - 1, 1, 1);
        g.fillStyle(L.gloveLo, 1).fillRect(x - 1, y + 1, 3, 1);
      }
    }
  }

  // one-pixel line on the glove layer (the bow string)
  line(x0, y0, x1, y1, color) {
    this.over.fillStyle(color, 1);
    for (const [x, y] of bres(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1))) this.over.fillRect(x, y, 1, 1);
  }

  destroy() { this.under.destroy(); this.over.destroy(); }
}

// weapon-image pixel -> world position, for a weapon image placed at (wx,wy) with its origin at `grip` px
export function weaponPoint(hx, hy, wx, wy, rot, grip, h, scale = 1) {
  const lx = (hx - grip) * scale, ly = (hy - h / 2) * scale;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: wx + c * lx - s * ly, y: wy + s * lx + c * ly };
}
