/**
 * @atrim/instrument-web - OpenTelemetry instrumentation for browsers
 *
 * Provides complete OpenTelemetry SDK initialization with pattern-based
 * span filtering and centralized configuration for browser applications.
 *
 * @packageDocumentation
 */

// Core initialization
export { initializeInstrumentation } from './api.js'
export type { SdkInitializationOptions } from './core/sdk-initializer.js'

// SDK utilities
export { getSdkInstance, shutdownSdk, resetSdk } from './core/sdk-initializer.js'

// OTLP exporter utilities
export type { OtlpExporterOptions } from './core/exporter-factory.js'
export { createOtlpExporter, getOtlpEndpoint } from './core/exporter-factory.js'

// Configuration (re-exported from core)
export type {
  InstrumentationConfig,
  PatternConfig,
  ConfigLoaderOptions
} from '@atrim/instrument-core'
export { loadConfig, clearConfigCache } from '@atrim/instrument-core'

// Pattern matching (re-exported from core)
export {
  shouldInstrumentSpan,
  PatternMatcher,
  getPatternMatcher,
  initializePatternMatcher,
  clearPatternMatcher
} from '@atrim/instrument-core'

// Span processor
export { PatternSpanProcessor } from './core/span-processor.js'

// Span helpers (browser-specific)
export {
  setSpanAttributes,
  recordException,
  markSpanSuccess,
  markSpanError,
  annotateHttpRequest,
  annotateCacheOperation,
  annotateUserInteraction,
  annotateNavigation
} from './integrations/standard/span-helpers.js'

// Error types (re-exported from core)
export {
  ConfigError,
  ConfigUrlError,
  ConfigValidationError,
  ConfigFileError,
  InitializationError,
  ExportError,
  ShutdownError
} from '@atrim/instrument-core'
