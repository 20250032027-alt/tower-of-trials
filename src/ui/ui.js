// DOM overlays: title screen, pause menu (status / weapons / traits / skills /
// magic / tower / demo tools), sign dialogs and toast notifications.
// They sit on top of the canvas so text stays crisp and lists can scroll.

import { G, persist, startFresh, continueSave, saveSettings } from '../game/state.js';
import { unlockAudio, sfx } from '../game/sfx.js';
import { music } from '../game/music.js';
import { icon, WEAPON_ICON } from './icons.js';
import {
  GAME_TITLE, RANK_COLORS, RANK_ORDER, RANKS, TRAIT_SLOTS, MANA_CIRCLE_CHANCE, MANA_TYPES, GEMINI_NOTICE,
  LEVEL_MAX, LEVEL_MIN, xpToNext, rankOfLevel, UNITS, BERSERK, FOCUS,
} from '../data/constants.js';
import { TRAITS, TRAIT_BY_ID, TRAIT_TYPES } from '../data/traits.js';
import { WEAPON_LIST, CLASSES, WEAPONS } from '../data/weapons.js';
import { TOWER, DUNGEONS } from '../data/world.js';
import { computeStats, traitPassives } from '../logic/stats.js';
import { setLevel, addXp, innateTalent } from '../logic/progression.js';
import { rollManaCircles } from '../logic/mana.js';
import { loadProfile } from '../logic/progression.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';

