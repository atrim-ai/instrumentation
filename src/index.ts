/**
 * @atrim/instrumentation - Universal OpenTelemetry instrumentation library
 *
 * Provides pattern-based span filtering and centralized configuration
 * for any Node.js application (Node.js, Bun, Deno).
 *
 * @packageDocumentation
 */

// Core exports (standard OpenTelemetry)
export { initializeInstrumentation } from './api.js'

// Configuration types
export type { InstrumentationConfig, PatternConfig } from './core/instrumentation-schema.js'

// Pattern matching utilities
export { shouldInstrumentSpan } from './core/pattern-matcher.js'

// Span processor
export { PatternSpanProcessor } from './core/span-processor.js'
