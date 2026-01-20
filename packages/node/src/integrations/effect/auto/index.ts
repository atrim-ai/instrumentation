/**
 * Effect 4.x Auto-Tracing
 *
 * In Effect 4.x, automatic tracing works differently than Effect 3.x:
 *
 * BUILD TIME (via @clayroach/effect-unplugin):
 * - Effect.gen, Effect.fork, Effect.all, Effect.forEach are wrapped with withSpan()
 * - Source locations are tracked via CurrentStackFrame service
 *
 * RUNTIME (via this module):
 * - Spans are exported to OTLP collector
 * - No Supervisor needed - unplugin handles span creation
 *
 * @example
 * ```typescript
 * // vite.config.ts - Enable build-time instrumentation
 * import effectPlugin from "@clayroach/effect-unplugin/vite"
 *
 * export default defineConfig({
 *   plugins: [effectPlugin({
 *     sourceTrace: true,
 *     spans: { enabled: true },
 *     annotateEffects: true
 *   })]
 * })
 * ```
 *
 * @example
 * ```typescript
 * // app.ts - Use the tracing layer
 * import { Effect4TracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Spans automatically created by unplugin
 *   yield* Effect.all([doA(), doB()])
 *   yield* Effect.fork(backgroundTask())
 * }).pipe(Effect.provide(Effect4TracingLive))
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Effect 4.x Tracing (RECOMMENDED)
// ============================================================================

export {
  // Main layer - provides OTLP export for spans created by unplugin
  Effect4TracingLive,
  // Factory for custom configuration
  createEffect4TracingLayer,
  // Wrapper for convenience
  withEffect4Tracing
} from './effect4-tracing.js'

// ============================================================================
// Configuration
// ============================================================================

export { loadFullConfigSync } from './config.js'

// ============================================================================
// Naming utilities
// ============================================================================

export { inferSpanName, sanitizeSpanName } from './naming.js'
export type { SourceInfo, TemplateVariables } from './naming.js'

// ============================================================================
// Legacy aliases for migration
// ============================================================================

// These aliases help migrate from Effect 3.x naming to Effect 4.x
// The actual behavior is the same - just OTLP export

/**
 * @deprecated Use Effect4TracingLive instead
 */
export { Effect4TracingLive as UnifiedTracingLive } from './effect4-tracing.js'

/**
 * @deprecated Use createEffect4TracingLayer instead
 */
export { createEffect4TracingLayer as createUnifiedTracingLayer } from './effect4-tracing.js'

/**
 * @deprecated Use withEffect4Tracing instead
 */
export { withEffect4Tracing as withUnifiedTracing } from './effect4-tracing.js'
