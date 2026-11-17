// Helpers for drawing pixel-font text in the game world / HUD.
import { FONT_KEY } from '../art/register.js';

export const hexToInt = (hex) => parseInt(hex.replace('#', ''), 16);

/** size 1 = 6px glyphs (5x7 letters). */
export function txt(scene, x, y, str, o = {}) {
  const { size = 1, color = 0xffffff, depth = 100, fixed = false, origin = [0, 0], align = 0 } = o;
  const t = scene.add.bitmapText(x, y, FONT_KEY, String(str), 6 * size, align);
  t.setTint(typeof color === 'string' ? hexToInt(color) : color);
  t.setDepth(depth).setOrigin(origin[0], origin[1]);
  if (fixed) t.setScrollFactor(0);
  return t;
}

/** text with a 1px dark drop shadow (two bitmap texts kept together) */
export function shadowText(scene, x, y, str, o = {}) {
  const sh = txt(scene, x + 1, y + 1, str, { ...o, color: 0x0a0612, depth: (o.depth ?? 100) - 0.1 });
  const main = txt(scene, x, y, str, o);
  return {
    main, sh,
    setText(s) { main.setText(s); sh.setText(s); return this; },
    setPosition(px, py) { main.setPosition(px, py); sh.setPosition(px + 1, py + 1); return this; },
    setTint(c) { main.setTint(c); return this; },
    setVisible(v) { main.setVisible(v); sh.setVisible(v); return this; },
    setAlpha(a) { main.setAlpha(a); sh.setAlpha(a); return this; },
    destroy() { main.destroy(); sh.destroy(); },
    get width() { return main.width; },
  };
}
