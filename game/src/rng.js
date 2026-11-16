// Seeded random: every decision the game makes (spawns, enemy aim, wave makeup) flows
// through this one stream, so a seed fully pins a run. mulberry32, a proven 32-bit PRNG.
export function createRng(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, items) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
