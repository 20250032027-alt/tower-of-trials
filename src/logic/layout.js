// Turns a room/corridor description (data/world.js) into a tile grid plus
// the list of things standing on it (enemies, chests, signs, portals ...).
// Pure functions: no Phaser in here, so it can be unit-tested in Node.

import { makeRng } from './rng.js';

// tile indices (match the tileset image built in art/tiles.js)
export const TILE = {
  FLOOR_A: 0,
  FLOOR_B: 1,
  FLOOR_C: 2,
  WALL_EDGE: 3,
  WALL_DEEP: 4,
  CRACK: 5,
};
export const isWall = (t) => t >= TILE.WALL_EDGE;

const center = (r) => ({ cx: r.x + Math.floor(r.w / 2), cy: r.y + Math.floor(r.h / 2) });

export function buildLayout(def, seed = 1) {
  const rng = makeRng(seed);
  const { w, h } = def;
  const cw = def.corridor || 2;
  const solid = new Uint8Array(w * h).fill(1);
  const inb = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;
  const carve = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) solid[y * w + x] = 0;
  };
  const roomById = Object.fromEntries(def.rooms.map((r) => [r.id, r]));

  // rooms
  for (const r of def.rooms) carve(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1);

  // corridors
  const hseg = (x0, x1, y) => carve(Math.min(x0, x1), y, Math.max(x0, x1), y + cw - 1);
  const vseg = (y0, y1, x) => carve(x, Math.min(y0, y1), x + cw - 1, Math.max(y0, y1));
  for (const [aId, bId, mode = 'h'] of def.links || []) {
    const a = center(roomById[aId]);
    const b = center(roomById[bId]);
    if (mode === 'h') {
      hseg(a.cx, b.cx, a.cy);
      vseg(a.cy, b.cy, b.cx);
    } else {
      vseg(a.cy, b.cy, a.cx);
      hseg(a.cx, b.cx, b.cy);
    }
  }

  // pillars (2x2 blocks) - carved back to wall
  for (const r of def.rooms) {
    for (const [dx, dy] of r.pillars || []) {
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
        const px = r.x + dx + xx, py = r.y + dy + yy;
        if (inb(px, py)) solid[py * w + px] = 1;
      }
    }
  }

  // cracked walls stay solid but get their own tile
  const cracks = (def.cracks || []).map((c) => ({ x: c.x, y: c.y }));
  for (const c of cracks) solid[c.y * w + c.x] = 1;

  // final tile ids
  const tiles = new Uint8Array(w * h);
  const floorAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x] === 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x] === 0) {
        const hsh = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
        const v = hsh % 100;
        tiles[y * w + x] = v < 76 ? TILE.FLOOR_A : v < 94 ? TILE.FLOOR_B : TILE.FLOOR_C;
      } else {
        let near = false;
        for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) if (floorAt(x + ox, y + oy)) { near = true; break; }
        tiles[y * w + x] = near ? TILE.WALL_EDGE : TILE.WALL_DEEP;
      }
    }
  }
  for (const c of cracks) tiles[c.y * w + c.x] = TILE.CRACK;

  // ----- things standing in rooms
  const occupied = new Set();
  const key = (x, y) => x + ',' + y;
  const objects = [];
  const enemies = [];
  const rooms = def.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, role: r.role || null, ...center(r), enemies: r.enemies || 0 }));

  for (const r of def.rooms) {
    for (const o of r.objects || []) {
      const { t, dx, dy, ...rest } = o;
      const x = r.x + dx, y = r.y + dy;
      objects.push({ type: t, x, y, ...rest });
      occupied.add(key(x, y));
    }
  }

  const randomFloorTile = (r, margin = 1, avoid = []) => {
    for (let tries = 0; tries < 80; tries++) {
      const x = rng.int(r.x + margin, r.x + r.w - 1 - margin);
      const y = rng.int(r.y + margin, r.y + r.h - 1 - margin);
      if (!floorAt(x, y) || occupied.has(key(x, y))) continue;
      if (avoid.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 3)) continue;
      return { x, y };
    }
    return null;
  };

  let spawn = null;
  for (const r of def.rooms) {
    const c = center(r);
    if (r.role === 'start') spawn = { x: c.cx, y: c.cy };
    if (r.role === 'exit') {
      objects.push({ type: 'exit', x: c.cx, y: c.cy });
      occupied.add(key(c.cx, c.cy));
    }
  }
  if (!spawn) {
    const c = center(def.rooms[0]);
    spawn = { x: c.cx, y: c.cy };
  }
  occupied.add(key(spawn.x, spawn.y));

  for (const r of def.rooms) {
    const placed = [];
    for (let i = 0; i < (r.enemies || 0); i++) {
      const p = randomFloorTile(r, 1, placed);
      if (!p) continue;
      placed.push(p);
      occupied.add(key(p.x, p.y));
      enemies.push({ x: p.x, y: p.y, room: r.id, levelBonus: r.levelBonus || 0 });
    }
    const chests = (r.chest ? 1 : 0) + (r.extraChests || 0);
    for (let i = 0; i < chests; i++) {
      const p = randomFloorTile(r, 1);
      if (!p) continue;
      occupied.add(key(p.x, p.y));
      objects.push({ type: 'chest', x: p.x, y: p.y });
    }
  }

  return { w, h, tiles, spawn, objects, enemies, rooms, cracks, seed };
}

