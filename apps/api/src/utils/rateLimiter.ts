export type RateLimiterOptions = {
  windowMs: number;
  max: number;
};

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly hits: Map<string, number[]> = new Map();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  allow(key: string, now = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t >= windowStart);
    if (timestamps.length >= this.max) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  reset(key?: string) {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
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
