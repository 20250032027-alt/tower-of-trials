// A very small "draw pixels into a buffer" toolkit.
// All the game's art is generated from code with this, so there are no image
// files to download or lose. Works in the browser AND in Node (for previews).

const colorCache = new Map();
export function parseColor(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c;
  let v = colorCache.get(c);
  if (!v) {
    let s = c.replace('#', '');
    if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
    v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
    colorCache.set(c, v);
  }
  return v;
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  copy() {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return this;
    const col = parseColor(c);
    const i = (y * this.w + x) * 4;
    if (!col) { this.data[i + 3] = 0; return this; }
    this.data[i] = col[0]; this.data[i + 1] = col[1]; this.data[i + 2] = col[2]; this.data[i + 3] = col[3];
    return this;
  }

  get(x, y) {
    if (!this.inside(x, y)) return null;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  solid(x, y) {
    return this.inside(x, y) && this.data[(y * this.w + x) * 4 + 3] > 0;
  }

  fillRect(x, y, w, h, c) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
    return this;
  }

  rect(x, y, w, h, c) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); }
    for (let i = 0; i < h; i++) { this.set(x, y + i, c); this.set(x + w - 1, y + i, c); }
    return this;
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  // filled ellipse; fn(nx, ny) may return a colour for each pixel (nx,ny in -1..1)
  ellipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const col = typeof c === 'function' ? c(nx, ny) : c;
          if (col) this.set(x, y, col);
        }
      }
    }
    return this;
  }

  // ellipse with simple top-left light / bottom-right shade
  shaded(cx, cy, rx, ry, base, light, dark) {
    return this.ellipse(cx, cy, rx, ry, (nx, ny) => {
      const d = nx * 0.7 + ny * 0.7;
      if (d < -0.45) return light;
      if (d > 0.5) return dark;
      return base;
    });
  }

  // paint the 4-neighbour border of everything drawn so far
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.solid(x, y)) continue;
        if (this.solid(x + 1, y) || this.solid(x - 1, y) || this.solid(x, y + 1) || this.solid(x, y - 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }

  blit(src, ox = 0, oy = 0) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        if (src.data[i + 3] === 0) continue;
        this.set(ox + x, oy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
      }
    }
    return this;
  }

  // nearest-neighbour rotation around the centre
  rotated(angle) {
    const out = new Pix(this.w, this.h);
    const cx = this.w / 2, cy = this.h / 2;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const sx = Math.floor(dx * cos - dy * sin + cx);
        const sy = Math.floor(dx * sin + dy * cos + cy);
        const col = this.get(sx, sy);
        if (col && col[3] > 0) out.set(x, y, col);
      }
    }
    return out;
  }

  // build from rows of characters + palette {char: colour}
  static fromRows(rows, palette) {
    const p = new Pix(rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (palette[ch]) p.set(x, y, palette[ch]); }));
    return p;
  }

  scaled(n) {
    const out = new Pix(this.w * n, this.h * n);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
      const col = this.get(Math.floor(x / n), Math.floor(y / n));
      if (col && col[3] > 0) out.set(x, y, col);
    }
    return out;
  }

  // ---- outputs
  toImageData() {
    return new ImageData(this.data, this.w, this.h);
  }

  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(this.toImageData(), 0, 0);
    return cv;
  }

  toDataURL() {
    return this.toCanvas().toDataURL('image/png');
  }
}

// deterministic tiny hash noise (0..1) for texture speckles
export function noise(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export const shade = (hex, amt) => {
  const [r, g, b, a] = parseColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return [f(r), f(g), f(b), a];
};
