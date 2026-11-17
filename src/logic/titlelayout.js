// Layout + camera maths for the title-screen vista (pure, so it can be tested).
//
// The title is a low-angle "worm's-eye" view: the camera stands on the path in front of the Tower, tilted up and rolled
// a little (a Dutch angle), so the shaft races away into the night and leans across the screen. The picture is drawn
// small, by a tiny ray-caster (art/titleworld.js), and shown at a whole-number zoom Z, so every pixel on screen is the
// same size. Everything here is in "virtual pixels" (1 virtual px = Z screen px) and world units (1 unit ~ 1 metre).

export const TIERS = 11; // the Tower has 11 floors (tutorial + 10), so the drawn tower has 11 storeys

export const WORLD = {
  R0: 5.2,          // radius of the gate storey
  TAPER: 0.34,      // the top storey is this much narrower than the bottom one
  LEDGE_H: 0.34,    // thickness of each storey's overhanging cornice
  LEDGE_OUT: 0.5,   // how far the cornice juts out
  GATE_H: 6.0,      // height of the gate storey
  TIER_H: 2.6,      // height of every other storey
  LANTERN_H: 2.6,   // the glowing lantern room above the top cornice
  LANTERN_R: 1.9,
  SPIRE_H: 7.5,     // slate spire above the lantern
  CAM_H: 1.7,       // eye height
  CAM_D: 17,        // camera distance from the tower axis (it stands on the path, looking at the gate)
  DOOR_HW: 1.6,    // half-width of the gate
  DOOR_H: 4.9,      // height of the gate
  HERO_Z: 3.5,      // how far in front of the wall the hero stands
};
const Wd = WORLD;

export const towerR = (i) => Wd.R0 * (1 - Wd.TAPER * (i / (TIERS - 1)));
export const tierBase = (i) => (i === 0 ? 0 : Wd.GATE_H + (i - 1) * Wd.TIER_H);
export const tierTop = (i) => tierBase(i) + (i === 0 ? Wd.GATE_H : Wd.TIER_H);
export const TOWER_H = tierTop(TIERS - 1);
export const LANTERN_TOP = TOWER_H + Wd.LANTERN_H + 0.35;
export const APEX_Y = LANTERN_TOP + Wd.SPIRE_H;
/** The hero's feet / the beacon gem, in world space (x right, y up, z away from the camera; the gate faces -z). */
export const HERO_POS = [0, 0, -(Wd.R0 + Wd.HERO_Z)];
export const BEACON_POS = [0, APEX_Y + 1.1, 0];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RAD = Math.PI / 180;

/** Roughly where the logo + tagline end in the portrait layout (css px), mirroring the css sizes in ui/style.css. */
const logoBottom = (sw, sh) => {
  const l1 = clamp(0.17 * sw, 36, 96), l2 = clamp(0.1 * sw, 22, 58);
  return Math.max(0.06 * sh, 50) + 0.92 * l1 + 1.14 * l2 + 30 + 18;
};

// ------------------------------------------------------------------ camera
/** Project a world point; returns {x, y} in virtual px and the depth along the view axis. */
export function project(cam, px, py, pz) {
  const vx = px, vy = py - Wd.CAM_H, vz = pz + Wd.CAM_D;
  const zc = vy * cam.sp + vz * cam.cp, b = vy * cam.cp - vz * cam.sp;
  const us = cam.F * vx / zc, vs = -cam.F * b / zc;
  return { x: cam.tx + cam.cr * us - cam.sr * vs, y: cam.ty + cam.sr * us + cam.cr * vs, z: zc };
}
/** Unit direction of the ray through screen point (sx, sy). */
export function rayDir(cam, sx, sy, out = [0, 0, 0]) {
  const X = sx - cam.tx, Y = sy - cam.ty;
  const us = cam.cr * X + cam.sr * Y, vs = -cam.sr * X + cam.cr * Y;
  // forward = (0, sp, cp), up = (0, cp, -sp), right = (1, 0, 0); screen y grows downward, so the ray is F*fwd + us*right - vs*up
  const dx = us, dy = cam.F * cam.sp - vs * cam.cp, dz = cam.F * cam.cp + vs * cam.sp;
  const l = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
  return out;
}

