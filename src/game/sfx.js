// Procedural sound engine. Every sound is synthesised from oscillators and noise (no audio files).
//
// How the sounds are built (the "art of game SFX" rules this follows):
//  * LAYERS: a hit is not one beep. It is a sharp transient + a body thump + a material layer
//    (bone rattle / wood knock) + a short tail. Each weapon gets its own recipe.
//  * VARIATION: every call randomises pitch, timing and filter a little, and sounds with several
//    variants never play the same variant twice in a row, so repeated swings never sound identical.
//  * WEIGHT: light weapons get high, quick, airy whooshes. The claymore gets a low, slow, heavy one.
//  * MATERIAL: hits sound different on bone (skeletons) and wood (the training dummy).
//  * MIX: everything goes through a compressor/limiter so combat never clips, quiet "soft" sounds
//    (footsteps, ticks) duck out of the way of big events, and sounds pan + fade with distance.
import { G } from './state.js';
import { makeVariantPicker, chainFreq, panFor, distanceGain } from '../logic/sfxmath.js';

let ctx = null, master = null, sfxOut = null, bus = null, softBus = null, duckG = null, verbIn = null, noiseBuf = null, shapeCurve = null;
let voices = 0;
const MAX_VOICES = 40;
const pickV = makeVariantPicker();
const lastAt = {};
const rnd = (a, b) => a + Math.random() * (b - a);

// settings for the sound currently being played (read by every layer it creates)
const cur = { vol: 1, pan: 0, pitch: 1, soft: false, prio: false };

// ------------------------------------------------------------------ audio graph
function build() {
  // master -> limiter -> speakers. Sound effects go through `sfxOut` (the EFFECTS slider); the music engine plugs
  // straight into `master`, so both share one limiter and loud fights can never clip.
  master = ctx.createGain(); master.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.16;
  master.connect(comp); comp.connect(ctx.destination);
  sfxOut = ctx.createGain(); sfxOut.connect(master);
  bus = ctx.createGain(); bus.connect(sfxOut);
  duckG = ctx.createGain(); duckG.connect(sfxOut);
  softBus = ctx.createGain(); softBus.connect(duckG);

  // a short, dark "stone room" reverb so tails sit in the dungeon instead of in a vacuum
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.1);
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * (1 - i / len) ** 2.6; }
  }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  verbIn = ctx.createGain();
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
  verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(sfxOut);

  noiseBuf = ctx.createBuffer(1, sr * 3, sr);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  shapeCurve = new Float32Array(257);
  for (let i = 0; i < 257; i++) shapeCurve[i] = Math.tanh((i / 128 - 1) * 3.2);
}

function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); build(); } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended' && !ctx.startRendering) ctx.resume();
  return ctx;
}
export function unlockAudio() { audio(); }
/** The shared audio context and its master input, for the music engine. Null if audio is unavailable. */
export function audioGraph() { const c = audio(); return c && master ? { ctx: c, master } : null; }
/** EFFECTS slider (0..1). Curved so the middle of the slider is a comfortable level; 1 = the original mix. */
export function setSfxVolume(v) {
  if (!sfxOut) return;
  const g = Math.max(0, Math.min(1, v)) ** 1.5;
  if (Math.abs(sfxOut.gain.value - g) > 0.001) sfxOut.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
}

// test hook: lets a script render sounds into an OfflineAudioContext and inspect the result
export function __useContext(c) { ctx = c; voices = 0; for (const k of Object.keys(lastAt)) delete lastAt[k]; build(); }

// ------------------------------------------------------------------ building blocks
function envelope(p, t, vol, atk, dur) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(vol, t + Math.max(0.0015, Math.min(atk, dur * 0.6)));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

function route(node, o) {
  if (cur.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, cur.pan));
    node.connect(p); node = p;
  }
  node.connect(cur.soft ? softBus : bus);
  if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; node.connect(s); s.connect(verbIn); }
}

// tone layer: { type, f0, f1, dur, vol, delay, atk, lp, dist, detune, vib:{rate,depth}, verb }
function osc(o) {
  const a = audio(); if (!a || (voices >= MAX_VOICES && !cur.prio)) return;
  const t = a.currentTime + (o.delay || 0) + 0.004;
  const n = a.createOscillator();
  n.type = o.type || 'square';
  const f0 = o.f0 * cur.pitch, f1 = (o.f1 == null ? o.f0 : o.f1) * cur.pitch;
  n.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) n.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + o.dur);
  if (o.detune) n.detune.value = o.detune;
  let node = n;
  if (o.lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  if (o.dist) { const w = a.createWaveShaper(); w.curve = shapeCurve; node.connect(w); node = w; }
  const g = a.createGain();
  envelope(g.gain, t, (o.vol == null ? 0.08 : o.vol) * cur.vol, o.atk == null ? 0.002 : o.atk, o.dur);
  node.connect(g);
  route(g, o);
  if (o.vib) {
    const l = a.createOscillator(), lg = a.createGain();
    l.frequency.value = o.vib.rate; lg.gain.value = o.vib.depth;
    l.connect(lg); lg.connect(n.frequency); l.start(t); l.stop(t + o.dur + 0.03);
  }
  n.start(t); n.stop(t + o.dur + 0.03);
  voices++; n.onended = () => { voices--; };
}

