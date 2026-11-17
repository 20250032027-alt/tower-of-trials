// =====================================================================
//  FLOORS 2-10 (everything here is a [PLACEHOLDER])
//
//  The sheet says each floor has: 1 main dungeon, 3-6 preset dungeons, a set number of randomized
//  dungeons, a set number of preset hidden dungeons and a set number of double dungeons. It does not
//  say what any floor after Floor 1 looks like ("Pending Layout / Pending Theme"), so the names, themes,
//  layouts, counts and ranks below are my own stand-ins. They are all generated from a seed, so every
//  floor is the same every time you play, and they are easy to replace one by one later.
//
//  The only enemy in the sheet is the Skeleton Soldier, so every dungeon uses it (levels follow the
//  dungeon rank, the same way Floor 1 works).
// =====================================================================

import { makeRng, hashString } from '../logic/rng.js';

const R = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, ...extra });
const key = (c, r) => c + ',' + r;

// ---------------------------------------------------------------- the floor list [PLACEHOLDER]
// rank = rank of the main dungeon (sets the enemy level range). Presets are the same rank or one lower.
export const FLOOR_SPECS = [
  { n: 2, name: 'The Ossuary', theme: 'ossuary', rank: 'E', main: 'Bone Cathedral',
    presets: ['Charnel Corridor', 'Skull Gallery', 'Bone Mill', 'Reliquary'], randoms: ['Drifting Ossuary I', 'Drifting Ossuary II'], hidden: 'Sealed Ossuary', double: 'Rift of Ribs',
    intro: 'FLOOR 2: THE OSSUARY. Bone dust hangs in the air.' },
  { n: 3, name: 'The Drowned Cistern', theme: 'cistern', rank: 'E', main: 'Sunken Reservoir',
    presets: ['Flooded Walk', 'Pump Room', 'Drain Tunnels'], randoms: ['Lost Conduit I', 'Lost Conduit II'], hidden: 'Hidden Sluice', double: 'Rift of Tides',
    intro: 'FLOOR 3: THE DROWNED CISTERN. Water drips somewhere in the dark.' },
  { n: 4, name: 'The Rust Foundry', theme: 'foundry', rank: 'E', main: 'Furnace Heart',
    presets: ['Slag Hall', 'Anvil Row', 'Boiler Deck', 'Chain Works'], randoms: ['Cinder Maze I', 'Cinder Maze II'], hidden: 'Forgotten Forge', double: 'Rift of Embers',
    intro: 'FLOOR 4: THE RUST FOUNDRY. The air tastes of old iron.' },
  { n: 5, name: 'The Ashen Archive', theme: 'archive', rank: 'D', main: 'Grand Scriptorium',
    presets: ['Reading Room', 'Map Vault', 'Ink Cellar', 'Silent Stacks', 'Index Hall'], randoms: ['Lost Pages I', 'Lost Pages II'], hidden: 'Forbidden Shelf', double: 'Rift of Pages',
    intro: 'FLOOR 5: THE ASHEN ARCHIVE. Every shelf is burnt.' },
  { n: 6, name: 'The Frostbound Halls', theme: 'frost', rank: 'D', main: 'Ice Throne Approach',
    presets: ['Rime Gallery', 'Cold Storage', 'Glacier Stair', 'Whiteout'], randoms: ['Drifting Cold I', 'Drifting Cold II'], hidden: 'Frozen Cache', double: 'Rift of Winter',
    intro: 'FLOOR 6: THE FROSTBOUND HALLS. Your breath turns to mist.' },
  { n: 7, name: 'The Overgrown Keep', theme: 'overgrown', rank: 'D', main: 'Root Citadel',
    presets: ['Vine Walk', 'Moss Cellar', 'Thorn Court', 'Rootway', 'Old Barracks'], randoms: ['Tangled Ruins I', 'Tangled Ruins II'], hidden: 'Buried Shrine', double: 'Rift of Roots',
    intro: 'FLOOR 7: THE OVERGROWN KEEP. Something grows through the stones.' },
  { n: 8, name: 'The Ember Citadel', theme: 'ember', rank: 'D', main: 'Magma Spire',
    presets: ['Cinder Walk', 'Lava Gate', 'Smoke Hall', 'Brand Pit', 'Ash Stair', 'Warden Row'], randoms: ['Burning Maze I', 'Burning Maze II'], hidden: 'Molten Vault', double: 'Rift of Flame',
    intro: 'FLOOR 8: THE EMBER CITADEL. The walls are warm to the touch.' },
  { n: 9, name: 'The Starlit Gallery', theme: 'starlit', rank: 'C', main: 'Observatory Crown',
    presets: ['Lens Hall', 'Orrery Room', 'Night Walk', 'Comet Stair'], randoms: ['Falling Stars I', 'Falling Stars II'], hidden: 'Hidden Planetarium', double: 'Rift of Stars',
    intro: 'FLOOR 9: THE STARLIT GALLERY. The ceiling is gone. Only sky.' },
  { n: 10, name: 'The Summit', theme: 'summit', rank: 'C', main: 'The Final Trial',
    presets: ['Marble Approach', 'Hall of Kings', 'Gilded Stair', 'Court of Bones', 'Last Gallery', 'Throne Walk'], randoms: ['Endless Steps I', 'Endless Steps II'], hidden: 'Crown Vault', double: 'Rift of the Top',
    intro: 'FLOOR 10: THE SUMMIT. One last climb.' },
];

