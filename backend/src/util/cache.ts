/**
 * Light TMS - Minimal in-process TTL cache.
 *
 * Shared hosting has no Redis, and the app runs as a single Node process, so an
 * in-memory Map is the right fit: ~0µs lookups, no extra infrastructure. Used to
 * collapse the high-frequency nav-badge count queries (polled every 20s by each
 * open browser plus the 60s server watcher) into one DB hit per TTL window.
 *
 * Caveat by design: the cache is per-process. If the host ever runs multiple
 * instances or restarts, each caches independently / starts cold — fine for
 * short-TTL counts and reloadable lookups.
 */

interface Entry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Returns the cached value if still fresh; otherwise runs `loader`, caches the
 * in-flight promise (so concurrent callers share one DB query, not N), and
 * returns it. A rejected loader is not cached — the next call retries.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.promise;

  const promise = loader();
  store.set(key, { promise, expiresAt: now + ttlMs });
  // Don't let a transient failure stick in the cache until TTL expiry.
  promise.catch(() => {
    if ((store.get(key) as Entry<T> | undefined)?.promise === promise) store.delete(key);
  });
  return promise;
}

/** Drops a single cache entry (call after a write that changes it). */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Drops every entry whose key starts with `prefix`. */
export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
