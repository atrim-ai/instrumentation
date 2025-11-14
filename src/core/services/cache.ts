/**
 * Effect-based Cache service
 *
 * Provides TTL-based in-memory caching with automatic expiration
 */

import { Context, Effect, Layer, Ref, Option, Duration } from 'effect'

/**
 * Cache entry with expiration
 */
interface CacheEntry<V> {
  readonly value: V
  readonly expiresAt: number
}

/**
 * Cache service interface
 */
export interface Cache<K, V> {
  /**
   * Get value from cache (None if expired or not found)
   */
  readonly get: (key: K) => Effect.Effect<Option.Option<V>, never>

  /**
   * Set value in cache with optional TTL
   */
  readonly set: (key: K, value: V, ttl?: Duration.Duration) => Effect.Effect<void, never>

  /**
   * Clear all cache entries
   */
  readonly clear: Effect.Effect<void, never>

  /**
   * Delete a specific cache entry
   */
  readonly delete: (key: K) => Effect.Effect<void, never>
}

/**
 * Create a Cache service tag
 */
export const makeCache = <K, V>() => Context.GenericTag<Cache<K, V>>('@atrim/Cache')

/**
 * Default TTL for cache entries (5 minutes)
 */
const DEFAULT_TTL = Duration.seconds(300)

/**
 * Create a live Cache layer
 */
export const makeCacheLayer = <K, V>(defaultTtl: Duration.Duration = DEFAULT_TTL) => {
  const CacheTag = makeCache<K, V>()

  return Layer.effect(
    CacheTag,
    Effect.gen(function* () {
      const store = yield* Ref.make(new Map<K, CacheEntry<V>>())

      return CacheTag.of({
        get: (key: K) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(store)
            const entry = map.get(key)

            if (!entry) {
              return Option.none()
            }

            // Check if expired
            const now = Date.now()
            if (entry.expiresAt < now) {
              // Remove expired entry
              yield* Ref.update(store, (m) => {
                const newMap = new Map(m)
                newMap.delete(key)
                return newMap
              })
              return Option.none()
            }

            return Option.some(entry.value)
          }),

        set: (key: K, value: V, ttl: Duration.Duration = defaultTtl) =>
          Effect.gen(function* () {
            const expiresAt = Date.now() + Duration.toMillis(ttl)
            const entry: CacheEntry<V> = { value, expiresAt }

            yield* Ref.update(store, (m) => {
              const newMap = new Map(m)
              newMap.set(key, entry)
              return newMap
            })
          }),

        clear: Ref.set(store, new Map<K, CacheEntry<V>>()),

        delete: (key: K) =>
          Ref.update(store, (m) => {
            const newMap = new Map(m)
            newMap.delete(key)
            return newMap
          })
      })
    })
  )
}
