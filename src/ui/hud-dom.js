// The HUD, drawn in the DOM with the same pixel font as the menus: bars, skill buttons, weapon,
// Aura cores, location, objective + pointer arrow, minimap. Kept compact so it never covers the game.

import { RANK_COLORS, xpToNext, LEVEL_MAX, BERSERK } from '../data/constants.js';
import { G } from '../game/state.js';
import { Controls } from './controls.js';
import { icon, WEAPON_ICON, traitIcon, SHORT, glyph } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// map colours (same palette family as the tiles)
const MAP = { floor: [112, 94, 72], wall: [178, 154, 120], deep: [36, 28, 22] };
const WIN_W = 32, WIN_H = 32; // tiles shown by the round radar (3 css px per tile)
const MARK = { player: '#ffffff', portal: '#7fd0ff', exit: '#5fe08a', goal: '#ffe27a', enemy: '#ff5a5a', rift: '#d08aff', chest: '#ffb84a', hidden: '#ffd84a' };

export function createHudDom() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div class="h-tl">
      <div class="lvl"><b id="h-lv">LV 1</b> <span id="h-rank">RANK F</span> <span class="status"></span></div>
      <div class="bar hp"><i></i><span></span></div>
      <div class="bar st"><i></i><span></span></div>
      <div class="bar mp hidden"><i></i><span></span></div>
      <div class="bar xp"><i></i></div>
      <b class="xpgain"></b>
      <div class="aura"><div class="al">AURA <b>[R]</b> <span></span></div><div class="cores"><i></i><i></i><i></i><i></i></div></div>
      <div class="buffs"></div>
    </div>
    <div class="h-tr">
      <div class="loc"></div>
      <div class="sub"></div>
      <canvas id="map" width="${WIN_W}" height="${WIN_H}"></canvas>
    </div>
    <div class="h-tc">
      <div id="obj" class="obj hidden"><b>!</b><span></span><em></em></div>
    </div>
    <div class="h-b">
      <div class="prompt hidden"></div>
      <div class="skills">
        <button class="skill" data-slot="0"><b class="k">1</b><img class="gl" alt=""><span class="nm"></span><em class="cd"></em><u></u></button>
        <button class="skill" data-slot="1"><b class="k">2</b><img class="gl" alt=""><span class="nm"></span><em class="cd"></em><u></u></button>
        <button class="skill" data-slot="2"><b class="k">3</b><img class="gl" alt=""><span class="nm"></span><em class="cd"></em><u></u></button>
      </div>
    </div>
    <div class="h-bl">
      <img class="wi" alt=""><div><div class="wn"></div><div class="wx"></div></div>
    </div>
    <div class="h-br keyhints">
      <span><kbd>SPACE</kbd>DODGE</span><span><kbd>R</kbd>AURA</span><span><kbd>Q</kbd>SWAP</span>
      <span><kbd>E</kbd>USE</span><span><kbd>WHEEL</kbd>ZOOM</span><span><kbd>TAB</kbd>MENU</span>
    </div>
    <div id="bigmap" class="hidden"><div class="panel"><canvas></canvas><div class="foot">TAP OR PRESS M TO CLOSE</div></div></div>`;

  const q = (s) => root.querySelector(s);
  const $lv = q('#h-lv'), $rank = q('#h-rank');
  const $xpg = q('.xpgain');
  const $hp = q('.bar.hp'), $st = q('.bar.st'), $mp = q('.bar.mp'), $xp = q('.bar.xp');
  const $buffs = q('.buffs');
  const $loc = q('.loc'), $sub = q('.sub'), $status = q('.status');
  const $obj = q('#obj'), $prompt = q('.prompt');
  const $skills = [...root.querySelectorAll('.skill')];
  const $wi = q('.wi'), $wn = q('.wn'), $wx = q('.wx');
  const $aura = q('.aura'), $cores = [...root.querySelectorAll('.cores i')], $al = q('.al span');
  const $map = q('#map'), $big = q('#bigmap'), $bigc = $big.querySelector('canvas');

  const last = {};
  const setText = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.textContent = v; } };
  const setW = (el, key, frac) => { const v = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10; if (last[key] !== v) { last[key] = v; el.style.width = v + '%'; } };
  const setCls = (el, key, cls, on) => { const k = key + cls; if (last[k] !== on) { last[k] = on; el.classList.toggle(cls, on); } };

  // skill buttons: tap/click -> Controls
  $skills.forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); Controls.press('slot' + b.dataset.slot); b.classList.add('down'); });
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });

  // ---------------------------------------------------------------- minimap
  let map = null; // { w, h, tiles, explored, terrain(canvas), tctx, img }
  let bigOpen = false;
  const mctx = $map.getContext('2d');
  const bctx = $bigc.getContext('2d');
  mctx.imageSmoothingEnabled = false; bctx.imageSmoothingEnabled = false;

  function setMap(layout, explored) {
    const { w, h, tiles } = layout;
    const terrain = document.createElement('canvas'); terrain.width = w; terrain.height = h;
    const tctx = terrain.getContext('2d');
    const img = tctx.createImageData(w, h);
    map = { w, h, tiles, explored, terrain, tctx, img, lastTx: -99, lastTy: -99 };
    for (let i = 0; i < w * h; i++) if (explored[i]) paintTile(i);
    tctx.putImageData(img, 0, 0);
    $bigc.width = w; $bigc.height = h;
    $map.classList.remove('hidden');
  }
  function paintTile(i) {
    const t = map.tiles[i];
    const c = t <= 2 ? MAP.floor : t === 3 || t === 5 ? MAP.wall : MAP.deep;
    const o = i * 4;
    map.img.data[o] = c[0]; map.img.data[o + 1] = c[1]; map.img.data[o + 2] = c[2]; map.img.data[o + 3] = 255;
  }
  function reveal(tx, ty, radius = 6) {
    if (!map || (tx === map.lastTx && ty === map.lastTy)) return;
    map.lastTx = tx; map.lastTy = ty;
    let changed = false;
    for (let y = Math.max(0, ty - radius); y <= Math.min(map.h - 1, ty + radius); y++) {
      for (let x = Math.max(0, tx - radius); x <= Math.min(map.w - 1, tx + radius); x++) {
        if ((x - tx) ** 2 + (y - ty) ** 2 > radius * radius + 1) continue;
        const i = y * map.w + x;
        if (!map.explored[i]) { map.explored[i] = 1; paintTile(i); changed = true; }
      }
    }
    if (changed) map.tctx.putImageData(map.img, 0, 0);
  }
  function drawMarkers(ctx, markers, ox, oy, size) {
    for (const m of markers) {
      const x = Math.round(m.x - ox), y = Math.round(m.y - oy);
      if (m.kind === 'player') { ctx.fillStyle = '#0b0806'; ctx.fillRect(x - 2, y - 2, 5, 5); }
      ctx.fillStyle = MARK[m.kind] || '#fff';
      const s = m.kind === 'player' ? 3 : m.kind === 'enemy' ? 2 : 3;
      ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
    }
  }
  function drawMap(markers, px, py, blink) {
    if (!map) return;
    const ox = Math.round(px - WIN_W / 2);   // a radar: always centred on you
    const oy = Math.round(py - WIN_H / 2);
    if (bigOpen) {
      bctx.clearRect(0, 0, map.w, map.h);
      bctx.drawImage(map.terrain, 0, 0);
      drawMarkers(bctx, markers.filter((m) => m.kind !== 'enemy' || true), 0, 0);
      return;
    }
    if ($map.classList.contains('hidden')) return;
    mctx.clearRect(0, 0, WIN_W, WIN_H);
    mctx.drawImage(map.terrain, ox, oy, WIN_W, WIN_H, 0, 0, WIN_W, WIN_H);
    // the goal always shows: when it is beyond the radar it is pinned to the rim, pointing the way
    const R = WIN_W / 2 - 2, cx = ox + WIN_W / 2, cy = oy + WIN_H / 2;
    const ms = markers.filter((m) => m.x >= ox - 1 && m.x <= ox + WIN_W + 1 && m.y >= oy - 1 && m.y <= oy + WIN_H + 1 || m.kind === 'goal').map((m) => {
      if (m.kind !== 'goal') return m;
      const dx = m.x - cx, dy = m.y - cy, d = Math.hypot(dx, dy);
      return d > R ? { ...m, x: cx + (dx / d) * R, y: cy + (dy / d) * R } : m;
    });
    drawMarkers(mctx, ms, ox, oy);
  }
  function toggleBigMap(force) {
    if (!map) return;
    bigOpen = force != null ? force : !bigOpen;
    $big.classList.toggle('hidden', !bigOpen);
    if (bigOpen) {
      // integer scale that fits ~70% of the screen
      const s = Math.max(1, Math.floor(Math.min((window.innerWidth * 0.8) / map.w, (window.innerHeight * 0.62) / map.h)));
      $bigc.style.width = map.w * s + 'px'; $bigc.style.height = map.h * s + 'px';
    }
  }
  function setMiniVisible(v) { $map.classList.toggle('hidden', !v); }
  $map.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleBigMap(true); });
  $big.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleBigMap(false); });

  // ---------------------------------------------------------------- per-frame update
  function update(player, info) {
    const st = player.stats;
    const p = G.profile;
    setText($lv, 'lv', `LV ${p.level}`);
    setText($rank, 'rank', `RANK ${st.rank}`);
    if (last.rc !== st.rank) { last.rc = st.rank; $rank.style.color = RANK_COLORS[st.rank]; $lv.style.color = RANK_COLORS[st.rank]; }

    setW($hp.firstElementChild, 'hpw', player.hp / st.maxHealth);
    setText($hp.lastElementChild, 'hpt', `HP ${Math.ceil(player.hp)}/${Math.round(st.maxHealth)}`);
    setCls($hp, 'hp', 'low', player.hp / st.maxHealth < 0.3);
    setW($st.firstElementChild, 'stw', player.stamina / st.maxStamina);
    setText($st.lastElementChild, 'stt', `STAMINA ${Math.ceil(player.stamina)}`);
    setCls($st, 'st', 'hot', player.focusing && player.focus > 1.5);
    const hasMana = st.maxMana > 0;
    setCls($mp, 'mp', 'hidden', !hasMana);
    if (hasMana) {
      setW($mp.firstElementChild, 'mpw', player.mana / st.maxMana);
      setText($mp.lastElementChild, 'mpt', `MANA ${Math.ceil(player.mana)}/${Math.round(st.maxMana)}`);
    }
    setW($xp.firstElementChild, 'xpw', p.level >= LEVEL_MAX ? 1 : p.xp / xpToNext(p.level));

    // active buffs (short)
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const si = player.skillInfo(i);
      if (si.activeLeft > 0 && si.trait) lines.push(`${si.trait.name.toUpperCase()} ${Math.ceil(si.activeLeft)}S`);
    }
    if (player.bloodlust.until > player.t && player.bloodlust.stacks) lines.push(`BLOODLUST x${player.bloodlust.stacks}`);
    if (player.shield > 0) lines.push('SHIELD');
    const bt = lines.slice(0, 4).join('\n');
    if (last.buffs !== bt) { last.buffs = bt; $buffs.textContent = bt; }

    // banner: berserk / decay / exhaustion
    const bs = player.berserk.status;
    setText($status, 'status', bs === 'READY' ? '' : bs);
    if (last.sc !== bs) { last.sc = bs; $status.style.color = bs === 'BERSERK' ? '#ff6a4a' : bs === 'EXHAUSTED' ? '#b0b0c0' : '#c27bff'; }

    // location
    setText($loc, 'loc', info.title);
    if (last.lc !== info.color) { last.lc = info.color; $loc.style.color = info.color || '#fff'; }
    setText($sub, 'sub', info.sub || '');

    // weapon
    const w = player.weaponDef;
    const wsrc = icon(WEAPON_ICON[w.id], 2);
    if (last.wsrc !== wsrc) { last.wsrc = wsrc; $wi.src = wsrc; }
    setText($wn, 'wn', w.name.toUpperCase());
    let extra = w.cls.toUpperCase();
    if (w.cls === 'ranger') extra = player.reload > 0 ? 'RELOADING' : player.focusing ? `FOCUS ${Math.round(player.focus * 100)}%` : 'HOLD ATTACK TO FOCUS';
    if (w.cls === 'magic') extra = p.manaCircles > 0 ? `COST ${Math.round(w.mana * st.manaCost)} MP` : 'NO MANA CIRCLE';
    setText($wx, 'wx', extra);

    // skill buttons
    for (let i = 0; i < 3; i++) {
      const b = $skills[i];
      const si = player.skillInfo(i);
      const empty = !si.trait, locked = si.trait && !si.skill;
      const nm = empty ? 'EMPTY' : locked ? '?' : (SHORT[si.trait.id] || si.trait.name.split(/[ ']/).filter(Boolean)[0].slice(0, 7).toUpperCase());
      const onCd = si.skill && si.cd > 0;
      setText(b.querySelector('.nm'), 'nm' + i, onCd ? '' : nm);
      setText(b.querySelector('.cd'), 'cd' + i, onCd ? (si.cd >= 10 ? String(Math.ceil(si.cd)) : si.cd.toFixed(1)) : '');
      const gimg = b.querySelector('.gl');
      const gsrc = locked || empty ? '' : traitIcon(si.trait.id, 2);
      if (last['gl' + i] !== gsrc) { last['gl' + i] = gsrc; if (gsrc) gimg.src = gsrc; gimg.style.visibility = gsrc ? 'visible' : 'hidden'; }
      gimg.style.opacity = onCd ? '.35' : '1';
      const fill = b.querySelector('u');
      setW(fill, 'fill' + i, onCd ? si.cd / si.cdMax : 0);
      setCls(b, 'sk' + i, 'on', si.activeLeft > 0);
      b.classList.toggle('empty', empty);
      setCls(b, 'sk' + i, 'dim', empty || locked);
      setCls(b, 'sk' + i, 'ready', !!(si.skill && !onCd && !empty));
    }

    // aura cores (melee only)
    const showAura = w.cls === 'melee';
    setCls($aura, 'aura', 'hidden', !showAura);
    if (showAura) {
      const b = player.berserk;
      for (let i = 0; i < BERSERK.maxCores; i++) {
        const full = Math.max(0, Math.min(1, (b.force - i * BERSERK.forcePerCore) / BERSERK.forcePerCore));
        const core = $cores[i];
        const v = Math.round(full * 100);
        if (core.dataset.v !== String(v)) { core.dataset.v = String(v); core.style.setProperty('--f', v + '%'); }
        if (last['dc' + i] !== !!b.decay) { last['dc' + i] = !!b.decay; core.classList.toggle('decay', !!b.decay); }
      }
      setText($al, 'al', `${Math.round(b.force * 100)}%`);
    }
  }

  // objective chip (+ optional text on how far)
  function setObjective(text, dist) {
    setCls($obj, 'obj', 'hidden', !text);
    if (!text) return;
    setText($obj.querySelector('span'), 'objt', text);
    setText($obj.querySelector('em'), 'objd', dist != null ? `${dist}m` : '');
  }

  function setPrompt(text) {
    setCls($prompt, 'prompt', 'hidden', !text);
    if (text) setText($prompt, 'prompttxt', text);
  }

  // gold XP bar pulse + a small "+N XP" tag that adds up while orbs keep arriving, then fades
  let xpAcc = 0, xpTimer = 0;
  function pulseXp(v) {
    $xp.classList.remove('pulse'); void $xp.offsetWidth; $xp.classList.add('pulse');
    xpAcc += v;
    $xpg.textContent = '+' + xpAcc + ' XP';
    $xpg.classList.add('on');
    clearTimeout(xpTimer);
    xpTimer = setTimeout(() => { $xpg.classList.remove('on'); xpAcc = 0; }, 900);
  }
  return { pulseXp, update, setMap, reveal, drawMap, toggleBigMap, setMiniVisible, setObjective, setPrompt, isBigMapOpen: () => bigOpen, root };
}