// noise layer: { ft:'lowpass'|'highpass'|'bandpass', f0, f1, q, dur, vol, delay, atk, verb }
function nz(o) {
  const a = audio(); if (!a || (voices >= MAX_VOICES && !cur.prio)) return;
  const t = a.currentTime + (o.delay || 0) + 0.004;
  const s = a.createBufferSource(); s.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q == null ? 0.8 : o.q;
  const top = a.sampleRate * 0.45;
  const f0 = Math.min(top, o.f0 * cur.pitch), f1 = Math.min(top, (o.f1 == null ? o.f0 : o.f1) * cur.pitch);
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + o.dur);
  const g = a.createGain();
  envelope(g.gain, t, (o.vol == null ? 0.08 : o.vol) * cur.vol, o.atk == null ? 0.002 : o.atk, o.dur);
  s.connect(f); f.connect(g);
  route(g, o);
  s.start(t, Math.random() * 2.2, o.dur + 0.04);
  voices++; s.onended = () => { voices--; };
}

// ---- recipes built from the layers above
const click = (f, vol, delay = 0, q = 3) => nz({ ft: 'bandpass', f0: f, q, dur: 0.02, vol, delay, atk: 0.001 });
const rattle = (n, vol, gap = 0.035, base = 2200) => {
  for (let i = 0; i < n; i++) click(base * rnd(0.65, 1.45), vol * rnd(0.55, 1), i * gap * rnd(0.6, 1.4), rnd(2.5, 6));
};
// body of an impact: a mid "thock" (audible on phone speakers) plus a low layer for headphones
const thump = (f, vol, dur = 0.1, delay = 0, verb = 0) => {
  osc({ type: 'triangle', f0: f, f1: f * 0.42, dur, vol, delay, lp: 1100, verb });
  osc({ type: 'sine', f0: f * 0.5, f1: f * 0.24, dur: dur * 1.25, vol: vol * 0.75, delay });
};
// metal ring: inharmonic partials die away at different speeds
const ring = (f, vol, dur = 0.16, delay = 0, verb = 0.12) => {
  [1, 1.504, 2.31].forEach((r, i) => osc({ type: 'sine', f0: f * r, f1: f * r * 0.99, dur: dur / (1 + i * 0.5), vol: vol / (1 + i * 0.7), delay, verb }));
};
const whoosh = (f0, f1, dur, vol, q = 1, atk = dur * 0.35, delay = 0) => nz({ ft: 'bandpass', f0, f1, q, dur, vol, atk, delay });

// ------------------------------------------------------------------ weapon swings (weight shapes the sound)
const SWING = {
  training_sword: [ // light + quick: bright airy sweep
    () => { whoosh(1100, 3600, 0.12, 0.085, 1.1); click(3800, 0.03, 0.005); },
    () => { whoosh(800, 2800, 0.15, 0.08, 1.4, 0.05); osc({ type: 'sine', f0: 2300, f1: 2600, dur: 0.1, vol: 0.012, atk: 0.03 }); },
    () => { whoosh(1600, 4400, 0.09, 0.08, 0.9); whoosh(500, 1200, 0.1, 0.03, 0.8); },
  ],
  training_claymore: [ // heavy + slow: low rushing air, gritty weight, chain rattle
    () => { whoosh(240, 950, 0.26, 0.15, 0.8, 0.1); whoosh(1000, 2400, 0.15, 0.04, 1, 0.07); osc({ type: 'sawtooth', f0: 120, f1: 62, dur: 0.24, vol: 0.05, lp: 500, atk: 0.06 }); click(1200, 0.05); },
    () => { whoosh(200, 820, 0.3, 0.15, 0.7, 0.12); whoosh(1400, 3000, 0.12, 0.035, 1.2, 0.08); osc({ type: 'sawtooth', f0: 95, f1: 55, dur: 0.28, vol: 0.055, lp: 420, atk: 0.08 }); rattle(2, 0.03, 0.03, 1500); },
  ],
  training_spear: [ // thrust: short sharp "fft" with a thin whistle
    () => { whoosh(2600, 5600, 0.07, 0.085, 1.6, 0.012); osc({ type: 'sine', f0: 1700, f1: 2700, dur: 0.07, vol: 0.02, atk: 0.01 }); },
    () => { whoosh(2000, 4800, 0.09, 0.08, 1.3, 0.02); click(4200, 0.04, 0.02); },
  ],
};

