export type TtlCacheOptions = {
  ttlMs: number;
  /** Oldest entries are evicted first once the cache holds this many. */
  maxEntries: number;
};

// In-process cache with a fixed time-to-live per entry and a size bound, so keys
// built from user input cannot grow memory without limit.
export class TtlCache<V> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries: Map<string, { value: V; expiresAtMs: number }> = new Map();

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
  }

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, now = Date.now()) {
    // Re-inserting moves the key to the end, so Map order stays oldest first.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAtMs: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }
}

// Keep a registry for test resets
const registry: Array<TtlCache<unknown>> = [];

export function registerCache<V>(cache: TtlCache<V>): TtlCache<V> {
  registry.push(cache as TtlCache<unknown>);
  return cache;
}

export function resetAllCaches() {
  registry.forEach((cache) => cache.clear());
}
