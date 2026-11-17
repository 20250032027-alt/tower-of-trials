// The score: what every track plays, bar by bar. Each scheduler is called for every 16th-note step
// (bar 0-7, step 0-15) and decides which notes start at that moment. All of it comes from the
// progressions and the motif in logic/musictheory.js so the tracks stay in key together.
import {
  MOTIF, DUNGEON_LEVELS, voicing, chordTone, bassNote, inScale,
} from '../logic/musictheory.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pickDifferent = (state, key, n) => {
  let i = Math.floor(Math.random() * n);
  if (i === state[key]) i = (i + 1) % n;
  state[key] = i;
  return i;
};
const scaleCache = {};
function scaleNotes(key, scale, lo, hi) {
  const k = [key, scale, lo, hi].join();
  if (!scaleCache[k]) { const out = []; for (let m = lo; m <= hi; m++) if (inScale(m, key, scale)) out.push(m); scaleCache[k] = out; }
  return scaleCache[k];
}
// over the A major chord the 7th is raised (C#), so pings use the harmonic-minor colour there
const aScale = (p, ch) => (ch[0] === 'A' && ch[1] === 'maj' && p.def.scale === 'minor' ? 'harmonic' : p.def.scale);
const human = () => rnd(0, 0.012); // tiny timing looseness so plucks do not feel machine-gunned

// ------------------------------------------------------------------ TITLE (68 BPM, D minor)
// A tolling bell, a slow pad, distant voices and a music box calling the four-note motif. The A major chord
// (with its C#) leans back toward D, so the loop always feels like it is about to open a door.
function title(p, bar, s, t) {
  const ch = p.def.prog[bar], B = p.beat, barD = p.barDur;
  if (s === 0) {
    p.play('pad', 'pad', voicing(ch, 50), t, barD + 1.4, 0.16);
    p.play('bass', 'bass', bassNote(ch, 36), t, B * 3.6, 0.2);
    if (bar % 2 === 0) p.play('choir', 'choir', [chordTone(ch, 0, 62), chordTone(ch, 2, 62)], t, barD * 2 + 0.6, 0.07);
    if (bar === 0 || bar === 4) p.play('bell', 'toll', 50, t, 7, 0.11);
    if (bar === 2 || bar === 6) p.play('amb', 'swell', null, t, barD * 1.9, 0.05);
    p.state.pat = pickDifferent(p.state, 'pat', 3);
  }
  if (s === 10 && bar % 2 === 0) p.play('bass', 'bass', chordTone(ch, 2, 36), t, B * 1.6, 0.1);

  // shimmering arpeggio (rests while the music box has the tune)
  if (s % 2 === 0 && bar !== 0 && bar !== 4) {
    const PATS = [[0, 1, 2, 1, 2, 1, 0, 1], [0, 2, 1, 2, 0, 2, 1, 2], [2, 1, 0, 1, 2, 3, 2, 1]];
    if (s === 0 || Math.random() > 0.18) p.play('arp', 'pluck', chordTone(ch, PATS[p.state.pat || 0][s / 2], 62), t + human(), 0.6, s % 8 === 0 ? 0.085 : 0.065);
  }

  // the call of the Tower
  if (bar === 0 && s % 4 === 0) p.play('motif', 'bell', 62 + MOTIF[s / 4], t, 2.4, 0.1);                       // D F A G
  if (bar === 1 && (s === 0 || s === 8)) p.play('motif', 'bell', s === 0 ? 65 : 62, t, 2.4, 0.09);            // F ... D
  if (bar === 4 && s % 4 === 0) p.play('motif', 'bell', 74 + MOTIF[s / 4], t, 2.4, 0.09);                       // the same, an octave up
  if (bar === 5 && (s === 0 || s === 6 || s === 10)) p.play('motif', 'bell', s === 0 ? 69 : s === 6 ? 67 : 65, t, 2.4, 0.09); // A G F
  if (bar === 7 && (s === 0 || s === 8)) p.play('motif', 'bell', s === 0 ? 76 : 73, t, 2.8, 0.1);              // E C#: pulls home to D
}

