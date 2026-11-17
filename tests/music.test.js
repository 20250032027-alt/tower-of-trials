import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, SCALES, chordPcs, inScale, midi, pc, voicing, bassNote, chordTone, MOTIF, DUNGEON_FAMILY, DUNGEON_LEVELS } from '../src/logic/musictheory.js';
import { SCHEDULE, STINGERS, FX, LEVELS } from '../src/game/tracks.js';
import { INST, DRUM } from '../src/game/musicengine.js';

// a stand-in for the WebAudio Player that records every note a scheduler asks for
function run(name, mood, loops, seed) {
  let x = seed >>> 0;
  const rand = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const realRandom = Math.random; Math.random = rand;
  const def = TRACKS[name], out = [], hits = [];
  let at = { bar: 0, s: 0 };
  const beat = 60 / def.bpm;
  const p = {
    def, mood, state: {}, beat, stepDur: beat / 4, barDur: beat * 4, wide: 0,
    levelOf: () => 1, on: () => true,
    play(layer, inst, notes, t, dur, vol) { out.push({ layer, inst, notes: [].concat(notes ?? []), dur, vol, ...at }); },
    hit(layer, drum, t, vol) { hits.push({ layer, drum, vol, ...at }); },
  };
  try {
    let t = 0;
    for (let loop = 0; loop < loops; loop++) for (let bar = 0; bar < def.bars; bar++) for (let s = 0; s < 16; s++) {
      at = { bar, s }; SCHEDULE[name](p, bar, s, t, loop); t += p.stepDur;
    }
  } finally { Math.random = realRandom; }
  return { out, hits, def };
}

const PITCHED_MELODY = ['pluck', 'bell', 'lead', 'chip', 'hollow', 'drip'];
const TRACK_MOODS = [['title', 'title'], ['hub', 'hub'], ['dungeon', 'dungeon'], ['vault', 'vault'], ['rift', 'rift']];

test('every track is 8 bars with valid chords, in D, and loops back to D minor', () => {
  for (const [name, def] of Object.entries(TRACKS)) {
    assert.equal(def.prog.length, def.bars, name);
    assert.equal(def.key, 'D');
    assert.ok(SCALES[def.scale], name);
    assert.ok(def.bpm >= 50 && def.bpm <= 90, name + ' tempo');
    for (const ch of def.prog) assert.ok(chordPcs(ch).length >= 2, name + ' chord ' + ch);
    assert.deepEqual(def.prog[0], ['D', 'min'], name + ' opens on Dm');
  }
});

test('every chord is built from the track scale (the A major chord is the one allowed colour)', () => {
  for (const [name, def] of Object.entries(TRACKS)) {
    for (const ch of def.prog) {
      const pcs = chordPcs(ch);
      const colour = pcs.filter((p) => !inScale(p, def.key, def.scale));
      if (colour.length) assert.ok(def.chromatic.includes(ch[0]) && ch[0] === 'A', `${name}: ${ch} has out-of-scale tones`);
    }
  }
});

test('melodic notes stay in key (or on the current chord), inside a playable range', () => {
  for (const [name, mood] of TRACK_MOODS) for (const seed of [1, 7, 99, 12345]) {
    const { out, def } = run(name, mood, 4, seed);
    assert.ok(out.length > 40, name + ' plays something');
    for (const n of out) {
      const chord = chordPcs(def.prog[n.bar]);
      for (const m of n.notes) {
        assert.ok(Number.isInteger(m) && m >= 36 && m <= 100, `${name} ${n.inst} note ${m} out of range`);
        const p = ((m % 12) + 12) % 12;
        const inChord = chord.includes(p);
        if (PITCHED_MELODY.includes(n.inst)) {
          const scaleOk = inScale(m, def.key, def.scale) || (n.inst !== 'drip' && inChord);
          // the A major chord's C# is the one deliberate chromatic colour (so is its raised 7th over the A chord)
          assert.ok(scaleOk || inChord, `${name} bar ${n.bar} step ${n.s}: ${n.inst} note ${m} (pc ${p}) is out of key`);
        } else if (['pad', 'choir', 'stab', 'bass', 'pulse'].includes(n.inst)) {
          assert.ok(inChord || n.layer === 'pulse', `${name} bar ${n.bar}: ${n.inst} note ${m} not in chord`);
        }
      }
    }
  }
});

test('the drone only ever sits on D plus the fifth (or the rift tritone)', () => {
  for (const [name, mood] of TRACK_MOODS.slice(2)) {
    const { out } = run(name, mood, 2, 5);
    for (const n of out.filter((x) => x.inst === 'drone')) for (const m of n.notes) assert.ok([38, 45, 44].includes(m), `${name} drone ${m}`);
  }
});

test('the four-note motif (D F A G) opens the title and the hub', () => {
  for (const name of ['title', 'hub']) {
    const { out } = run(name, name, 1, 3);
    const motif = out.filter((n) => n.layer === 'motif' && n.bar === 0).map((n) => n.notes[0] % 12);
    assert.deepEqual(motif.slice(0, 4), MOTIF.map((m) => (2 + m) % 12), name);
  }
});

test('all instruments and drums used by the scores exist, and every layer has a mix entry', () => {
  for (const [name, mood] of TRACK_MOODS) {
    const { out, hits } = run(name, mood, 2, 11);
    for (const n of out) assert.ok(INST[n.inst], `${name}: no instrument ${n.inst}`);
    for (const h of hits) assert.ok(DRUM[h.drum], `${name}: no drum ${h.drum}`);
    assert.ok(Object.keys(FX[name]).length > 0);
    for (const n of out) assert.ok(FX[name][n.layer] || n.layer === 'tick', `${name}: layer ${n.layer} has no FX entry`);
    for (const n of out) assert.ok(n.vol > 0 && n.vol < 0.5, `${name}: odd volume ${n.vol}`);
  }
});

test('the dungeon fight layers are silent while exploring and come in with intensity', () => {
  for (const f of DUNGEON_FAMILY) assert.equal(LEVELS[f], DUNGEON_LEVELS);
  for (const l of ['pulse', 'hats', 'drums', 'arp']) assert.equal(DUNGEON_LEVELS[l][0], 0, l);
  assert.equal(DUNGEON_LEVELS.drums[1], 0);       // alert: no drums yet
  assert.ok(DUNGEON_LEVELS.pulse[1] > 0);          // alert: the bass pulse starts
  for (const l of ['hollow', 'drip']) assert.equal(DUNGEON_LEVELS[l][2], 0, l); // melody + drips step aside in a fight
});

test('stingers play notes and duck the music', () => {
  for (const name of Object.keys(STINGERS)) {
    const notes = []; let ducked = null;
    const p = { play: (...a) => notes.push(a), hit() {}, on: () => true, def: {}, state: {} };
    STINGERS[name](p, 0, { duck: (a, h) => { ducked = [a, h]; } });
    assert.ok(notes.length >= 3, name);
    assert.ok(ducked && ducked[0] > 0 && ducked[1] > 1, name + ' ducks');
    for (const [, inst] of notes) assert.ok(INST[inst], inst);
  }
});

test('theory helpers', () => {
  assert.equal(midi('D4'), 62);
  assert.equal(pc('Bb'), 10);
  assert.deepEqual(voicing(['D', 'min'], 50), [50, 53, 57]);
  assert.equal(bassNote(['D', 'min'], 36), 38);
  assert.equal(chordTone(['A', 'maj'], 1, 62), 73); // C# above A4... lowest A >= 62 is 69, +4 = 73
});