export function createUI() {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div id="toasts"></div>
    <div id="title" class="layer hidden"></div>
    <div id="menu" class="layer hidden"></div>
    <div id="dialog" class="layer hidden"></div>`;
  const $toasts = root.querySelector('#toasts');
  const $title = root.querySelector('#title');
  const $menu = root.querySelector('#menu');
  const $dialog = root.querySelector('#dialog');

  let menuOpen = false;
  let dialogOpen = false;
  let tab = 'status';
  let renderedTab = null;
  let menuPaused = false;

  // ------------------------------------------------------------ toasts
  // One line at a time, no box: messages queue up (at most 2 waiting) instead of piling up over the game.
  const toastQ = [];
  let toastShowing = null;
  function nextToast() {
    if (toastShowing || !toastQ.length) return;
    const { msg, kind } = toastQ.shift();
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $toasts.appendChild(el);
    const life = Math.min(4200, 1500 + msg.length * 38);
    const rec = (toastShowing = { el, shownAt: performance.now() });
    rec.t1 = setTimeout(() => el.classList.add('out'), life);
    rec.t2 = setTimeout(() => finishToast(rec), life + 350);
  }
  function finishToast(rec) {
    clearTimeout(rec.t1); clearTimeout(rec.t2);
    rec.el.remove();
    if (toastShowing === rec) toastShowing = null;
    nextToast();
  }
  function toast(msg, kind = 'info') {
    if (toastQ.some((q) => q.msg === msg) || (toastShowing && toastShowing.el.textContent === msg)) return;
    toastQ.push({ msg, kind });
    while (toastQ.length > 2) toastQ.shift();
    // something new is waiting: let the current line go after a short minimum read time
    if (toastShowing && performance.now() - toastShowing.shownAt > 1300) finishToast(toastShowing);
    else if (toastShowing) { const r = toastShowing; clearTimeout(r.t1); clearTimeout(r.t2); const wait = Math.max(0, 1300 - (performance.now() - r.shownAt)); r.t1 = setTimeout(() => r.el.classList.add('out'), wait); r.t2 = setTimeout(() => finishToast(r), wait + 350); }
    nextToast();
  }

  // ------------------------------------------------------------ pause helpers
  function pauseScene() {
    const sc = G.scene;
    if (sc && sc.scene.isActive()) { sc.scene.pause(); menuPaused = true; }
    music.muffle(true); // the music steps back (low-passed) while a menu or sign is open
  }
  function resumeScene() {
    const sc = G.scene;
    if (sc && menuPaused) { menuPaused = false; sc.scene.resume(); }
    music.muffle(false);
  }

  // ------------------------------------------------------------ dialog (signs)
  function dialog(title, text) {
    if (dialogOpen || menuOpen) return;
    dialogOpen = true;
    pauseScene();
    $dialog.innerHTML = `<div class="panel dialog"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn" data-act="closeDialog">OK  [E]</button></div>`;
    $dialog.classList.remove('hidden');
  }
  function closeDialog() {
    if (!dialogOpen) return;
    dialogOpen = false;
    $dialog.classList.add('hidden');
    resumeScene();
    if (G.scene) G.scene.menuLockUntil = performance.now() + 300;
  }

  // ------------------------------------------------------------ menu
  function openMenu(startTab) {
    if (menuOpen || dialogOpen) return;
    unlockAudio();
    menuOpen = true;
    if (startTab) tab = startTab;
    pauseScene();
    $menu.classList.remove('hidden');
    render();
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    renderedTab = null;
    persist();
    $menu.classList.add('hidden');
    resumeScene();
    if (G.scene) G.scene.menuLockUntil = performance.now() + 300;
  }

  const TABS = [
    ['status', 'STATUS'], ['weapons', 'WEAPONS'], ['traits', 'TRAITS'], ['skills', 'SKILLS'],
    ['magic', 'MAGIC'], ['tower', 'TOWER'], ['help', 'HELP'], ['demo', 'DEMO'],
  ];

  function render() {
    const body = { status: rStatus, weapons: rWeapons, traits: rTraits, skills: rSkills, magic: rMagic, tower: rTower, help: rHelp, demo: rDemo }[tab]();
    const prev = $menu.querySelector('.content');
    const scroll = prev && renderedTab === tab ? prev.scrollTop : 0;
    renderedTab = tab;
    $menu.innerHTML = `
      <div class="panel menu">
        <div class="tabs">${TABS.map(([id, label]) => `<button class="tab ${id === tab ? 'on' : ''}" data-act="tab" data-id="${id}">${label}</button>`).join('')}
          <button class="tab close" data-act="closeMenu">X</button></div>
        <div class="content">${body}</div>
        <div class="foot">TAB / ESC to close</div>
      </div>`;
    const c = $menu.querySelector('.content');
    if (c) c.scrollTop = scroll;
  }

  // ---- STATUS
  function currentStats() {
    const p = G.profile;
    return computeStats({ level: p.level, manaCircles: p.manaCircles, passives: traitPassives(p.traits), extra: p.extra, proficiency: p.proficiency });
  }
  function row(label, value, note = '') {
    return `<tr><td>${label}</td><td class="v">${value}</td><td class="n">${note}</td></tr>`;
  }
  function rStatus() {
    const p = G.profile;
    const s = currentStats();
    const need = xpToNext(p.level);
    const rank = rankOfLevel(p.level);
    return `
      <div class="hero">
        <div class="rankbadge" style="color:${RANK_COLORS[rank]};border-color:${RANK_COLORS[rank]}">${rank}</div>
        <div>
          <div class="big">LEVEL ${p.level} <small>(${LEVEL_MIN}-${LEVEL_MAX} in this demo)</small></div>
          <div class="bar"><i style="width:${p.level >= LEVEL_MAX ? 100 : (p.xp / need) * 100}%"></i></div>
          <small>${p.level >= LEVEL_MAX ? 'MAX LEVEL' : `${Math.floor(p.xp)} / ${need} XP`} &nbsp; KILLS ${p.kills}</small>
        </div>
      </div>
      <div class="cols">
      <table class="stats"><thead><tr><th colspan="3">BASIC</th></tr></thead>
        ${row('Health', Math.round(s.maxHealth))}
        ${row('Defense', s.defense.toFixed(1), '10% of Health')}
        ${row('Stamina', Math.round(s.maxStamina))}
        ${row('Mana', Math.round(s.maxMana), s.maxMana ? '' : 'needs a Mana Circle')}
        <thead><tr><th colspan="3">RECOVERY PER SECOND (in / out of combat)</th></tr></thead>
        ${row('Health', `${pct(s.regen.health.combat, 1)} / ${pct(s.regen.health.out, 1)}`)}
        ${row('Stamina', `${pct(s.regen.stamina.combat, 1)} / ${pct(s.regen.stamina.out, 1)}`)}
        ${row('Mana', `${pct(s.regen.mana.combat, 1)} / ${pct(s.regen.mana.out, 1)}`)}
        <thead><tr><th colspan="3">CRITICALS</th></tr></thead>
        ${row('Crit Rate', pct(s.critRate, 1))}
        ${row('Crit Damage', pct(s.critDamage, 1))}
        <thead><tr><th colspan="3">MOVEMENT</th></tr></thead>
        ${row('Movement Speed', pct(s.moveSpeed))}
        ${row('Dodge Distance', pct(s.dodgeDistance))}
        ${row('Dodge Cooldown', s.dodgeCooldown + ' secs')}
        ${row('Dodge Stamina Use', pct(s.dodgeStamina, 1))}
      </table>
      <table class="stats"><thead><tr><th colspan="3">DAMAGE MULTIPLIERS</th></tr></thead>
        ${row('Damage', pct(s.damage))}
        ${row('Melee Damage', pct(s.meleeDamage))}
        ${row('Range Damage', pct(s.rangeDamage))}
        ${row('Magic Damage', pct(s.magicDamage))}
        ${row('Damage Reduction', pct(s.damageReduction))}
        <thead><tr><th colspan="3">WEAPON TYPE PROFICIENCY</th></tr></thead>
        ${row('Weapon Proficiency Rate', pct(s.weaponMastery))}
        ${row('Melee Proficiency', pct(s.proficiency.melee, 1))}
        ${row('Ranger Proficiency', pct(s.proficiency.ranger, 1))}
        ${row('Magic Proficiency', pct(s.proficiency.magic, 1))}
        <thead><tr><th colspan="3">OTHER</th></tr></thead>
        ${row('Experience Rate', pct(s.expRate))}
        ${row('Focus Speed', pct(s.focusSpeed), `100% = ${FOCUS.secondsTo100}s to 100% focus`)}
        ${row('Loot luck', s.lootLuck ? '+' + pct(s.lootLuck) : '-')}
        <thead><tr><th colspan="3">LEVEL RANKS</th></tr></thead>
        <tr><td colspan="3" class="ranks">${RANKS.map((r) => `<span style="color:${RANK_COLORS[r.rank]}">${r.rank} ${r.min}${r.max === Infinity ? '+' : '-' + r.max}</span>`).join(' ')}</td></tr>
      </table></div>
      <p class="hint">Level up growth: +5% every basic stat, +1% every Criticals stat. Trait or Skill rank does not change your Level Rank.</p>`;
  }

  // ---- WEAPONS
  function rWeapons() {
    const p = G.profile;
    const group = (cls) => `
      <h3 style="color:${CLASSES[cls].color}">${CLASSES[cls].name.toUpperCase()}</h3>
      <div class="cards">${WEAPON_LIST.filter((w) => w.cls === cls).map((w) => {
        const eq = p.weapon === w.id;
        const blocked = w.cls === 'magic' && p.manaCircles <= 0;
        return `<div class="card ${eq ? 'equipped' : ''}">
          <img src="${icon(WEAPON_ICON[w.id], 2)}" class="wicon" alt="">
          <div class="ctext"><b>${esc(w.name)}</b><small>${esc(w.type)}</small>
          <div class="kv">${Object.entries(w.sheet).map(([k, v]) => `<span>${esc(k)}: <em>${esc(v)}</em></span>`).join('')}</div>
          ${w.cls === 'magic' ? `<small>Mana cost ${w.mana}, cast ${w.castTime}s</small>` : w.cls === 'ranger' ? `<small>${w.reload ? 'Reload ' + w.reload + 's, ' : ''}hold to Focus, release to fire</small>` : `<small>Range ${w.range}, ${w.arcDeg} deg arc</small>`}
          </div>
          <button class="btn small" data-act="equipWeapon" data-id="${w.id}" ${blocked ? 'disabled' : ''}>${eq ? 'EQUIPPED' : blocked ? 'NEEDS MANA' : 'EQUIP'}</button></div>`;
      }).join('')}</div>`;
    return `<p class="hint">Every Training weapon is unlocked for the demo. Switch in-game with Q (or SWAP).</p>${group('melee')}${group('ranger')}${group('magic')}`;
  }

  // ---- TRAITS
  function traitCard(t) {
    const p = G.profile;
    const equipped = p.traits.includes(t.id);
    const col = RANK_COLORS[t.rank];
    const type = TRAIT_TYPES[t.type];
    if (t.secret) {
      return `<div class="card locked"><div class="badge" style="color:${col};border-color:${col}">${t.rank}</div>
        <div class="ctext"><b>???</b><small style="color:${type.color}">SECRET</small><div>Effect: ???</div><small>Skill: ???</small></div>
        <button class="btn small" disabled>LOCKED</button></div>`;
    }
    const sk = t.skill;
    const skillLine = sk
      ? `<small class="skill">SKILL: ${esc(sk.text)} <em>${sk.active ? 'Active ' + fmtTime(sk.active) : 'Instant'}, Cooldown ${fmtTime(sk.cooldown)}</em></small>`
      : '<small class="skill dim">SKILL: ??? (blank in the plan, locked)</small>';
    return `<div class="card ${equipped ? 'equipped' : ''}"><div class="badge" style="color:${col};border-color:${col}">${t.rank}</div>
      <div class="ctext"><b>${esc(t.name)}</b> <small style="color:${type.color}">${t.type.toUpperCase()}</small>
      <div>${esc(t.effects)}</div>${skillLine}</div>
      <button class="btn small" data-act="${equipped ? 'unequipTrait' : 'equipTrait'}" data-id="${t.id}">${equipped ? 'REMOVE' : 'EQUIP'}</button></div>`;
  }
  function fmtTime(s) {
    if (s >= 60) { const m = s / 60; return (Number.isInteger(m) ? m : m.toFixed(1)) + ' min'; }
    return s + ' secs';
  }
  function rTraits() {
    const p = G.profile;
    const slots = Array.from({ length: TRAIT_SLOTS }, (_, i) => {
      const t = TRAIT_BY_ID[p.traits[i]];
      return `<div class="slot ${t ? 'filled' : ''}"><span>${i + 1}</span>${t ? `<b style="color:${RANK_COLORS[t.rank]}">${esc(t.name)}</b>` : '<i>empty</i>'}</div>`;
    }).join('');
    const first = G.firstRun ? '<p class="hint pulse">Pick up to 3 traits to start. Each trait gives passive bonuses AND a skill you trigger with keys 1, 2, 3.</p>' : '';
    const byRank = RANK_ORDER.map((r) => {
      const list = TRAITS.filter((t) => t.rank === r);
      return `<h3 style="color:${RANK_COLORS[r]}">${r} RANK TRAITS</h3><div class="cards">${list.map(traitCard).join('')}</div>`;
    }).join('');
    return `${first}<div class="slots">${slots}</div>${byRank}`;
  }

  // ---- SKILLS
  function rSkills() {
    const p = G.profile;
    const cards = Array.from({ length: TRAIT_SLOTS }, (_, i) => {
      const t = TRAIT_BY_ID[p.traits[i]];
      if (!t) return `<div class="card empty"><div class="badge">${i + 1}</div><div class="ctext"><b>EMPTY SLOT</b><small>Equip a trait to get its skill.</small></div></div>`;
      const sk = t.skill;
      return `<div class="card"><div class="badge" style="color:${RANK_COLORS[t.rank]};border-color:${RANK_COLORS[t.rank]}">${i + 1}</div>
        <div class="ctext"><b>${esc(t.name)}</b> <small>Skill Acquired</small>
        ${sk ? `<div>${esc(sk.text)}</div><small>Active: ${sk.active ? fmtTime(sk.active) : 'Instant'} &nbsp; Cooldown: ${fmtTime(sk.cooldown)}</small>` : '<div class="dim">??? (this skill is blank in the plan)</div><small>LOCKED</small>'}
        </div></div>`;
    }).join('');
    return `<p class="hint">Press the number key (or tap the slot) to use a skill. Skill ranks follow their trait.</p>${cards}
      <h3>SWORD AURA (MELEE)  -  key R</h3>
      <p class="hint">Physical Force is split into ${BERSERK.maxCores} Aura Cores (25% each). Each Berserk activation burns one Core, then Force drains ${pct(BERSERK.drainPerSecond, 1)} per second. Empty = <b>Life Force Decay</b> (damage taken, move speed -70%, damage -50%, crit rate -25%). Ending early = <b>Life Force Exhaustion</b>. A Core regenerates after ${BERSERK.coreRegenSeconds}s without activating. Berserker's Fury/Wrath skills trigger the stronger Berserk Mode.</p>`;
  }

  // ---- MAGIC
  function rMagic() {
    const p = G.profile;
    const talent = innateTalent(p);
    const ch = talent ? MANA_CIRCLE_CHANCE[talent.rank] : null;
    const table = RANK_ORDER.map((r) => `<tr class="${talent && talent.rank === r ? 'hl' : ''}"><td style="color:${RANK_COLORS[r]}">${r}</td><td>${MANA_CIRCLE_CHANCE[r].talent}</td><td>${pct(MANA_CIRCLE_CHANCE[r].one)}</td><td>${pct(MANA_CIRCLE_CHANCE[r].two)}</td></tr>`).join('');
    const types = Object.entries(MANA_TYPES).map(([id, m]) => `
      <div class="card ${p.manaType === id ? 'equipped' : ''}">
        <div class="ctext"><b style="color:${m.color}">${m.name}</b><small>${esc(m.desc)}</small>
        <small>Magic: ${m.magic.join(', ')}</small></div>
        <button class="btn small" data-act="manaType" data-id="${id}" ${p.manaCircles > 0 ? '' : 'disabled'}>${p.manaType === id ? 'CHOSEN' : 'CHOOSE'}</button></div>`).join('');
    const spells = p.manaType ? MANA_TYPES[p.manaType].magic.map((m) => `<div class="spell">${m.toUpperCase()} <em>LOCKED - spell stats are blank in the plan</em></div>`).join('') : '<div class="dim">Choose a mana type to see its magic.</div>';
    return `
      <p class="hint">Magic and Mana cannot be acquired by any means without the proper affinity and talent. Only select <b>Innate Talents</b> (Magic-type traits) can manifest Mana Circles in their hearts. Mana is the essence given by a Constellation.</p>
      <div class="hero"><div class="big">MANA CIRCLES: ${p.manaCircles}</div><small>${talent ? `Innate Talent: <b style="color:${RANK_COLORS[talent.rank]}">${esc(talent.name)}</b> (${talent.rank}) &nbsp; 1 circle ${pct(ch.one)}, 2 circles ${pct(ch.two)}` : 'No Innate Talent equipped. Equip a Magic trait first (Traits tab).'}</small></div>
      <div class="row">
        <button class="btn" data-act="awaken" ${talent ? '' : 'disabled'}>AWAKEN MANA CIRCLES</button>
        <button class="btn ghost" data-act="resetCircles" ${p.manaCircles ? '' : 'disabled'}>RESET (DEMO)</button>
      </div>
      <small class="hint">Demo: you can re-roll as many times as you like. Mana = ${UNITS.manaPerCircle} per circle at level 1 [placeholder value].</small>
      <h3>TYPES OF MANA</h3><div class="cards">${types}</div>
      <h3>MAGIC OF YOUR MANA</h3><div class="spells">${spells}</div>
      <p class="hint">Book (quick and fast) and Staff (more damage, slower casting) fire a basic mana bolt in the colour of your mana type.</p>
      <h3>INNATE TALENT CHANCES</h3>
      <table class="stats"><thead><tr><th>RANK</th><th>TALENT</th><th>1 CIRCLE</th><th>2 CIRCLES</th></tr></thead>${table}</table>`;
  }

  // ---- TOWER
  function rTower() {
    const p = G.profile;
    const floors = TOWER.map((f) => {
      const cur = G.scene && ((G.scene.floor && G.scene.floor.id === f.id) || (G.scene.dun && G.scene.dun.floor === f.id));
      let btn;
      if (!f.playable) btn = '<button class="btn small" disabled>NOT IN DEMO</button>';
      else if (f.id === 'floor1' && !p.flags.trialCleared) btn = '<button class="btn small" data-act="travel" data-id="floor1">TRAVEL (DEMO)</button>';
      else btn = `<button class="btn small" data-act="travel" data-id="${f.id}">${cur ? 'RESTART FLOOR' : 'TRAVEL'}</button>`;
      return `<div class="card ${cur ? 'equipped' : ''} ${f.playable ? '' : 'locked'}"><div class="ctext"><b>${f.label.toUpperCase()}</b><small>${f.id === 'tutorial' ? 'Tutorial Floor' : f.playable ? 'Main Floor' : 'Main Floor (locked)'}</small></div>${btn}</div>`;
    }).join('');
    const list = Object.values(DUNGEONS).filter((d) => d.floor === 'floor1').map((d) => {
      const hidden = d.kind === 'hidden' && !p.flags.hiddenFound;
      const done = p.flags['cleared_' + d.id];
      const label = hidden ? '???' : d.name;
      const kind = hidden ? 'HIDDEN' : d.kind === 'main' ? 'MAIN' : d.kind.toUpperCase();
      return `<div class="drow"><span class="k k-${hidden ? 'hidden' : d.kind}">${kind}</span> <b>${esc(label)}</b> <span style="color:${hidden ? '#8a7a99' : RANK_COLORS[d.rank]}">${hidden ? '' : 'RANK ' + d.rank}</span> ${done ? '<em class="ok">CLEARED</em>' : ''}</div>`;
    }).join('');
    return `<p class="hint">The Tower has 11 Floors: 1 Tutorial Floor and 10 Main Floors. Floors are the story's segments/acts. This demo has the Tutorial Floor and Floor 1.</p>
      <div class="cards">${floors}</div>
      <h3>FLOOR 1 DUNGEONS</h3>${list}
      <div class="drow"><span class="k k-double">DOUBLE</span> <b>Rifts</b> <em>appear rarely inside preset (very low chance) and randomized (low chance) dungeons</em></div>`;
  }

  // ---- HELP: controls + guidance options
  function rHelp() {
    const S = G.settings;
    const on = (v) => (v ? 'ON' : 'OFF');
    return `
      <h3>HOW TO PLAY</h3>
      <table class="stats">
        ${row('Move', 'WASD / Arrows  |  left thumb')}${row('Aim', 'Mouse  |  drag the ATTACK button')}
        ${row('Attack / Focus / Cast', 'Left click (hold)  |  hold ATTACK')}
        ${row('Dodge', 'SPACE  |  DODGE')}${row('Skills', '1  2  3  |  tap the skill buttons')}
        ${row('Berserk (Sword Aura)', 'R  |  AURA')}${row('Swap weapon', 'Q  |  SWAP')}
        ${row('Use / Open / Read', 'E  |  USE (appears near things)')}${row('Full map', 'M  |  tap the minimap')}
        ${row('Menu', 'TAB / ESC  |  MENU')}${row('Sound', 'N')}
      </table>
      <p class="hint">Tip: the yellow arrow always points at your next goal. If you ever feel lost, just follow it.</p>
      <h3>ENEMIES</h3>
      <table class="stats">
        ${row('Skeletons notice you', 'when you are in THEIR room and they can see you, or right beside them')}
        ${row('?  above a skeleton', 'unsure: it is about to notice you. Back out of the room to stay hidden')}
        ${row('!  above a skeleton', 'it spotted you and is coming')}
        ${row('Walls block sight', 'break line of sight and it gives up and searches')}
        ${row('Fighting is loud', 'other skeletons in the same room join in')}
      </table>
      <h3>AUDIO</h3>
      <div class="row aud">
        <label>MUSIC <input id="musicVol" type="range" min="0" max="100" step="5" value="${Math.round((S.musicVol == null ? 0.7 : S.musicVol) * 100)}"> <b id="musicVolv">${Math.round((S.musicVol == null ? 0.7 : S.musicVol) * 100)}</b></label>
        <label>EFFECTS <input id="sfxVol" type="range" min="0" max="100" step="5" value="${Math.round((S.sfxVol == null ? 1 : S.sfxVol) * 100)}"> <b id="sfxVolv">${Math.round((S.sfxVol == null ? 1 : S.sfxVol) * 100)}</b></label>
        <button class="btn small" data-act="toggleSound">SOUND: <b>${G.muted ? 'OFF' : 'ON'}</b></button>
      </div>
      <h3>GUIDE &amp; DISPLAY</h3>
      <div class="row">
        <button class="btn small" data-act="setOpt" data-k="guide">GOAL ARROW: <b>${on(S.guide)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="minimap">MINIMAP: <b>${on(S.minimap)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="autoAim">AUTO-AIM (TOUCH): <b>${on(S.autoAim)}</b></button>
      </div>
      <div class="row">
        <button class="btn small" data-act="setOpt" data-k="zoom">ZOOM: <b>${S.zoom === 'auto' ? 'AUTO' : S.zoom + 'X'}</b></button>
        <button class="btn small" data-act="setOpt" data-k="touch">TOUCH BUTTONS: <b>${String(S.touch).toUpperCase()}</b></button>
        <button class="btn small" data-act="resetTips">SHOW TIPS AGAIN</button>
      </div>`;
  }

  // ---- DEMO TOOLS
  function rDemo() {
    const p = G.profile;
    return `
      <div class="row"><label>LEVEL <input id="lvl" type="range" min="${LEVEL_MIN}" max="${LEVEL_MAX}" value="${p.level}"> <b id="lvlv">${p.level}</b></label>
        <button class="btn small" data-act="setLevel">SET LEVEL</button></div>
      <div class="row">
        <button class="btn small" data-act="xp">+200 XP</button>
        <button class="btn small" data-act="heal">FULL HEAL</button>
        <button class="btn small" data-act="unlock">UNLOCK STAIRS</button>
      </div>
      <div class="row">
        <button class="btn small" data-act="toggleDouble">DOUBLE DUNGEON RIFTS: <b>${p.demo.doubleAlways ? 'ALWAYS' : 'RARE (NORMAL)'}</b></button>
        <button class="btn small" data-act="toggleSound">SOUND: <b>${G.muted ? 'OFF' : 'ON'}</b></button>
      </div>
      <p class="hint">Rifts: turn this to ALWAYS, then enter any preset/randomized dungeon and look for the purple portal.</p>
      <div class="row"><button class="btn small danger" data-act="reset">RESET ALL PROGRESS</button></div>`;
  }

  // ------------------------------------------------------------ actions
  function afterChange() { persist(); render(); }

  const actions = {
    tab(el) { tab = el.dataset.id; sfx('ui'); render(); },
    setOpt(el) {
      const k = el.dataset.k, S = G.settings;
      if (k === 'zoom') S.zoom = { auto: '2', 2: '3', 3: '4', 4: 'auto' }[S.zoom] || 'auto';
      else if (k === 'touch') S.touch = { auto: 'on', on: 'off', off: 'auto' }[S.touch] || 'auto';
      else S[k] = !S[k];
      saveSettings(); sfx('ui');
      if (k === 'touch' && G.relayout) G.relayout();
      if (k === 'zoom' && G.scene && G.scene.applyZoom) G.scene.applyZoom();
      if (k === 'minimap' && G.hud) G.hud.setMiniVisible(S.minimap);
      render();
    },
    resetTips() { for (const f of Object.keys(G.profile.flags)) if (f.startsWith('tip_')) delete G.profile.flags[f]; toast('Tips will show again.', 'info'); sfx('ui'); },
    closeMenu, closeDialog,
    equipTrait(el) {
      const id = el.dataset.id;
      const p = G.profile;
      if (p.traits.length >= TRAIT_SLOTS) { toast(`All ${TRAIT_SLOTS} trait slots are full. Remove one first.`, 'warn'); sfx('deny'); return; }
      p.traits.push(id);
      p.awakened = false;
      G.firstRun = false;
      sfx('ui'); afterChange();
    },
    unequipTrait(el) {
      const p = G.profile;
      p.traits = p.traits.filter((t) => t !== el.dataset.id);
      sfx('ui'); afterChange();
    },
    equipWeapon(el) {
      G.profile.weapon = el.dataset.id; sfx('ui'); afterChange();
    },
    awaken() {
      const p = G.profile;
      const talent = innateTalent(p);
      if (!talent) return;
      const n = rollManaCircles(talent.rank, G.rng);
      p.manaCircles = n;
      p.awakened = true;
      if (n === 0) { p.manaType = null; toast(`${talent.name}: no Mana Circle formed. The affinity was too weak this time.`, 'warn'); sfx('deny'); }
      else {
        sfx('levelup');
        toast(`${n} MANA CIRCLE${n > 1 ? 'S' : ''} FORMED IN YOUR HEART!`, 'good');
        if (talent.rank === 'S') toast(GEMINI_NOTICE, 'good');
        if (!p.manaType) p.manaType = 'natural';
      }
      afterChange();
    },
    resetCircles() { G.profile.manaCircles = 0; G.profile.manaType = null; G.profile.awakened = false; afterChange(); },
    manaType(el) { G.profile.manaType = el.dataset.id; sfx('ui'); afterChange(); },
    travel(el) {
      const id = el.dataset.id;
      closeMenu();
      if (G.scene) G.scene.travel(id);
    },
    setLevel() { setLevel(G.profile, +$menu.querySelector('#lvl').value); G.pendingHeal = true; afterChange(); },
    xp() { addXp(G.profile, 200, 1, G.rng); G.pendingHeal = true; afterChange(); },
    heal() { G.pendingHeal = true; toast('Fully healed.', 'good'); },
    unlock() { G.profile.flags.trialCleared = true; toast('Stairs to Floor 1 unlocked (re-enter the floor to see it).', 'good'); afterChange(); },
    toggleDouble() { G.profile.demo.doubleAlways = !G.profile.demo.doubleAlways; afterChange(); },
    toggleSound() { G.muted = !G.muted; afterChange(); },
    reset() {
      if (!confirm('Reset all progress?')) return;
      startFresh(); G.firstRun = false;
      closeMenu();
      if (G.scene) G.scene.travel('tutorial');
    },
  };

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    unlockAudio();
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'lvl') root.querySelector('#lvlv').textContent = e.target.value;
    if (e.target.id === 'musicVol' || e.target.id === 'sfxVol') {
      G.settings[e.target.id] = +e.target.value / 100;
      root.querySelector('#' + e.target.id + 'v').textContent = e.target.value;
      music.sync();
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'musicVol' || e.target.id === 'sfxVol') {
      saveSettings();
      if (e.target.id === 'sfxVol') sfx('hit', { weapon: 'training_sword', mat: 'bone' }); // let them hear the new level
    }
  });

  window.addEventListener('keydown', (e) => {
    if (dialogOpen) {
      if (['e', 'E', 'Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); closeDialog(); }
      return;
    }
    if (menuOpen) {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
    }
  });

  // ------------------------------------------------------------ title screen
  // The DOM menu sits over the animated Tower vista (scenes/titlebackdrop.js). Logo, tagline, one clear main action, a save
  // summary, a sound switch and a rotating tip. Pressing a button hands over to the scene, which opens the gate and pushes in.
  const TIPS = [
    'Follow the yellow arrow: it always points at your next goal.',
    'Skeletons notice you when you enter THEIR room. A "?" means they are unsure.',
    'Walls block sight. Break line of sight and a skeleton gives up and searches.',
    'Fighting is loud: skeletons in the same room will join in.',
    'Bows and spells: HOLD to focus, RELEASE to fire.',
    'Melee users can go Berserk for more damage, at the cost of Force.',
    'Defeated skeletons drop XP orbs. Walk close and they fly to you.',
    'Cracked walls hide secret dungeons. Look for them.',
    'Rarely, a rift opens a Double Dungeon with tougher skeletons.',
    'Every lit window on the Tower is a dungeon you have cleared.',
  ];
  function showTitle(onStart) {
    const save = loadProfile();
    const words = GAME_TITLE.split(' '), line1 = words[0], line2 = words.slice(1).join(' ');
    const brackets = (t) => esc(t).replace(/\[/g, '<b class="br">[</b>').replace(/\]/g, '<b class="br">]</b>');
    const line2html = line2.replace(/^of\s+/i, '').length !== line2.length
      ? `<i>${esc(line2.match(/^of/i)[0].toUpperCase())}</i> ${brackets(line2.replace(/^of\s+/i, '').toUpperCase())}`
      : brackets(line2.toUpperCase());
    const summary = save ? `LV ${save.level}  -  RANK ${rankOfLevel(save.level)}  -  ${save.kills || 0} KILLS` : '';
    $title.innerHTML = `
      <div class="tt-wrap">
        <button class="tt-snd" data-act="sound">SOUND: <b>${G.muted ? 'OFF' : 'ON'}</b></button>
        <div class="tt-menu">
          <div class="tt-top">
            <h1 class="tt-logo" aria-label="${esc(GAME_TITLE)}"><span class="l1">${esc(line1.toUpperCase())}</span><span class="l2">${line2html}</span></h1>
            <div class="tt-tag">ELEVEN FLOORS. ONE WAY UP.</div>
          </div>
          <div class="tt-bottom">
            <div class="tt-btns">
              ${save
    ? `<button class="tt-btn primary" data-act="cont">CONTINUE</button>
                 <div class="tt-save">${summary}</div>
                 <button class="tt-btn" data-act="start" data-confirm="1">NEW GAME</button>`
    : '<button class="tt-btn primary" data-act="start">START</button>'}
            </div>
            <div class="tt-tip"><span id="tt-tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</span></div>
            <div class="tt-keys"><span class="kb">WASD move  -  MOUSE aim + attack  -  SPACE dodge  -  E use  -  TAB menu</span><span class="tc">Left thumb moves  -  ATTACK and DODGE on the right</span></div>
          </div>
        </div>
        <div class="tt-hint" id="tt-hint">TAP ANYWHERE FOR SOUND</div>
        <div class="tt-ver">DEMO  -  PLACEHOLDER TITLE</div>
      </div>`;
    $title.classList.remove('hidden', 'leaving');
    let going = false, eraseTimer = 0, tipIdx = Math.floor(Math.random() * TIPS.length);

    // rotating tip + the "tap for sound" hint (goes away once the music has started)
    const tipEl = $title.querySelector('#tt-tip'), hintEl = $title.querySelector('#tt-hint');
    const loop = setInterval(() => {
      if ($title.classList.contains('hidden')) { clearInterval(loop); return; }
      const d = music.debug();
      if (hintEl) hintEl.classList.toggle('gone', !!d.track);
    }, 300);
    const tipLoop = setInterval(() => {
      if ($title.classList.contains('hidden')) { clearInterval(tipLoop); return; }
      tipEl.classList.add('out');
      setTimeout(() => { tipIdx = (tipIdx + 1) % TIPS.length; tipEl.textContent = TIPS[tipIdx]; tipEl.classList.remove('out'); }, 380);
    }, 5600);

    const go = (act) => {
      if (going) return;
      going = true;
      if (act === 'start') startFresh();
      if (act === 'cont') { if (!continueSave()) startFresh(); G.firstRun = false; }
      $title.classList.add('leaving');             // menu fades while the gate opens
      setTimeout(() => { $title.classList.add('hidden'); clearInterval(loop); clearInterval(tipLoop); }, 900);
      onStart(act);
    };
    $title.onclick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled || going) return;
      unlockAudio();
      const act = el.dataset.act;
      if (act === 'sound') { G.muted = !G.muted; el.querySelector('b').textContent = G.muted ? 'OFF' : 'ON'; music.sync(); if (!G.muted) sfx('ui'); return; }
      // starting over deletes a save, so it takes a second tap (no pop-up dialogs)
      if (el.dataset.confirm && save && el.dataset.armed !== '1') {
        el.dataset.armed = '1'; el.classList.add('armed'); el.textContent = 'TAP AGAIN TO ERASE SAVE'; sfx('deny');
        clearTimeout(eraseTimer);
        eraseTimer = setTimeout(() => { el.dataset.armed = ''; el.classList.remove('armed'); el.textContent = 'NEW GAME'; }, 3000);
        return;
      }
      sfx('ui');
      go(act);
    };
    // Enter / Space starts the main action from a keyboard
    const onKey = (e) => {
      if ($title.classList.contains('hidden')) { window.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Enter') { const b = $title.querySelector('.tt-btn.primary'); if (b) { e.preventDefault(); b.click(); } }
    };
    window.addEventListener('keydown', onKey);
  }

  const ui = { toast, dialog, openMenu, closeMenu, showTitle, isModalOpen: () => menuOpen || dialogOpen };
  G.ui = ui;
  return ui;
}
