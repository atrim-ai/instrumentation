/**
 * @atrim/instrumentation - Universal OpenTelemetry instrumentation library
 *
 * Provides complete OpenTelemetry SDK initialization with pattern-based
 * span filtering and centralized configuration for any Node.js application.
 *
 * @packageDocumentation
 */

// Core exports (complete OpenTelemetry initialization)
// Promise API (backward compatible)
export { initializeInstrumentation, initializePatternMatchingOnly } from './api.js'
// Effect API (primary)
export { initializeInstrumentationEffect, initializePatternMatchingOnlyEffect } from './api.js'

// SDK initialization types
export type { SdkInitializationOptions } from './core/sdk-initializer.js'
export { getSdkInstance, shutdownSdk, resetSdk } from './core/sdk-initializer.js'

// OTLP exporter utilities
export type { OtlpExporterOptions } from './core/exporter-factory.js'
export { createOtlpExporter, getOtlpEndpoint } from './core/exporter-factory.js'

// Service detection utilities
export type { ServiceInfo } from './core/service-detector.js'
// Promise API
export {
  detectServiceInfoAsync as detectServiceInfo,
  getServiceNameAsync as getServiceName,
  getServiceVersionAsync as getServiceVersion
} from './core/service-detector.js'
// Effect API
export {
  detectServiceInfo as detectServiceInfoEffect,
  getServiceName as getServiceNameEffect,
  getServiceVersion as getServiceVersionEffect,
  getServiceInfoWithFallback
} from './core/service-detector.js'

// Configuration types and loader
export type { InstrumentationConfig, PatternConfig } from './core/instrumentation-schema.js'
export type { ConfigLoaderOptions } from './core/config-loader.js'
export { loadConfig } from './core/config-loader.js'

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
