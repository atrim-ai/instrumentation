/**
 * Span Control FiberRefs for Effect-TS Tracing
 *
 * Provides FiberRefs that control span creation behavior. These can be used to:
 * - Disable auto-tracing for specific fibers/effects
 * - Override auto-generated span names
 *
 * These FiberRefs are checked by the UnifiedTracingSupervisor during span creation.
 *
 * @example
 * ```typescript
 * import { withoutAutoTracing, setSpanName } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Automatically traced
 *   yield* publicWork()
 *
 *   // Opt-out of tracing
 *   yield* withoutAutoTracing(internalWork())
 *
 *   // Custom span name
 *   yield* setSpanName('custom.operation')(criticalWork())
 * }).pipe(withUnifiedTracing)
 * ```
 */

import { Effect, FiberRef, Option } from 'effect'

// ============================================================================
// FiberRefs for span control
// ============================================================================

/**
 * FiberRef to enable/disable auto-tracing for specific fibers.
 *
 * When set to `false`, the UnifiedTracingSupervisor will skip span creation
 * for the fiber and its children (unless they override it back to `true`).
 *
 * Default: `true` (auto-tracing enabled)
 */
export const AutoTracingEnabled = FiberRef.unsafeMake<boolean>(true)

/**
 * FiberRef to override the auto-generated span name.
 *
 * When set to `Some(name)`, the UnifiedTracingSupervisor will use this name
 * instead of inferring it from source location.
 *
 * Default: `None` (use inferred name)
 */
export const AutoTracingSpanName = FiberRef.unsafeMake<Option.Option<string>>(Option.none())

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Disable auto-tracing for a specific Effect.
 *
 * Use this to opt-out of automatic span creation for internal operations
 * that don't need to be traced.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* publicWork()  // Traced
 *   yield* withoutAutoTracing(internalWork())  // NOT traced
 * })
 * ```
 */
export const withoutAutoTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => effect.pipe(Effect.locally(AutoTracingEnabled, false))

/**
 * Override the auto-generated span name for a specific Effect.
 *
 * Use this when you want a custom span name instead of the inferred one.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* setSpanName('custom.operation.name')(myEffect)
 * })
 * ```
 */
export const setSpanName =
  (name: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(Effect.locally(AutoTracingSpanName, Option.some(name)))
