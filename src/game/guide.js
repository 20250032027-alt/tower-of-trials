// "What do I do next?" - picks the current objective (text + where it is) from the player's progress.
// Keep the texts SHORT: they live in a one-line chip at the top of the screen.

import { G } from './state.js';
import { DUNGEONS } from '../data/world.js';

const nearest = (list, p) => {
  let best = null, bd = Infinity;
  for (const e of list) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
  return best;
};

export function currentObjective(scene) {
  const p = G.profile, f = p.flags, poi = scene.poi || {};
  const pad = !!scene.padMode;
  const touch = scene.touch.enabled && !pad;
  const me = { x: scene.player.x, y: scene.player.y };

  if (scene.kind === 'floor' && scene.floor.id === 'tutorial') {
    if (!f.tutMoved) return { text: pad ? 'Move with the left stick' : touch ? 'Drag the left side to move' : 'Move with WASD', target: null };
    if (!p.traits.length) return { text: 'Equip traits at LOADOUT', target: poi.loadout };
    if (!f.tutHit) return { text: pad ? 'Hit a dummy: hold RT' : touch ? 'Hit a dummy: hold ATTACK' : 'Hit a dummy: hold click', target: nearest(scene.dummyList, me) };
    if (!f.tutDodged) return { text: pad ? 'Roll with B' : touch ? 'Roll with DODGE' : 'Roll with SPACE', target: null };
    if (!f.trialCleared) return { text: f.seen_trial ? 'Clear the Trial of Bones' : 'Enter the Trial of Bones', target: poi['portal:trial'] };
    return { text: 'Take the stairs to Floor 1', target: poi['portal:floor1'] };
  }

  if (scene.kind === 'floor') { // floors 1-10
    const fl = scene.floor;
    const main = DUNGEONS[fl.mainId];
    if (fl.id === 'floor1' && !f.cleared_bone_hall && p.level < 5) return { text: 'Warm up in BONE HALL', target: poi['portal:bone_hall'] };
    if (main && !f[fl.id + 'Cleared']) return { text: 'Enter the ' + main.name.toUpperCase(), target: poi['portal:' + fl.mainId] };
    const next = 'floor' + (fl.n + 1);
    if (poi['portal:' + next] && !f['seen_' + next]) return { text: `Take the stairs to Floor ${fl.n + 1}`, target: poi['portal:' + next] };
    if (!f['cracked_' + fl.id] && scene.crackTarget && scene.crackTarget()) return { text: 'Look for the cracked wall', target: scene.crackTarget() };
    if (fl.hiddenId && !f['cleared_' + fl.hiddenId] && poi['portal:' + fl.hiddenId]) return { text: 'Enter the hidden dungeon', target: poi['portal:' + fl.hiddenId] };
    return { text: fl.n >= 10 ? 'You reached the top! Try any dungeon' : `Floor ${fl.n} done! Try any dungeon`, target: null };
  }

  // inside a dungeon
  const alive = scene.enemyList.filter((e) => e.alive);
  if (!scene.cleared) {
    const t = alive.length <= 6 ? nearest(alive, me) : null; // few left: point at them
    return { text: `Defeat the skeletons (${alive.length})`, target: t };
  }
  return { text: 'Leave through the EXIT', target: poi.exit };
}
