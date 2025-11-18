/**
 * @atrim/instrument-node - OpenTelemetry instrumentation for Node.js
 *
 * Provides complete OpenTelemetry SDK initialization with pattern-based
 * span filtering and centralized configuration for Node.js applications.
 *
 * @packageDocumentation
 */

// Core exports (complete OpenTelemetry initialization)
// Effect-based API (all async operations return Effect)
export { initializeInstrumentation, initializePatternMatchingOnly } from './api.js'

// SDK initialization types
export type { SdkInitializationOptions } from './core/sdk-initializer.js'
export { getSdkInstance, shutdownSdk, resetSdk } from './core/sdk-initializer.js'

// OTLP exporter utilities
export type { OtlpExporterOptions } from './core/exporter-factory.js'
export { createOtlpExporter, getOtlpEndpoint } from './core/exporter-factory.js'

// Service detection utilities (Effect-based)
export type { ServiceInfo } from './core/service-detector.js'
export {
  detectServiceInfo,
  getServiceName,
  getServiceVersion,
  getServiceInfoWithFallback
} from './core/service-detector.js'

// Configuration types and loader (re-exported from core, Effect-based)
export type {
  InstrumentationConfig,
  PatternConfig,
  ConfigLoaderOptions
} from '@atrim/instrument-core'
export { loadConfigEffect as loadConfig } from '@atrim/instrument-core'

// Pattern matching utilities (re-exported from core)
export { shouldInstrumentSpan, PatternMatcher, getPatternMatcher } from '@atrim/instrument-core'

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

// Error types (for Effect error handling)
export {
  ConfigError,
  ConfigUrlError,
  ConfigValidationError,
  ConfigFileError,
  ServiceDetectionError,
  InitializationError,
  ExportError,
  ShutdownError
} from './core/errors.js'

// Test utilities (for examples and test fixtures)
export { suppressShutdownErrors } from './core/test-utils.js'
