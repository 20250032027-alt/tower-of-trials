// Generative music engine (WebAudio, no audio files).
//
// Design (from how adaptive game music is built):
//  * VERTICAL LAYERING: a dungeon track is many synchronized layers (drone, pad, hollow flute, drips ... + pulse, hats,
//    drums, arp, stabs). They share one clock and one key, and only their volumes move, so going from exploring to
//    fighting never needs a track switch and never falls out of time.
//  * A recurring four-note motif (D F A G) appears in different voices on every track so the soundtrack feels like one world.
//  * Loops are 8 bars with small random variations each pass so they do not wear out.
//  * The mix leaves headroom for sound effects: music sits under a shared limiter, ducks for big events, and muffles
//    (low-pass) while a menu is open.
import { mtof } from '../logic/musictheory.js';
import { TRACKS, DUNGEON_FAMILY } from '../logic/musictheory.js';
import { SCHEDULE, FX, LEVELS, STINGERS } from './tracks.js';

const LOOKAHEAD = 0.2;
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ instruments
// Every instrument is (env, destination, notes, t, dur, vol, player) and builds a tiny one-shot node graph.
function osc(c, type, f, t, dur, detune = 0) {
  const o = c.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.value = detune;
  o.start(t); o.stop(t + dur);
  return o;
}
function env(p, t, vol, atk, hold, rel) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(Math.max(0.0002, vol), t + atk);
  p.setValueAtTime(Math.max(0.0002, vol), t + atk + Math.max(0, hold));
  p.exponentialRampToValueAtTime(0.0001, t + atk + Math.max(0, hold) + rel);
}

