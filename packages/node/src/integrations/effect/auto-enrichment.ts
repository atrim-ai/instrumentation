/**
 * Effect Auto-Enrichment Utilities
 *
 * Provides utilities for automatically extracting and enriching spans with Effect-native metadata.
 *
 * Usage:
 * ```typescript
 * import { autoEnrichSpan, withAutoEnrichedSpan } from '@atrim/instrument-node/effect'
 *
 * // Option 1: Manual enrichment
 * Effect.gen(function* () {
 *   yield* autoEnrichSpan()  // Auto-add Effect metadata
 *   yield* annotateBatch(items.length, 10)  // Add custom attributes
 *   const result = yield* storage.writeBatch(items)
 *   return result
 * }).pipe(Effect.withSpan('storage.writeBatch'))
 *
 * // Option 2: Automatic enrichment wrapper
 * const instrumented = withAutoEnrichedSpan('storage.writeBatch')(
 *   Effect.gen(function* () {
 *     yield* annotateBatch(items.length, 10)
 *     return yield* storage.writeBatch(items)
 *   })
 * )
 * ```
 */

import { Effect } from 'effect'
import { extractEffectMetadata } from './metadata-extractor.js'

/**
 * Auto-enrich the current span with Effect metadata
 *
 * This function should be called within an Effect.withSpan() context.
 * It extracts Effect metadata (fiber ID, status, parent span info)
 * and adds it as span attributes.
 *
 * Best practice: Call this at the start of your instrumented Effect:
 *
 * ```typescript
 * Effect.gen(function* () {
 *   yield* autoEnrichSpan()  // Auto-add metadata
 *   yield* annotateBatch(items.length, 10)  // Add custom attributes
 *   const result = yield* storage.writeBatch(items)
 *   return result
 * }).pipe(Effect.withSpan('storage.writeBatch'))
 * ```
 *
 * @returns Effect that annotates the current span with Effect metadata
 */
export function autoEnrichSpan(): Effect.Effect<void> {
  return Effect.gen(function* () {
    // Extract Effect metadata
    const metadata = yield* extractEffectMetadata()

    // Add metadata as span attributes
    // Cast to Record<string, unknown> to satisfy Effect.annotateCurrentSpan type
    yield* Effect.annotateCurrentSpan(metadata as Record<string, unknown>)
  })
}

/**
 * Create a wrapper that combines Effect.withSpan with automatic enrichment
 *
 * This is a convenience function that wraps an Effect with both:
 * 1. A span (via Effect.withSpan)
 * 2. Automatic metadata extraction (via autoEnrichSpan)
 *
 * Usage:
 * ```typescript
 * const instrumented = withAutoEnrichedSpan('storage.writeBatch')(
 *   Effect.gen(function* () {
 *     yield* annotateBatch(items.length, 10)
 *     return yield* storage.writeBatch(items)
 *   })
 * )
 * ```
 *
 * @param spanName - The name of the span
 * @param options - Optional span options
 * @returns Function that wraps an Effect with an auto-enriched span
 */
export function withAutoEnrichedSpan<A, E, R>(
  spanName: string,
  options?: {
    readonly attributes?: Record<string, unknown>
    readonly kind?: 'client' | 'server' | 'producer' | 'consumer' | 'internal'
  }
) {
  return (self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    return Effect.gen(function* () {
      // Auto-enrich with metadata
      yield* autoEnrichSpan()

      // Execute the wrapped effect
      return yield* self
    }).pipe(Effect.withSpan(spanName, options))
  }
}