const SWING_GAIN = { training_sword: 2.2, training_claymore: 1.4, training_spear: 4 };

// ------------------------------------------------------------------ ranged release
const SHOOT = {
  training_bow: (o) => { // string twang + slap + arrow hiss (more charge = deeper twang, louder hiss)
    const pw = o.power == null ? 0.5 : o.power;
    osc({ type: 'triangle', f0: 190 + pw * 30, f1: 150, dur: 0.24, vol: 0.09, lp: 1400 });
    osc({ type: 'triangle', f0: 191 + pw * 30, f1: 150, dur: 0.22, vol: 0.06, detune: 14, lp: 1400 });
    osc({ type: 'sine', f0: 560, f1: 440, dur: 0.12, vol: 0.03 });
    click(2500, 0.07);
    whoosh(2800, 1100, 0.14, 0.03 + pw * 0.035, 1.2, 0.02, 0.01);
  },
  basic_crossbow: () => { // mechanical: latch click, heavy thunk, short snap
    click(3200, 0.09); click(1900, 0.06, 0.012);
    thump(210, 0.15, 0.1, 0.01);
    osc({ type: 'triangle', f0: 520, f1: 210, dur: 0.1, vol: 0.06, delay: 0.005, lp: 1800 });
    whoosh(2600, 1500, 0.1, 0.035, 1.2, 0.015, 0.02);
  },
  one_time_pistol: () => { // crack + boom + unpitched room tail + hammer click
    nz({ ft: 'highpass', f0: 700, q: 0.7, dur: 0.05, vol: 0.2, atk: 0.001 });
    nz({ ft: 'lowpass', f0: 4200, f1: 900, dur: 0.1, vol: 0.12, atk: 0.001 });
    thump(190, 0.2, 0.12);
    nz({ ft: 'lowpass', f0: 1800, f1: 400, dur: 0.38, vol: 0.06, delay: 0.03, atk: 0.01, verb: 0.35 });
    click(2100, 0.06, 0.1);
  },
  m4: () => { // a short dry crack with almost no tail: it fires about 11 times a second
    nz({ ft: 'highpass', f0: 1200, q: 0.7, dur: 0.035, vol: 0.13, atk: 0.001 });
    nz({ ft: 'lowpass', f0: 3000, f1: 800, dur: 0.07, vol: 0.09, atk: 0.001 });
    thump(230, 0.12, 0.07);
  },
};

const SHOOT_GAIN = { training_bow: 1.7, basic_crossbow: 1.7, one_time_pistol: 1.4, m4: 1.1 };

// magic: charge (cast begins) and release (bolt leaves the hand)
const CHARGE = {
  training_mage_book: () => { // quick page flutter + a small rising bell
    for (let i = 0; i < 4; i++) nz({ ft: 'bandpass', f0: rnd(3800, 5200), q: 2, dur: 0.035, vol: 0.035, delay: i * 0.025, atk: 0.004 });
    osc({ type: 'sine', f0: 700, f1: 1100, dur: 0.12, vol: 0.04, verb: 0.2 });
  },
  training_staff: () => { // low hum swelling over the slow cast time, with a wavering crystal tone
    osc({ type: 'sawtooth', f0: 110, f1: 330, dur: 0.55, vol: 0.04, lp: 700, atk: 0.2, vib: { rate: 9, depth: 5 } });
    osc({ type: 'sine', f0: 440, f1: 880, dur: 0.55, vol: 0.03, atk: 0.25, verb: 0.2 });
  },
};
const CAST = {
  training_mage_book: () => {
    osc({ type: 'triangle', f0: 1500, f1: 520, dur: 0.09, vol: 0.08 });
    osc({ type: 'sine', f0: 2200, f1: 3000, dur: 0.1, vol: 0.03, delay: 0.015, verb: 0.2 });
    nz({ ft: 'highpass', f0: 5000, dur: 0.04, vol: 0.04 });
  },
  training_staff: () => {
    thump(170, 0.17, 0.2, 0, 0.2);
    osc({ type: 'sawtooth', f0: 280, f1: 80, dur: 0.25, vol: 0.05, lp: 800 });
    nz({ ft: 'lowpass', f0: 2400, f1: 300, dur: 0.3, vol: 0.09, verb: 0.3 });
    [880, 1320, 1760].forEach((f, i) => osc({ type: 'sine', f0: f, dur: 0.35, vol: 0.03, delay: i * 0.03, verb: 0.4 }));
  },
};

