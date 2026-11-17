// Music theory helpers and the "score" for every track. Pure data + pure functions, no WebAudio,
// so the tracks can be unit-tested (are the notes in key? are the progressions the right length?).

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
/** 'D4' -> 62 */
export function midi(name) {
  const m = /^([A-G][b#]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return PC[m[1]] + 12 * (Number(m[2]) + 1);
}
export const pc = (name) => PC[name];

export const CHORDS = {
  min: [0, 3, 7], maj: [0, 4, 7], min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7], dim: [0, 3, 6], five: [0, 7],
};
export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], // natural minor with the raised 7th, for the A major "pull home" chord
};

/** Pitch classes (0-11, C = 0) of a chord given as [rootName, quality]. */
export function chordPcs([root, q]) {
  return CHORDS[q].map((s) => (PC[root] + s) % 12);
}

/** MIDI note for chord tone `i` (0 = root) with the root placed at/above `low`. */
export function chordTone([root, q], i, low) {
  const iv = CHORDS[q];
  const base = low + ((PC[root] - low) % 12 + 12) % 12; // lowest root >= low
  const idx = i % iv.length, oct = Math.floor(i / iv.length);
  return base + iv[idx] + 12 * oct;
}

/** All tones of a chord packed into [low, low + 12) (closed voicing, good for pads). */
export function voicing(chord, low) {
  return CHORDS[chord[1]].map((s) => {
    const p = (PC[chord[0]] + s) % 12;
    return low + (((p - low) % 12) + 12) % 12;
  }).sort((a, b) => a - b);
}

/** Bass note: the chord root in the octave starting at `low`. */
export function bassNote(chord, low = 33) { return chordTone(chord, 0, low); }

export const inScale = (m, key, scale) => SCALES[scale].includes((((m - PC[key]) % 12) + 12) % 12);

// ---------------------------------------------------------------------------------------------
// The score. Every progression is 8 bars (1 chord per bar). `bpm` is the beat; the engine plays 16 steps per bar.
// Keys: everything lives around D so the tracks share a tonal centre and crossfade without clashing.
// ---------------------------------------------------------------------------------------------
export const TRACKS = {
  // slow and mysterious: the Tower seen from far away
  title: {
    bpm: 68, key: 'D', scale: 'minor', bars: 8, trim: 2.0,
    prog: [['D', 'min'], ['Bb', 'maj'], ['G', 'min'], ['A', 'maj'], ['D', 'min'], ['F', 'maj'], ['G', 'min'], ['A', 'maj']],
    chromatic: ['A'], // the A major chord (C#) is the deliberate "pull home" colour
  },
  // safe floors: warm, steady, hopeful
  hub: {
    bpm: 86, key: 'D', scale: 'dorian', bars: 8, trim: 2.8,
    prog: [['D', 'min'], ['G', 'maj'], ['C', 'maj'], ['A', 'min'], ['D', 'min'], ['G', 'maj'], ['C', 'maj'], ['G', 'maj']],
    chromatic: [],
  },
  // exploring: sparse, dark, plenty of room for footsteps and bone rattles
  dungeon: {
    bpm: 64, key: 'D', scale: 'minor', bars: 8,
    prog: [['D', 'min'], ['D', 'min'], ['Bb', 'maj'], ['Bb', 'maj'], ['G', 'min'], ['G', 'min'], ['A', 'maj'], ['A', 'maj']],
    chromatic: ['A'],
  },
  // the hidden vault: same dungeon bones with more wonder and bells
  vault: {
    bpm: 60, key: 'D', scale: 'dorian', bars: 8, trim: 0.95,
    prog: [['D', 'min'], ['D', 'min'], ['G', 'maj'], ['G', 'maj'], ['C', 'maj'], ['C', 'maj'], ['A', 'min'], ['A', 'min']],
    chromatic: [],
  },
  // double dungeon: slower, phrygian, unsettling
  rift: {
    bpm: 56, key: 'D', scale: 'phrygian', bars: 8, trim: 1.05,
    prog: [['D', 'min'], ['Eb', 'maj'], ['D', 'min'], ['Eb', 'maj'], ['G', 'min'], ['Bb', 'maj'], ['Eb', 'maj'], ['D', 'min']],
    chromatic: [],
  },
};

// The four-note "call of the Tower" that every track hints at (D F A G, a rising triad then a step back).
// Offsets in semitones from D. Used in different voices so the whole soundtrack feels like one world.
export const MOTIF = [0, 3, 7, 5];
export const MOTIF_ANSWER = [3, 2, 0]; // F E D, settles home

// Combat layer levels per intensity (0 explore, 1 alert, 2 fight) for the dungeon-family tracks.
export const DUNGEON_LEVELS = {
  pad: [1, 0.85, 0.7], drone: [1, 1, 0.9], hollow: [1, 0.3, 0], drip: [1, 0.35, 0], bell: [1, 0.6, 0.35], amb: [1, 0.8, 0.5], delay: [1, 1, 1],
  pulse: [0, 1, 1], hats: [0, 0.8, 1], drums: [0, 0, 1], arp: [0, 0, 1], stab: [0, 0.5, 1],
};
export const DUNGEON_FAMILY = ['dungeon', 'vault', 'rift'];
