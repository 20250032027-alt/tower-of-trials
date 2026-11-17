// One scene plays every map: tower floors (safe hubs with portals) and
// dungeons (enemies, chests, exit portal, rare double-dungeon rifts).

import Phaser from 'phaser';
import { FLOORS, DUNGEONS } from '../data/world.js';
import { ENEMIES } from '../data/enemies.js';
import { rankRange, RANK_COLORS, DOUBLE_DUNGEON_CHANCE, rankOfLevel } from '../data/constants.js';
import { THEMES } from '../art/tiles.js';
import { buildLayout, generateRandomDef, pickRiftSpot, TILE } from '../logic/layout.js';
import { roomAt, hasLineOfSight } from '../logic/awareness.js';
import { makeRng, hashString } from '../logic/rng.js';
import { addXp, xpFromEnemy } from '../logic/progression.js';
import { G, persist } from '../game/state.js';
import { sfx } from '../game/sfx.js';
import { music } from '../game/music.js';
import { Player } from '../game/player.js';
import { Skeleton, Dummy } from '../game/enemy.js';
import { Hud } from '../game/hud.js';
import { XpOrbs } from '../game/orbs.js';
import { playDeath } from '../game/deathfx.js';
import { Controls } from '../ui/controls.js';
import { currentObjective } from '../game/guide.js';
import { txt, hexToInt } from '../game/text.js';
import { icon, WEAPON_ICON } from '../ui/icons.js';

const TS = 16;
// the touch USE caption is short and never cut mid-word
function shortCaption(prompt) {
  let t = prompt.replace(/^\[E\]\s*/, '')
    .replace('LEAVE DUNGEON (ENEMIES REMAIN)', 'LEAVE (ENEMIES LEFT)')
    .replace('LEAVE DUNGEON (CLEARED!)', 'LEAVE (CLEARED!)')
    .replace('LOCKED: CLEAR THE TRIAL OF BONES', 'LOCKED: CLEAR THE TRIAL')
    .replace('ENTER THE RIFT (VERY DANGEROUS)', 'ENTER RIFT (DANGER!)');
  if (t.length > 26) t = t.slice(0, 26).replace(/\s+\S*$/, '');
  return t;
}
const angDiff = (a, b) => Math.abs(Phaser.Math.Angle.Wrap(a - b));

const WEAPON_KEYS = {
  training_sword: 'w_sword', training_claymore: 'w_claymore', training_spear: 'w_spear',
  training_bow: 'w_bow', basic_crossbow: 'w_crossbow', one_time_pistol: 'w_pistol',
  training_mage_book: 'w_book', training_staff: 'w_staff',
};

export class PlayScene extends Phaser.Scene {
  constructor() { super('Play'); }

  init(data) { this.d0 = data || { kind: 'floor', id: 'tutorial' }; }

  weaponKey(id) { return WEAPON_KEYS[id] || 'w_sword'; }