const INST = {
  // warm slow string-like pad: detuned saws through a filter that opens and closes over the chord
  pad(e, d, notes, t, dur, vol, p) {
    const c = e.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.4;
    f.frequency.setValueAtTime(420, t);
    f.frequency.linearRampToValueAtTime(p.wide ? 900 : 1150, t + dur * 0.55);
    f.frequency.linearRampToValueAtTime(520, t + dur);
    const atk = Math.min(1.4, dur * 0.3), rel = Math.min(1.8, dur * 0.4);
    env(g.gain, t, vol / Math.sqrt(notes.length), atk, dur - atk - rel, rel);
    const det = p.wide || 8;
    for (const m of notes) for (const dt of [-det, det]) osc(c, 'sawtooth', mtof(m), t, dur + 0.05, dt).connect(f);
    f.connect(g); g.connect(d);
  },
  // very low, very slow bed
  drone(e, d, notes, t, dur, vol) {
    const c = e.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.6;
    const atk = Math.min(2, dur * 0.3), rel = Math.min(2.5, dur * 0.4);
    env(g.gain, t, vol / notes.length, atk, dur - atk - rel, rel);
    // sine + saw on the note, plus a triangle an octave up so the drone still reads on small phone speakers
    for (const m of notes) {
      osc(c, 'sawtooth', mtof(m), t, dur + 0.05, -5).connect(f); osc(c, 'sine', mtof(m), t, dur + 0.05).connect(f);
      const up = osc(c, 'triangle', mtof(m + 12), t, dur + 0.05, 4), ug = c.createGain(); ug.gain.value = 0.7; up.connect(ug); ug.connect(f);
    }
    f.connect(g); g.connect(d);
  },
  // "ahh" voices: saws through vowel formants, slow vibrato
  choir(e, d, notes, t, dur, vol) {
    const c = e.ctx, g = c.createGain(), mix = c.createGain();
    const atk = Math.min(1.1, dur * 0.35), rel = Math.min(1.6, dur * 0.4);
    env(g.gain, t, vol / Math.sqrt(notes.length), atk, dur - atk - rel, rel);
    for (const m of notes) {
      const o = osc(c, 'sawtooth', mtof(m), t, dur + 0.05);
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = rnd(4.4, 5.4); lg.gain.value = 9; l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.05);
      o.connect(mix);
    }
    [[650, 1], [1080, 0.6], [2600, 0.15]].forEach(([fq, w]) => {
      const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fq; b.Q.value = 6;
      const bg = c.createGain(); bg.gain.value = w * 2.2;
      mix.connect(b); b.connect(bg); bg.connect(g);
    });
    g.connect(d);
  },
  pluck(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain(), mix = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(520, t + 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc(c, 'triangle', mtof(m), t, dur + 0.05).connect(mix);
    const s = osc(c, 'square', mtof(m), t, dur + 0.05, 6); const sg = c.createGain(); sg.gain.value = 0.3; s.connect(sg); sg.connect(mix);
    mix.connect(f); f.connect(g); g.connect(d);
  },
  // music box: bright, short, slightly inharmonic
  bell(e, d, m, t, dur, vol) {
    const c = e.ctx, g = c.createGain();
    g.gain.value = 1; g.connect(d);
    [[1, 1, 1], [2.76, 0.32, 0.5], [5.4, 0.1, 0.28]].forEach(([r, w, dd]) => {
      const pg = c.createGain();
      pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(vol * w, t + 0.003); pg.gain.exponentialRampToValueAtTime(0.0001, t + dur * dd);
      osc(c, 'sine', mtof(m) * r, t, dur * dd + 0.05).connect(pg); pg.connect(g);
    });
  },
  // deep tower bell
  toll(e, d, m, t, dur, vol) {
    const c = e.ctx, g = c.createGain();
    g.gain.value = 1; g.connect(d);
    [[1, 1, 1], [2, 0.55, 0.7], [2.4, 0.45, 0.55], [3, 0.3, 0.4], [4.2, 0.2, 0.28]].forEach(([r, w, dd]) => {
      const pg = c.createGain();
      pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(vol * w, t + 0.01); pg.gain.exponentialRampToValueAtTime(0.0001, t + dur * dd);
      osc(c, 'sine', mtof(m) * r, t, dur * dd + 0.05).connect(pg); pg.connect(g);
    });
  },
  bass(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc(c, 'sine', mtof(m), t, dur + 0.05).connect(f);
    const tr = osc(c, 'triangle', mtof(m + 12), t, dur + 0.05); const tg = c.createGain(); tg.gain.value = 0.35; tr.connect(tg); tg.connect(f);
    f.connect(g); g.connect(d);
  },
  // gritty bass for the fight pulse
  pulse(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc(c, 'sawtooth', mtof(m), t, dur + 0.05).connect(f);
    osc(c, 'sine', mtof(m - 12 < 24 ? m : m - 12), t, dur + 0.05).connect(f);
    f.connect(g); g.connect(d);
  },
  // 25% pulse wave lead (the "chiptune" voice)
  lead(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.5;
    const o = c.createOscillator(); o.setPeriodicWave(e.pulse25); o.frequency.setValueAtTime(mtof(m), t);
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + Math.min(0.3, dur)); l.connect(lg); lg.connect(o.detune);
    env(g.gain, t, vol, 0.012, Math.max(0, dur - 0.14), 0.12);
    o.start(t); o.stop(t + dur + 0.05); l.start(t); l.stop(t + dur + 0.05);
    o.connect(f); f.connect(g); g.connect(d);
  },
  // short pulse for fast arps
  chip(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = c.createOscillator(); o.setPeriodicWave(e.pulse25); o.frequency.setValueAtTime(mtof(m), t); o.start(t); o.stop(t + dur + 0.03);
    o.connect(f); f.connect(g); g.connect(d);
  },
  // hollow flute: breathy triangle with a little vibrato
  hollow(e, d, m, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 0.6;
    const a = Math.min(0.12, dur * 0.3), r = Math.min(0.5, dur * 0.5);
    env(g.gain, t, vol, a, dur - a - r, r);
    const o = osc(c, 'triangle', mtof(m), t, dur + 0.05);
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 4.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + dur * 0.6); l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.05);
    const o2 = osc(c, 'sine', mtof(m) * 2, t, dur + 0.05); const og = c.createGain(); og.gain.value = 0.12; o2.connect(og); og.connect(f);
    const n = c.createBufferSource(); n.buffer = e.noise; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = mtof(m) * 2; nf.Q.value = 4;
    const ng = c.createGain(); ng.gain.value = 0.06; n.connect(nf); nf.connect(ng); ng.connect(f); n.start(t, rnd(0, 2), dur + 0.05);
    o.connect(f); f.connect(g); g.connect(d);
  },
  // staccato strings
  stab(e, d, notes, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / Math.sqrt(notes.length), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const m of notes) for (const dt of [-6, 6]) osc(c, 'sawtooth', mtof(m), t, dur + 0.05, dt).connect(f);
    f.connect(g); g.connect(d);
  },
  // a water drip in the dark: a quick pitched ping
  drip(e, d, m, t, dur, vol) {
    const c = e.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = c.createOscillator(); o.frequency.setValueAtTime(mtof(m) * 1.03, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.05);
    o.start(t); o.stop(t + dur + 0.05); o.connect(g); g.connect(d);
  },
  // wind / riser: filtered noise that swells and fades
  swell(e, d, _n, t, dur, vol) {
    const c = e.ctx, f = c.createBiquadFilter(), g = c.createGain(), s = c.createBufferSource();
    f.type = 'bandpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1700, t + dur * 0.6); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    env(g.gain, t, vol, dur * 0.45, 0, dur * 0.55);
    s.buffer = e.noise; s.start(t, rnd(0, 1.5), Math.min(dur + 0.1, 2.9));
    s.connect(f); f.connect(g); g.connect(d);
  },
};

