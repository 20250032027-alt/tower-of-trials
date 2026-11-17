// Pure helpers for XP orbs: how many orbs a reward turns into and how its value is shared out.

/** More XP spills into more orbs, but never a flood: 2..6 (or 1 for a tiny reward). */
export function orbCountFor(total) {
  if (total <= 1) return 1;
  return Math.max(2, Math.min(6, Math.round(total / 10)));
}

/** Splits `total` into `n` whole-number shares that add up exactly (e.g. 23 into 3 -> [8, 8, 7]). */
export function splitXp(total, n) {
  total = Math.max(0, Math.round(total));
  n = Math.max(1, Math.min(Math.floor(n), Math.max(1, total)));
  const base = Math.floor(total / n), extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
