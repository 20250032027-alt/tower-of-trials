// Renders the web game's sound (src/game/sfx.js and musicengine.js, all synthesised) to .ogg files for Godot:
//   npm run godot:audio          (needs ffmpeg on PATH, and:  npm i --no-save node-web-audio-api)
// Writes godot/assets/audio/{sfx,music,stingers}/ and godot/data/audio.json (what the Sound autoload reads).
// The rendered files are committed, so you only run this when the web game's sounds change.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// the sound code expects a browser: give it just enough of one
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, hidden: false };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

let OfflineAudioContext;
try {
  ({ OfflineAudioContext } = await import('node-web-audio-api'));
} catch (e) {
  console.error('Needs the node-web-audio-api package:  npm i --no-save node-web-audio-api');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).error) { console.error('Needs ffmpeg on your PATH.'); process.exit(1); }
globalThis.AudioContext = OfflineAudioContext;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'godot', 'assets', 'audio');
const SR = 44100;
const sfxMod = await import('../../src/game/sfx.js');
const { MusicEngine } = await import('../../src/game/musicengine.js');
const { TRACKS, DUNGEON_FAMILY } = await import('../../src/logic/musictheory.js');
const { STINGERS } = await import('../../src/game/tracks.js');
const { WEAPONS } = await import('../../src/data/weapons.js');
const { G } = await import('../../src/game/state.js');
G.muted = false;
G.settings.sfxVol = 1;

for (const d of ['sfx', 'music', 'stingers']) { rmSync(join(out, d), { recursive: true, force: true }); mkdirSync(join(out, d), { recursive: true }); }
const tmp = join(tmpdir(), 'tower-audio-' + process.pid); mkdirSync(tmp, { recursive: true });

// ------------------------------------------------------------------ helpers
function wav(path, chans, sr) {
  const n = chans[0].length, ch = chans.length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 32767), o); o += 2; }
  writeFileSync(path, buf);
}
function encode(chans, dest, q = 4) {
  const w = join(tmp, 'x.wav');
  wav(w, chans, SR);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'libvorbis', '-q:a', String(q), dest]);
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
}
const chansOf = (buf) => [buf.getChannelData(0), buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0)];
// cut the silence off the end and fade the last few ms so nothing clicks
function trim(chans, floor = 0.0006, minLen = 0.05) {
  let end = chans[0].length;
  while (end > SR * minLen && Math.abs(chans[0][end - 1]) < floor && Math.abs(chans[1][end - 1]) < floor) end--;
  end = Math.min(chans[0].length, end + Math.floor(SR * 0.03));
  const fade = Math.min(end, Math.floor(SR * 0.02));
  const res = chans.map((c) => Float32Array.from(c.subarray(0, end)));
  for (let i = 0; i < fade; i++) for (const c of res) c[end - 1 - i] *= i / fade;
  return res;
}

const manifest = { sfx: {}, music: {}, stingers: {}, meta: {} };
let count = 0;

// ------------------------------------------------------------------ sound effects
async function renderSfx(key, name, opts, variants) {
  const files = [];
  for (let v = 0; v < variants; v++) {
    const ctx = new OfflineAudioContext(2, SR * 3.4, SR);
    sfxMod.__useContext(ctx);
    sfxMod.sfx(name, opts);
    const buf = await ctx.startRendering();
    const chans = trim(chansOf(buf));
    const file = `${key.replace(/[^a-z0-9_.]/gi, '_')}_${v}.ogg`;
    encode(chans, join(out, 'sfx', file));
    files.push(file);
    count++;
  }
  manifest.sfx[key] = files;
}

