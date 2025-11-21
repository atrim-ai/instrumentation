/**
 * Effect-TS integration for @atrim/instrumentation
 *
 * Optional Effect-TS integration providing automatic metadata extraction
 * from Effect fibers and spans.
 *
 * Only use this if you're using Effect-TS in your application.
 * For standard OpenTelemetry usage, import from '@atrim/instrumentation' instead.
 *
 * @packageDocumentation
 */

// Effect-specific exports
export { EffectInstrumentationLive, createEffectInstrumentation } from './effect-tracer.js'

// Effect-specific span helpers
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

// Effect metadata extraction
export { extractEffectMetadata } from './metadata-extractor.js'
export type { EffectMetadata } from './metadata-extractor.js'

// Auto-enrichment utilities
export { autoEnrichSpan, withAutoEnrichedSpan } from './auto-enrichment.js'

// FiberSet isolation helpers (automatic span isolation + virtual parent tracking)
export {
  runIsolated,
  runWithSpan,
  annotateSpawnedTasks,
  FiberSet,
  type IsolationOptions
} from './fiberset.js'