const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
const lower = (r) => RANKS[Math.max(0, RANKS.indexOf(r) - 1)];
const higher = (r, cap = 'C') => RANKS[Math.min(RANKS.indexOf(cap), RANKS.indexOf(r) + 1)];

// ---------------------------------------------------------------- grid helpers
// A connected blob of grid cells. linear = a winding path, otherwise a branching tree.
function growCells(rng, cols, rows, n, { linear = false, startRow = null } = {}) {
  n = Math.min(n, cols * rows);
  const start = [0, startRow == null ? rng.int(0, rows - 1) : startRow];
  const cells = [start];
  const used = new Set([key(...start)]);
  const edges = [];
  let guard = 0;
  while (cells.length < n && guard++ < 2000) {
    const from = linear && rng.chance(0.85) ? cells.length - 1 : rng.int(0, cells.length - 1);
    const [c, r] = cells[from];
    const free = [[c + 1, r], [c, r + 1], [c, r - 1], [c - 1, r]].filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows && !used.has(key(x, y)));
    if (!free.length) continue;
    const right = free.find((p) => p[0] === c + 1);
    const pick = linear && right && rng.chance(0.6) ? right : rng.pick(free);
    used.add(key(...pick));
    cells.push(pick);
    edges.push([from, cells.length - 1]);
  }
  return { cells, edges, used };
}

const addLoops = (rng, cells, edges, count, skip = new Set()) => {
  const has = (a, b) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const cand = [];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const d = Math.abs(cells[i][0] - cells[j][0]) + Math.abs(cells[i][1] - cells[j][1]);
    if (d === 1 && !has(i, j) && !skip.has(i) && !skip.has(j)) cand.push([i, j]);
  }
  for (let k = 0; k < count && cand.length; k++) edges.push(cand.splice(rng.int(0, cand.length - 1), 1)[0]);
};

const bfs = (n, edges, from = 0) => {
  const dist = new Array(n).fill(-1);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const a = q.shift();
    for (const [x, y] of edges) {
      const b = x === a ? y : y === a ? x : -1;
      if (b >= 0 && dist[b] < 0) { dist[b] = dist[a] + 1; q.push(b); }
    }
  }
  return dist;
};

const placeRoom = (rng, id, c, r, cw, ch, wr, hr) => {
  const w = Math.min(rng.int(wr[0], wr[1]), cw - 4), h = Math.min(rng.int(hr[0], hr[1]), ch - 4);
  return R(id, c * cw + 2 + rng.int(0, cw - 4 - w), r * ch + 2 + rng.int(0, ch - 4 - h), w, h);
};

const linkOf = (cells, a, b) => [String(a), String(b), cells[a][1] === cells[b][1] ? 'h' : 'v'];

// the rectangles a link's corridors carve (mirrors logic/layout.js) - used to keep the secret vault clear of them
function corridorRects(rooms, links, cw = 2) {
  const by = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const ctr = (r) => ({ cx: r.x + Math.floor(r.w / 2), cy: r.y + Math.floor(r.h / 2) });
  const out = [];
  const hseg = (x0, x1, y) => out.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: y, y1: y + cw - 1 });
  const vseg = (y0, y1, x) => out.push({ x0: x, x1: x + cw - 1, y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
  for (const [aId, bId, mode] of links) {
    const a = ctr(by[aId]), b = ctr(by[bId]);
    if (mode === 'h') { hseg(a.cx, b.cx, a.cy); vseg(a.cy, b.cy, b.cx); } else { vseg(a.cy, b.cy, a.cx); hseg(a.cx, b.cx, b.cy); }
  }
  return out;
};
const hit = (a, b, pad = 0) => a.x0 - pad <= b.x1 && a.x1 + pad >= b.x0 && a.y0 - pad <= b.y1 && a.y1 + pad >= b.y0;
const rectOf = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w - 1, y1: r.y + r.h - 1 });

