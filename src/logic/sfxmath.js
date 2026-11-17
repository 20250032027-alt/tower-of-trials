// Small pure helpers behind the sound engine (kept free of WebAudio so they can be unit-tested).

/**
 * Picks a variant index in [0, n) that is never the same as the previous pick for that key.
 * Hearing the exact same sample twice in a row is what makes game audio feel "machine-gunny".
 */
export function makeVariantPicker(rand = Math.random) {
  const last = new Map();
  return (key, n) => {
    if (n <= 1) return 0;
    const prev = last.get(key);
    let i = Math.floor(rand() * n);
    if (i === prev) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
    last.set(key, i);
    return i;
  };
}

// C-major pentatonic (no sour notes, so any pickup order sounds musical)
const PENTA = [0, 2, 4, 7, 9];
export const CHAIN_MAX = 11;
const BASE = 523.25; // C5

/** Frequency of the Nth note of a rising pickup chain. */
export function chainFreq(step) {
  const s = Math.max(0, Math.min(CHAIN_MAX, Math.floor(step)));
  const semis = PENTA[s % PENTA.length] + 12 * Math.floor(s / PENTA.length);
  return BASE * 2 ** (semis / 12);
}

/**
 * Next step in a pickup chain: keeps climbing while pickups arrive quickly,
 * drops back to the start after a pause.
 */
export function chainStep(prevStep, secondsSinceLast, window = 0.65) {
  if (prevStep == null || secondsSinceLast > window) return 0;
  return Math.min(CHAIN_MAX, prevStep + 1);
}

/** 0 → centre, ±1 → hard left/right, based on how far to the side the source is. */
export function panFor(dx, reach = 220, limit = 0.8) {
  return Math.max(-limit, Math.min(limit, dx / reach));
}

/** Volume multiplier by distance: full when close, fades to `floor` at `maxDist`. */
export function distanceGain(dist, near = 40, maxDist = 340, floor = 0) {
  if (dist <= near) return 1;
  if (dist >= maxDist) return floor;
  const t = (dist - near) / (maxDist - near);
  return floor + (1 - floor) * (1 - t) ** 1.6;
}
