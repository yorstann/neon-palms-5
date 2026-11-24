// Seeded randomness for Neon Palms. World generation and the screenshot
// scenes run off a fixed seed so Palmera Bay is the same city every visit,
// while gameplay rolls use a separate stream that follows the player's luck.

/** A compact seeded PRNG (mulberry32 family). Returns floats in [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max] inclusive. */
export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/** Pick one element of an array. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angular difference from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep` radians. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

/** Euclidean distance between two points. */
export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
