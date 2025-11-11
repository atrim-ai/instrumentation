/**
 * @atrim/instrumentation - Universal OpenTelemetry instrumentation library
 *
 * Provides pattern-based span filtering and centralized configuration
 * for any Node.js application (Node.js, Bun, Deno).
 *
 * @packageDocumentation
 */

// Core exports (standard OpenTelemetry)
export { initializeInstrumentation, isInitialized, resetInitialization } from './api.js'

// Configuration types
export type { InstrumentationConfig, PatternConfig } from './core/instrumentation-schema.js'
export type { ConfigLoaderOptions } from './core/config-loader.js'

// Pattern matching utilities
export { shouldInstrumentSpan, PatternMatcher, getPatternMatcher } from './core/pattern-matcher.js'

// Span processor
export { PatternSpanProcessor } from './core/span-processor.js'

// Span helpers (standard OpenTelemetry)
export {
  setSpanAttributes,
  recordException,
  markSpanSuccess,
  markSpanError,
  annotateHttpRequest,
  annotateDbQuery,
  annotateCacheOperation
} from './integrations/standard/span-helpers.js'
