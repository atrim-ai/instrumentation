/**
 * @atrim/instrumentation - Universal OpenTelemetry instrumentation library
 *
 * Provides complete OpenTelemetry SDK initialization with pattern-based
 * span filtering and centralized configuration for any Node.js application.
 *
 * @packageDocumentation
 */

// Core exports (complete OpenTelemetry initialization)
export { initializeInstrumentation, initializePatternMatchingOnly } from './api.js'

// SDK initialization types
export type { SdkInitializationOptions } from './core/sdk-initializer.js'
export { getSdkInstance, shutdownSdk, resetSdk } from './core/sdk-initializer.js'

// OTLP exporter utilities
export type { OtlpExporterOptions } from './core/exporter-factory.js'
export { createOtlpExporter, getOtlpEndpoint } from './core/exporter-factory.js'

// Service detection utilities
export type { ServiceInfo } from './core/service-detector.js'
export { detectServiceInfo, getServiceName, getServiceVersion } from './core/service-detector.js'

// Configuration types and loader
export type { InstrumentationConfig, PatternConfig } from '@atrim/instrumentation-core'
export type { ConfigLoaderOptions } from './core/config-loader.js'
export { loadConfig } from './core/config-loader.js'

// Pattern matching utilities
export { shouldInstrumentSpan, PatternMatcher, getPatternMatcher } from '@atrim/instrumentation-core'

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