// ------------------------------------------------------------------ HUB (86 BPM, D dorian)
function hub(p, bar, s, t) {
  const ch = p.def.prog[bar], B = p.beat, barD = p.barDur;
  if (s === 0) {
    p.play('pad', 'pad', voicing(ch, 50), t, barD + 1.0, 0.11);
    p.play('bass', 'bass', bassNote(ch, 36), t, B * 1.7, 0.2);
    p.state.pat = pickDifferent(p.state, 'pat', 3);
  }
  if (s === 8) p.play('bass', 'bass', chordTone(ch, 2, 36), t, B * 1.5, 0.15);
  if (s === 12 && bar % 2 === 1) p.play('bass', 'bass', bassNote(ch, 36), t, B * 0.9, 0.1);

  // plucked broken chords
  if (s % 2 === 0) {
    const PATS = [[0, 1, 2, 1, 0, 1, 2, 3], [0, 2, 1, 2, 0, 2, 3, 2], [2, 1, 0, 1, 2, 3, 2, 1]];
    if (s === 0 || Math.random() > 0.1) p.play('arp', 'pluck', chordTone(ch, PATS[p.state.pat || 0][s / 2], 60), t + human(), 0.5, s % 8 === 0 ? 0.075 : 0.055);
  }
  // soft woodblock on 2 and 4, whisper of hat between
  if (s === 4 || s === 12) p.hit('tick', 'tick', t, 0.05);
  if (s % 4 === 2) p.hit('tick', 'hat', t, 0.012);

  // music-box motif on bars 1 and 5, a hopeful pulse-wave tune on 3-4 and 7-8
  if ((bar === 0 || bar === 4) && s % 4 === 0) p.play('motif', 'bell', 74 + MOTIF[s / 4], t, 2.0, 0.09);
  const LEAD = {
    2: [[0, 76], [4, 79], [8, 76], [12, 74]],
    3: [[0, 72], [4, 76], [8, 74], [12, 69]],
    6: [[0, 79], [4, 76], [8, 72], [12, 76]],
    7: [[0, 74], [6, 71], [10, 67]],
  };
  if (LEAD[bar]) for (const [st, m] of LEAD[bar]) if (st === s) p.play('lead', 'lead', m, t, p.stepDur * 3.6, 0.07);
}

// ------------------------------------------------------------------ DUNGEON FAMILY (64 / 60 / 56 BPM)
// Exploring is almost nothing: a drone, a slow pad, a lonely flute fragment, water drips and a far-off bell.
// The fight layers (pulse, hats, drums, arp, stabs) are written on the same grid and harmony and fade in over it.
const MOODS = {
  dungeon: { drone: [38, 45], drip: 0.012, sparkle: 0 },
  vault: { drone: [38, 45], drip: 0.016, sparkle: 0.024 },
  rift: { drone: [38, 44], drip: 0.026, sparkle: 0, riser: true }, // D + Ab: a tritone
};
const ARPS = [
  [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1],
  [0, 2, 1, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 2],
  [3, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1, 0, 1, 2, 1, 0],
];
function dungeonLike(p, bar, s, t) {
  const m = MOODS[p.mood] || MOODS.dungeon;
  const ch = p.def.prog[bar], B = p.beat, barD = p.barDur, st = p.state;

  if (s === 0) {
    if (bar % 2 === 0) {
      p.play('drone', 'drone', [m.drone[0]], t, barD * 2 + 1.5, 0.12);
      p.play('drone', 'drone', [m.drone[1]], t + 0.4, barD * 2 + 1.1, m.drone[1] === 44 ? 0.04 : 0.09); // rift: the tritone is only a shadow
    }
    p.play('pad', 'pad', voicing(ch, 50), t, barD + 1.6, 0.13);
    if (bar === 0 || bar === 4) p.play('bell', 'toll', 50, t, 8, bar === 0 ? 0.1 : 0.07);
    if (bar === 2 || bar === 6) p.play('amb', 'swell', null, t, barD * 1.8, 0.035);
    if (m.riser && bar === 7) p.play('amb', 'swell', null, t, barD, 0.045);
    st.arp = pickDifferent(st, 'arp', ARPS.length);
    // maybe a lonely flute fragment this bar-pair
    if (bar % 2 === 0) {
      st.frag = null;
      if (Math.random() < 0.65) {
        if (bar === 0) st.frag = Math.random() < 0.5 ? [62, 65, 69, 67] : [65, p.def.scale === 'phrygian' ? 63 : 64, 62];   // the motif, or its answer (F E D)
        else st.frag = [chordTone(ch, 1, 62), chordTone(ch, 2, 62), chordTone(ch, 0, 62)].slice(0, 2 + Math.floor(Math.random() * 2));
      }
    }
  }
  if (st.frag && bar % 2 === 0 && s % 4 === 0 && s / 4 < st.frag.length) p.play('hollow', 'hollow', st.frag[s / 4], t, B * 1.25, 0.075);

  // water drips (never closer than ~1 s apart)
  if (Math.random() < m.drip && t - (st.lastDrip || -9) > 1.0) {
    st.lastDrip = t;
    const notes = scaleNotes(p.def.key, aScale(p, ch), 74, 91);
    p.play('drip', 'drip', notes[Math.floor(Math.random() * notes.length)], t, 0.7, rnd(0.03, 0.06));
  }
  if (m.sparkle && Math.random() < m.sparkle && t - (st.lastSpark || -9) > 0.7) {
    st.lastSpark = t;
    const notes = scaleNotes(p.def.key, aScale(p, ch), 74, 88);
    p.play('bell', 'bell', notes[Math.floor(Math.random() * notes.length)], t, 1.6, 0.05);
  }

  // ---- fight layers
  if (s % 2 === 0) {
    const i = s / 2, PAT = [0, 0, 0, 12, 0, 0, 7, 0];
    p.play('pulse', 'pulse', bassNote(ch, 36) + PAT[i], t, i === 0 ? 0.3 : 0.18, i % 4 === 0 ? 0.2 : 0.11);
  }
  p.hit('hats', s === 14 ? 'ohat' : 'hat', t, s % 4 === 2 ? 0.05 : 0.03);
  if (s === 0 || s === 6 || s === 10) p.hit('drums', 'kick', t, s === 0 ? 0.34 : 0.24);
  if (bar % 4 === 3 && s >= 12) p.hit('drums', 'tom', t, 0.2, 1.3 - (s - 12) * 0.14);
  else if (s === 4 || s === 12) p.hit('drums', 'snare', t, 0.2);
  if (p.on('arp') && (s === 0 || Math.random() > 0.1)) p.play('arp', 'chip', chordTone(ch, ARPS[st.arp || 0][s], 62), t + human() * 0.5, 0.16, s % 4 === 0 ? 0.04 : 0.028);
  if (s === 0 && bar % 2 === 0) p.play('stab', 'stab', voicing(ch, 55), t, 0.4, 0.12);
  if (s === 8 && p.levelOf('stab') >= 0.99) p.play('stab', 'stab', voicing(ch, 55), t, 0.3, 0.08);
}

