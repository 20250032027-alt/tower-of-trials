// "What do I do next?" - picks the current objective (text + where it is) from the player's progress.
// Keep the texts SHORT: they live in a one-line chip at the top of the screen.

import { G } from './state.js';

const nearest = (list, p) => {
  let best = null, bd = Infinity;
  for (const e of list) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
  return best;
};

export function currentObjective(scene) {
  const p = G.profile, f = p.flags, poi = scene.poi || {};
  const touch = scene.touch.enabled;
  const me = { x: scene.player.x, y: scene.player.y };

  if (scene.kind === 'floor' && scene.floor.id === 'tutorial') {
    if (!f.tutMoved) return { text: touch ? 'Drag the left side to move' : 'Move with WASD', target: null };
    if (!p.traits.length) return { text: 'Equip traits at LOADOUT', target: poi.loadout };
    if (!f.tutHit) return { text: touch ? 'Hit a dummy: hold ATTACK' : 'Hit a dummy: hold click', target: nearest(scene.dummyList, me) };
    if (!f.tutDodged) return { text: touch ? 'Roll with DODGE' : 'Roll with SPACE', target: null };
    if (!f.trialCleared) return { text: f.seen_trial ? 'Clear the Trial of Bones' : 'Enter the Trial of Bones', target: poi['portal:trial'] };
    return { text: 'Take the stairs to Floor 1', target: poi['portal:floor1'] };
  }

  if (scene.kind === 'floor') { // floor 1
    if (!f.cleared_bone_hall && p.level < 5) return { text: 'Warm up in BONE HALL', target: poi['portal:bone_hall'] };
    if (!f.floor1Cleared) return { text: 'Enter the SKELETON CRYPT', target: poi['portal:main'] };
    if (!f.hiddenOpened && scene.crackTarget) return { text: 'Look for the cracked wall', target: scene.crackTarget() };
    if (!f.cleared_hidden_vault && poi['portal:hidden_vault']) return { text: 'Enter the hidden vault', target: poi['portal:hidden_vault'] };
    return { text: 'Floor 1 done! Try any dungeon', target: null };
  }

  // inside a dungeon
  const alive = scene.enemyList.filter((e) => e.alive);
  if (!scene.cleared) {
    const t = alive.length <= 6 ? nearest(alive, me) : null; // few left: point at them
    return { text: `Defeat the skeletons (${alive.length})`, target: t };
  }
  return { text: 'Leave through the EXIT', target: poi.exit };
}