  // ============================================================= create
  create() {
    G.scene = this;
    const d = this.d0;
    this.kind = d.kind;
    this.animated = [];
    this.interactables = [];
    this.poi = {}; // points of interest (for the objective arrow / minimap)
    this.enemyList = [];
    this.dummyList = [];
    this.targets = [];
    this.pickups = [];
    this.crackHp = {};
    this.cleared = false;
    this.ending = false;
    this.prevFire = false;
    this.hitStopUntil = 0;
    this.lastStop = 0;
    this.kickV = { x: 0, y: 0 };
    this.slowUntil = 0; this.slowK = 1;
    this.floorBits = [];
    this.hbT = 0;
    this.look = { x: 0, y: 0 };

    // ---- which map?
    let layoutDef;
    let seed;
    if (d.kind === 'floor') {
      this.floor = FLOORS[d.id];
      this.title = this.floor.name.toUpperCase();
      this.theme = this.floor.theme;
      seed = hashString(d.id);
      layoutDef = this.floor.layout;
      this.titleColor = '#ffffff';
    } else {
      this.dun = DUNGEONS[d.id];
      this.title = this.dun.name.toUpperCase();
      this.theme = this.dun.theme;
      seed = d.seed != null ? d.seed : this.dun.kind === 'random' ? (Date.now() & 0x7fffffff) : hashString(d.id);
      layoutDef = this.dun.kind === 'random' ? generateRandomDef(seed) : this.dun.layout;
      this.titleColor = RANK_COLORS[this.dun.rank];
      this.runKey = d.id + ':' + seed;
      this.run = G.runs[this.runKey] || (G.runs[this.runKey] = { killed: new Set(), chests: new Set(), rift: undefined });
    }
    this.seed = seed;
    this.layout = buildLayout(layoutDef, seed);
    const L = this.layout;

    // ---- double dungeon rift roll (first visit only)
    if (this.dun && ['preset', 'main', 'random'].includes(this.dun.kind) && this.run.rift === undefined) {
      const chance = this.dun.kind === 'random' ? DOUBLE_DUNGEON_CHANCE.randomized : DOUBLE_DUNGEON_CHANCE.preset;
      const rr = makeRng(seed ^ 0x9e3779b9);
      this.run.rift = (G.profile.demo.doubleAlways || rr.chance(chance)) ? pickRiftSpot(L, rr) : null;
    }

    // ---- tilemap
    const rows = [];
    for (let y = 0; y < L.h; y++) rows.push(Array.from(L.tiles.subarray(y * L.w, (y + 1) * L.w)));
    this.map = this.make.tilemap({ data: rows, tileWidth: TS, tileHeight: TS });
    const ts = this.map.addTilesetImage('ts', 'tiles_' + this.theme, TS, TS, 0, 0);
    this.layer = this.map.createLayer(0, ts, 0, 0).setDepth(0);
    this.layer.setCollisionBetween(TILE.WALL_EDGE, TILE.CRACK);
    this.physics.world.setBounds(0, 0, L.w * TS, L.h * TS);
    this.cameras.main.setBackgroundColor(THEMES[this.theme].fog);

    // ---- groups
    this.enemyGroup = this.physics.add.group();
    this.dummyGroup = this.physics.add.group({ immovable: true });
    this.projectiles = this.physics.add.group();

    // ---- player
    let sx = L.spawn.x, sy = L.spawn.y + (d.kind === 'floor' ? 0 : 0);
    if (d.spawnTile) { sx = d.spawnTile.x; sy = d.spawnTile.y + 2; if (d.kind === 'dungeon') sy = d.spawnTile.y + 1; }
    this.player = new Player(this, sx * TS + 8, sy * TS + 8);
    this.player.sprite.setCollideWorldBounds(true);

    this.buildObjects();
    this.buildTorches();
    this.buildEnemies();

    // ---- physics wiring
    this.physics.add.collider(this.player.sprite, this.layer);
    this.physics.add.collider(this.enemyGroup, this.layer);
    this.physics.add.collider(this.player.sprite, this.enemyGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.collider(this.player.sprite, this.dummyGroup);
    this.physics.add.collider(this.projectiles, this.layer, (proj, tile) => {
      if (tile && tile.index === TILE.CRACK) this.hitCrackTile(tile.x, tile.y);
      this.spark(proj.x, proj.y);
      proj.destroy();
    });
    this.physics.add.overlap(this.projectiles, this.enemyGroup, (proj, es) => this.player.projectileHit(proj, es.ref));
    this.physics.add.overlap(this.projectiles, this.dummyGroup, (proj, ds) => this.player.projectileHit(proj, ds.ref));

    // ---- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.w * TS, L.h * TS);
    cam.startFollow(this.player.sprite, true, 0.16, 0.16);
    cam.setRoundPixels(true);
    cam.fadeIn(280, 5, 3, 12);

    // ---- HUD / input
    document.body.classList.add('playing');
    document.body.classList.toggle('moved', !!G.profile.flags.tutMoved);
    this.hud = new Hud(this);
    this.orbs = new XpOrbs(this);
    const self = this;
    this.touch = { get enabled() { return !!(G.pad && G.pad.active); }, get aiming() { return !!(G.pad && G.pad.aiming); } };
    this.focusGfx = this.add.graphics().setDepth(45);
    this.reticles = [];
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q,R,ONE,TWO,THREE,TAB,ESC,M,N');
    this.input.keyboard.addCapture('SPACE,TAB,UP,DOWN,LEFT,RIGHT');
    this.input.mouse.disableContextMenu();
    this.lastAim = 0;
    this.pointerWorld = { x: 0, y: 0 };
    this.goalRing = this.add.image(0, 0, 'fx_goal_0').setDepth(14).setVisible(false);
    this.pointer = this.add.image(0, 0, 'fx_ptr_0').setDepth(70).setVisible(false);
    this.interactMark = txt(this, 0, 0, '!', { depth: 42, origin: [0.5, 1], color: 0xffe27a, size: 1 }).setVisible(false);
    this.startPos = { x: this.player.x, y: this.player.y };

    // zoom: whole-number zoom keeps every pixel the same size; layout changes (rotate / resize) re-fit it
    this.applyZoom();
    const onResize = () => this.applyZoom();
    this.scale.on('resize', onResize);
    window.addEventListener('tower-layout', onResize);

    // minimap + fog of war
    const mapKey = this.mapKey = this.runKey || ('floor:' + this.d0.id);
    if (!G.explored[mapKey] || G.explored[mapKey].length !== L.w * L.h) G.explored[mapKey] = new Uint8Array(L.w * L.h);
    G.hud.setMap(L, G.explored[mapKey]);
    G.hud.setMiniVisible(G.settings.minimap);
    G.hud.toggleBigMap(false);
    G.pad && G.pad.reset();

    this.events.on('resume', () => { this.input.keyboard.resetKeys(); this.prevFire = false; this.menuLockUntil = performance.now() + 300; this.onLoadoutChanged(); });
    this.events.once('shutdown', () => { this.scale.off('resize', onResize); window.removeEventListener('tower-layout', onResize); document.body.classList.remove('fighting'); this.tweens.timeScale = 1; this.time.timeScale = 1; clearTimeout(this._hsT); if (this.orbs) this.orbs.destroy(); if (G.scene === this) G.scene = null; });
    this.saveTimer = this.time.addEvent({ delay: 15000, loop: true, callback: persist });
    void self;

    this.arrive();
  }

  arrive() {
    // soundtrack: a calm hub on the floors, and a dungeon theme that grows teeth when skeletons hunt you
    const dk = this.kind === 'dungeon' ? this.dun.kind : null;
    music.resetThreat();
    music.play(this.kind === 'floor' ? 'hub' : dk === 'hidden' ? 'vault' : dk === 'double' ? 'rift' : 'dungeon', { fade: this.d0.afterDeath ? 4 : 1.8 });
    const kindName = this.kind === 'floor' ? this.floor.name : this.dun.name;
    if (this.kind === 'dungeon') {
      const rr = rankRange(this.dun.rank);
      G.ui.toast(`ENTERED: ${kindName.toUpperCase()}  (RANK ${this.dun.rank}, LV ${rr.min}-${rr.max === Infinity ? '+' : rr.max})`, 'info');
      if (this.dun.kind === 'double') G.ui.toast('DOUBLE DUNGEON: difficulty exceeds normal scaling!', 'warn');
      if (this.dun.kind === 'hidden') G.ui.toast('A hidden dungeon. Few have seen this place.', 'info');
    } else if (this.floor.id === 'floor1' && !G.profile.flags.floor1Seen) {
      G.profile.flags.floor1Seen = true;
      G.ui.toast('FLOOR 1. Look for cracks in the walls...', 'info');
    }
    if (this.run && this.run.rift) G.ui.toast('You sense a rift somewhere in this dungeon.', 'info');
    if (G.firstRun && !G.introShown) {
      G.introShown = true;
    }
  }

  // one-time tips (never repeated, remembered in the save)
  tip(id, text) {
    const f = G.profile.flags;
    if (f['tip_' + id]) return;
    f['tip_' + id] = true;
    G.ui.toast(text, 'tip');
  }

  // ================================================================= world
  tileCenter(x, y) { return { x: x * TS + TS / 2, y: y * TS + TS / 2 }; }

  addInteract(x, y, radius, prompt, act) {
    this.interactables.push({ x, y, r: radius, prompt, act });
  }

  buildObjects() {
    const L = this.layout;
    const objs = [...L.objects];
    if (this.run && this.run.rift) objs.push({ type: 'rift', x: this.run.rift.x, y: this.run.rift.y });
    const flags = G.profile.flags;
    let chestIdx = 0;
    for (const o of objs) {
      const c = this.tileCenter(o.x, o.y);
      switch (o.type) {
        case 'sign': {
          this.add.image(c.x, c.y, 'o_sign').setDepth(5);
          this.addInteract(c.x, c.y, 22, () => '[E] READ SIGN', () => { sfx('ui'); G.ui.dialog(o.title, o.text); });
          break;
        }
        case 'dummy': {
          const dm = new Dummy(this, c.x, c.y);
          this.dummyGroup.add(dm.sprite);
          dm.sprite.body.setImmovable(true);
          this.dummyList.push(dm);
          break;
        }
        case 'altar': {
          const key = o.kind === 'mana' ? 'o_altar_mana' : 'o_altar_loadout';
          const glow = this.add.image(c.x, c.y, key).setDepth(3);
          this.tweens.add({ targets: glow, alpha: 0.7, duration: 900, yoyo: true, repeat: -1 });
          this.poi[o.kind === 'mana' ? 'mana' : 'loadout'] = { x: c.x, y: c.y };
          this.worldLabel(c.x, c.y - 17, o.label, o.kind === 'mana' ? 0xd6b0ff : 0x9fc8ff);
          this.addInteract(c.x, c.y, 24, () => (o.kind === 'mana' ? '[E] MANA ALTAR' : '[E] OPEN LOADOUT'), () => { sfx('ui'); G.ui.openMenu(o.kind === 'mana' ? 'magic' : 'traits'); });
          break;
        }
        case 'portal': {
          const req = o.requires;
          const locked = req && !flags[req];
          const sprite = this.add.image(c.x, c.y, locked ? 'o_portal_locked' : (o.hidden ? 'o_hidden_0' : 'o_portal_0')).setDepth(5);
          if (!locked) this.animated.push({ sprite, prefix: o.hidden ? 'o_hidden_' : 'o_portal_', n: 4, speed: 6 });
          this.poi['portal:' + o.to.id] = { x: c.x, y: c.y, hidden: !!o.hidden };
          const col = locked ? 0x8a7a99 : o.hidden ? 0xffe27a : 0xbfe0ff;
          this.worldLabel(c.x, c.y - 19, o.label + (locked ? ' (LOCKED)' : ''), col);
          if (!locked && !o.hidden) this.addGlow(c.x, c.y, 0x4f8dff);
          if (o.hidden) this.addGlow(c.x, c.y, 0xffd84a);
          this.addInteract(c.x, c.y, 18,
            () => (locked ? '[E] LOCKED: CLEAR THE TRIAL OF BONES' : '[E] ENTER ' + o.label),
            () => this.usePortal(o, c, locked));
          break;
        }
        case 'exit': {
          const sprite = this.add.image(c.x, c.y, 'o_exit_0').setDepth(5);
          this.animated.push({ sprite, prefix: 'o_exit_', n: 4, speed: 6 });
          this.addGlow(c.x, c.y, 0x4fd37a);
          this.exitSprite = sprite;
          this.poi.exit = { x: c.x, y: c.y };
          this.worldLabel(c.x, c.y - 19, 'EXIT', 0xaaf0c0);
          this.addInteract(c.x, c.y, 18,
            () => (this.cleared ? '[E] LEAVE DUNGEON (CLEARED!)' : '[E] LEAVE DUNGEON (ENEMIES REMAIN)'),
            () => this.leaveDungeon());
          break;
        }
        case 'rift': {
          const sprite = this.add.image(c.x, c.y, 'o_rift_0').setDepth(5);
          this.animated.push({ sprite, prefix: 'o_rift_', n: 4, speed: 9 });
          this.addGlow(c.x, c.y, 0xb04fff, 1.6);
          this.poi.rift = { x: c.x, y: c.y };
          this.worldLabel(c.x, c.y - 21, 'RIFT: DOUBLE DUNGEON', 0xe0a8ff);
          this.addInteract(c.x, c.y, 20, () => '[E] ENTER THE RIFT (VERY DANGEROUS)', () => this.enterRift(c));
          break;
        }
        case 'chest': {
          const idx = chestIdx++;
          (this.poi.chests = this.poi.chests || []).push({ x: c.x, y: c.y, idx });
          const opened = this.run && this.run.chests.has(idx);
          const sprite = this.add.image(c.x, c.y, opened ? 'o_chest_open' : 'o_chest').setDepth(5);
          if (!opened) {
            const it = { x: c.x, y: c.y, r: 18, prompt: () => '[E] OPEN CHEST', act: () => this.openChest(idx, sprite, it) };
            this.interactables.push(it);
          }
          break;
        }
        default: break;
      }
    }
    // cracked walls (hidden dungeon)
    for (const cr of L.cracks) this.crackHp[cr.x + ',' + cr.y] = 3;
  }

  // Names above altars / portals only appear when you are close, so they never clutter the view.
  worldLabel(x, y, str, color) {
    const sh = txt(this, x + 1, y + 1, str, { depth: 40.9, origin: [0.5, 1], color: 0x0a0612 }).setAlpha(0);
    const t = txt(this, x, y, str, { depth: 41, origin: [0.5, 1], color }).setAlpha(0);
    (this.worldLabels = this.worldLabels || []).push({ t, sh, x, y });
  }

  updateLabels() {
    const p = this.player;
    for (const l of this.worldLabels || []) {
      const d = Math.hypot(l.x - p.x, l.y + 14 - p.y);
      const a = d < 64 ? 1 : d < 96 ? 1 - (d - 64) / 32 : 0;
      l.t.setAlpha(a); l.sh.setAlpha(a);
    }
  }

  addGlow(x, y, color, scale = 1) {
    const g = this.add.image(x, y, 'fx_glow').setDepth(2).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(scale).setAlpha(0.8);
    this.tweens.add({ targets: g, alpha: 0.45, duration: 700 + Math.random() * 500, yoyo: true, repeat: -1 });
    return g;
  }

  buildTorches() {
    const L = this.layout;
    for (let y = 1; y < L.h - 1; y++) {
      for (let x = 1; x < L.w - 1; x++) {
        if (L.tiles[y * L.w + x] !== TILE.WALL_EDGE) continue;
        const below = L.tiles[(y + 1) * L.w + x];
        if (below >= TILE.WALL_EDGE) continue;
        if (((x * 7 + y * 13) % 19) !== 0) continue;
        const c = this.tileCenter(x, y);
        const sprite = this.add.image(c.x, c.y + 1, 'o_torch_0').setDepth(1.5);
        this.animated.push({ sprite, prefix: 'o_torch_', n: 2, speed: 5 + (x % 3) });
        const col = this.theme === 'rift' ? 0xc060ff : this.theme === 'trial' ? 0x9fc8ff : 0xffa040;
        this.addGlow(c.x, c.y + 10, col, 1.1);
      }
    }
  }

  buildEnemies() {
    if (!this.dun) return;
    const L = this.layout;
    const mult = this.dun.statMult || 1;
    L.enemies.forEach((spec, i) => {
      if (this.run.killed.has(i)) return;
      const rng = makeRng(this.seed * 31 + i * 977);
      const rr = rankRange(this.dun.rank);
      let level;
      if (this.dun.kind === 'double') level = rankRange(this.d0.parentRank || 'F').max + 5 + rng.int(0, 1);
      else level = Phaser.Math.Clamp(G.profile.level + this.dun.levelDelta + (spec.levelBonus || 0) + rng.int(-1, 1), rr.min, rr.max);
      const c = this.tileCenter(spec.x, spec.y);
      const e = new Skeleton(this, c.x, c.y, level, mult, i, spec.room);
      this.enemyGroup.add(e.sprite);
      e.sprite.body.setCircle(6, 4, 4);
      this.enemyList.push(e);
    });
    this.totalEnemies = L.enemies.length;
    if (this.enemyList.length === 0 && this.totalEnemies > 0) this.markCleared(true);
  }

  // ============================================================ interaction
  usePortal(o, c, locked) {
    if (locked) { sfx('deny'); G.ui.toast('The stairs are sealed. Clear the Trial of Bones first.', 'warn'); return; }
    sfx('portal');
    if (o.to.type === 'floor') {
      this.transition({ kind: 'floor', id: o.to.id });
    } else {
      const dun = DUNGEONS[o.to.id];
      G.profile.flags['seen_' + o.to.id] = true;
      if (dun.kind === 'hidden') G.profile.flags.hiddenFound = true;
      this.transition({ kind: 'dungeon', id: o.to.id, returnFloor: this.floor.id, returnTile: { x: Math.floor(c.x / TS), y: Math.floor(c.y / TS) } });
    }
  }

  enterRift(c) {
    sfx('portal');
    G.ui.toast('You step into the rift...', 'warn');
    this.transition({
      kind: 'dungeon', id: 'rift', parentRank: this.dun.rank,
      parent: { id: this.d0.id, seed: this.seed, tile: this.run.rift, returnFloor: this.d0.returnFloor, returnTile: this.d0.returnTile },
      returnFloor: this.d0.returnFloor, returnTile: this.d0.returnTile,
    });
  }

  leaveDungeon() {
    sfx('portal');
    const d = this.d0;
    if (this.dun.kind === 'double' && d.parent) {
      const p = d.parent;
      if (this.cleared) { const pr = G.runs[p.id + ':' + p.seed]; if (pr) pr.rift = null; }
      this.transition({ kind: 'dungeon', id: p.id, seed: p.seed, spawnTile: p.tile, returnFloor: p.returnFloor, returnTile: p.returnTile });
      return;
    }
    delete G.runs[this.runKey];
    this.transition({ kind: 'floor', id: d.returnFloor || this.dun.floor, spawnTile: d.returnTile });
  }

  transition(next) {
    if (this.ending) return;
    this.ending = true;
    this.orbs.flush(); // anything still lying around is yours
    persist();
    this.cameras.main.fadeOut(260, 5, 3, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Play', next));
  }

  travel(floorId) {
    if (this.ending) return;
    delete G.runs[this.runKey];
    this.transition({ kind: 'floor', id: floorId });
  }

  openChest(idx, sprite, it) {
    sfx('chest');
    sprite.setTexture('o_chest_open');
    this.interactables = this.interactables.filter((x) => x !== it);
    if (this.run) this.run.chests.add(idx);
    const luck = this.player.stats.lootLuck; // Lucky Constellation
    const rare = G.rng.chance(0.2 + luck);
    const lv = G.profile.level;
    if (rare) {
      const xp = 60 + lv * 14;
      this.floatText(sprite.x, sprite.y - 12, 'RARE LOOT!', 0xffd84a, 2);
      G.ui.toast(`RARE LOOT! +${xp} XP, full recovery.`, 'good');
      this.orbs.spawn(sprite.x, sprite.y - 2, xp);
      this.burst(sprite.x, sprite.y - 4, 0xffd84a, 14, 24, 14);
      this.kick(-Math.PI / 2, 2);
      sfx('rare');
      this.player.heal(this.player.stats.maxHealth, true);
      this.player.stamina = this.player.stats.maxStamina;
      this.player.mana = this.player.stats.maxMana;
      this.ringFx(sprite.x, sprite.y, 0xffd84a);
    } else {
      const xp = 20 + lv * 5;
      G.ui.toast(`Chest: +${xp} XP and some health.`, 'info');
      this.orbs.spawn(sprite.x, sprite.y - 2, xp);
      this.burst(sprite.x, sprite.y - 4, 0xffe9a0, 8, 18, 10);
      this.player.heal(this.player.stats.maxHealth * 0.3);
    }
    if (luck > 0) {
      const bonus = 10 + lv * 3;
      G.ui.toast(`Lucky Constellation bonus reward: +${bonus} XP.`, 'good');
      this.orbs.spawn(sprite.x, sprite.y - 2, bonus);
    }
  }

  // ---- cracked wall (hidden dungeon)
  hitCrackTile(tx, ty) {
    const key = tx + ',' + ty;
    if (this.crackHp[key] == null) return;
    this.crackHp[key] -= 1;
    sfx('crack');
    const c = this.tileCenter(tx, ty);
    this.spark(c.x, c.y);
    this.cameras.main.shake(80, 0.004);
    if (this.crackHp[key] <= 0) {
      delete this.crackHp[key];
      this.layer.putTileAt(TILE.FLOOR_B, tx, ty);
      G.profile.flags.hiddenOpened = true;
      for (let i = 0; i < 10; i++) this.boneBurst(c.x, c.y);
      sfx('crumble');
      this.cameras.main.shake(220, 0.006);
      G.ui.toast('The wall crumbles... a hidden path is revealed!', 'good');
    }
  }

  crackHit(x, y, aim, reach, half) {
    for (const key of Object.keys(this.crackHp)) {
      const [tx, ty] = key.split(',').map(Number);
      const c = this.tileCenter(tx, ty);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > reach + 10) continue;
      if (angDiff(Math.atan2(c.y - y, c.x - x), aim) > half + 0.5) continue;
      this.hitCrackTile(tx, ty);
    }
  }

  // ============================================================== combat glue
  targetNearAim(x, y, aim, range, cone) {
    let best = null, bestScore = Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dx = t.x - x, dy = t.y - y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      const ad = angDiff(Math.atan2(dy, dx), aim);
      if (ad > cone) continue;
      const score = ad * 70 + d * 0.25;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  roomAt(x, y) { return roomAt(this.layout, x, y, TS); }
  hasLOS(x0, y0, x1, y1) { return hasLineOfSight(this.layout, x0, y0, x1, y1, TS); }

  // a skeleton noticed you: the rest of ITS ROOM gets suspicious too (walls stop the shout)
  alertAllies(src) {
    for (const e of this.enemyList) {
      if (e === src || !e.alive || (e.state !== 'idle' && e.state !== 'search')) continue;
      if (e.room === src.room || Math.hypot(e.x - src.x, e.y - src.y) < 40) { e.alert = Math.max(e.alert, 0.55); e.senseT = 0; }
    }
  }

  // fighting is loud: whatever you do in a room makes that room's occupants suspicious
  noise(x, y) {
    const room = this.roomAt(x, y);
    if (room == null) return;
    for (const e of this.enemyList) {
      if (!e.alive || e.room !== room || (e.state !== 'idle' && e.state !== 'search')) continue;
      e.alert = Math.max(e.alert, 0.6); e.senseT = 0;
    }
  }

  gainXp(amount) {
    const p = G.profile;
    const res = addXp(p, amount, this.player.stats.expRate, G.rng);
    if (res.levelsGained > 0) {
      this.player.refreshStats();
      const st = this.player.stats;
      this.player.hp = Math.min(st.maxHealth, this.player.hp + st.maxHealth * 0.3);
      this.player.stamina = st.maxStamina;
      sfx('levelup');
      this.ringFx(this.player.x, this.player.y, 0xffe27a, 3);
      this.time.delayedCall(150, () => this.ringFx(this.player.x, this.player.y, 0xffffff, 2));
      this.burst(this.player.x, this.player.y + 2, 0xffe27a, 14, 24, 20);
      this.player.hurtFlash = 0.14; // body flashes white-hot for a moment
      this.floatText(this.player.x, this.player.y - 20, 'LEVEL UP', 0xffe27a, 1);
      G.ui.toast(`LEVEL UP! LV ${p.level}  RANK ${rankOfLevel(p.level)}` + (res.adaptive.length ? `  +10% ${res.adaptive.join(', ')}` : ''), 'good');
      persist();
    }
  }

  onEnemyKilled(e) {
    if (this.run) this.run.killed.add(e.idx);
    G.profile.kills += 1;
    this.player.onKill();
    const dir = Math.atan2(e.y - this.player.y, e.x - this.player.x);
    this.orbs.spawn(e.x, e.y, xpFromEnemy(e.def, e.level, this.dun.xpBonus), dir);
    if (G.rng.chance(e.def.healDropChance)) {
      const img = this.add.image(e.x, e.y, 'fx_heal').setDepth(6);
      this.tweens.add({ targets: img, y: e.y - 3, duration: 500, yoyo: true, repeat: -1 });
      this.pickups.push({ img, x: e.x, y: e.y });
    }
    const left = this.enemyList.filter((x) => x.alive && x !== e).length;
    if (left === 0) this.markCleared(false);
  }

  markCleared(silent) {
    if (this.cleared) return;
    this.cleared = true;
    const d = this.dun;
    G.profile.flags['cleared_' + d.id] = true;
    if (d.clearFlag) G.profile.flags[d.clearFlag] = true;
    if (silent) return;
    sfx('levelup');
    music.stinger('clear');
    this.slowMo(0.3, 520);
    const bonus = Math.round((30 + G.profile.level * 6 + this.totalEnemies * 8) * d.xpBonus);
    G.ui.toast(`DUNGEON CLEARED!  Bonus +${bonus} XP`, 'good');
    this.gainXp(bonus);
    if (d.id === 'trial') G.ui.toast('The stairs to Floor 1 are now unlocked!', 'good');
    if (d.id === 'main') G.ui.toast('FLOOR 1 CLEARED! Floors 2-10 are not part of this demo yet.', 'good');
    if (d.kind === 'double') G.ui.toast('The rift collapses behind you as you leave.', 'info');
    if (this.exitSprite) this.ringFx(this.exitSprite.x, this.exitSprite.y, 0x4fd37a);
    persist();
  }

  onPlayerDeath() {
    if (this.ending) return;
    this.ending = true;
    this.orbs.flush();
    music.stinger('death'); music.stop(1.4);
    G.ui.toast('YOU FELL...  The Tower sends you back.', 'warn');
    this.cameras.main.fadeOut(900, 40, 0, 0);
    this.time.delayedCall(1200, () => {
      const d = this.d0;
      const floorId = d.kind === 'floor' ? d.id : (d.returnFloor || this.dun.floor);
      if (this.runKey) delete G.runs[this.runKey];
      this.scene.start('Play', { kind: 'floor', id: floorId, afterDeath: true, spawnTile: d.kind === 'floor' ? undefined : d.returnTile });
    });
  }

  onLoadoutChanged() {
    if (!this.player) return;
    this.player.reloadLoadout(true);
    this.player.hp = Math.min(this.player.hp, this.player.stats.maxHealth);
    this.player.stamina = Math.min(this.player.stamina, this.player.stats.maxStamina);
    this.player.mana = Math.min(this.player.mana || 0, this.player.stats.maxMana);
    if (this.player.mana === 0 && this.player.stats.maxMana > 0) this.player.mana = this.player.stats.maxMana;
    if (G.pendingHeal) {
      G.pendingHeal = false;
      this.player.hp = this.player.stats.maxHealth;
      this.player.stamina = this.player.stats.maxStamina;
      this.player.mana = this.player.stats.maxMana;
    }
  }

  // ================================================================== effects
  // Small, quick numbers. Always 1:1 pixel size, at most a handful on screen, and a hit that lands in the same
  // spot right after another is folded into it instead of stacking up.
  floatText(x, y, str, color = 0xffffff, size = 1) {
    const list = (this.floaters = this.floaters || []);
    const now = this.time.now;
    str = String(str);
    for (const f of list) if (f.str === str && now - f.t0 < 90 && Math.abs(f.x - x) < 10) return;
    while (list.length >= 5) { const o = list.shift(); o.tw.stop(); o.a.destroy(); o.b.destroy(); }
    const big = size > 1;               // crits stay the same size: they are told apart by colour and a "!"
    const label = big && /^\d+$/.test(str) ? str + '!' : str;
    x = Math.round(x); y = Math.round(y);
    const sh = txt(this, x + 1, y + 1, label, { color: 0x0a0612, depth: 59, origin: [0.5, 1] });
    const t = txt(this, x, y, label, { color, depth: 60, origin: [0.5, 1] });
    const rec = { a: t, b: sh, str, x, t0: now };
    rec.tw = this.tweens.add({
      targets: [t, sh], y: '-=8', alpha: 0, duration: 520, ease: 'Quad.easeOut',
      onComplete: () => { t.destroy(); sh.destroy(); const i = list.indexOf(rec); if (i >= 0) list.splice(i, 1); },
    });
    list.push(rec);
  }

  spark(x, y) {
    const s = this.add.image(Math.round(x), Math.round(y), 'fx_spark').setDepth(14);
    this.tweens.add({ targets: s, alpha: 0, duration: 120, onComplete: () => s.destroy() });
  }

  // Bones fly out the way the killing blow was travelling, arc down, and the bigger bits stay on the floor for a few seconds.
  boneBurst(x, y, dir = null) {
    for (let i = 0; i < 8; i++) {
      const chunk = i < 2;
      const key = chunk ? 'fx_chunk' : i % 3 ? 'fx_bone' : 'fx_blood';
      const b = this.add.image(Math.round(x), Math.round(y), key).setDepth(10);
      const a = dir == null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.9;
      const sp = 38 + Math.random() * 72, vh = 80 + Math.random() * 90, dur = 0.34 + Math.random() * 0.2;
      const spin = (Math.random() - 0.5) * 16;
      this.tweens.addCounter({
        from: 0, to: 1, duration: dur * 1000,
        onUpdate: (tw) => {
          const t = tw.getValue() * dur;
          const lift = Math.max(0, 4 + vh * t - 260 * t * t);
          b.setPosition(Math.round(x + Math.cos(a) * sp * t), Math.round(y + Math.sin(a) * sp * t * 0.8 - lift));
          b.setRotation(spin * t);
        },
        onComplete: () => {
          if (!b.scene) return;
          if (key === 'fx_blood') { b.destroy(); return; }
          b.setRotation(Math.round(Math.random() * 3) * Math.PI / 2).setDepth(3.4);
          this.floorBits.push(b);
          if (this.floorBits.length > 28) { const o = this.floorBits.shift(); if (o.scene) o.destroy(); }
          this.tweens.add({ targets: b, alpha: 0, delay: 2600 + Math.random() * 800, duration: 700, onComplete: () => { const k = this.floorBits.indexOf(b); if (k >= 0) this.floorBits.splice(k, 1); if (b.scene) b.destroy(); } });
        },
      });
    }
  }

  // A dying skeleton: skull, ribs, bone bits, its dropped weapon, a heap of bones, dust, ash and a soul wisp (see game/deathfx.js)
  deathFx(x, y, dir, crit, weapon) { playDeath(this, x, y, dir, crit, weapon); }

  // Tiered feedback so the big moments feel bigger than the small ones: a normal hit is a small spark and a few chips;
  // a crit throws more, in gold.
  hitFx(x, y, angle, crit) {
    this.spark(x, y);
    const n = crit ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.3;
      const d = 8 + Math.random() * (crit ? 18 : 10);
      const c = this.add.image(Math.round(x), Math.round(y), 'fx_dot').setDepth(14).setTint(crit ? (i % 2 ? 0xffd84a : 0xffffff) : 0xfff2d0);
      this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 140 + Math.random() * 90, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
    }
    if (crit) this.ringFx(x, y, 0xffd84a, 1);
  }

  // A kill gets the biggest hit-stop and a small pop + shake (a crit kill gets a little more).
  killFx(x, y, crit) {
    this.hitStop(crit ? 110 : 85, true);
    this.cameras.main.shake(crit ? 120 : 80, crit ? 0.0032 : 0.0022);
    this.ringFx(x, y, 0xe2dcc6, 1);
  }

  // a ring of little sparks that drift up and fade (level up, chests)
  burst(x, y, color, n = 10, r = 20, rise = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = this.add.image(Math.round(x), Math.round(y), 'fx_dot').setDepth(14).setTint(i % 2 ? color : 0xffffff);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.55 - rise, alpha: 0, duration: 420 + i * 12, ease: 'Cubic.easeOut', onComplete: () => d.destroy() });
    }
  }

  // camera punch: shoves the view a couple of pixels along `angle`, then eases back (whole pixels, so the art stays crisp)
  kick(angle, px) {
    this.kickV.x += Math.cos(angle) * px;
    this.kickV.y += Math.sin(angle) * px;
  }

  // short slow-motion (used for the final blow of a dungeon)
  slowMo(scale, ms) {
    this.physics.world.timeScale = 1 / scale;
    this.tweens.timeScale = scale; this.time.timeScale = scale;
    this.slowK = scale;
    this.slowUntil = performance.now() + ms;
  }
  endSlowMo() {
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1; this.time.timeScale = 1;
    this.slowK = 1; this.slowUntil = 0;
  }

  stepDust(x, y) {
    const d = this.add.image(Math.round(x + (Math.random() - 0.5) * 4), Math.round(y + 6), 'fx_dot').setDepth(5).setAlpha(0.45).setTint(0xcfc8b0);
    this.tweens.add({ targets: d, y: d.y - 3, alpha: 0, duration: 260, onComplete: () => d.destroy() });
  }

  trailDot(x, y, color, ms = 160) {
    const d = this.add.image(Math.round(x), Math.round(y), 'fx_dot').setDepth(11).setTint(color).setAlpha(0.85);
    this.tweens.add({ targets: d, alpha: 0, duration: ms, onComplete: () => d.destroy() });
  }

  // Freeze the world for a few ms when something connects. Short and rate-limited so it adds weight without feeling laggy
  // (kills pass force=true: they are the one moment worth always freezing for).
  hitStop(ms, force = false) {
    const now = performance.now();
    if (!force && (now < this.hitStopUntil || now < this.lastStop + 140)) return;
    this.lastStop = now;
    this.hitStopUntil = Math.max(this.hitStopUntil, now + ms);
    this.physics.world.isPaused = true;
    clearTimeout(this._hsT);
    this._hsT = setTimeout(() => { try { this.physics.world.isPaused = false; } catch (e) { /* scene gone */ } }, Math.max(1, this.hitStopUntil - now));
  }

  afterimage(pl) {
    const s = pl.sprite;
    for (const key of ['player', 'player_hood']) {
      const g = this.add.image(s.x, s.y, key).setDepth(9).setRotation(s.rotation).setAlpha(0.4).setTint(0xf0d9a0);
      this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    }
  }

  // Camera leads the player a little in the direction of travel and aim (eased so it never whips).
  updateCamera(dt, wp) {
    const cam = this.cameras.main;
    const p = this.player;
    const v = p.sprite.body.velocity;
    let tx = v.x * 0.15, ty = v.y * 0.15;
    let lead = 0;
    if (this.touch.enabled) lead = this.touch.aiming ? 20 : 0;
    else if (wp) lead = Math.min(36, Math.hypot(wp.x - p.x, wp.y - p.y) * 0.18);
    tx += Math.cos(p.aim) * lead; ty += Math.sin(p.aim) * lead;
    const k = 1 - Math.exp(-4.5 * dt);
    this.look.x += (tx - this.look.x) * k;
    this.look.y += (ty - this.look.y) * k;
    const kd = Math.exp(-13 * dt);
    this.kickV.x *= kd; this.kickV.y *= kd;
    cam.setFollowOffset(-Math.round(this.look.x + this.kickV.x), -Math.round(this.look.y + this.kickV.y) - Math.round(this.shiftY || 0));
  }

  dust(x, y) {
    for (let i = 0; i < 4; i++) {
      const b = this.add.image(x, y + 4, 'fx_dot').setDepth(5).setAlpha(0.7).setTint(0xcfc8b0);
      this.tweens.add({ targets: b, x: x + (Math.random() - 0.5) * 18, y: y + 4 + (Math.random() - 0.5) * 8, alpha: 0, duration: 260, onComplete: () => b.destroy() });
    }
  }

  // expanding pulse, drawn as a few whole-pixel rings (no fractional scaling)
  ringFx(x, y, color, max = 3) {
    const r = this.add.image(Math.round(x), Math.round(y), 'fx_pulse_0').setDepth(13).setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    let i = 0;
    this.time.addEvent({
      delay: 70, repeat: max,
      callback: () => { i++; if (i > max) { r.destroy(); return; } r.setTexture('fx_pulse_' + i).setAlpha(1 - i / (max + 1)); },
    });
  }

  slashFx(x, y, angle, reach, color, flip, shape = 'small') {
    let key = 'fx_slash_s', base = 29, ox = 0.5;
    if (shape === 'large') { key = 'fx_slash_l'; base = 38; }
    if (shape === 'thrust') { key = 'fx_thrust'; base = 60; ox = 0; }
    const s = this.add.image(x, y, key).setDepth(13).setRotation(angle).setTint(color).setOrigin(ox, 0.5);
    const sc = Math.max(1, Math.round(reach / base));
    s.setScale(sc, sc * (flip < 0 ? -1 : 1));
    if (shape === 'thrust') s.setPosition(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
    this.tweens.add({ targets: s, alpha: 0, duration: 150, onComplete: () => s.destroy() });
  }

  // ================================================================== update
  // nearest enemy/dummy to aim at when the touch ATTACK button is held without dragging
  autoAimAngle() {
    if (!G.settings.autoAim) return null;
    const p = this.player;
    let best = null, bd = 210;
    for (const t of this.targets || []) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null;
  }

  readInput() {
    const k = this.keys;
    const pressed = Controls.take();
    const usingTouch = this.touch.enabled;
    const tch = usingTouch ? G.pad.poll(() => this.autoAimAngle(), this.lastAim) : { mx: 0, my: 0, aim: null, fire: false };
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (Math.abs(tch.mx) + Math.abs(tch.my) > 0) { mx = tch.mx; my = tch.my; }
    const cam = this.cameras.main;
    const ptr = this.input.mousePointer;
    const wp = cam.getWorldPoint(ptr.x, ptr.y);
    let aim = this.lastAim;
    if (tch.aim != null) aim = tch.aim;
    else if (!usingTouch) aim = Math.atan2(wp.y - this.player.y, wp.x - this.player.x);
    else if (mx || my) aim = Math.atan2(my, mx); // touch: face where you walk
    this.lastAim = aim;
    const fire = (!usingTouch && ptr.leftButtonDown() && !this.pointerOnUi) || tch.fire;
    const J = Phaser.Input.Keyboard.JustDown;
    const inp = {
      mx, my, aim, fire,
      firePressed: fire && !this.prevFire,
      fireReleased: !fire && this.prevFire,
      dodge: J(k.SPACE) || !!pressed.dodge,
      skill1: J(k.ONE) || !!pressed.slot0,
      skill2: J(k.TWO) || !!pressed.slot1,
      skill3: J(k.THREE) || !!pressed.slot2,
      berserk: J(k.R) || !!pressed.berserk,
      swap: J(k.Q) || !!pressed.swap,
      interact: J(k.E) || !!pressed.use,
      menu: J(k.TAB) || J(k.ESC) || !!pressed.menu,
      mute: J(k.N),
      map: J(k.M),
    };
    this.prevFire = fire;
    this.pointerWorld = { x: wp.x, y: wp.y };
    return inp;
  }

  update(time, delta) {
    if (this.slowUntil && performance.now() > this.slowUntil) this.endSlowMo();
    const dt = Math.min(0.05, delta / 1000) * (this.slowUntil ? this.slowK : 1);
    if (performance.now() < this.hitStopUntil) return; // hit-stop freeze
    const inp = this.readInput();
    if (inp.menu && performance.now() > (this.menuLockUntil || 0)) { G.ui.openMenu(); return; }
    if (inp.mute) { G.muted = !G.muted; G.ui.toast(G.muted ? 'SOUND OFF' : 'SOUND ON', 'info'); }
    if (inp.map) G.hud.toggleBigMap();

    // target list
    this.targets = [...this.enemyList.filter((e) => e.alive), ...this.dummyList];

    this.player.update(dt, inp);
    for (const e of this.enemyList) e.update(dt, this.player);
    for (const dm of this.dummyList) dm.update(dt);

    // projectiles
    for (const p of this.projectiles.getChildren()) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.destroy(); continue; }
      if (p.trail) { // fast shots and spells leave a short glittering tail
        p.trailT = (p.trailT || 0) - dt;
        if (p.trailT <= 0) { p.trailT = p.trail.every; this.trailDot(p.x, p.y, p.trail.color, p.trail.ms); }
      }
    }
    this.orbs.update(dt, this.player);

    // interactions
    this.updateInteract(inp);

    // pickups
    for (const pk of this.pickups) {
      if (!pk.img.active) continue;
      if (Math.hypot(pk.x - this.player.x, pk.y - this.player.y) < 14) {
        this.player.heal(this.player.stats.maxHealth * 0.12);
        sfx('pickup');
        this.ringFx(pk.x, pk.y, 0x4fd37a, 1);
        this.burst(pk.x, pk.y, 0x7fe8a0, 6, 12, 8);
        pk.img.destroy();
      }
    }
    this.pickups = this.pickups.filter((p) => p.img.active);

    // animations
    for (const a of this.animated) a.sprite.setTexture(a.prefix + (Math.floor((time / 1000) * a.speed) % a.n));

    this.drawFocus();

    // HUD (DOM)
    const info = { title: this.title, color: this.titleColor, sub: '' };
    if (this.dun) {
      const left = this.enemyList.filter((e) => e.alive).length;
      info.sub = `RANK ${this.dun.rank}  ENEMIES ${left}/${this.totalEnemies}${this.cleared ? '  CLEARED' : ''}`;
    }
    G.hud.update(this.player, info);
    const hpFrac = this.player.hp / this.player.stats.maxHealth;
    this.hud.tick(dt, hpFrac, this.player.dead);
    this.hbT -= dt;
    if (!this.player.dead && hpFrac < 0.3 && this.hbT <= 0) { this.hbT = 0.97; sfx('heartbeat'); } // low health: pulse in sync with the red vignette
    const prompt = this.nearestInteract && this.nearestInteract.on ? this.nearestInteract.text : '';
    G.hud.setPrompt(prompt);
    if (G.pad) {
      G.pad.setUse(prompt ? shortCaption(prompt) : '');
      G.pad.setWeaponIcon(icon(WEAPON_ICON[this.player.weaponDef.id], 2));
      G.pad.setBerserk({ visible: this.player.weaponDef.cls === 'melee', state: this.player.berserk.status });
    }
    this.updateCamera(dt, this.pointerWorld);
    this.updateGuide(time, dt);
    this.updateLabels();
    this.track(dt);
    const showCross = !this.touch.enabled && !this.player.dead;
    this.hud.setCrosshair(showCross, this.pointerWorld.x, this.pointerWorld.y);
  }

  // tutorial progress + one-time tips
  track(dt) {
    const f = G.profile.flags, p = this.player;
    if (!f.tutMoved && Math.hypot(p.x - this.startPos.x, p.y - this.startPos.y) > 24) { f.tutMoved = true; document.body.classList.add('moved'); }
    this.tipT = (this.tipT || 0) + dt;
    this.fightT = (this.fightT || 0) - dt;
    if (this.fightT <= 0) {   // touch buttons are dimmed when idle and come back when something is hunting you
      this.fightT = 0.25;
      const hunters = this.kind === 'dungeon' ? this.enemyList.filter((e) => e.alive && (e.state === 'chase' || e.state === 'windup' || e.state === 'recover')) : [];
      document.body.classList.toggle('fighting', hunters.length > 0);
      // music intensity: 0 exploring, 1 something is onto you (or unsure), 2 a real fight (3+ hunters or one up close)
      let mood = 0;
      if (hunters.length) mood = (hunters.length >= 3 || hunters.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 90)) ? 2 : 1;
      else if (this.kind === 'dungeon' && this.enemyList.some((e) => e.alive && (e.state === 'search' || e.alert > 0.45))) mood = 1;
      music.threat(this.player.dead ? 0 : mood);
    }
    if (this.kind === 'dungeon' && this.enemyList.some((e) => e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 130)) {
      this.tip('enemy', this.touch.enabled ? 'Skeletons! Hold ATTACK to fight, DODGE to roll away.' : 'Skeletons! Click to fight, SPACE to roll away.');
    }
    if (p.hp / p.stats.maxHealth < 0.3) this.tip('lowhp', 'Low health! Back off: you recover when out of combat.');
    if (this.kind === 'floor' && this.floor.id === 'floor1' && this.tipT > 12) this.tip('map', this.touch.enabled ? 'Tap the minimap for the full map.' : 'Press M for the full map.');
    if (p.weaponDef.cls === 'ranger') this.tip('focus', 'Ranged: HOLD attack to focus, RELEASE to fire.');
    if (p.weaponDef.cls === 'melee' && G.profile.kills >= 2) this.tip('aura', this.touch.enabled ? 'Tip: AURA starts Berserk (more damage, drains Force).' : 'Tip: press R for Berserk (more damage, drains Force).');
  }

  // objective chip, pointer arrow, goal ring and minimap
  updateGuide(time, dt) {
    const cam = this.cameras.main;
    const p = this.player;
    const z = this.zoomLevel || 1;
    // fog of war
    G.hud.reveal(Math.floor(p.x / TS), Math.floor(p.y / TS));
    const obj = currentObjective(this);
    const showGuide = G.settings.guide;
    G.hud.setObjective(showGuide ? obj.text : '', obj.target && showGuide ? Math.round(Math.hypot(obj.target.x - p.x, obj.target.y - p.y) / TS) : null);

    // arrow / ring
    let ring = false;
    if (showGuide && obj.target) {
      const cv = this.game.canvas.getBoundingClientRect();
      const sx = cv.left + (obj.target.x - cam.worldView.x) * z;
      const sy = cv.top + (obj.target.y - cam.worldView.y) * z;
      const touchLand = this.touch.enabled && cv.width > cv.height;
      const inset = { l: 34, r: touchLand ? 232 : 34, t: G.settings.minimap ? 150 : 92, b: touchLand ? 80 : 52 };
      const x0 = cv.left + inset.l, x1 = cv.right - inset.r, y0 = cv.top + inset.t, y1 = (this.viewBottom || cv.bottom) - inset.b;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) {
        this.pointer.setVisible(false);
        ring = true;
        // pulse by swapping whole-pixel ring frames (never a fractional scale)
        const f = [0, 1, 2, 1][Math.floor(time / 170) % 4];
        this.goalRing.setTexture('fx_goal_' + f).setPosition(Math.round(obj.target.x), Math.round(obj.target.y - 2)).setVisible(true);
      } else {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const dx = sx - cx, dy = sy - cy;
        const t = Math.min((x1 - x0) / 2 / Math.max(1e-3, Math.abs(dx)), (y1 - y0) / 2 / Math.max(1e-3, Math.abs(dy)));
        // same point, in world pixels, snapped to the world grid; direction snapped to one of 16 pre-drawn arrows
        const wcx = cam.worldView.x + (cx - cv.left) / z, wcy = cam.worldView.y + (cy - cv.top) / z;
        const k = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16);
        const ang = (k * Math.PI * 2) / 16;
        const bob = Math.round(Math.sin(time / 150));
        this.pointer.setTexture('fx_ptr_' + (((k % 16) + 16) % 16))
          .setPosition(Math.round(wcx + (obj.target.x - wcx) * t + Math.cos(ang) * bob), Math.round(wcy + (obj.target.y - wcy) * t + Math.sin(ang) * bob))
          .setVisible(true);
      }
    } else this.pointer.setVisible(false);
    if (!ring) this.goalRing.setVisible(false);

    // minimap
    const markers = [];
    const tile = (o) => ({ x: o.x / TS, y: o.y / TS });
    for (const key of Object.keys(this.poi)) {
      if (key.startsWith('portal:')) {
        const q = this.poi[key];
        const seen = G.explored[this.mapKey];
        if (q.hidden && !(seen && seen[Math.floor(q.y / TS) * this.layout.w + Math.floor(q.x / TS)])) continue; // secrets stay secret until you walk past
        markers.push({ ...tile(q), kind: q.hidden ? 'hidden' : 'portal' });
      }
    }
    if (this.poi.exit) markers.push({ ...tile(this.poi.exit), kind: 'exit' });
    if (this.poi.rift && this.run && this.run.rift) markers.push({ ...tile(this.poi.rift), kind: 'rift' });
    if (this.poi.loadout) markers.push({ ...tile(this.poi.loadout), kind: 'portal' });
    for (const e of this.enemyList) if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 16 * TS) markers.push({ ...tile(e), kind: 'enemy' });
    if (obj.target && showGuide && Math.floor(time / 350) % 2 === 0) markers.push({ ...tile(obj.target), kind: 'goal' });
    markers.push({ x: p.x / TS, y: p.y / TS, kind: 'player' });
    G.hud.drawMap(markers, p.x / TS, p.y / TS);
  }

  applyZoom() {
    const w = this.scale.width, h = this.scale.height;
    const pref = G.settings.zoom;
    let z;
    if (pref && pref !== 'auto') z = +pref;
    else if (h > w) z = w >= 800 ? 3 : 2;
    else z = w >= 1600 ? 4 : w >= 1000 ? 3 : 2;
    this.zoomLevel = z;
    this.cameras.main.setZoom(z);
    this.hud.layout(z);
    this.measureView();
  }

  // In portrait the world fills the whole screen and the controls float over the lower part, so the camera
  // keeps the hero centred in the free area above them instead of the middle of the screen.
  measureView() {
    const hud = document.getElementById('hud');
    const cv = this.game.canvas.getBoundingClientRect();
    const portrait = document.body.classList.contains('touch') && document.body.dataset.layout === 'portrait';
    const free = hud ? hud.getBoundingClientRect().bottom - cv.top : cv.height;
    this.viewBottom = portrait ? cv.top + free : cv.bottom;
    this.shiftY = portrait ? Math.max(0, (cv.height - free) / 2) / (this.zoomLevel || 1) : 0;
  }

  updateInteract(inp) {
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(it.x - this.player.x, it.y - this.player.y);
      if (d <= it.r && d < bestD) { bestD = d; best = it; }
    }
    this.nearestInteract = best ? { on: true, text: best.prompt() } : null;
    this.interactMark.setVisible(!!best).setPosition(best ? best.x : 0, best ? best.y - 16 + Math.sin(this.time.now / 160) * 1.5 : 0);
    if (best && inp.interact) best.act();
  }

  // focus bar + lock-on reticles for rangers
  drawFocus() {
    const g = this.focusGfx;
    g.clear();
    const p = this.player;
    for (const r of this.reticles) r.setVisible(false);
    if (!p.focusing) return;
    // highlight everything in view; locked target gets the bright reticle
    const cam = this.cameras.main;
    let n = 0;
    for (const t of this.targets) {
      if (!t.alive) continue;
      if (!cam.worldView.contains(t.x, t.y)) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) > 260) continue;
      let r = this.reticles[n];
      if (!r) { r = this.add.image(0, 0, 'fx_reticle').setDepth(44); this.reticles[n] = r; }
      const locked = t === p.lockTarget;
      r.setVisible(true).setPosition(t.x, t.y).setAlpha(locked ? 1 : 0.35).setScale(1);
      n++;
    }
    // focus meter above the player
    const w = 30, x = p.x - w / 2, y = p.y - 17;
    const f = p.focus;
    g.fillStyle(0x0a0612, 0.9).fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle(0x2a1424, 1).fillRect(x, y, w, 3);
    g.fillStyle(f > 1.5 ? 0xff9a3a : f >= 1 ? 0xffe27a : 0x6fd2ff, 1).fillRect(x, y, w * Math.min(1, f / 2), 3);
    g.fillStyle(0xffffff, 0.7).fillRect(x + w * 0.5, y - 1, 1, 5); // 100% marker
    g.fillStyle(0xff9a3a, 0.9).fillRect(x + w * 0.75, y - 1, 1, 5); // 150% marker
  }
}