export const SCHEDULE = { title, hub, dungeon: dungeonLike, vault: dungeonLike, rift: dungeonLike };

// ------------------------------------------------------------------ mixing: how much of each layer goes to reverb/echo, and layer levels
const DUNGEON_FX = {
  drone: { rev: 0.2 }, pad: { rev: 0.55 }, hollow: { rev: 0.6, dly: 0.5, vol: 1.3 }, drip: { rev: 0.7, dly: 0.6 }, bell: { rev: 0.7 }, amb: { rev: 0.5 },
  pulse: { rev: 0.05, vol: 1.5 }, hats: { rev: 0.1, vol: 1.6 }, drums: { rev: 0.18, vol: 1.3 }, arp: { rev: 0.2, dly: 0.35, vol: 1.8 }, stab: { rev: 0.3, dly: 0.2, vol: 1.5 },
};
export const FX = {
  title: { pad: { rev: 0.5 }, choir: { rev: 0.7 }, bass: { rev: 0.1 }, arp: { rev: 0.35, dly: 0.5 }, motif: { rev: 0.5, dly: 0.4 }, bell: { rev: 0.6 }, amb: { rev: 0.4 } },
  hub: { pad: { rev: 0.35 }, bass: { rev: 0.05 }, arp: { rev: 0.25, dly: 0.35 }, tick: { rev: 0.1 }, motif: { rev: 0.4, dly: 0.3 }, lead: { rev: 0.3, dly: 0.35 } },
  dungeon: DUNGEON_FX,
  vault: DUNGEON_FX,
  rift: { ...DUNGEON_FX, pad: { rev: 0.7 }, drip: { rev: 0.8, dly: 0.7 } },
  stinger: { st: { rev: 0.5, dly: 0.25 } },
};
export const LEVELS = { dungeon: DUNGEON_LEVELS, vault: DUNGEON_LEVELS, rift: DUNGEON_LEVELS };

// ------------------------------------------------------------------ stingers (one-off musical moments)
export const STINGERS = {
  // dungeon cleared: a bright D major arpeggio blooming into a warm chord
  clear(p, t, e) {
    [62, 66, 69, 74, 78, 81].forEach((m, i) => p.play('st', 'bell', m, t + i * 0.11, 1.8, 0.13));
    p.play('st', 'pad', voicing(['D', 'maj7'], 50), t, 4.2, 0.14);
    p.play('st', 'toll', 50, t, 6, 0.12);
    p.play('st', 'choir', [74, 78], t + 0.3, 3.2, 0.06);
    e.duck(0.65, 3.2);
  },
  // the gate of the Tower opens: one deep toll and a swelling chord
  start(p, t, e) {
    p.play('st', 'toll', 38, t, 6, 0.16);
    p.play('st', 'toll', 50, t + 0.02, 5, 0.1);
    p.play('st', 'pad', voicing(['D', 'min'], 50), t, 3.4, 0.12);
    p.play('st', 'choir', [62, 69], t + 0.15, 2.8, 0.06);
    p.play('st', 'swell', null, t, 1.8, 0.05);
    e.duck(0.45, 1.6);
  },
  // you fell: bells tolling downward under a dark swell
  death(p, t, e) {
    [62, 57, 53, 50].forEach((m, i) => p.play('st', 'toll', m, t + i * 0.95, 5, 0.14));
    p.play('st', 'pad', voicing(['D', 'min'], 43), t, 5, 0.1);
    p.play('st', 'swell', null, t, 4, 0.05);
    e.duck(0.8, 5);
  },
};