// ---------------------------------------------------------------- dungeon layouts (preset: same every time)
const SHAPES = [
  { cols: 4, rows: 3, n: 6, linear: true, loops: 0, w: [9, 13], h: [8, 10] },   // a winding walk
  { cols: 5, rows: 2, n: 7, linear: false, loops: 1, w: [9, 13], h: [8, 10] },  // long and branching
  { cols: 3, rows: 3, n: 7, linear: false, loops: 1, w: [9, 13], h: [8, 10] },  // compact, loops
  { cols: 4, rows: 3, n: 8, linear: false, loops: 2, w: [9, 13], h: [8, 10] },  // sprawling
  { cols: 5, rows: 3, n: 8, linear: true, loops: 1, w: [9, 13], h: [8, 10] },   // long road with a shortcut
  { cols: 4, rows: 2, n: 5, linear: true, loops: 0, w: [12, 14], h: [9, 10] },  // a few big halls
];

function dungeonDef(seed, shape, { dens = 1, chests = 2, exitBonus = 2, lastBonus = 0, extraChests = 0 } = {}) {
  const rng = makeRng(seed);
  const cw = 18, ch = 14;
  const { cells, edges } = growCells(rng, shape.cols, shape.rows, shape.n, { linear: shape.linear });
  addLoops(rng, cells, edges, shape.loops);
  const dist = bfs(cells.length, edges);
  let far = 1;
  dist.forEach((d, i) => { if (d > dist[far]) far = i; });
  const deg = new Array(cells.length).fill(0);
  edges.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const rooms = cells.map(([c, r], i) => {
    const isStart = i === 0, isExit = i === far;
    const room = placeRoom(rng, String(i), c, r, cw, ch, isStart ? [8, 9] : shape.w, isStart ? [8, 9] : shape.h);
    if (isStart) room.role = 'start';
    else {
      const area = room.w * room.h;
      room.enemies = Math.max(2, Math.round((rng.int(2, 4) + (area > 110 ? 1 : 0)) * dens));
      if (isExit) { room.role = 'exit'; room.enemies += exitBonus; if (lastBonus) room.levelBonus = lastBonus; }
      if (room.w >= 11 && room.h >= 9 && rng.chance(0.55)) room.pillars = [[2, 2], [room.w - 4, 2], [2, room.h - 4], [room.w - 4, room.h - 4]];
    }
    return room;
  });
  // chests in side rooms (the ones far from the start first)
  const order = rooms.map((r, i) => i).filter((i) => i !== 0 && i !== far).sort((a, b) => dist[b] - dist[a]);
  for (let k = 0; k < chests && k < order.length; k++) rooms[order[k]].chest = true;
  if (extraChests) rooms[far].extraChests = extraChests;
  return { w: shape.cols * cw, h: shape.rows * ch, corridor: 2, rooms, links: edges.map(([a, b]) => linkOf(cells, a, b)) };
}

