// The HUD, drawn in the DOM with the same pixel font as the menus: bars, skill buttons, weapon,
// Aura cores, location, objective + pointer arrow, minimap. Kept compact so it never covers the game.

import { RANK_COLORS, xpToNext, LEVEL_MAX, BERSERK } from '../data/constants.js';
import { G } from '../game/state.js';
import { Controls } from './controls.js';
import { icon, WEAPON_ICON, traitIcon, SHORT, glyph } from './icons.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { T, tuneIsChanged } from '../data/tuning.js';
import { sfx } from '../game/sfx.js';

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
        <button class="skill" id="skillbtn" data-slot="1"><b class="k">F</b><img class="gl" alt=""><span class="nm">SKILLS</span><em class="cd"></em><u></u></button>
      </div>
    </div>
    <div class="h-bl">
      <img class="wi" alt=""><div><div class="wn"></div><div class="wx"></div></div>
    </div>
    <div class="h-br keyhints">
      <span class="kbh"><kbd>SPACE</kbd>DODGE</span><span class="kbh"><kbd>R</kbd>AURA</span><span class="kbh"><kbd>Q</kbd>SWAP</span>
      <span class="kbh"><kbd>E</kbd>USE</span><span class="kbh"><kbd>WHEEL</kbd>ZOOM</span><span class="kbh"><kbd>TAB</kbd>MENU</span>
      <span class="pdh"><kbd>B</kbd>DODGE</span><span class="pdh"><kbd>RB</kbd>AURA</span><span class="pdh"><kbd>Y</kbd>SWAP</span>
      <span class="pdh"><kbd>A</kbd>USE</span><span class="pdh"><kbd>LB</kbd>SKILLS</span><span class="pdh"><kbd>START</kbd>MENU</span>
    </div>
    <div id="skillwheel" class="hidden">
      <div class="sw-box">
        <svg class="sw-track" viewBox="-130 -130 260 260"><circle class="trk" r="118"/><circle class="thumb" r="118"/></svg>
        <div class="sw-items">${Array.from({ length: 8 }, () => '<button class="sw-item"><img alt=""><em></em></button>').join('')}</div>
        <button class="sw-use">USE</button>
      </div>
      <div class="sw-info"><b class="sw-name"></b><small class="sw-text"></small><i class="sw-time"></i>
        <div class="sw-foot"><span class="kpc kbh"><kbd>WHEEL</kbd> / <kbd>Q</kbd> <kbd>E</kbd> SCROLL<br><kbd>F</kbd> OR <kbd>ENTER</kbd> USE &nbsp; <kbd>ESC</kbd> CLOSE</span><span class="kpc pdh"><kbd>D-PAD</kbd> / <kbd>STICK</kbd> SCROLL<br><kbd>A</kbd> OR <kbd>LB</kbd> USE &nbsp; <kbd>B</kbd> CLOSE</span><span class="ktc">DRAG AROUND THE RING TO SCROLL.<br>TAP THE TOP SKILL OR USE.</span></div>
      </div>
    </div>
    <div id="bigmap" class="hidden"><div class="panel"><canvas></canvas><div class="foot">TAP OR PRESS M TO CLOSE</div></div></div>`;

  const q = (s) => root.querySelector(s);
  const $lv = q('#h-lv'), $rank = q('#h-rank');
  const $xpg = q('.xpgain');
  const $hp = q('.bar.hp'), $st = q('.bar.st'), $mp = q('.bar.mp'), $xp = q('.bar.xp');
  const $buffs = q('.buffs');
  const $loc = q('.loc'), $sub = q('.sub'), $status = q('.status');
  const $obj = q('#obj'), $prompt = q('.prompt');
  const $skillbtn = q('#skillbtn');
  const $wi = q('.wi'), $wn = q('.wn'), $wx = q('.wx');
  const $aura = q('.aura'), $cores = [...root.querySelectorAll('.cores i')], $al = q('.al span');
  const $map = q('#map'), $big = q('#bigmap'), $bigc = $big.querySelector('canvas');

  const last = {};
  const setText = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.textContent = v; } };
  const setW = (el, key, frac) => { const v = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10; if (last[key] !== v) { last[key] = v; el.style.width = v + '%'; } };
  const setCls = (el, key, cls, on) => { const k = key + cls; if (last[k] !== on) { last[k] = on; el.classList.toggle(cls, on); } };

  // the skill button opens the skill wheel (key F)
  $skillbtn.addEventListener('pointerdown', (e) => { e.preventDefault(); Controls.press('skills'); $skillbtn.classList.add('down'); });
  const upBtn = () => $skillbtn.classList.remove('down');
  $skillbtn.addEventListener('pointerup', upBtn); $skillbtn.addEventListener('pointercancel', upBtn); $skillbtn.addEventListener('pointerleave', upBtn);

  // ---------------------------------------------------------------- the skill wheel
  // A ring of skills you scroll round (mouse wheel, Q/E, drag, tap). The chosen one sits at the top. A thin ring outside it
  // is the scroll bar: the bright arc shows where you are in the whole list.
  const wheel = (() => {
    const el = q('#skillwheel'), box = q('.sw-box');
    const items = [...el.querySelectorAll('.sw-item')];
    const thumb = el.querySelector('.thumb'), trk = el.querySelector('.trk');
    const $name = q('.sw-name'), $text = q('.sw-text'), $time = q('.sw-time'), $use = q('.sw-use');
    void trk;
    const N = 8, STEP = 360 / N, TR = 118, C = 2 * Math.PI * TR;
    const mod = (a, n) => ((a % n) + n) % n;
    let ids = [], sel = 0, pos = 0, isOpen = false, raf = 0, R = 92, drag = null;

    const idAt = (i) => ids[mod(i, ids.length)];
    function render(player) {
      const base = Math.round(pos);
      for (let off = -3; off <= 4; off++) {
        const idx = base + off, it = items[mod(idx, N)];
        const id = idAt(idx), th = (idx - pos) * STEP;
        const a = Math.abs(((th + 180) % 360 + 360) % 360 - 180); // angular distance from the top
        const s = 1 + 0.55 * Math.max(0, 1 - a / STEP);
        if (it.dataset.id !== id) {
          it.dataset.id = id;
          it.querySelector('img').src = traitIcon(id, 2);
        }
        it.style.transform = `translate(-50%,-50%) rotate(${th}deg) translateY(${-R}px) rotate(${-th}deg) scale(${s.toFixed(3)})`;
        it.style.opacity = (a > 140 ? 0.25 : a > 100 ? 0.55 : 1).toFixed(2);
        it.style.zIndex = a < STEP / 2 ? 3 : 1;
        it.classList.toggle('sel', a < STEP / 2);
        it.dataset.idx = idx;
        if (player) {
          const si = player.skillInfo(id);
          it.classList.toggle('cdon', si.cd > 0);
          it.classList.toggle('actv', si.activeLeft > 0);
          const em = it.querySelector('em'); const v = si.cd > 0 ? String(Math.ceil(si.cd)) : '';
          if (em.textContent !== v) em.textContent = v;
        }
      }
      const total = ids.length || 1, thumbLen = Math.max(C / total, 14);
      thumb.style.strokeDasharray = `${thumbLen} ${C}`;
      thumb.setAttribute('transform', `rotate(${(pos / total) * 360 - 90 - (thumbLen / C) * 180})`);
    }
    function info(player) {
      const id = idAt(sel), def = SKILL_BY_ID[id];
      if (!def) return;
      const sk = def.skill, si = player ? player.skillInfo(id) : null;
      if ($name.textContent !== def.name.toUpperCase()) $name.textContent = def.name.toUpperCase();
      if ($text.textContent !== sk.text) $text.textContent = sk.text;
      const fmt = (s) => (s >= 60 ? (Number.isInteger(s / 60) ? s / 60 : (s / 60).toFixed(1)) + 'M' : s + 'S');
      const state = si && si.cd > 0 ? `COOLDOWN ${Math.ceil(si.cd)}S` : `${sk.active ? fmt(sk.active) + ' ACTIVE / ' : 'INSTANT / '}${fmt(sk.cooldown)} CD`;
      if ($time.textContent !== state) $time.textContent = state;
      $use.disabled = !!(si && si.cd > 0);
    }
    function tick() {
      const d = sel - pos;
      pos = Math.abs(d) < 0.004 ? sel : pos + d * 0.28;
      render(lastPlayer); info(lastPlayer);
      raf = isOpen && pos !== sel ? requestAnimationFrame(tick) : 0;
    }
    let lastPlayer = null;
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const buzz = (ms) => { try { if (navigator.vibrate && document.body.classList.contains('touch')) navigator.vibrate(ms); } catch (e) { /* no haptics */ } };
    const tickFx = (d) => { sfx('tick', { dir: d }); buzz(6); };
    function step(d) { if (!isOpen) return; sel += d; tickFx(d); kick(); }
    function openWheel(startId, list) {
      ids = (list || []).filter((i) => SKILL_BY_ID[i]);
      if (!ids.length) return false;
      sel = Math.max(0, ids.indexOf(startId)); pos = sel;
      isOpen = true; el.classList.remove('hidden');
      size();
      render(lastPlayer); info(lastPlayer);
      return true;
    }
    function closeWheel() { isOpen = false; el.classList.add('hidden'); if (raf) cancelAnimationFrame(raf); raf = 0; drag = null; }
    // tap an icon: scroll it to the top; tap the one at the top: use it
    items.forEach((it) => it.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = +it.dataset.idx;
      if (idx === sel) Controls.press('wheelUse'); else { tickFx(idx > sel ? 1 : -1); sel = idx; kick(); }
    }));
    $use.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Controls.press('wheelUse'); });
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) { Controls.press('wheelClose'); return; }
      // dragging round the ring scrolls it
      const r = box.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      drag = { cx, cy, last: Math.atan2(e.clientY - cy, e.clientX - cx), acc: 0, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
      let d = a - drag.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      drag.last = a; drag.acc += d;
      const stepRad = (STEP * Math.PI) / 180;
      while (drag.acc > stepRad) { drag.acc -= stepRad; sel -= 1; tickFx(-1); kick(); } // clockwise drag turns the ring clockwise: the previous one comes to the top
      while (drag.acc < -stepRad) { drag.acc += stepRad; sel += 1; tickFx(1); kick(); }
    });
    const endDrag = () => { drag = null; };
    el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // the ring has to fit on the screen (the wheel is zoomed with the HUD: see the CSS)
    function size() { const z = parseFloat(getComputedStyle(el).zoom) || 1; R = Math.max(64, Math.min(92, Math.floor(Math.min(window.innerWidth, window.innerHeight) / z / 2 - 74))); }
    window.addEventListener('resize', size); window.addEventListener('tower-layout', size); size();
    return {
      open: openWheel, close: closeWheel, step,
      get isOpen() { return isOpen; },
      selectedId: () => (ids.length ? idAt(sel) : null),
      refresh(player) { lastPlayer = player; if (isOpen) { render(player); info(player); } },
    };
  })();

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
    for (const a of player.activeSkills()) lines.push(`${a.name.toUpperCase()} ${Math.ceil(a.left)}S`);
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
    if (w.cls === 'ranger') extra = player.reload > 0 ? 'RELOADING' : w.mag ? `AMMO ${player.ammo == null ? w.mag : player.ammo}/${w.mag}` : w.auto ? 'HOLD ATTACK TO FIRE' : player.focusing ? `FOCUS ${Math.round(player.focus * 100)}%` : 'HOLD ATTACK TO FOCUS';
    if (w.cls === 'magic') extra = p.manaCircles <= 0 ? 'NO MANA CIRCLE' : w.charge ? (player.charging ? `CHARGE ${Math.round(Math.min(1, player.chargeT / w.charge.time) * 100)}%` : 'HOLD TO CHARGE') : `COST ${Math.round(w.mana * st.manaCost)} MP`;
    setText($wx, 'wx', extra);
    setCls($wx, 'wx', 'lowammo', !!(w.mag && player.reload <= 0 && (player.ammo == null ? w.mag : player.ammo) <= 6));
    setCls($wx, 'wx', 'reloading', !!(w.cls === 'ranger' && player.reload > 0));

    // the skill button shows the skill the wheel last had selected (and its cooldown)
    {
      const sid = p.selSkill && SKILL_BY_ID[p.selSkill] ? p.selSkill : (p.skills || []).find((x) => SKILL_BY_ID[x]) || null;
      const si = sid ? player.skillInfo(sid) : null;
      const b = $skillbtn;
      const onCd = !!(si && si.cd > 0);
      setText(b.querySelector('.nm'), 'nm', onCd || !si ? '' : (SHORT[sid] || si.trait.name.split(/[ ']/).filter(Boolean)[0].slice(0, 7).toUpperCase()));
      setText(b.querySelector('.cd'), 'cd', onCd ? (si.cd >= 10 ? String(Math.ceil(si.cd)) : si.cd.toFixed(1)) : '');
      const gimg = b.querySelector('.gl');
      const gsrc = sid ? traitIcon(sid, 2) : '';
      if (last.gl !== gsrc) { last.gl = gsrc; if (gsrc) gimg.src = gsrc; gimg.style.visibility = gsrc ? 'visible' : 'hidden'; }
      gimg.style.opacity = onCd ? '.35' : '1';
      setW(b.querySelector('u'), 'fill', onCd ? si.cd / si.cdMax : 0);
      setCls(b, 'sk', 'on', !!(si && si.activeLeft > 0));
      setCls(b, 'sk', 'ready', !!(si && !onCd));
    }
    wheel.refresh(player);

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
  // the skill button flashes when the skill you picked is ready again, and punches when you use one
  const flashSkill = (kind) => {
    const c = kind === 'use' ? 'fl-use' : 'fl-ready';
    $skillbtn.classList.remove('fl-use', 'fl-ready'); void $skillbtn.offsetWidth; $skillbtn.classList.add(c);
    setTimeout(() => $skillbtn.classList.remove(c), 650);
  };
  return { wheel, flashSkill, pulseXp, update, setMap, reveal, drawMap, toggleBigMap, setMiniVisible, setObjective, setPrompt, isBigMapOpen: () => bigOpen, root };
}
