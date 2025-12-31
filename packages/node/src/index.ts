/**
 * @atrim/instrument-node - OpenTelemetry instrumentation for Node.js
 *
 * Provides complete OpenTelemetry SDK initialization with pattern-based
 * span filtering and centralized configuration for Node.js applications.
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

// Configuration types (re-exported from core)
export type { InstrumentationConfig, PatternConfig } from '@atrim/instrument-core'

// Configuration loader (Node.js-specific with platform layers)
export {
  loadConfig,
  loadConfigFromInline,
  loadConfigWithOptions,
  _resetConfigLoaderCache as clearConfigCache,
  type ConfigLoaderOptions
} from './core/config-loader.js'

// Pattern matching utilities (re-exported from core)
export { shouldInstrumentSpan, PatternMatcher, getPatternMatcher } from '@atrim/instrument-core'

// Span processor
export { PatternSpanProcessor } from './core/span-processor.js'
export type { PatternSpanProcessorOptions } from './core/span-processor.js'

// SpanTree - runtime span hierarchy querying
// Legacy sync API
export { SpanTree, SpanTreeImpl, resetGlobalSpanTree, setGlobalSpanTree } from './core/span-tree.js'
// Effect-based API
export {
  SpanTreeService,
  SpanTreeServiceLive,
  makeSpanTreeService,
  SpanStarted,
  SpanEnded
} from './core/span-tree.js'
export type {
  SpanInfo,
  TraceSummary,
  SpanTreeConfig,
  SpanTreeState,
  SpanTreeStats,
  SpanTreeMemoryStats,
  SpanRecord,
  SpanEvent,
  TraceSummaryOptions
} from './core/span-tree.js'

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
