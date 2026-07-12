import { describe, it, expect } from 'vitest';
import { cached, invalidate, invalidatePrefix } from '../src/util/cache.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('cache', () => {
  it('serves a cached value within the TTL (loader runs once)', async () => {
    let calls = 0;
    const load = () => {
      calls++;
      return Promise.resolve(42);
    };
    expect(await cached('k-ttl', 1000, load)).toBe(42);
    expect(await cached('k-ttl', 1000, load)).toBe(42);
    expect(calls).toBe(1);
  });

  it('dedups concurrent callers into one load', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      await sleep(20);
      return 7;
    };
    const [a, b, c] = await Promise.all([
      cached('k-dedup', 1000, load),
      cached('k-dedup', 1000, load),
      cached('k-dedup', 1000, load),
    ]);
    expect([a, b, c]).toEqual([7, 7, 7]);
    expect(calls).toBe(1);
  });

  it('reloads after the TTL expires', async () => {
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    expect(await cached('k-expire', 20, load)).toBe(1);
    await sleep(30);
    expect(await cached('k-expire', 20, load)).toBe(2);
  });

  it('does not cache a rejected loader', async () => {
    let calls = 0;
    const load = () => {
      calls++;
      return Promise.reject(new Error('boom'));
    };
    await expect(cached('k-reject', 1000, load)).rejects.toThrow('boom');
    await expect(cached('k-reject', 1000, load)).rejects.toThrow('boom');
    expect(calls).toBe(2); // retried, not served from cache
  });

  it('invalidate drops a single key', async () => {
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    await cached('k-inv', 1000, load);
    invalidate('k-inv');
    await cached('k-inv', 1000, load);
    expect(calls).toBe(2);
  });

  it('invalidatePrefix drops all matching keys', async () => {
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    await cached('badge:a', 1000, load);
    await cached('badge:b', 1000, load);
    invalidatePrefix('badge:');
    await cached('badge:a', 1000, load);
    await cached('badge:b', 1000, load);
    expect(calls).toBe(4);
  });
});
