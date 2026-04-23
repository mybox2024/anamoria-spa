// utils/apiCache.js — Anamoria SPA
// v1.0 — April 22, 2026
//
// Shared module-level cache for API responses.
// Pattern: Map with TTL-based expiry (same as MemoryFeed D-4 image cache).
//
// Used by:
//   - useBillingStatus.js (A-2: billing status cache)
//   - SpacePage.jsx (A-3: space detail + prompt cache)
//
// Design decisions (Build Plan v1.1):
//   - Module-level Map (not React Context) — avoids re-renders on cache update.
//   - Consumer-layer caching (not in client.js) — not all endpoints should be
//     cached; invalidation is consumer-specific.
//   - getCached returns { hit, value } wrapper (OQ-2) — distinguishes between
//     "cache miss" and "cached null value" (prompt endpoint can return null).
//   - Cleared on full page reload (intentional — fresh data on reload).
//   - Survives React Fast Refresh in dev — hard-refresh to clear during testing.

// ─── Internal store ─────────────────────────────────────────────────────────
// Each entry: { value: any, expiresAt: number (Date.now() + ttlMs) }

const cache = new Map();

// ─── TTL Constants ──────────────────────────────────────────────────────────
// Exported so consumers can reference them for transparency and testing.

/** Billing status: changes only on subscription events. 5 min is safe. */
export const BILLING_CACHE_TTL = 300_000; // 5 minutes

/** Space detail (name, privacy, photo): changes are rare, user-initiated.
 *  Invalidated explicitly on settings save. */
export const SPACE_DETAIL_CACHE_TTL = 120_000; // 2 minutes

/** Current prompt: advances are user-initiated.
 *  Invalidated explicitly on skip/advance. */
export const PROMPT_CACHE_TTL = 120_000; // 2 minutes

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Retrieve a cached value by key.
 *
 * Returns { hit: true, value } if the key exists and has not expired.
 * Returns { hit: false } if the key is missing or expired.
 *
 * The wrapper convention (OQ-2) ensures callers can distinguish between
 * "no cache entry" and "cached a null value" (e.g., prompt endpoint
 * legitimately returns null when no prompt is available).
 *
 * @param {string} key
 * @returns {{ hit: true, value: any } | { hit: false }}
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return { hit: false };

  if (Date.now() > entry.expiresAt) {
    // Expired — clean up and report miss.
    cache.delete(key);
    return { hit: false };
  }

  return { hit: true, value: entry.value };
}

/**
 * Store a value in cache with a TTL.
 *
 * @param {string} key
 * @param {any} value — the value to cache (may be null)
 * @param {number} ttlMs — time-to-live in milliseconds
 */
export function setCache(key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Remove a specific key from cache.
 * Use after mutations that invalidate a single cached resource
 * (e.g., space settings save invalidates `space:{spaceId}`).
 *
 * @param {string} key
 */
export function invalidateCache(key) {
  cache.delete(key);
}

/**
 * Remove all keys that start with the given prefix.
 * Use for bulk invalidation (e.g., `invalidateCachePrefix('space:')` to
 * clear all space detail caches at once).
 *
 * @param {string} prefix
 */
export function invalidateCachePrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
