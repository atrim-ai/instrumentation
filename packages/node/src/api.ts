/**
 * Public API for standard OpenTelemetry usage
 *
 * This module provides the main entry point for complete OpenTelemetry
 * initialization including NodeSDK, OTLP export, and pattern-based filtering.
 */

import type { NodeSDK } from '@opentelemetry/sdk-node'
import { initializeSdk, type SdkInitializationOptions } from './core/sdk-initializer.js'
import { initializePatternMatcher, loadConfig, logger } from '@atrim/instrument-core'

/**
 * Initialize OpenTelemetry instrumentation with complete SDK setup
 *
 * This function provides a single-line initialization for OpenTelemetry:
 * - Loads instrumentation.yaml configuration
 * - Creates and configures OTLP exporter
 * - Sets up pattern-based span filtering
 * - Initializes NodeSDK with auto-instrumentations
 * - Registers graceful shutdown handlers
 *
 * Configuration priority (highest to lowest):
 * 1. Explicit config object (options.config)
 * 2. Environment variable (ATRIM_INSTRUMENTATION_CONFIG)
 * 3. Explicit path/URL (options.configPath or options.configUrl)
 * 4. Project root file (./instrumentation.yaml)
 * 5. Default config (built-in defaults)
 *
 * OTLP endpoint priority:
 * 1. options.otlp.endpoint
 * 2. OTEL_EXPORTER_OTLP_TRACES_ENDPOINT environment variable
 * 3. OTEL_EXPORTER_OTLP_ENDPOINT environment variable
 * 4. Default: http://localhost:4318/v1/traces
 *
 * Service name priority:
 * 1. options.serviceName
 * 2. OTEL_SERVICE_NAME environment variable
 * 3. package.json name field
 * 4. Default: 'unknown-service'
 *
 * @param options - Initialization options
 * @returns The initialized NodeSDK instance
 *
 * @example
 * ```typescript
 * // Zero-config initialization (recommended)
 * await initializeInstrumentation()
 * // Auto-detects everything from env vars and package.json
 *
 * // With custom OTLP endpoint
 * await initializeInstrumentation({
 *   otlp: {
 *     endpoint: 'https://otel-collector.company.com:4318'
 *   }
 * })
 *
 * // With custom service name
 * await initializeInstrumentation({
 *   serviceName: 'my-api-service',
 *   serviceVersion: '2.0.0'
 * })
 *
 * // Disable auto-instrumentation (manual spans only)
 * await initializeInstrumentation({
 *   autoInstrument: false
 * })
 *
 * // With custom config file
 * await initializeInstrumentation({
 *   configPath: './config/custom-instrumentation.yaml'
 * })
 *
 * // With remote config URL
 * await initializeInstrumentation({
 *   configUrl: 'https://config.company.com/instrumentation.yaml',
 *   cacheTimeout: 300_000 // 5 minutes
 * })
 *
 * // Advanced: Full control
 * await initializeInstrumentation({
 *   otlp: {
 *     endpoint: process.env.CUSTOM_ENDPOINT,
 *     headers: { 'x-api-key': 'secret' }
 *   },
 *   serviceName: 'my-service',
 *   autoInstrument: true,
 *   instrumentations: [], // custom instrumentations
 *   sdk: {
 *     // Additional NodeSDK configuration
 *   }
 * })
 * ```
 */
export async function initializeInstrumentation(
  options: SdkInitializationOptions = {}
): Promise<NodeSDK | null> {
  // Initialize the complete SDK with all features
  // Returns null if OpenTelemetry is already initialized elsewhere
  const sdk = await initializeSdk(options)

  // If SDK was initialized, also set up pattern matcher for backwards compatibility
  // (in case users are using shouldInstrumentSpan directly)
  // Note: If SDK was skipped, initializeSdk already initialized the pattern matcher
  if (sdk) {
    const config = await loadConfig(options)
    initializePatternMatcher(config)
  }

  return sdk
}

/**
 * Legacy initialization function for pattern-only mode
 *
 * This function only initializes pattern matching without setting up the NodeSDK.
 * Use this if you want to manually configure OpenTelemetry while still using
 * pattern-based filtering.
 *
 * @deprecated Use initializeInstrumentation() instead for complete setup
 */
export async function initializePatternMatchingOnly(
  options: SdkInitializationOptions = {}
): Promise<void> {
  const config = await loadConfig(options)
  initializePatternMatcher(config)

  logger.log('@atrim/instrumentation: Pattern matching initialized (legacy mode)')
  logger.log(
    '  Note: NodeSDK is not initialized. Use initializeInstrumentation() for complete setup.'
  )
}
