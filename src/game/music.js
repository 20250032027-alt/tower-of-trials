// Game-facing music controller. Scenes and menus only talk to this file; the engine (musicengine.js) is built the first
// time the browser lets us make sound, and whatever track was asked for before that starts then.
import { G } from './state.js';
import { audioGraph, setSfxVolume } from './sfx.js';
import { MusicEngine } from './musicengine.js';

let eng = null;
let want = null;          // { name, mood } the scene asked for
let level = 0;            // current combat intensity 0 explore / 1 alert / 2 fight
let lowSince = 0;         // when the wanted level first dropped below `level`
let muffled = false;
let timer = null;

function ensure() {
  if (eng) return eng;
  const g = audioGraph();
  if (!g) return null;
  try {
    eng = new MusicEngine(g.ctx, g.master);
    eng.start();
    eng.intensity = level;
    if (muffled) eng.muffle(true);
    timer = setInterval(poll, 120);
    return eng;
  } catch (e) { eng = null; return null; }
}

// keeps the engine in step with the mute switch and the sliders, wherever those were changed
function poll() {
  if (!eng) return;
  const muted = !!G.muted, vol = G.settings.musicVol == null ? 0.7 : G.settings.musicVol;
  if (eng.muted !== muted) eng.setMuted(muted);
  if (eng.volume !== vol) eng.setVolume(vol);
  setSfxVolume(G.settings.sfxVol == null ? 1 : G.settings.sfxVol);
}

function startWanted() {
  const e = ensure();
  if (!e || !want) return;
  if (e.ctx.state === 'suspended' && !e.ctx.startRendering) e.ctx.resume();
  poll();
  e.play(want.name, { mood: want.mood || want.name, fade: want.fade == null ? 1.8 : want.fade });
}

export const music = {
  /** Called from any user gesture: creates the audio context and starts the wanted track. */
  unlock() {
    if (!audioGraph()) return;
    if (!eng || !eng.cur) startWanted();
    else if (eng.ctx.state === 'suspended') eng.ctx.resume();
  },
  /** Ask for a track. Safe to call before the first tap: it starts as soon as sound is allowed. */
  play(name, opts = {}) {
    want = { name, mood: opts.mood || name, fade: opts.fade };
    if (eng) startWanted();
  },
  stop(fade = 1.2) { want = null; if (eng) eng.stop(fade); },
  /** Combat intensity from the scene, called often. Rises at once, falls one step after 3.5 s of calm. */
  threat(target, now = performance.now()) {
    if (target > level) { level = target; lowSince = 0; if (eng) eng.setIntensity(level, 0.35); }
    else if (target < level) {
      if (!lowSince) lowSince = now;
      if (now - lowSince > 3500) { level -= 1; lowSince = now; if (eng) eng.setIntensity(level, 1.4); }
    } else lowSince = 0;
  },
  resetThreat() { level = 0; lowSince = 0; if (eng) eng.setIntensity(0, 0.8); },
  stinger(name) { if (eng && !G.muted) eng.stinger(name); },
  muffle(on) { muffled = on; if (eng) eng.muffle(on); },
  /** Re-read mute / slider settings right now (the engine also polls them). */
  sync() { ensure(); poll(); },
  /** For tests/debugging: what is playing right now. */
  debug() { return eng ? { track: eng.cur && eng.cur.name, mood: eng.cur && eng.cur.mood, intensity: eng.cur && eng.cur.intensity, state: eng.ctx.state, muted: eng.muted, volume: eng.volume, players: eng.players.length, time: +eng.ctx.currentTime.toFixed(2) } : { track: null, want: want && want.name }; },
  get level() { return level; },
};

// the first tap/key anywhere unlocks sound (browsers require a gesture); later ones recover an interrupted context
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => music.unlock(), { passive: true });
// no music (or CPU use) while the tab is hidden
document.addEventListener('visibilitychange', () => {
  if (!eng) return;
  if (document.hidden) eng.ctx.suspend(); else eng.ctx.resume();
});
