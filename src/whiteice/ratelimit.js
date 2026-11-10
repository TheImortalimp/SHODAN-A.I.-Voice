// Token bucket used to throttle API calls, AI requests and event reactions.
export class RateLimiter {
  constructor({ capacity, refillPerSecond, now = () => performance.now() }) {
    if (!(capacity > 0) || !(refillPerSecond > 0)) throw new RangeError('RateLimiter needs a positive capacity and refill rate.');
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.updated = now();
  }

  refill() {
    const now = this.now();
    const elapsed = Math.max(0, now - this.updated) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updated = now;
  }

  take(cost = 1) {
    this.refill();
    if (this.tokens + 1e-9 < cost) return false;
    this.tokens -= cost;
    return true;
  }

  retryAfterMs(cost = 1) {
    this.refill();
    return this.tokens >= cost ? 0 : Math.ceil(((cost - this.tokens) / this.refillPerSecond) * 1000);
  }
}

// Ensures a repeated reaction cannot fire more often than its cooldown.
export class Cooldowns {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.until = new Map();
  }

  ready(key) {
    return (this.until.get(key) ?? -Infinity) <= this.now();
  }

  arm(key, ms) {
    this.until.set(key, this.now() + ms);
  }

  tryArm(key, ms) {
    if (!this.ready(key)) return false;
    this.arm(key, ms);
    return true;
  }
}
