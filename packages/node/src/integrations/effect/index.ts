/**
 * Effect 4.x integration for @atrim/instrumentation
 *
 * For Effect 4.x, automatic tracing is handled differently:
 *
 * BUILD TIME:
 * - Use @clayroach/effect-unplugin to add withSpan() calls
 * - Source locations tracked via CurrentStackFrame service
 *
 * RUNTIME:
 * - Use Effect4TracingLive layer for OTLP export
 *
 * @example
 * ```typescript
 * import { Effect4TracingLive } from '@atrim/instrument-node/effect'
 *
 * const program = Effect.gen(function* () {
 *   yield* myEffect()
 * }).pipe(Effect.provide(Effect4TracingLive))
 * ```
 *
 * @packageDocumentation
 */

// Effect 4.x tracing layer (auto module re-export)
export {
  Effect4TracingLive,
  createEffect4TracingLayer,
  withEffect4Tracing,
  // Legacy aliases
  UnifiedTracingLive,
  createUnifiedTracingLayer,
  withUnifiedTracing
} from './auto/index.js'

// Effect-specific span helpers (these work with any Effect version)
export {
  annotateUser,
  annotateDataSize,
  annotateBatch,
  annotateLLM,
  annotateQuery,
  annotateHttpRequest,
  annotateError,
  annotatePriority,
  annotateCache
} from './effect-helpers.js'
