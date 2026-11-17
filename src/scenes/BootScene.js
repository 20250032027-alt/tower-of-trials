// Draws all the art once, then shows the title screen: the Tower at dusk behind the menu.
import Phaser from 'phaser';
import { registerArt } from '../art/register.js';
import { G } from '../game/state.js';
import { music } from '../game/music.js';
import { TitleBackdrop } from './titlebackdrop.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    registerArt(this);
    music.play('title');
    document.body.classList.remove('playing');
    this.backdrop = new TitleBackdrop(this);
    this.events.once('shutdown', () => { if (this.backdrop) this.backdrop.destroy(); this.backdrop = null; });
    // the menu (DOM) calls back when a button is pressed; the gate opens, the camera pushes in, then the game starts
    G.ui.showTitle(() => {
      this.backdrop.enter(() => this.scene.start('Play', { kind: 'floor', id: 'tutorial' }));
    });
  }

  update(time, delta) { if (this.backdrop) this.backdrop.update(time, delta); }
}
