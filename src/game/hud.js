// What still lives inside the canvas: the dark vignette and the mouse crosshair.
// (All the readable HUD is DOM now, see ui/hud-dom.js.)

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.vignette = scene.add.image(0, 0, 'fx_vignette').setScrollFactor(0).setDepth(95);
    this.hurtVig = scene.add.image(0, 0, 'fx_vignette_red').setScrollFactor(0).setDepth(96).setAlpha(0);
    this.hurtA = 0; this.t = 0;
    this.cross = scene.add.image(0, 0, 'fx_cross').setDepth(300); // lives in the world so it stays glued to the mouse while the camera moves
  }

  // keep the vignette covering the whole view whatever the zoom / window size
  layout(zoom) {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    this.vignette.setPosition(w / 2, h / 2).setDisplaySize(w / zoom + 8, h / zoom + 8);
    this.hurtVig.setPosition(w / 2, h / 2).setDisplaySize(w / zoom + 8, h / zoom + 8);
  }

  // red edge flash when you get hit, and a slow red pulse while health is low
  flashHurt(a = 0.85) { this.hurtA = Math.max(this.hurtA, a); }
  tick(dt, hpFrac, dead) {
    this.t += dt;
    this.hurtA = Math.max(0, this.hurtA - dt * 3.4);
    const low = !dead && hpFrac < 0.3 ? (0.16 + 0.16 * (0.5 + 0.5 * Math.sin(this.t * 6.5))) * (1.4 - hpFrac / 0.3 * 0.5) : 0;
    this.hurtVig.setAlpha(Math.min(1, Math.max(this.hurtA, low)));
  }

  setCrosshair(visible, x, y) {
    this.cross.setVisible(visible);
    if (visible) this.cross.setPosition(Math.round(x), Math.round(y));
  }
}
