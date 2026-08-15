export interface RateLimitConfig {
  readonly windowSeconds: number;
  readonly maxRequests: number;
}

export interface RateLimitBucketStore {
  increment(bucketKey: string, windowStartedAtMs: number, nowMs: number): Promise<number>;
}

export class InMemoryRateLimitBucketStore implements RateLimitBucketStore {
  readonly counts = new Map<string, number>();

  async increment(bucketKey: string, windowStartedAtMs: number, _nowMs: number): Promise<number> {
    const key = `${bucketKey}|${windowStartedAtMs}`;
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }
}

export async function consumeRateLimit(
  store: RateLimitBucketStore,
  bucketKey: string,
  config: RateLimitConfig,
  nowMs: number,
): Promise<{ allowed: boolean; count: number }> {
  const windowStartedAtMs = Math.floor(nowMs / (config.windowSeconds * 1000)) * config.windowSeconds * 1000;
  const count = await store.increment(bucketKey, windowStartedAtMs, nowMs);
  return { allowed: count <= config.maxRequests, count };
}