// ------------------------------------------------------------------ hits (weapon kind x material)
const HITKIND = {
  training_sword: 'blade', training_claymore: 'heavy', training_spear: 'pierce',
  training_bow: 'arrow', basic_crossbow: 'bolt', one_time_pistol: 'bullet', m4: 'bullet',
  training_mage_book: 'mbolt', training_staff: 'morb',
};
// what the target is made of
function material(m, k) {
  if (m === 'wood') { thump(130, 0.07 * k, 0.1); nz({ ft: 'lowpass', f0: 600, dur: 0.08, vol: 0.05 * k }); return; }
  if (m === 'stone') { click(rnd(900, 1500), 0.06 * k); thump(110, 0.08 * k, 0.1); return; }
  rattle(k > 1.2 ? 4 : 2, 0.05 * k, 0.022, 2400); // bone
  osc({ type: 'sine', f0: 340, f1: 210, dur: 0.05, vol: 0.05 * k });
}
const HIT = {
  blade: (m) => { nz({ ft: 'bandpass', f0: 3400, q: 1, dur: 0.035, vol: 0.09, atk: 0.001 }); thump(rnd(210, 260), 0.11, 0.09); ring(rnd(1500, 2100), 0.03, 0.12); material(m, 1); },
  heavy: (m) => { thump(150, 0.2, 0.15); nz({ ft: 'lowpass', f0: 1500, f1: 350, dur: 0.18, vol: 0.11 }); ring(rnd(800, 1000), 0.04, 0.22); material(m, 1.6); },
  pierce: (m) => { nz({ ft: 'highpass', f0: 4200, dur: 0.025, vol: 0.09, atk: 0.001 }); thump(rnd(260, 320), 0.09, 0.06); click(3000, 0.05, 0.012); material(m, 0.8); },
  arrow: (m) => { thump(320, 0.09, 0.08); nz({ ft: 'bandpass', f0: 1500, q: 1, dur: 0.05, vol: 0.05 }); osc({ type: 'sine', f0: 2100, f1: 1900, dur: 0.06, vol: 0.02 }); material(m, 0.7); },
  bolt: (m) => { thump(240, 0.12, 0.1); click(3500, 0.08); nz({ ft: 'lowpass', f0: 1200, dur: 0.06, vol: 0.06 }); material(m, 0.9); },
  bullet: (m) => { nz({ ft: 'highpass', f0: 3000, dur: 0.02, vol: 0.1, atk: 0.001 }); osc({ type: 'sine', f0: 1800, f1: 900, dur: 0.15, vol: 0.04, verb: 0.2 }); thump(300, 0.07, 0.05); material(m, 0.6); },
  mbolt: () => { osc({ type: 'triangle', f0: 1000, f1: 420, dur: 0.09, vol: 0.07 }); osc({ type: 'sine', f0: 1800, f1: 2400, dur: 0.12, vol: 0.035, delay: 0.02, verb: 0.2 }); nz({ ft: 'highpass', f0: 5000, dur: 0.03, vol: 0.04 }); },
  morb: () => { thump(180, 0.16, 0.2); osc({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.22, vol: 0.05, lp: 700 }); nz({ ft: 'lowpass', f0: 2000, f1: 300, dur: 0.25, vol: 0.1, verb: 0.3 }); osc({ type: 'sine', f0: 880, dur: 0.3, vol: 0.03, verb: 0.4 }); osc({ type: 'sine', f0: 1320, dur: 0.3, vol: 0.025, verb: 0.4 }); },
};
const HIT_GAIN = { blade: 1.8, heavy: 1.9, pierce: 1.7, arrow: 2, bolt: 1.9, bullet: 1.9, mbolt: 3, morb: 1.6 };
// crits add a bright sting on top, so they read as "that one was special" without being louder overall
function critSting() {
  ring(1760, 0.05, 0.2, 0.01, 0.25);
  osc({ type: 'sine', f0: 2640, dur: 0.14, vol: 0.03, delay: 0.04, verb: 0.2 });
  nz({ ft: 'highpass', f0: 6000, dur: 0.05, vol: 0.06 });
  thump(120, 0.12, 0.14);
}

