// Seedable randomness so CORTEX output is reproducible in tests but unpredictable live.
export function seedFromCrypto() {
  const buffer = new Uint32Array(4);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer);
}

function hashSeed(seed) {
  if (Array.isArray(seed)) return seed.map((n) => n >>> 0);
  let h = 1779033703 ^ String(seed).length;
  const out = [];
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    out.push((h ^= h >>> 16) >>> 0);
  }
  return out;
}

// sfc32: small, fast, well-distributed PRNG.
export function createRandom(seed = seedFromCrypto()) {
  let [a, b, c, d] = hashSeed(seed);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const random = () => next();
  random.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  random.pick = (items) => items[Math.floor(next() * items.length)];
  random.chance = (p) => next() < p;
  random.weighted = (entries) => {
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    let roll = next() * total;
    for (const [value, weight] of entries) {
      roll -= Math.max(0, weight);
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  };
  random.shuffle = (items) => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  return random;
}

// Draws every item once before repeating, and never repeats across a refill boundary.
export class ShuffleBag {
  constructor(items, random) {
    this.items = items;
    this.random = random;
    this.queue = [];
    this.last = undefined;
  }

  next() {
    if (!this.items.length) return undefined;
    if (!this.queue.length) {
      this.queue = this.random.shuffle(this.items);
      if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.last) {
        [this.queue[0], this.queue[this.queue.length - 1]] = [this.queue[this.queue.length - 1], this.queue[0]];
      }
    }
    this.last = this.queue.pop();
    return this.last;
  }
}