// drums: (env, destination, t, vol)
const DRUM = {
  kick(e, d, t, vol) {
    const c = e.ctx, g = c.createGain(), o = c.createOscillator();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.start(t); o.stop(t + 0.34); o.connect(g); g.connect(d);
    noiseHit(e, d, t, 0.012, 'highpass', 2500, vol * 0.4);
  },
  // "bone clack": a snare made of dry noise + a woody body
  snare(e, d, t, vol) {
    noiseHit(e, d, t, 0.17, 'bandpass', 1900, vol, 0.8);
    const c = e.ctx, g = c.createGain(), o = c.createOscillator();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.1);
    g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.start(t); o.stop(t + 0.16); o.connect(g); g.connect(d);
  },
  hat(e, d, t, vol) { noiseHit(e, d, t, 0.05, 'highpass', 7000, vol); },
  ohat(e, d, t, vol) { noiseHit(e, d, t, 0.2, 'highpass', 6500, vol); },
  tom(e, d, t, vol, pitch = 1) {
    const c = e.ctx, g = c.createGain(), o = c.createOscillator();
    o.frequency.setValueAtTime(210 * pitch, t); o.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.22);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.32); o.connect(g); g.connect(d);
    noiseHit(e, d, t, 0.05, 'lowpass', 900, vol * 0.5);
  },
  tick(e, d, t, vol) { // dry woodblock
    const c = e.ctx, g = c.createGain(), o = c.createOscillator();
    o.type = 'triangle'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.04);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.start(t); o.stop(t + 0.08); o.connect(g); g.connect(d);
  },
};
function noiseHit(e, d, t, dur, type, freq, vol, q = 0.7) {
  const c = e.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.buffer = e.noise; s.start(t, rnd(0, 2), dur + 0.02);
  s.connect(f); f.connect(g); g.connect(d);
}

// ------------------------------------------------------------------ one playing track
class Player {
  constructor(engine, name, mood, def) {
    this.e = engine;
    this.name = name;
    this.def = def || TRACKS[name];
    this.mood = mood || name;
    const c = engine.ctx;
    this.beat = 60 / this.def.bpm;
    this.stepDur = this.beat / 4;
    this.barDur = this.beat * 4;
    this.step = 0;
    this.nextT = c.currentTime + 0.12;
    this.state = {};
    this.wide = this.mood === 'rift' ? 24 : 0;
    this.intensity = 0;
    this.layers = {};
    this.fx = FX[name] || {};
    this.levels = LEVELS[name] || {};
    this.out = c.createGain(); this.out.gain.value = 0.0001;
    // stingers skip the duck/muffle (they ARE the thing the music ducks for) and use their own reverb
    this.out.connect(this.mood === 'stinger' ? engine.stingIn : engine.musicIn);
    // dotted-eighth echo shared by this player's layers
    this.delayIn = c.createGain();
    const dl = c.createDelay(2), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
    dl.delayTime.value = this.beat * 0.75; fb.gain.value = 0.36; lp.type = 'lowpass'; lp.frequency.value = 2200; wet.gain.value = 0.55;
    this.delayIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(this.out);
    this.dead = false;
  }