function mkCam(F, pitch, roll) {
  return { F, p: pitch, roll, sp: Math.sin(pitch), cp: Math.cos(pitch), sr: Math.sin(roll), cr: Math.cos(roll), tx: 0, ty: 0 };
}

/** Choose focal length, pitch and shift so the hero's feet and the beacon land where the layout wants them. */
export function makeCam(W, H, portrait, Z = 3) {
  const roll = portrait ? -0.2 : 0.2;                         // the Tower leans toward the open sky (portrait) / the menu (landscape)
  // portrait: the logo sits above the Tower, so the beacon has to clear it (the logo's height follows the screen width, in css px)
  const T = portrait ? { fx: 0.5, fy: 0.665, ty: clamp(logoBottom(W * Z, H * Z) / (H * Z), 0.2, H < W * 1.25 ? 0.24 : 0.42) } : { fx: 0.3, fy: 0.87, ty: 0.1 };
  const footX = W * T.fx, footY = H * T.fy, topY = H * T.ty;
  const spanT = (footY - topY) / Math.cos(roll);              // screen distance foot -> beacon (rotation keeps it)
  const [fx, fy, fz] = HERO_POS, [bx, by, bz] = BEACON_POS;
  // elevations of foot / beacon seen from the camera, to size the focal length so the tower fits
  const eF = Math.atan2(fy - Wd.CAM_H, fz + Wd.CAM_D), eT = Math.atan2(by - Wd.CAM_H, bz + Wd.CAM_D);
  const Fmax = spanT / (2 * Math.tan((eT - eF) / 2));
  const Fpref = portrait ? W * 0.8 : H * 0.62;
  const F = Math.min(Fpref, Fmax * 0.9);
  let best = null;
  const midPd = (eF + eT) / 2 / RAD;
  for (let pd = 3; pd <= midPd; pd += 0.25) {                 // the flatter solution: the shaft races away to a vanishing point high above
    const c = mkCam(F, pd * RAD, roll);
    const a = project(c, fx, fy, fz), b = project(c, bx, by, bz);
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const err = Math.abs(span - spanT);
    if (!best || err < best.err) best = { err, c, a };
  }
  const cam = best.c;
  cam.tx = footX - best.a.x; cam.ty = footY - best.a.y;
  return cam;
}

// ------------------------------------------------------------------ metrics
export function titleMetrics(sw, sh) {
  const portrait = sh >= sw;                                  // same rule as the css (orientation: portrait)
  const squarish = Math.max(sw, sh) < Math.min(sw, sh) * 1.25;  // near-square windows get a finer picture so the Tower still fits
  const Z = clamp(Math.round(Math.min(sw, sh) / (squarish ? 175 : 130)), 2, 6);
  const W = Math.ceil(sw / Z), H = Math.ceil(sh / Z);
  const cam = makeCam(W, H, portrait, Z);
  const pr = (p) => project(cam, p[0], p[1], p[2]);
  const hero = pr(HERO_POS), beacon = pr(BEACON_POS);
  const door = {                                              // gate centre-bottom on the wall, and its top
    foot: project(cam, 0, 0, -towerR(0)), top: project(cam, 0, Wd.DOOR_H, -towerR(0)),
  };
  const moon = portrait ? { x: Math.round(W * 0.79), y: Math.round(H * 0.385), r: Math.max(6, Math.round(W * 0.07)) }
    : { x: Math.round(W * 0.5), y: Math.round(H * 0.3), r: Math.max(7, Math.round(H * 0.085)) };
  return { Z, W, H, portrait, cam, hero, beacon, door, moon, pad: 10 };
}

/** How many storeys' windows are lit: one per cleared dungeon, so the tower records the player's progress. */
export function litTiers(flags) {
  if (!flags) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(flags)) if (v && k.startsWith('cleared_')) n++;
  return Math.min(TIERS, n);
}