const ALL = Object.keys(WEAPONS);
const HITS = ALL;                       // every weapon has a hit sound (sfx.js falls back to "blade")
const names = ['heavy', 'draw', 'charged', 'reload', 'hurt', 'dodge', 'kill', 'eswing', 'windup', 'erattle', 'notice', 'step', 'heartbeat', 'pickup', 'levelup', 'chest', 'rare', 'portal', 'skill', 'wheelopen', 'wheelclose', 'heal', 'manaup', 'buff', 'shieldup', 'shieldbreak', 'mark', 'ready', 'expire', 'dry', 'magout', 'lock', 'lockon', 'lockoff', 'slam', 'magewind', 'aurafade', 'overfocus', 'berserk', 'deny', 'crack', 'thunder', 'crumble'];
console.log('sound effects...');
for (const w of ['training_sword', 'training_claymore', 'training_spear']) await renderSfx(`swing:${w}`, 'swing', { weapon: w }, 3);
for (const w of HITS) for (const mat of ['bone', 'wood']) {
  await renderSfx(`hit:${w}:${mat}`, 'hit', { weapon: w, mat }, 2);
  await renderSfx(`crit:${w}:${mat}`, 'crit', { weapon: w, mat }, 2);
}
for (const w of ALL.filter((x) => !String(WEAPONS[x].cls).includes('mage') && WEAPONS[x].cls !== 'magic' && WEAPONS[x].cls !== 'melee')) {
  if (w === 'training_bow') for (const [i, pw] of [0.15, 0.55, 1].entries()) await renderSfx(`shoot:${w}:${i}`, 'shoot', { weapon: w, power: pw }, 2);
  else await renderSfx(`shoot:${w}`, 'shoot', { weapon: w, power: 1 }, 2);
}
for (const w of ['training_mage_book', 'training_staff']) { await renderSfx(`magic:${w}`, 'magic', { weapon: w }, 2); await renderSfx(`cast:${w}`, 'cast', { weapon: w }, 2); }
for (let s = 0; s < 9; s++) await renderSfx(`xp:${s}`, 'xp', { step: s }, 1);
await renderSfx('tick:up', 'tick', { dir: 1 }, 2); await renderSfx('tick:down', 'tick', { dir: -1 }, 2);
await renderSfx('ui', 'ui', {}, 3);
for (const n of names) await renderSfx(n, n, {}, ['step', 'hurt', 'kill', 'notice', 'erattle', 'dodge', 'eswing'].includes(n) ? 3 : 2);
console.log(`  ${count} files`);

// ------------------------------------------------------------------ music loops (one bar-aligned loop per track and intensity; the tail is folded onto the start so it loops without a seam)
async function renderLoop(name, mood, intensity, file) {
  const def = TRACKS[name];
  const loopLen = def.bars * 4 * (60 / def.bpm);
  const tail = 5, lead = 0.12;
  const total = Math.ceil((lead + loopLen + tail) * SR);
  const ctx = new OfflineAudioContext(2, total, SR);
  const eng = new MusicEngine(ctx, ctx.destination);
  eng.intensity = intensity;
  const p = eng.play(name, { mood, fade: 0.01 });
  p.out.gain.cancelScheduledValues(0);
  p.out.gain.setValueAtTime(def.trim || 1, 0);
  eng.renderAhead(lead + loopLen + tail);
  const buf = await ctx.startRendering();
  const [L, R] = chansOf(buf);
  const n = Math.round(loopLen * SR), s0 = Math.round(lead * SR);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = L[s0 + i]; b[i] = R[s0 + i]; }
  const tl = Math.min(Math.round(tail * SR), L.length - s0 - n);
  for (let i = 0; i < tl; i++) { a[i % n] += L[s0 + n + i]; b[i % n] += R[s0 + n + i]; }
  encode([a, b], join(out, 'music', file), 3);
  count++;
  return loopLen;
}
console.log('music...');
const moods = { title: ['title'], hub: ['hub'], dungeon: ['dungeon'], vault: ['vault'], rift: ['rift'] };
for (const name of Object.keys(moods)) {
  const levels = DUNGEON_FAMILY.includes(name) ? [0, 1, 2] : [0];
  const files = [];
  let len = 0;
  for (const lv of levels) { const f = `${name}_${lv}.ogg`; len = await renderLoop(name, name, lv, f); files.push(f); }
  manifest.music[name] = { files, length: +len.toFixed(3), bpm: TRACKS[name].bpm, family: DUNGEON_FAMILY.includes(name) };
  console.log(`  ${name}: ${levels.length} loop(s), ${len.toFixed(1)}s`);
}

// ------------------------------------------------------------------ stingers (one-off musical moments)
console.log('stingers...');
for (const name of Object.keys(STINGERS)) {
  const ctx = new OfflineAudioContext(2, SR * 12, SR);
  const eng = new MusicEngine(ctx, ctx.destination);
  eng.stinger(name, 0.05);
  const buf = await ctx.startRendering();
  encode(trim(chansOf(buf), 0.0008, 0.3), join(out, 'stingers', `${name}.ogg`), 4);
  manifest.stingers[name] = `${name}.ogg`;
  count++;
}

manifest.meta = { sampleRate: SR, note: 'written by tools/godot/render_audio.mjs' };
writeFileSync(join(root, 'godot', 'data', 'audio.json'), JSON.stringify(manifest, null, 1) + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log(`done: ${count} files -> godot/assets/audio/`);