  levelOf(layer, intensity = this.intensity) {
    const l = this.levels[layer];
    return l ? l[Math.min(l.length - 1, intensity)] : 1;
  }
  on(layer) { return this.levelOf(layer) > 0.02; }

  layer(name) {
    let l = this.layers[name];
    if (l) return l;
    const c = this.e.ctx, fx = this.fx[name] || {};
    const g = c.createGain(); g.gain.value = this.levelOf(name) * (fx.vol == null ? 1 : fx.vol);
    g.connect(this.out);
    if (fx.rev) { const s = c.createGain(); s.gain.value = fx.rev; g.connect(s); s.connect(this.mood === 'stinger' ? this.e.stingVerb : this.e.reverbIn); }
    if (fx.dly) { const s = c.createGain(); s.gain.value = fx.dly; g.connect(s); s.connect(this.delayIn); }
    l = this.layers[name] = { g, fx };
    return l;
  }

  play(layer, inst, notes, t, dur, vol) {
    if (!this.on(layer)) return;
    INST[inst](this.e, this.layer(layer).g, notes, t, dur, vol, this);
  }
  hit(layer, drum, t, vol, extra) {
    if (!this.on(layer)) return;
    DRUM[drum](this.e, this.layer(layer).g, t, vol, extra);
  }

  setIntensity(level, when = this.e.ctx.currentTime, tc = 0.5) {
    this.intensity = level;
    for (const [name, l] of Object.entries(this.layers)) {
      l.g.gain.cancelScheduledValues(when);
      l.g.gain.setTargetAtTime(this.levelOf(name, level) * (l.fx.vol == null ? 1 : l.fx.vol), when, tc);
    }
  }

  // schedule everything that falls before `until`
  tick(until) {
    const now = this.e.ctx.currentTime;
    const sched = SCHEDULE[this.name];
    const total = this.def.bars * 16;
    while (this.nextT < until && !this.dead) {
      const loop = Math.floor(this.step / total);
      const inLoop = this.step % total;
      if (this.nextT >= now - 0.05 && sched) sched(this, Math.floor(inLoop / 16), inLoop % 16, this.nextT, loop);
      this.nextT += this.stepDur;
      this.step++;
    }
  }

  fade(to, secs, when = this.e.ctx.currentTime) {
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), when);
    this.out.gain.linearRampToValueAtTime(Math.max(0.0001, to), when + secs);
  }
}

// ------------------------------------------------------------------ the engine
export class MusicEngine {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.cur = null;
    this.players = [];
    this.intensity = 0;
    this.volume = 0.7;
    this.muted = false;
    this.ducking = false;

    // chain: players -> musicIn -> tone (menu muffle) -> duck -> level -> dest
    this.musicIn = ctx.createGain();
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 20000; this.tone.Q.value = 0.4;
    this.duckG = ctx.createGain();
    this.level = ctx.createGain();
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 55; this.hp.Q.value = 0.5;
    this.musicIn.connect(this.hp); this.hp.connect(this.tone); this.tone.connect(this.duckG); this.duckG.connect(this.level); this.level.connect(dest);
    this.applyLevel(true);