// ------------------------------------------------------------------ the sound table
const SOUNDS = {
  swing: (o) => { cur.vol *= SWING_GAIN[o.weapon] || 2.2; const v = SWING[o.weapon] || SWING.training_sword; v[pickV('swing:' + (o.weapon || ''), v.length)](); },
  heavy: () => SOUNDS.swing({ weapon: 'training_claymore' }),
  hit: (o) => { const k = HITKIND[o.weapon] || 'blade'; cur.vol *= HIT_GAIN[k]; HIT[k](o.mat || 'bone'); if (o.crit) critSting(); },
  crit: (o) => SOUNDS.hit({ ...o, crit: true }),
  shoot: (o) => { cur.vol *= SHOOT_GAIN[o.weapon] || 1.7; (SHOOT[o.weapon] || SHOOT.training_bow)(o); },
  gun: (o) => { cur.vol *= 1.4; SHOOT.one_time_pistol(o); },
  draw: () => { nz({ ft: 'bandpass', f0: 350, f1: 650, q: 4, dur: 0.16, vol: 0.03, atk: 0.06 }); osc({ type: 'triangle', f0: 90, f1: 110, dur: 0.14, vol: 0.02, atk: 0.05 }); },
  charged: () => { osc({ type: 'sine', f0: 1320, dur: 0.09, vol: 0.035, verb: 0.15 }); osc({ type: 'sine', f0: 1980, dur: 0.12, vol: 0.03, delay: 0.05, verb: 0.15 }); },
  reload: () => { click(1800, 0.09); click(2600, 0.08, 0.07); thump(400, 0.05, 0.04, 0.07); },
  magic: (o) => { cur.vol *= o.weapon === 'training_staff' ? 1 : 2.6; (CHARGE[o.weapon] || CHARGE.training_mage_book)(); },
  cast: (o) => { cur.vol *= o.weapon === 'training_staff' ? 1.3 : 2.6; (CAST[o.weapon] || CAST.training_mage_book)(); },

  hurt: () => {
    thump(170, 0.22, 0.16);
    osc({ type: 'sawtooth', f0: 190, f1: 80, dur: 0.2, vol: 0.07, lp: 900 });
    nz({ ft: 'bandpass', f0: 2400, f1: 800, dur: 0.09, vol: 0.08 });
    nz({ ft: 'lowpass', f0: 900, dur: 0.18, vol: 0.07 });
    click(1400, 0.05);
  },
  dodge: () => {
    const v = pickV('dodge', 2);
    whoosh(v ? 2200 : 1800, v ? 700 : 600, 0.16, 0.06, 0.9, 0.03);
    nz({ ft: 'lowpass', f0: 500, dur: 0.04, vol: 0.06 }); // cloth + a soft push-off
  },
  kill: () => { // the last hit lands, then the skeleton comes apart
    thump(rnd(170, 210), 0.13, 0.12);
    rattle(Math.round(rnd(6, 9)), 0.06, 0.028, 2000);
    osc({ type: 'triangle', f0: 330, f1: 90, dur: 0.22, vol: 0.06, delay: 0.02, lp: 900 });
    nz({ ft: 'lowpass', f0: 900, f1: 300, dur: 0.3, vol: 0.06, delay: 0.02, verb: 0.3 });
  },
  eswing: () => { // enemy swing: lower, scrapier than yours, so you can tell whose attack it is
    whoosh(500, 1500, 0.13, 0.07, 1);
    rattle(2, 0.035, 0.03, 1800);
    osc({ type: 'sawtooth', f0: 150, f1: 90, dur: 0.12, vol: 0.03, lp: 500 });
  },
  windup: () => { nz({ ft: 'bandpass', f0: 400, f1: 900, q: 3, dur: 0.18, vol: 0.04, atk: 0.08 }); rattle(2, 0.03, 0.04, 1800); }, // a readable "it's about to swing" tell
  erattle: () => { rattle(2, 0.02, 0.03, 2000); click(320, 0.02, 0.01, 1); },
  notice: () => { rattle(3, 0.045, 0.03, 2000); osc({ type: 'sine', f0: 330, f1: 520, dur: 0.09, vol: 0.045 }); },
  step: () => {
    cur.pan = (pickV('stepside', 2) ? 1 : -1) * 0.1;
    nz({ ft: 'lowpass', f0: rnd(480, 760), dur: 0.05, vol: 0.05, atk: 0.003 });
    osc({ type: 'triangle', f0: 120, f1: 80, dur: 0.04, vol: 0.02 });
  },
  heartbeat: () => { thump(110, 0.08, 0.1); thump(95, 0.05, 0.1, 0.16); },

  xp: (o) => { // rising pentatonic chain: collect a bunch quickly and it climbs
    const f = chainFreq(o.step || 0);
    osc({ type: 'sine', f0: f, dur: 0.16, vol: 0.06, verb: 0.12 });
    osc({ type: 'triangle', f0: f * 2, dur: 0.1, vol: 0.025 });
    nz({ ft: 'highpass', f0: 8000, dur: 0.025, vol: 0.02 });
  },
  pickup: () => {
    osc({ type: 'sine', f0: 880, f1: 1320, dur: 0.1, vol: 0.07 });
    osc({ type: 'sine', f0: 1320, f1: 1760, dur: 0.14, vol: 0.06, delay: 0.07, verb: 0.2 });
    nz({ ft: 'highpass', f0: 6000, dur: 0.04, vol: 0.02 });
  },
  levelup: () => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      osc({ type: 'square', f0: f, dur: 0.2, vol: 0.05, delay: i * 0.085, lp: 3000, verb: 0.25 });
      osc({ type: 'triangle', f0: f * 2, dur: 0.16, vol: 0.025, delay: i * 0.085 + 0.01 });
    });
    [1046.5, 1318.5, 1568].forEach((f) => osc({ type: 'sine', f0: f, dur: 0.7, vol: 0.035, delay: 0.45, verb: 0.35 }));
    thump(130, 0.14, 0.2);
    nz({ ft: 'highpass', f0: 7000, dur: 0.35, vol: 0.03, delay: 0.3, atk: 0.1 });
  },
  chest: () => {
    nz({ ft: 'bandpass', f0: 300, f1: 650, q: 5, dur: 0.22, vol: 0.05, atk: 0.08 }); // lid creak
    thump(150, 0.1, 0.1, 0.05);
    [880, 1175, 1568].forEach((f, i) => osc({ type: 'triangle', f0: f, dur: 0.16, vol: 0.05, delay: 0.12 + i * 0.07, verb: 0.25 }));
  },
  rare: () => {
    [1047, 1319, 1568, 2093].forEach((f, i) => osc({ type: 'sine', f0: f, dur: 0.3, vol: 0.05, delay: i * 0.07, verb: 0.35 }));
    nz({ ft: 'highpass', f0: 7000, dur: 0.4, vol: 0.035, delay: 0.1, atk: 0.1 });
  },
  portal: () => {
    whoosh(180, 2600, 0.5, 0.09, 0.9, 0.25);
    osc({ type: 'sine', f0: 160, f1: 640, dur: 0.5, vol: 0.07, atk: 0.2, verb: 0.3 });
    osc({ type: 'triangle', f0: 240, f1: 960, dur: 0.5, vol: 0.035, delay: 0.04 });
    [1320, 1760].forEach((f) => osc({ type: 'sine', f0: f, dur: 0.4, vol: 0.03, delay: 0.35, verb: 0.4 }));
  },
  skill: () => {
    [440, 660, 880].forEach((f, i) => osc({ type: 'triangle', f0: f, f1: f * 1.02, dur: 0.14, vol: 0.06, delay: i * 0.06, verb: 0.25 }));
    nz({ ft: 'highpass', f0: 6500, dur: 0.15, vol: 0.025, delay: 0.05, atk: 0.04 });
  },
  // ---- feedback sounds for the skill wheel, skills, M4, enemy varieties, focus and lock-on
  tick: (o) => { const up = (o.dir || 1) > 0; osc({ type: 'triangle', f0: up ? 780 : 680, f1: up ? 1060 : 540, dur: 0.05, vol: 0.05 }); click(3400, 0.035); },
  wheelopen: () => { whoosh(260, 1900, 0.24, 0.07, 0.9, 0.1); osc({ type: 'sine', f0: 480, f1: 760, dur: 0.2, vol: 0.04, atk: 0.06, verb: 0.3 }); click(2600, 0.04, 0.02); },
  wheelclose: () => { whoosh(1700, 240, 0.16, 0.05, 0.9, 0.04); osc({ type: 'sine', f0: 700, f1: 420, dur: 0.12, vol: 0.03 }); },
  heal: () => { [523, 659, 784, 1047].forEach((f, i) => osc({ type: 'sine', f0: f, dur: 0.24, vol: 0.045, delay: i * 0.05, verb: 0.35 })); whoosh(1200, 5200, 0.3, 0.02, 1, 0.15); },
  manaup: () => { [660, 990, 1320].forEach((f, i) => osc({ type: 'triangle', f0: f, f1: f * 1.03, dur: 0.2, vol: 0.04, delay: i * 0.045, verb: 0.4 })); nz({ ft: 'highpass', f0: 6000, dur: 0.25, vol: 0.025, delay: 0.04, atk: 0.08 }); },
  buff: () => { osc({ type: 'sawtooth', f0: 180, f1: 420, dur: 0.22, vol: 0.05, lp: 1400, atk: 0.04 }); ring(880, 0.05, 0.25, 0.06); whoosh(500, 3000, 0.2, 0.04, 1, 0.1); },
  shieldup: () => { ring(620, 0.09, 0.32); thump(170, 0.12, 0.12); whoosh(400, 2200, 0.18, 0.04, 1, 0.08); },
  shieldbreak: () => { nz({ ft: 'highpass', f0: 2500, dur: 0.18, vol: 0.1, atk: 0.001 }); ring(900, 0.07, 0.22); osc({ type: 'sawtooth', f0: 400, f1: 90, dur: 0.18, vol: 0.05, lp: 900 }); rattle(4, 0.04, 0.03, 3000); },
  mark: () => { osc({ type: 'square', f0: 1400, dur: 0.05, vol: 0.035, lp: 3200 }); osc({ type: 'square', f0: 1900, dur: 0.07, vol: 0.035, delay: 0.07, lp: 3200, verb: 0.2 }); click(4000, 0.04, 0.07); },
  ready: () => { osc({ type: 'sine', f0: 1320, dur: 0.1, vol: 0.03, verb: 0.2 }); osc({ type: 'sine', f0: 1760, dur: 0.16, vol: 0.03, delay: 0.07, verb: 0.3 }); },
  expire: () => { osc({ type: 'sine', f0: 880, f1: 440, dur: 0.22, vol: 0.03, verb: 0.2 }); whoosh(2400, 500, 0.16, 0.02, 1, 0.05); },
  dry: () => { click(1500, 0.07); click(900, 0.05, 0.016); thump(500, 0.02, 0.03, 0.01); },
  magout: () => { click(900, 0.08); thump(260, 0.07, 0.06, 0.02); click(2000, 0.04, 0.06); },
  lock: () => { osc({ type: 'square', f0: 1500, f1: 1900, dur: 0.03, vol: 0.022, lp: 3500 }); click(3800, 0.03); },
  lockon: () => { osc({ type: 'triangle', f0: 600, dur: 0.05, vol: 0.05 }); osc({ type: 'triangle', f0: 900, dur: 0.08, vol: 0.05, delay: 0.06, verb: 0.2 }); },
  lockoff: () => { osc({ type: 'triangle', f0: 900, dur: 0.05, vol: 0.04 }); osc({ type: 'triangle', f0: 560, dur: 0.09, vol: 0.04, delay: 0.06 }); },
  slam: () => { thump(95, 0.2, 0.2); nz({ ft: 'lowpass', f0: 900, f1: 120, dur: 0.3, vol: 0.12, verb: 0.3 }); rattle(3, 0.04, 0.03, 1200); },
  magewind: () => { osc({ type: 'sine', f0: 240, f1: 720, dur: 0.5, vol: 0.04, atk: 0.3, verb: 0.4, vib: { rate: 9, depth: 8 } }); nz({ ft: 'highpass', f0: 5000, dur: 0.4, vol: 0.02, atk: 0.2 }); },
  aurafade: () => { osc({ type: 'sawtooth', f0: 110, f1: 45, dur: 0.4, vol: 0.06, lp: 700 }); nz({ ft: 'lowpass', f0: 1400, f1: 150, dur: 0.4, vol: 0.05, verb: 0.2 }); },
  overfocus: () => { osc({ type: 'square', f0: 760, f1: 1100, dur: 0.07, vol: 0.03, lp: 2600 }); osc({ type: 'square', f0: 1100, f1: 1500, dur: 0.07, vol: 0.03, delay: 0.07, lp: 2600 }); },
  berserk: () => { // a low growl that distorts, with a heavy thud under it
    osc({ type: 'sawtooth', f0: 90, f1: 50, dur: 0.5, vol: 0.12, dist: true, lp: 900 });
    osc({ type: 'square', f0: 180, f1: 110, dur: 0.35, vol: 0.05, dist: true, lp: 1200 });
    nz({ ft: 'lowpass', f0: 1200, f1: 200, dur: 0.5, vol: 0.08, verb: 0.25 });
    thump(100, 0.18, 0.3);
  },
  deny: () => {
    osc({ type: 'square', f0: 150, f1: 120, dur: 0.07, vol: 0.06, lp: 800 });
    osc({ type: 'square', f0: 140, f1: 100, dur: 0.08, vol: 0.06, delay: 0.09, lp: 800 });
  },
  ui: () => { osc({ type: 'triangle', f0: 700, f1: pickV('ui', 2) ? 900 : 780, dur: 0.04, vol: 0.045 }); click(3000, 0.02); },
  crack: () => {
    nz({ ft: 'lowpass', f0: 1000, f1: 300, dur: 0.14, vol: 0.12 });
    thump(110, 0.14, 0.1);
    for (let i = 0; i < 3; i++) click(rnd(900, 1600), 0.05, rnd(0, 0.08));
  },
  thunder: () => { // a sharp crack, then a long low roll that grumbles and fades
    nz({ ft: 'highpass', f0: 1800, f1: 600, dur: 0.12, vol: 0.05, atk: 0.003, verb: 0.3 });
    nz({ ft: 'lowpass', f0: 900, f1: 120, dur: 1.9, vol: 0.14, atk: 0.12, q: 0.5, verb: 0.5 });
    nz({ ft: 'lowpass', f0: 500, f1: 90, dur: 1.5, vol: 0.1, atk: 0.4, delay: 0.5, q: 0.4, verb: 0.5 });
    osc({ type: 'sine', f0: 62, f1: 34, dur: 1.6, vol: 0.12, atk: 0.1, verb: 0.2 });
    thump(70, 0.16, 0.5, 0.35, 0.3);
  },
  crumble: () => {
    nz({ ft: 'lowpass', f0: 600, f1: 200, dur: 0.7, vol: 0.12, atk: 0.08, verb: 0.3 });
    thump(80, 0.2, 0.3);
    for (let i = 0; i < 8; i++) click(rnd(700, 1800), 0.05, rnd(0.05, 0.55));
  },
};

