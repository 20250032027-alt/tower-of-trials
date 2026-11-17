// Registers the generated art with Phaser (textures + the pixel font).
import Phaser from 'phaser';
import { buildCatalog } from './catalog.js';
import { FONT_CHARS, FONT_CELL_W, FONT_CELL_H, FONT_PER_ROW } from './font.js';

export const FONT_KEY = 'pf';

export function registerArt(scene) {
  const catalog = buildCatalog();
  for (const [key, pix] of Object.entries(catalog)) {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, pix.toCanvas());
  }
  const retro = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'font',
    width: FONT_CELL_W,
    height: FONT_CELL_H,
    chars: FONT_CHARS,
    charsPerRow: FONT_PER_ROW,
  });
  scene.cache.bitmapFont.add(FONT_KEY, retro);
  return catalog;
}