    // shared dark hall reverb for the whole soundtrack
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.22; d[i] = lp * (1 - i / len) ** 3; }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    this.reverbIn = ctx.createGain();
    const rOut = ctx.createGain(); rOut.gain.value = 0.9;
    this.reverbIn.connect(conv); conv.connect(rOut); rOut.connect(this.musicIn);
    // stingers: straight to the level control, with their own copy of the hall
    this.stingIn = ctx.createGain(); this.stingIn.connect(this.level);
    this.stingVerb = ctx.createGain();
    const conv2 = ctx.createConvolver(); conv2.buffer = ir; this.stingVerb.connect(conv2); conv2.connect(this.stingIn);

    this.noise = ctx.createBuffer(1, sr * 3, sr);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // 25% pulse wave for the chip voices
    const N = 32, re = new Float32Array(N), im = new Float32Array(N), duty = 0.25;
    for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    this.pulse25 = ctx.createPeriodicWave(re, im);
  }

  // slider 0..1 -> gain (curved so the middle of the slider is a sensible level)
  applyLevel(immediate = false) {
    const target = this.muted ? 0.0001 : Math.max(0.0001, this.volume ** 1.6 * 0.2);
    const t = this.ctx.currentTime;
    this.level.gain.cancelScheduledValues(t);
    if (immediate) this.level.gain.setValueAtTime(target, t); else this.level.gain.setTargetAtTime(target, t, 0.08);
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyLevel(); }
  setMuted(m) { if (m !== this.muted) { this.muted = m; this.applyLevel(); } }

  muffle(on) {
    const t = this.ctx.currentTime;
    this.tone.frequency.cancelScheduledValues(t);
    this.tone.frequency.setTargetAtTime(on ? 700 : 20000, t, on ? 0.12 : 0.2);
    this.duckG.gain.cancelScheduledValues(t);
    this.duckG.gain.setTargetAtTime(on ? 0.7 : 1, t, 0.15);
  }

  duck(amount, hold = 1.5) {
    const t = this.ctx.currentTime;
    this.duckG.gain.cancelScheduledValues(t);
    this.duckG.gain.setTargetAtTime(1 - amount, t, 0.05);
    this.duckG.gain.setTargetAtTime(1, t + hold, 0.5);
  }

  // start (or crossfade to) a track. `mood` selects a variation (e.g. dungeon art on a vault/rift)
  play(name, { fade = 1.8, mood = name } = {}) {
    if (this.cur && this.cur.name === name && this.cur.mood === mood) return this.cur;
    const prev = this.cur;
    const p = new Player(this, name, mood);
    p.setIntensity(DUNGEON_FAMILY.includes(name) ? this.intensity : 0, this.ctx.currentTime, 0.01);
    p.fade(p.def.trim || 1, fade);   // per-track trim evens out how loud each track sits
    this.cur = p;
    this.players.push(p);
    if (prev) {
      prev.fade(0.0001, fade * 0.9);
      prev.dead = true;
      setTimeout(() => this.drop(prev), (fade + 3) * 1000);
    }
    return p;
  }
  drop(p) {
    p.dead = true;
    try { p.out.disconnect(); } catch (e) { /* already gone */ }
    this.players = this.players.filter((x) => x !== p);
  }
  stop(fade = 1.2) {
    if (!this.cur) return;
    const p = this.cur; this.cur = null;
    p.fade(0.0001, fade); p.dead = true;
    setTimeout(() => this.drop(p), (fade + 3) * 1000);
  }

  setIntensity(level, tc = 0.6) {
    this.intensity = level;
    if (this.cur && DUNGEON_FAMILY.includes(this.cur.name)) this.cur.setIntensity(level, this.ctx.currentTime, tc);
  }

  // one-off musical moments over the top of the current music
  stinger(name, at = this.ctx.currentTime + 0.05) {
    const fn = STINGERS[name];
    if (!fn) return;
    const p = new Player(this, 'stinger_' + name, 'stinger', { bpm: 60, bars: 1, prog: [], key: 'D', scale: 'minor' });
    p.fx = FX.stinger; p.levels = {};
    p.out.gain.value = 3.6;           // stingers are the moment: a good deal louder than the bed
    p.nextT = at;
    fn(p, at, this);
    setTimeout(() => this.drop(p), 14000);
  }

  tickAll() {
    const until = this.ctx.currentTime + LOOKAHEAD;
    for (const p of this.players) p.tick(until);
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.tickAll(), 40); }
  halt() { clearInterval(this.timer); this.timer = null; }

  // offline rendering (tests/previews): schedule `seconds` of the current player in one go
  renderAhead(seconds) {
    for (const p of this.players) p.tick(seconds);
  }
}

export { INST, DRUM };