// per-sound mixing rules: gap = minimum ms between plays, pv = random pitch spread,
// soft = quiet background sounds that duck under big events, prio = never dropped, duck = how hard it ducks soft sounds
const DEF = { gap: 0, pv: 0.06, soft: false, prio: false, duck: 0, g: 1 };
const META = {
  hit: { gap: 30, pv: 0.07 }, crit: { gap: 30, pv: 0.05 }, swing: { gap: 40 }, heavy: { gap: 40 },
  shoot: { gap: 40 }, gun: { gap: 40 }, kill: { gap: 60, prio: true, g: 1.8 },
  hurt: { prio: true, duck: 0.5, pv: 0.05, g: 1.5 },
  levelup: { prio: true, duck: 0.6, pv: 0, g: 1.4 }, berserk: { prio: true, duck: 0.5, pv: 0.03, g: 1.1 }, crumble: { prio: true, duck: 0.4 }, thunder: { prio: true, duck: 0.3, pv: 0.1, g: 1.2 },
  rare: { prio: true, duck: 0.4, pv: 0, g: 1.1 }, portal: { duck: 0.3, pv: 0.02 },
  xp: { gap: 24, pv: 0, soft: true, g: 2.4 }, step: { gap: 60, pv: 0.12, soft: true, g: 6 },
  erattle: { gap: 120, pv: 0.1, soft: true, g: 10 }, heartbeat: { soft: true, pv: 0.02, g: 0.7 },
  notice: { gap: 200, g: 3.5 }, windup: { gap: 150, g: 4 }, eswing: { g: 3 },
  ui: { gap: 30, soft: true, g: 3.5 }, deny: { gap: 80 }, dodge: { g: 3 }, draw: { g: 2.2 }, charged: { g: 1.8 },
  pickup: { g: 1.3 }, skill: { g: 1.3 }, crack: { g: 1.5 },
  tick: { gap: 25, soft: true, g: 3 }, wheelopen: { g: 1.6 }, wheelclose: { g: 2.6, gap: 80 }, heal: { g: 1.4 }, manaup: { g: 1.4 }, buff: { g: 1.4 }, shieldup: { g: 1.3 }, shieldbreak: { g: 1.4 },
  mark: { g: 1.5 }, ready: { g: 1.6, gap: 300 }, expire: { g: 2.6, gap: 200 }, dry: { gap: 120, g: 4.5 }, magout: { g: 1.8 }, lock: { gap: 90, soft: true, g: 3 }, lockon: { g: 1.8 }, lockoff: { g: 1.8 },
  slam: { gap: 120, g: 1.8 }, magewind: { gap: 200, g: 1.2 }, aurafade: { g: 1.4 }, overfocus: { gap: 250, g: 2 },
};