// ---------------------------------------------------------------- the floor hub (a map of rooms with portals)
function hubDef(spec, seed, ids) {
  const rng = makeRng(seed);
  const cols = 4, rows = 3, cw = 20, ch = 16;
  const nPortals = spec.presets.length + spec.randoms.length;
  const n = 4 + nPortals; // start, plaza, main, stairs + dungeons
  const { cells, edges } = growCells(rng, cols, rows, n, { linear: false });
  const dist = bfs(cells.length, edges);
  const deg = new Array(cells.length).fill(0);
  edges.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const order = cells.map((_, i) => i).filter((i) => i !== 0);

  // roles: plaza = busiest room near the start, main + stairs = the two farthest, the rest are dungeon rooms
  const plaza = [...order].sort((a, b) => (deg[b] - deg[a]) || (dist[a] - dist[b]))[0];
  const byFar = order.filter((i) => i !== plaza).sort((a, b) => dist[b] - dist[a]);
  const stairs = byFar[0], main = byFar[1];
  const others = order.filter((i) => ![plaza, stairs, main].includes(i));

  // the secret vault hangs off a leaf room that is not one of the special rooms
  const leaves = others.filter((i) => deg[i] === 1);
  const hostPool = leaves.length ? leaves : others;

  const mk = (i, wr, hr) => placeRoom(rng, String(i), cells[i][0], cells[i][1], cw, ch, wr, hr);
  const rooms = cells.map((_, i) => (i === 0 ? mk(i, [10, 11], [10, 10]) : i === plaza ? mk(i, [14, 15], [10, 11]) : i === main ? mk(i, [14, 16], [9, 10]) : mk(i, [10, 13], [8, 10])));
  const links = () => edges.map(([a, b]) => linkOf(cells, a, b));

  // vault: try each host and each side until there is room for it (6x5 with the cracked wall in between)
  let vault = null, crack = null, hostId = null;
  for (const hi of hostPool) {
    for (const side of [1, -1]) {
      const h = rooms[hi];
      const [c] = cells[hi];
      // push the host against the cell edge so there is space for the vault
      const nx = side === 1 ? c * cw + 2 : (c + 1) * cw - 2 - h.w;
      const trial = { ...h, x: nx, w: Math.min(h.w, 10) };
      const vx = side === 1 ? trial.x + trial.w + 1 : trial.x - 7;
      const vy = trial.y + 1;
      const box = { x0: (side === 1 ? vx - 1 : vx), y0: vy - 1, x1: (side === 1 ? vx + 6 : vx + 7), y1: vy + 5 };
      if (box.x0 < 1 || box.x1 > cols * cw - 2) continue;
      const all = rooms.map((r, i) => (i === hi ? trial : r));
      if (all.some((r, i) => i !== hi && hit(box, rectOf(r), 2))) continue;
      if (corridorRects(all, links()).some((rc) => hit(box, rc, 1))) continue;
      // the vault must not touch the host's own corridors either (checked above) - ok
      rooms[hi] = trial;
      vault = R('vault', vx, vy, 6, 5);
      crack = { x: side === 1 ? trial.x + trial.w : trial.x - 1, y: vy + 1 };
      hostId = hi;
      break;
    }
    if (vault) break;
  }
  if (!vault) throw new Error('floorgen: no space for the vault on ' + spec.name);

  addLoops(rng, cells, edges, 1, new Set([hostId]));

  // ---- fill the rooms
  const mid = (r) => [Math.floor(r.w / 2), Math.floor(r.h / 2)];
  const portal = (r, label, to, extra = {}) => ({ t: 'portal', dx: mid(r)[0], dy: mid(r)[1] - 1, label, to, ...extra });
  const prev = spec.n - 1 === 0 ? 'tutorial' : 'floor' + (spec.n - 1);

  rooms[0].role = 'start';
  rooms[0].objects = [
    { t: 'sign', dx: 1, dy: 0, title: 'FLOOR ' + spec.n, text: `${spec.name.toUpperCase()}\nEach floor has 1 main dungeon, preset dungeons, randomized dungeons, a hidden dungeon and rare double dungeons.\nThe stairs up only open once you clear the main dungeon.` },
    { t: 'portal', dx: rooms[0].w - 3, dy: 3, label: 'STAIRS DOWN', to: { type: 'floor', id: prev, arriveAtStairs: true } },
  ];
  const pl = rooms[plaza];
  pl.objects = [
    { t: 'altar', kind: 'loadout', dx: mid(pl)[0], dy: mid(pl)[1] + 1, label: 'LOADOUT' },
    { t: 'sign', dx: 1, dy: 0, title: 'REST STOP', text: 'Change your loadout here any time.\nPresets, randomized and hidden dungeons all lead back to this floor.\nCracks in the walls hide secret dungeons.' },
    { t: 'dummy', dx: 2, dy: pl.h - 2 }, { t: 'dummy', dx: pl.w - 3, dy: pl.h - 2 },
  ];
  rooms[main].objects = [
    portal(rooms[main], 'MAIN DUNGEON: ' + spec.main.toUpperCase(), { type: 'dungeon', id: ids.main }),
    { t: 'sign', dx: 1, dy: 0, title: 'MAIN DUNGEON', text: `${spec.main}\nThe main dungeon is the main gameplay loop of this floor.\nIt ends in the Last Chamber. Clear it to open the stairs up.` },
  ];
  const st = rooms[stairs];
  st.objects = spec.n < 10
    ? [portal(st, 'STAIRS TO FLOOR ' + (spec.n + 1), { type: 'floor', id: 'floor' + (spec.n + 1) }, { requires: 'floor' + spec.n + 'Cleared', lockText: 'CLEAR THE ' + spec.main.toUpperCase() }),
       { t: 'sign', dx: 1, dy: 0, title: 'STAIRS UP', text: `The stairs to Floor ${spec.n + 1} are sealed until you clear ${spec.main}.` }]
    : [{ t: 'sign', dx: Math.floor(st.w / 2), dy: Math.floor(st.h / 2) - 1, title: 'THE TOP', text: 'There are no more stairs.\nThe tower ends here, for this demo. The story that follows is not written yet.\nClear every dungeon you like.' }];
  others.forEach((ri, k) => {
    const r = rooms[ri];
    if (k < spec.presets.length) r.objects = [portal(r, spec.presets[k].toUpperCase(), { type: 'dungeon', id: ids.presets[k] })];
    else r.objects = [portal(r, spec.randoms[k - spec.presets.length].toUpperCase(), { type: 'dungeon', id: ids.randoms[k - spec.presets.length] })];
  });
  vault.objects = [{ t: 'portal', dx: 3, dy: 2, label: spec.hidden.toUpperCase(), to: { type: 'dungeon', id: ids.hidden }, hidden: true }];
  rooms.push(vault);

  return {
    w: cols * cw, h: rows * ch, corridor: 2, rooms, links: links(), cracks: [crack],
    meta: { stairsRoom: String(stairs), mainRoom: String(main) },
  };
}

