import Phaser from 'phaser';
import './ui/style.css';
import { BootScene } from './scenes/BootScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { createUI } from './ui/ui.js';
import { createHudDom } from './ui/hud-dom.js';
import { createTouchPad } from './ui/touch-dom.js';
import { initLayoutWatcher } from './ui/controls.js';
import { initGamepad } from './ui/gamepad.js';
import { G } from './game/state.js';
import { music } from './game/music.js';

// DOM layers first (menus, HUD, touch pad), then the canvas that fills the space they leave
createUI();
G.hud = createHudDom();
G.pad = createTouchPad();
initGamepad();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: '100%',
  height: '100%',
  backgroundColor: '#0d0b14',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  // the canvas always matches its box; the scene picks a whole-number zoom so pixels stay crisp
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
  input: { activePointers: 4 },
  scene: [BootScene, PlayScene],
});

window.__tower = { game, G, music };
G.relayout = initLayoutWatcher(() => game.scale && game.scale.refresh && game.scale.refresh());
