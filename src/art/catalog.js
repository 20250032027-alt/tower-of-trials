// Collects every drawing into one catalog and registers it with Phaser.

import * as S from './sprites.js';
import * as F from './figures.js';
import { buildTileset, THEMES } from './tiles.js';
import { buildFontSheet } from './font.js';
import { Pix } from './pixel.js';

const BLUE = ['#1d3f8f', '#4f8dff', '#bfe0ff'];
const GREEN = ['#1d6b3a', '#4fd37a', '#d6ffe4'];
const PURPLE = ['#3b1466', '#a24fff', '#f0c8ff'];
const GOLD = ['#7a5a12', '#e0b84a', '#fff2b0'];

// Composite of the layered player sprite (cape + scarf + hood) for menus / title.
function heroIcon() {
  const p = new Pix(20, 20);
  const scarf = F.playerScarf();
  // tint the neutral grey scarf with the teal of an F-rank climber
  for (let i = 0; i < scarf.data.length; i += 4) {
    if (!scarf.data[i + 3]) continue;
    const v = scarf.data[i] / 255;
    scarf.data[i] = Math.round(0x9a * v); scarf.data[i + 1] = Math.round(0xd0 * v); scarf.data[i + 2] = Math.round(0xc0 * v);
  }
  return p.blit(F.playerBody()).blit(scarf).blit(F.playerHood()).outline('#120d0a');
}

// Pure function (no Phaser) -> { textureKey: Pix } so Node can preview it too.
export function buildCatalog() {
  const c = {
    player: F.playerBody(), player_hood: F.playerHood(), player_scarf: F.playerScarf(),
    hero_icon: heroIcon(),
    skeleton: F.skeletonBody(),
    shadow: S.shadow(),

    w_sword: F.sword(), w_claymore: F.claymore(), w_spear: F.spear(), w_bow: F.bow(),
    w_crossbow: F.crossbow(), w_pistol: F.pistol(), w_book: F.book(), w_staff: F.staff(),

    p_arrow: S.arrow(), p_bolt: S.bolt(), p_bullet: S.bullet(),
    p_mana_bolt: S.manaBolt(), p_mana_orb: S.manaOrb(), p_enemy: S.enemyBolt(),

    fx_slash_s: S.slashSmall(), fx_slash_l: S.slashLarge(), fx_thrust: S.thrust(),
    fx_spark: S.spark(), fx_bone: S.bit('#e2dcc6'), fx_blood: S.bit('#c0584a'), fx_dot: S.dot(),
    fx_alert: S.cueAlert(), fx_wonder: S.cueWonder(),
    fx_reticle: S.reticle(), fx_mark: S.markIcon(), fx_heal: S.healOrb(), fx_glow: S.glow(),
    fx_ring: S.ring(40, '#ffffffcc'), fx_cross: S.cross(), fx_vignette: S.vignette(480, 270),
    fx_vignette_red: S.vignette(480, 270, [190, 18, 30], 170, 0.8), fx_orb_sh: S.orbShadow(), fx_chunk: S.boneChunk(),
    fx_skull: S.skull(), fx_rib: S.rib(), fx_femur: S.femur(), fx_pile: S.bonePile(), fx_soul_0: S.soulWisp(0), fx_soul_1: S.soulWisp(1), fx_puff: S.dustPuff(), fx_rust: S.bit('#7a5a3a'),

    o_dummy: S.dummy(), o_chest: S.chest(false), o_chest_open: S.chest(true), o_sign: S.sign(),
    o_altar_loadout: S.altar(BLUE), o_altar_mana: S.altar(PURPLE),
    o_portal_locked: S.portalFrame(26, 0, BLUE, true),
    o_torch_0: S.torchFrame(0), o_torch_1: S.torchFrame(1),
  };
  for (let i = 0; i < 3; i++) c['fx_orb_' + i] = S.xpOrb(i);
  for (let i = 0; i < 16; i++) c['fx_ptr_' + i] = S.pointer(i);
  [9, 11, 13].forEach((r, i) => { c['fx_goal_' + i] = S.pixelRing(r, '#ffe27a', '#120d0a'); });
  [4, 8, 12, 16, 20].forEach((r, i) => { c['fx_pulse_' + i] = S.pixelRing(r, '#ffffff'); });
  for (let f = 0; f < 4; f++) {
    c['o_portal_' + f] = S.portalFrame(26, f, BLUE);
    c['o_exit_' + f] = S.portalFrame(26, f, GREEN);
    c['o_hidden_' + f] = S.portalFrame(26, f, GOLD);
    c['o_rift_' + f] = S.portalFrame(32, f, PURPLE);
  }
  for (const id of Object.keys(THEMES)) c['tiles_' + id] = buildTileset(id);
  c.font = buildFontSheet();
  return c;
}
