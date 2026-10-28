export type RateLimiterOptions = {
  windowMs: number;
  max: number;
};

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly hits: Map<string, number[]> = new Map();
  private lastSweep = 0;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  allow(key: string, now = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    this.sweep(now);
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t >= windowStart);
    if (timestamps.length === 0) this.hits.delete(key);
    if (timestamps.length >= this.max) {
      if (timestamps.length > 0) this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  // Drop every key whose timestamps have all expired, at most once per window, so keys
  // that are never requested again cannot accumulate.
  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      if (timestamps.every((t) => t < windowStart)) this.hits.delete(key);
    }
  }

  reset(key?: string) {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
      this.lastSweep = 0;
    }
  }
}

// Keep a registry for test resets
const registry: SlidingWindowRateLimiter[] = [];

export function registerLimiter(limiter: SlidingWindowRateLimiter) {
  registry.push(limiter);
}

export function resetAllRateLimiters() {
  registry.forEach((limiter) => limiter.reset());
}