// where a sound comes from in the world → volume + stereo position relative to the player
function spatial(at) {
  const p = G.scene && G.scene.player && G.scene.player.sprite;
  if (!p) return { vol: 1, pan: 0 };
  const dx = at.x - p.x, dy = at.y - p.y;
  const vol = distanceGain(Math.hypot(dx, dy), 50, 360, 0);
  if (vol <= 0.02) return null;
  return { vol, pan: panFor(dx) };
}

function duck(amount) {
  const t = ctx.currentTime;
  duckG.gain.cancelScheduledValues(t);
  duckG.gain.setTargetAtTime(1 - amount, t, 0.01);
  duckG.gain.setTargetAtTime(1, t + 0.28, 0.15);
}

/**
 * Play a sound. Options (all optional):
 *   weapon  weapon id → picks the weapon's own swing / shot / hit sound
 *   mat     'bone' | 'wood' | 'stone' → what got hit
 *   crit    true → adds the crit sting
 *   power   0..1 charge amount (bow)
 *   step    pickup chain position (xp)
 *   at      {x,y} world position → volume falls off and pans with distance
 *   vol     extra volume multiplier
 */
export function sfx(name, o = {}) {
  if (G.muted) return;
  if (sfxOut && G.settings.sfxVol != null) setSfxVolume(G.settings.sfxVol);
  const fn = SOUNDS[name];
  if (!fn) return;
  const m = META[name] || DEF;
  const now = performance.now();
  if (m.gap && now - (lastAt[name] || -1e9) < m.gap) return;
  try {
    if (!audio() || !bus) return;
    lastAt[name] = now;
    cur.vol = (o.vol == null ? 1 : o.vol) * (m.g || 1);
    cur.pan = 0;
    cur.pitch = (o.pitch == null ? 1 : o.pitch) * (1 + rnd(-1, 1) * (m.pv == null ? DEF.pv : m.pv));
    cur.soft = !!m.soft;
    cur.prio = !!m.prio;
    if (o.at) {
      const s = spatial(o.at);
      if (!s) return;
      cur.vol *= s.vol; cur.pan = s.pan;
    }
    if (m.duck) duck(m.duck);
    fn(o);
  } catch (e) { /* audio can fail silently */ }
}