// ----- flood fill helpers (used by tests and by the rift placement)
export function reachableFrom(layout, sx, sy) {
  const { w, h, tiles } = layout;
  const seen = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i] || isWall(tiles[i])) continue;
    seen[i] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

// Pick a spot for a "double dungeon" rift: a room that is not start/exit.
export function pickRiftSpot(layout, rng) {
  const candidates = layout.rooms.filter((r) => !r.role && r.enemies > 0);
  const pool = candidates.length ? candidates : layout.rooms.filter((r) => r.role !== 'start');
  const room = rng.pick(pool);
  const taken = new Set(layout.objects.map((o) => o.x + ',' + o.y));
  for (let tries = 0; tries < 60; tries++) {
    const x = rng.int(room.x + 1, room.x + room.w - 2);
    const y = rng.int(room.y + 1, room.y + room.h - 2);
    if (!isWall(layout.tiles[y * layout.w + x]) && !taken.has(x + ',' + y)) return { x, y, room: room.id };
  }
  return { x: room.cx, y: room.cy, room: room.id };
}

// ----- randomly generated dungeon description
export function generateRandomDef(seed) {
  const rng = makeRng(seed);
  const w = 72, h = 46;
  const target = rng.int(7, 9);
  const rooms = [];
  for (let attempt = 0; attempt < 400 && rooms.length < target; attempt++) {
    const rw = rng.int(8, 14), rh = rng.int(7, 11);
    const x = rng.int(3, w - rw - 4), y = rng.int(3, h - rh - 4);
    const clash = rooms.some((r) => x < r.x + r.w + 4 && x + rw + 4 > r.x && y < r.y + r.h + 4 && y + rh + 4 > r.y);
    if (!clash) rooms.push({ id: 'r' + rooms.length, x, y, w: rw, h: rh });
  }
  rooms.sort((a, b) => a.x - b.x);
  rooms.forEach((r, i) => (r.id = 'r' + i));
  rooms[0].role = 'start';
  rooms[rooms.length - 1].role = 'exit';
  const links = [];
  for (let i = 0; i < rooms.length - 1; i++) links.push([rooms[i].id, rooms[i + 1].id, i % 2 ? 'v' : 'h']);
  for (let k = 0; k < 2; k++) {
    const a = rng.int(0, rooms.length - 3);
    const b = rng.int(a + 2, rooms.length - 1);
    links.push([rooms[a].id, rooms[b].id, rng.chance(0.5) ? 'h' : 'v']);
  }
  let chests = 0;
  rooms.forEach((r, i) => {
    if (i === 0) return;
    r.enemies = rng.int(2, 4) + (r.w * r.h > 90 ? 1 : 0);
    if (r.role === 'exit') r.enemies += 2;
    if (!r.role && chests < 3 && rng.chance(0.4)) { r.chest = true; chests++; }
    if (r.w >= 11 && r.h >= 9 && rng.chance(0.5)) r.pillars = [[2, 2], [r.w - 4, 2], [2, r.h - 4], [r.w - 4, r.h - 4]];
  });
  if (!chests && rooms.length > 2) rooms[1].chest = true;
  return { w, h, corridor: 2, rooms, links };
}