// ---------------------------------------------------------------- build everything
export function generateTowerFloors() {
  const floors = {}, dungeons = {}, riftOf = {};
  for (const spec of FLOOR_SPECS) {
    const fid = 'floor' + spec.n;
    const ids = { main: `f${spec.n}_main`, presets: spec.presets.map((_, i) => `f${spec.n}_p${i + 1}`), randoms: spec.randoms.map((_, i) => `f${spec.n}_r${i + 1}`), hidden: `f${spec.n}_hidden`, double: `f${spec.n}_rift` };
    const seed = hashString('tower-' + fid);
    const dens = 1 + (spec.n - 1) * 0.07;
    const xp = 1 + spec.n * 0.12;
    let hub = null;
    for (let attempt = 0; attempt < 60 && !hub; attempt++) { // some random grids leave no room for the secret vault: just draw another
      try { hub = hubDef(spec, seed + attempt * 7919, ids); } catch (e) { if (attempt === 59) throw e; }
    }
    delete hub.meta;
    floors[fid] = { id: fid, name: 'Floor ' + spec.n + ': ' + spec.name, short: 'Floor ' + spec.n, theme: spec.theme, intro: spec.intro, n: spec.n, mainId: ids.main, hiddenId: ids.hidden, layout: hub };

    dungeons[ids.main] = {
      id: ids.main, name: spec.main, kind: 'main', rank: spec.rank, levelDelta: 2, floor: fid, theme: spec.theme, xpBonus: xp * 1.25, clearFlag: fid + 'Cleared',
      layout: dungeonDef(seed ^ 0x51, { cols: 5, rows: 4, n: 12, linear: false, loops: 2, w: [9, 13], h: [8, 10] }, { dens: dens * 1.15, chests: 3, exitBonus: 4, lastBonus: 3 }),
    };
    spec.presets.forEach((name, i) => {
      const shape = SHAPES[(i + spec.n) % SHAPES.length];
      dungeons[ids.presets[i]] = {
        id: ids.presets[i], name, kind: 'preset', rank: i % 3 === 2 ? lower(spec.rank) : spec.rank, levelDelta: i % 3, floor: fid, theme: spec.theme, xpBonus: xp,
        layout: dungeonDef(seed ^ (0x100 + i * 977), shape, { dens, chests: 2 }),
      };
    });
    spec.randoms.forEach((name, i) => {
      dungeons[ids.randoms[i]] = { id: ids.randoms[i], name, kind: 'random', rank: spec.rank, levelDelta: 1 + i * 2, floor: fid, theme: spec.theme, xpBonus: xp * (1 + i * 0.1), enemyBonus: Math.floor(spec.n / 4) };
    });
    dungeons[ids.hidden] = {
      id: ids.hidden, name: spec.hidden, kind: 'hidden', rank: higher(spec.rank), levelDelta: 0, floor: fid, theme: 'vault', xpBonus: xp * 1.6,
      layout: dungeonDef(seed ^ 0x777, { cols: 3, rows: 2, n: 4, linear: true, loops: 0, w: [9, 13], h: [8, 10] }, { dens: dens * 1.1, chests: 1, extraChests: 2, exitBonus: 2 }),
    };
    dungeons[ids.double] = {
      id: ids.double, name: 'Double Dungeon: ' + spec.double, kind: 'double', rank: spec.rank, levelDelta: 0, floor: fid, theme: 'rift', xpBonus: xp * 2, statMult: 1.5, fixedLevelOffset: 5,
      layout: dungeonDef(seed ^ 0x999, { cols: 3, rows: 3, n: 6, linear: false, loops: 1, w: [10, 14], h: [9, 10] }, { dens: dens * 1.2, chests: 1, exitBonus: 3 }),
    };
    riftOf[fid] = ids.double;
  }
  return { floors, dungeons, riftOf };
}
