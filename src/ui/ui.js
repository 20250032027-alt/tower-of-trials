// DOM overlays: title screen, pause menu (status / weapons / traits / skills /
// magic / tower / demo tools), sign dialogs and toast notifications.
// They sit on top of the canvas so text stays crisp and lists can scroll.

import { G, persist, startFresh, continueSave, saveSettings } from '../game/state.js';
import { unlockAudio, sfx } from '../game/sfx.js';
import { music } from '../game/music.js';
import { icon, WEAPON_ICON, setIcon, traitIcon, statIcon, typeIcon } from './icons.js';
import {
  GAME_TITLE, RANK_COLORS, RANK_ORDER, RANKS, TRAIT_SLOTS, MANA_TYPES, GEMINI_NOTICE,
  LEVEL_MAX, LEVEL_MIN, xpToNext, rankOfLevel, UNITS, BERSERK, FOCUS,
} from '../data/constants.js';
import { TRAITS, TRAIT_BY_ID, TRAIT_TYPES } from '../data/traits.js';
import { SKILLS } from '../data/skills.js';
import { TUNING_GROUPS, T, setTune, resetTune, tuneIsChanged, formatTune, tuneJson } from '../data/tuning.js';
import { WEAPON_LIST, CLASSES, WEAPONS } from '../data/weapons.js';
import { TOWER, DUNGEONS, FLOORS, dungeonsOf } from '../data/world.js';
import { computeStats, traitPassives } from '../logic/stats.js';
import { setLevel, addXp, innateTalent } from '../logic/progression.js';
import { rollManaCircles } from '../logic/mana.js';
import { rollRunTraits } from '../logic/runtraits.js';
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
    if (startTab) tab = startTab === 'skills' ? 'traits' : startTab;
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
    ['status', 'STATUS'], ['traits', 'LOADOUT'], ['weapons', 'WEAPONS'],
    ['magic', 'MAGIC'], ['tower', 'TOWER'], ['help', 'HELP'], ['tuning', 'TUNING'], ['demo', 'DEMO'],
  ];

  function render() {
    const body = { status: rStatus, weapons: rWeapons, traits: rTraits, magic: rMagic, tower: rTower, help: rHelp, tuning: rTuning, demo: rDemo }[tab]();
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
      <div class="chiprow">
        ${[['hp', 'HEALTH', Math.round(s.maxHealth)], ['stamina', 'STAMINA', Math.round(s.maxStamina)], ['mana', 'MANA', Math.round(s.maxMana)], ['defense', 'DEFENSE', s.defense.toFixed(0)],
          ['damage', 'DAMAGE', pct(s.damage)], ['speed', 'SPEED', pct(s.moveSpeed)], ['crit', 'CRIT', pct(s.critRate, 0)], ['kills', 'KILLS', p.kills]]
          .map(([ic, l, v]) => `<div class="sc"><img src="${statIcon(ic, 2)}" alt=""><div><small>${l}</small><b>${v}</b></div></div>`).join('')}
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
          ${w.cls === 'magic' ? `<small>Mana cost ${w.mana}${w.charge ? '+' + w.charge.extraMana : ''}, ${w.charge ? 'hold to charge, release to slam' : 'floats beside you, hold to cast'}</small>` : w.cls === 'ranger' ? `<small>${w.auto ? 'hold to auto-fire' : (w.reload ? 'Reload ' + w.reload + 's, ' : '') + 'hold to Focus, release to fire'}</small>` : `<small>Range ${w.range}, ${w.arcDeg} deg arc</small>`}
          </div>
          <button class="btn small" data-act="equipWeapon" data-id="${w.id}" ${blocked ? 'disabled' : ''}>${eq ? 'EQUIPPED' : blocked ? 'NEEDS MANA' : 'EQUIP'}</button></div>`;
      }).join('')}</div>`;
    return `<p class="hint">Every Training weapon is unlocked for the demo. Switch in-game with Q (or SWAP).</p>${group('melee')}${group('ranger')}${group('magic')}`;
  }

  // ---- LOADOUT (traits + skills + their keybinds in one place)
  let traitFilter = 'all';
  const fmtTime = (s) => (s >= 60 ? (Number.isInteger(s / 60) ? s / 60 : (s / 60).toFixed(1)) + 'm' : s + 's');
  const timing = (sk) => (sk.active ? `${fmtTime(sk.active)} ACTIVE` : 'INSTANT') + ` / ${fmtTime(sk.cooldown)} CD`;

  // Magic traits are Innate Talents: their rank stays hidden everywhere (it decides the Mana Circle odds)
  const hidesRank = (t) => t.type === 'Magic';
  const rankColor = (t) => (hidesRank(t) ? TRAIT_TYPES.Magic.color : RANK_COLORS[t.rank]);
  function traitFrame(t, size = 3) {
    return `<div class="tf" style="--rc:${rankColor(t)}"><img src="${t.secret ? setIcon('t_secret', size) : traitIcon(t.id, size)}" alt=""><b class="rk">${hidesRank(t) ? '?' : t.rank}</b></div>`;
  }
  function traitCard(t, readOnly = false) {
    const equipped = G.profile.traits.includes(t.id);
    const type = TRAIT_TYPES[t.type];
    if (t.secret) {
      return `<div class="tc locked">${traitFrame(t)}<div class="tb"><div class="tn"><b>???</b><i style="color:${type.color}">SECRET</i></div>
        <p><em>PASSIVE</em> ???</p><p class="tm">Find the way to unlock it.</p></div></div>`;
    }
    return `<div class="tc ${equipped ? 'equipped' : ''}">${traitFrame(t)}
      <div class="tb"><div class="tn"><b>${esc(t.name.toUpperCase())}</b><i style="color:${type.color}">${t.type.toUpperCase()}</i></div>
        <p><em>PASSIVE</em> ${esc(t.effects)}</p>
      </div>
      ${readOnly ? (equipped ? '<b class="eqb dim">YOURS</b>' : '') : `<button class="btn small eqb" data-act="equipTrait" data-id="${t.id}">${equipped ? 'EQUIPPED' : 'EQUIP'}</button>`}</div>`;
  }
  function skillCard(sd) {
    const sk = sd.skill, type = TRAIT_TYPES[sd.type];
    return `<div class="tc"><div class="tf" style="--rc:${type.color}"><img src="${traitIcon(sd.id, 3)}" alt=""></div>
      <div class="tb"><div class="tn"><b>${esc(sd.name.toUpperCase())}</b><i style="color:${type.color}">${sd.type.toUpperCase()}</i></div>
        <p>${esc(sk.text)}</p><p class="tm">${timing(sk)}</p></div></div>`;
  }
  function slotCard(random = false) {
    const t = TRAIT_BY_ID[G.profile.traits[0]];
    if (!t) return `<div class="ls empty"><div class="tf blank"><span>+</span></div><div class="lsb"><b class="dim">NO TRAIT</b><small>${random ? 'Nothing dealt yet.' : 'Pick one in the list below.'}</small></div></div>`;
    return `<div class="ls filled" style="--rc:${rankColor(t)}">${traitFrame(t, 4)}
      <div class="lsb"><b>${esc(t.name.toUpperCase())}</b>
        <small>${esc(t.effects)}</small>
        <small class="tm">${hidesRank(t) ? 'INNATE TALENT' : 'RANK ' + t.rank}</small></div>
      ${random ? '' : `<button class="btn small" data-act="unequipTrait" data-id="${t.id}">REMOVE</button>`}</div>`;
  }
  function rTraits() {
    const p = G.profile;
    const random = G.settings.traitMode !== 'pick';
    const first = random
      ? `<p class="hint ${G.firstRun ? 'pulse' : ''}">You carry ONE trait per run: a passive that is always on. It is dealt by rarity (F is common, S is very rare) when you start a new game, fall, or leave a dungeon, and you get one reroll. Skills are separate: you own all of them and pick one from the skill wheel (key F).</p>`
      : (G.firstRun ? '<p class="hint pulse">Pick ONE trait (a passive that is always on). Skills are separate: you own all of them and pick one from the skill wheel (key F).</p>' : '');
    const modes = [['random', 'RANDOM EACH RUN'], ['pick', 'PICK MYSELF']]
      .map(([id, label]) => `<button class="chip ${(random ? 'random' : 'pick') === id ? 'on' : ''}" data-act="traitMode" data-id="${id}">${label}</button>`).join('');
    const filters = [['all', 'ALL'], ...Object.keys(TRAIT_TYPES).filter((k) => k !== 'Secret').map((k) => [k, k.toUpperCase()]), ['Secret', 'SECRET']]
      .map(([id, label]) => `<button class="chip ${traitFilter === id ? 'on' : ''}" data-act="filter" data-id="${id}">${label}</button>`).join('');
    const list = TRAITS.filter((t) => traitFilter === 'all' || t.type === traitFilter || (traitFilter === 'Secret' && t.secret));
    const card = (t) => traitCard(t, random);
    // Magic traits are not sorted by rank (their rank is hidden): they get a block of their own
    const byRank = RANK_ORDER.map((r) => {
      const ts = list.filter((t) => t.rank === r && !hidesRank(t));
      if (!ts.length) return '';
      return `<h3 style="color:${RANK_COLORS[r]}">${r} RANK</h3><div class="tgrid">${ts.map(card).join('')}</div>`;
    }).join('');
    const magic = list.filter(hidesRank);
    const magicBlock = magic.length ? `<h3 style="color:${TRAIT_TYPES.Magic.color}">INNATE TALENTS</h3><div class="tgrid">${magic.map(card).join('')}</div>` : '';
    const left = p.rerolls || 0;
    return `${first}
      <div class="chips">${modes}</div>
      <h3>YOUR TRAIT</h3>
      <div class="lslots">${slotCard(random)}</div>
      ${random ? `<div class="row"><button class="btn" data-act="reroll" ${left > 0 ? '' : 'disabled'}>REROLL TRAIT (${left} LEFT)</button></div>` : ''}
      <h3>SKILLS (${SKILLS.length})</h3>
      <p class="hint">Press <kbd>F</kbd> in the game (or tap the skill button) to open the skill wheel. Scroll round it, then use the one at the top. The game slows down while it is open. For now the skills are the ones that come with the traits of the plan, under the trait's name. There is no limit on how many you can have.</p>
      <div class="tgrid">${SKILLS.map(skillCard).join('')}</div>
      <h3>${random ? 'TRAIT CODEX' : 'TRAIT LIBRARY'}</h3>
      ${random ? '<p class="hint">Every trait you can be dealt. Magic traits are Innate Talents: their rank is a secret.</p>' : ''}
      <div class="chips">${filters}</div>
      ${byRank}${magicBlock}
      <h3>SWORD AURA <kbd>R</kbd></h3>
      <p class="hint">Physical Force is split into ${BERSERK.maxCores} Aura Cores (25% each). Each Berserk activation burns one Core, then Force drains ${pct(BERSERK.drainPerSecond, 1)} per second. Empty = <b>Life Force Decay</b> (damage taken, move speed -70%, damage -50%, crit rate -25%). Ending early = <b>Life Force Exhaustion</b>. A Core regenerates after ${BERSERK.coreRegenSeconds}s without activating. Berserker's Fury/Wrath skills trigger the stronger Berserk Mode.</p>`;
  }

  // ---- TUNING: live numbers, saved in this browser
  function rTuning() {
    const groups = TUNING_GROUPS.map((g) => `<h3>${g.name}</h3><p class="hint">${esc(g.note)}</p>
      <div class="tune">${g.items.map((i) => {
        const v = T(i.key);
        return `<div class="trow ${tuneIsChanged(i.key) ? 'chg' : ''}"><label>${esc(i.label)}</label>
          <input type="range" data-tune="${i.key}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}"><b data-tv="${i.key}">${formatTune(i, v)}</b>
          <button class="btn small" data-act="tuneReset" data-id="${i.key}" title="Back to the default">RESET</button></div>`;
      }).join('')}</div>`).join('');
    return `<p class="hint">Change the numbers and play on: they apply at once and are saved in this browser. Lock-on, HUD size and the rest are on the HELP tab.</p>
      <div class="row"><button class="btn small" data-act="tuneCopy">COPY ALL (JSON)</button><button class="btn small danger" data-act="tuneResetAll">RESET ALL</button></div>
      ${groups}`;
  }

  // ---- MAGIC
  function rMagic() {
    const p = G.profile;
    const talent = innateTalent(p);
    const types = Object.entries(MANA_TYPES).map(([id, m]) => `
      <div class="card ${p.manaType === id ? 'equipped' : ''}">
        <div class="ctext"><b style="color:${m.color}">${m.name}</b><small>${esc(m.desc)}</small>
        <small>Magic: ${m.magic.join(', ')}</small></div>
        <button class="btn small" data-act="manaType" data-id="${id}" ${p.manaCircles > 0 ? '' : 'disabled'}>${p.manaType === id ? 'CHOSEN' : 'CHOOSE'}</button></div>`).join('');
    const spells = p.manaType ? MANA_TYPES[p.manaType].magic.map((m) => `<div class="spell">${m.toUpperCase()} <em>LOCKED - spell stats are blank in the plan</em></div>`).join('') : '<div class="dim">Choose a mana type to see its magic.</div>';
    return `
      <p class="hint">Magic and Mana cannot be acquired by any means without the proper affinity and talent. Only select <b>Innate Talents</b> (Magic-type traits) can manifest Mana Circles in their hearts. Mana is the essence given by a Constellation.</p>
      <div class="hero"><div class="big">MANA CIRCLES: ${p.manaCircles}</div><small>${talent ? `Innate Talent: <b style="color:${TRAIT_TYPES.Magic.color}">${esc(talent.name)}</b>` : 'No Innate Talent in your skills. Get a Magic trait first (LOADOUT tab).'}</small></div>
      <div class="row">
        <button class="btn" data-act="awaken" ${talent ? '' : 'disabled'}>AWAKEN MANA CIRCLES</button>
        <button class="btn ghost" data-act="resetCircles" ${p.manaCircles ? '' : 'disabled'}>RESET (DEMO)</button>
      </div>
      <small class="hint">Demo: you can re-roll as many times as you like. Mana = ${UNITS.manaPerCircle} per circle at level 1 [placeholder value].</small>
      <h3>TYPES OF MANA</h3><div class="cards">${types}</div>
      <h3>MAGIC OF YOUR MANA</h3><div class="spells">${spells}</div>
      <p class="hint">The Book (quick, floats beside you) and the Staff (hold to charge, then slam) cast in the look of your mana type.</p>`;
  }

  // ---- TOWER
  let towerFloor = null;
  function rTower() {
    const p = G.profile;
    const here = G.scene && ((G.scene.floor && G.scene.floor.id) || (G.scene.dun && G.scene.dun.floor)) || 'floor1';
    const sel = towerFloor || (here === 'tutorial' ? 'floor1' : here);
    const cleared = (id) => (id === 'tutorial' ? !!p.flags.trialCleared : !!p.flags[id + 'Cleared']);
    const unlocked = (i) => i <= 1 ? (i === 0 || cleared('tutorial')) : cleared(TOWER[i - 1].id);
    const floors = TOWER.map((f, i) => {
      const cur = here === f.id;
      const ds = dungeonsOf(f.id);
      const done = ds.filter((d) => p.flags['cleared_' + d.id]).length;
      const open = unlocked(i);
      const btn = `<button class="btn small" data-act="travel" data-id="${f.id}">${cur ? 'RESTART FLOOR' : open ? 'TRAVEL' : 'TRAVEL (DEMO)'}</button>`;
      const sub = f.id === 'tutorial' ? 'Tutorial Floor' : `${cleared(f.id) ? 'CLEARED' : open ? 'OPEN' : 'LOCKED'}${ds.length ? ` - ${done}/${ds.length} dungeons done` : ''}`;
      return `<div class="card ${cur ? 'equipped' : ''} ${open ? '' : 'locked'}"><div class="ctext"><b>${esc(FLOORS[f.id] ? FLOORS[f.id].name.toUpperCase() : f.label.toUpperCase())}</b><small>${sub}</small></div>
        <button class="btn small ghost" data-act="towerSel" data-id="${f.id}">DUNGEONS</button>${btn}</div>`;
    }).join('');
    const list = dungeonsOf(sel).map((d) => {
      const hidden = d.kind === 'hidden' && !p.flags['seen_' + d.id];
      const done = p.flags['cleared_' + d.id];
      const label = hidden ? '???' : d.name;
      const kind = hidden ? 'HIDDEN' : d.kind === 'main' ? 'MAIN' : d.kind.toUpperCase();
      return `<div class="drow"><span class="k k-${hidden ? 'hidden' : d.kind}">${kind}</span> <b>${esc(label)}</b> <span style="color:${hidden ? '#8a7a99' : RANK_COLORS[d.rank]}">${hidden ? '' : 'RANK ' + d.rank}</span> ${done ? '<em class="ok">CLEARED</em>' : ''}</div>`;
    }).join('');
    const fname = FLOORS[sel] ? FLOORS[sel].name.toUpperCase() : sel.toUpperCase();
    return `<p class="hint">The Tower has 11 Floors: 1 Tutorial Floor and 10 Main Floors. Clear a floor's main dungeon to open its stairs up. (Floors 2-10 are placeholder designs until the plan fills them in.)</p>
      <div class="cards">${floors}</div>
      <h3>${esc(fname)}: DUNGEONS</h3>${list || '<p class="hint">No dungeons here, just the way up.</p>'}
      <div class="drow"><span class="k k-double">DOUBLE</span> <b>Rifts</b> <em>appear rarely inside preset (very low chance) and randomized (low chance) dungeons</em></div>`;
  }

  // ---- HELP: controls + guidance options
  const kt = (keys, text) => `<div class="kt"><div class="kk">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</div><span>${text}</span></div>`;
  function rHelp() {
    const S = G.settings;
    const on = (v) => (v ? 'ON' : 'OFF');
    return `
      <h3>CONTROLS</h3>
      <div class="keytable">
        ${kt(['W', 'A', 'S', 'D'], 'Move (arrow keys work too)')}${kt(['MOUSE'], 'Aim')}
        ${kt(['CLICK'], 'Attack. Hold to Focus / Cast')}${kt(['SPACE'], 'Dodge roll')}
        ${kt(['F'], 'Skill wheel: scroll with the mouse wheel or Q / E, F or ENTER to use')}${kt(['T'], 'Lock-on on / off')}
        ${kt(['R'], 'Sword Aura (Berserk)')}${kt(['Q'], 'Swap weapon')}${kt(['SHIFT', 'WHEEL'], 'Swap weapon')}
        ${kt(['WHEEL'], 'Zoom in / out')}${kt(['E'], 'Use / open / read')}
        ${kt(['M'], 'Full map')}${kt(['TAB'], 'Menu (ESC too)')}${kt(['N'], 'Sound on / off')}
      </div>
      <h3>CONTROLLER</h3>
      <div class="keytable">
        ${kt(['L STICK'], 'Move (D-pad too)')}${kt(['R STICK'], 'Aim. Let go and it faces your target')}
        ${kt(['RT', 'X'], 'Attack. Hold to Focus / Cast')}${kt(['B', 'LT'], 'Dodge roll')}
        ${kt(['LB'], 'Skill wheel: D-pad or sticks scroll, A or LB uses, B closes')}${kt(['A'], 'Use / open / read')}
        ${kt(['RB'], 'Sword Aura (Berserk)')}${kt(['Y'], 'Swap weapon')}
        ${kt(['R3'], 'Lock-on on / off')}${kt(['BACK'], 'Full map')}${kt(['START'], 'Menu')}
      </div>
      <p class="hint">Menus with a controller: D-pad moves the highlight, A presses, B or START closes, LB / RB change tab, right stick scrolls.</p>
      <p class="hint">Touch: left thumb moves, drag the ATTACK button to aim, DODGE / AURA / SWAP / USE buttons on the right, skills in the arc above them.</p>
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
        <label>SCREEN SHAKE <input id="shakeAmt" type="range" min="0" max="100" step="5" value="${Math.round((S.shake == null ? 0.3 : S.shake) * 100)}"> <b id="shakeAmtv">${Math.round((S.shake == null ? 0.3 : S.shake) * 100)}</b></label>
      </div>
      <h3>GUIDE &amp; DISPLAY</h3>
      <div class="row">
        <button class="btn small" data-act="setOpt" data-k="guide">GOAL ARROW: <b>${on(S.guide)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="minimap">MINIMAP: <b>${on(S.minimap)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="autoAim">AUTO-AIM (TOUCH / PAD): <b>${on(S.autoAim)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="rumble">RUMBLE: <b>${on(S.rumble !== false)}</b></button>
        <button class="btn small" data-act="setOpt" data-k="lockOn">LOCK-ON <i>(T)</i>: <b>${on(S.lockOn !== false)}</b></button>
      </div>
      <div class="row">
        <button class="btn small" data-act="setOpt" data-k="zoom">ZOOM: <b>${S.zoom === 'auto' ? 'AUTO' : S.zoom + 'X'}</b> <i>(mouse wheel)</i></button>
        <button class="btn small" data-act="setOpt" data-k="hudScale">HUD SIZE: <b>${S.hudScale === 'auto' || !S.hudScale ? 'AUTO' : S.hudScale + 'X'}</b></button>
        <button class="btn small" data-act="setOpt" data-k="sway">CAMERA SWAY: <b>${S.sway === 0 ? 'OFF' : S.sway >= 1 ? 'HIGH' : S.sway > 0.3 && S.sway < 1 ? 'LOW' : 'MID'}</b></button>
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
        <button class="btn small" data-act="unlock">UNLOCK ALL STAIRS</button>
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
      if (k === 'zoom') S.zoom = { auto: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: 'auto' }[S.zoom] || 'auto';
      else if (k === 'hudScale') S.hudScale = { auto: '1', 1: '2', 2: '3', 3: 'auto' }[S.hudScale || 'auto'] || 'auto';
      else if (k === 'sway') S.sway = (S.sway == null ? 0.5 : S.sway) <= 0 ? 0.25 : S.sway < 0.5 ? 0.5 : S.sway < 1 ? 1 : 0;
      else if (k === 'touch') S.touch = { auto: 'on', on: 'off', off: 'auto' }[S.touch] || 'auto';
      else S[k] = !S[k];
      saveSettings(); sfx('ui');
      if ((k === 'touch' || k === 'hudScale') && G.relayout) G.relayout();
      if (k === 'zoom' && G.scene && G.scene.applyZoom) G.scene.applyZoom();
      if (k === 'minimap' && G.hud) G.hud.setMiniVisible(S.minimap);
      render();
    },
    resetTips() { for (const f of Object.keys(G.profile.flags)) if (f.startsWith('tip_')) delete G.profile.flags[f]; toast('Tips will show again.', 'info'); sfx('ui'); },
    closeMenu, closeDialog,
    equipTrait(el) {
      const id = el.dataset.id;
      const p = G.profile;
      p.traits = [id]; // one trait: the new one replaces the old
      p.awakened = false;
      G.firstRun = false;
      sfx('ui'); afterChange();
    },
    reroll() {
      const p = G.profile;
      if ((p.rerolls || 0) <= 0) { sfx('deny'); return; }
      p.traits = rollRunTraits(G.rng, undefined, p.traits); // all new ones
      p.rerolls -= 1; p.awakened = false; G.firstRun = false;
      sfx('levelup'); toast('NEW TRAIT: ' + p.traits.map((id) => TRAIT_BY_ID[id].name.toUpperCase()).join(', '), 'info');
      afterChange();
    },
    traitMode(el) {
      G.settings.traitMode = el.dataset.id === 'pick' ? 'pick' : 'random';
      saveSettings(); sfx('ui');
      toast(G.settings.traitMode === 'pick' ? 'You choose your trait.' : 'A trait is dealt again from your next run.', 'info');
      render();
    },
    unequipTrait(el) {
      const p = G.profile;
      p.traits = p.traits.filter((t) => t !== el.dataset.id);
      sfx('ui'); afterChange();
    },
    towerSel(el) { towerFloor = el.dataset.id; sfx('ui'); render(); },
    filter(el) { traitFilter = el.dataset.id; sfx('ui'); render(); },
    tuneReset(el) { resetTune(el.dataset.id); sfx('ui'); render(); },
    tuneResetAll() { resetTune(); sfx('ui'); toast('Tuning back to the defaults.', 'info'); render(); },
    tuneCopy() {
      const txt = tuneJson();
      const done = () => toast('Tuning copied.', 'good');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => dialog('TUNING', txt));
      else dialog('TUNING', txt);
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
    unlock() {
      G.profile.flags.trialCleared = true;
      for (let i = 1; i <= 10; i++) G.profile.flags['floor' + i + 'Cleared'] = true;
      toast('All stairs unlocked (re-enter the floor to see them).', 'good'); afterChange();
    },
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
    if (e.target.dataset && e.target.dataset.tune) { // live tuning slider
      const key = e.target.dataset.tune, it = TUNING_GROUPS.flatMap((g) => g.items).find((i) => i.key === key);
      setTune(key, +e.target.value);
      const lab = root.querySelector(`[data-tv="${key}"]`);
      if (lab && it) lab.textContent = formatTune(it, T(key));
      e.target.closest('.trow').classList.toggle('chg', tuneIsChanged(key));
      return;
    }
    if (e.target.id === 'lvl') root.querySelector('#lvlv').textContent = e.target.value;
    if (e.target.id === 'shakeAmt') { G.settings.shake = +e.target.value / 100; root.querySelector('#shakeAmtv').textContent = e.target.value; }
    if (e.target.id === 'musicVol' || e.target.id === 'sfxVol') {
      G.settings[e.target.id] = +e.target.value / 100;
      root.querySelector('#' + e.target.id + 'v').textContent = e.target.value;
      music.sync();
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'shakeAmt') saveSettings();
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
    const tipIdx0 = Math.floor(Math.random() * TIPS.length);
    const summary = save ? `<span>LV <b>${save.level}</b></span><span>RANK <b>${rankOfLevel(save.level)}</b></span><span><b>${save.kills || 0}</b> KILLS</span>` : '';
    $title.innerHTML = `
      <div class="tt-wrap">
        <button class="tt-snd" data-act="sound">SOUND: <b>${G.muted ? 'OFF' : 'ON'}</b></button>
        <div class="tt-menu">
          <div class="tt-top">
            <h1 class="tt-logo" aria-label="${esc(GAME_TITLE)}"><span class="l1">${esc(line1.toUpperCase())}</span><span class="l2">${line2html}</span></h1>
            <div class="tt-tag">ELEVEN FLOORS. ONE WAY UP.</div>
          </div>
          <div class="tt-bottom">
            <div class="tt-panel">
              <div class="tt-btns">
                ${save
    ? `<button class="tt-btn primary" data-act="cont">CONTINUE</button>
                   <div class="tt-save">${summary}</div>
                   <button class="tt-btn" data-act="start" data-confirm="1">NEW GAME</button>`
    : '<button class="tt-btn primary" data-act="start">START</button>'}
              </div>
            </div>
            <div class="tt-tip"><p><b>TIP</b><span id="tt-tip">${esc(TIPS[tipIdx0])}</span></p></div>
            <div class="tt-keys">
              <span class="kpc"><span class="kk"><kbd>WASD</kbd>MOVE</span><span class="kk"><kbd>CLICK</kbd>ATTACK</span><span class="kk"><kbd>SPACE</kbd>DODGE</span><span class="kk"><kbd>F</kbd>SKILLS</span><span class="kk"><kbd>E</kbd>USE</span><span class="kk"><kbd>TAB</kbd>MENU</span></span>
              <span class="ktc"><span class="kk"><kbd>LEFT</kbd>MOVE</span><span class="kk"><kbd>RIGHT</kbd>ATTACK + DODGE</span></span>
            </div>
          </div>
        </div>
        <div class="tt-hint" id="tt-hint"><span class="kpc">CLICK</span><span class="ktc">TAP</span> ANYWHERE FOR SOUND</div>
        <div class="tt-ver"><b>DEMO BUILD</b><span>WORKING TITLE</span></div>
      </div>`;
    $title.classList.remove('hidden', 'leaving');
    let going = false, eraseTimer = 0, tipIdx = tipIdx0;

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
