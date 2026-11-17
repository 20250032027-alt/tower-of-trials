// Shared game state (one object so scenes, menus and the HUD all see the same data).
import { makeRng } from '../logic/rng.js';
import { createProfile, loadProfile, saveProfile, clearSave } from '../logic/progression.js';

const SETTINGS_KEY = 'tower-trials-settings-v1';
const DEFAULT_SETTINGS = { guide: true, minimap: true, zoom: 'auto', touch: 'auto', autoAim: true, muted: false, musicVol: 0.7, sfxVol: 1, shake: 0.3, sway: 0.5, hudScale: 'auto' };
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
}

// Camera shake goes through here so one setting (0-100%) scales every hit.
export function shakeCam(scene, ms, amt) {
  const k = G.settings.shake == null ? 0.3 : G.settings.shake;
  if (k <= 0 || !scene || !scene.cameras) return;
  scene.cameras.main.shake(ms, amt * k);
}

export const G = {
  settings: loadSettings(),
  explored: {}, // minimap fog-of-war per map
  profile: createProfile(),
  rng: makeRng((Math.random() * 4294967296) >>> 0),
  runs: {}, // dungeon runs kept while you step into a double dungeon and come back
  ui: null, // set by ui/ui.js
  scene: null, // current PlayScene
  muted: false,
  touch: false,
};

export function startFresh() {
  clearSave();
  G.profile = createProfile();
  G.runs = {};
  G.firstRun = true;
}

export function continueSave() {
  const p = loadProfile();
  if (!p) return false;
  G.profile = p;
  G.runs = {};
  return true;
}

export function persist() {
  saveProfile(G.profile);
}
