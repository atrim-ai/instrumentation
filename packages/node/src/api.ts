/**
 * Public API for standard OpenTelemetry usage
 *
 * This module provides the main entry point for complete OpenTelemetry
 * initialization including NodeSDK, OTLP export, and pattern-based filtering.
 *
 * Available in two flavors:
 * - Effect API (primary): For typed error handling and composability
 * - Promise API (backward compatible): For traditional async/await usage
 */

import { Effect } from 'effect'
import type { NodeSDK } from '@opentelemetry/sdk-node'
import { initializeSdk, type SdkInitializationOptions } from './core/sdk-initializer.js'
import { initializePatternMatcher, logger } from '@atrim/instrument-core'
import { loadConfigWithOptions } from './core/config-loader.js'
import { InitializationError, ConfigError } from './core/errors.js'

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
    const config = await loadConfigWithOptions(options)
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
  const config = await loadConfigWithOptions(options)
  initializePatternMatcher(config)

  logger.log('@atrim/instrumentation: Pattern matching initialized (legacy mode)')
  logger.log(
    '  Note: NodeSDK is not initialized. Use initializeInstrumentation() for complete setup.'
  )
}

// ============================================================================
// Effect-Based API (Primary)
// ============================================================================

/**
 * Initialize OpenTelemetry instrumentation (Effect version)
 *
 * Provides typed error handling and composability with Effect ecosystem.
 * All errors are returned in the error channel, not thrown.
 *
 * @param options - Initialization options
 * @returns Effect that yields the initialized NodeSDK or null
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { initializeInstrumentationEffect } from '@atrim/instrumentation'
 *
 * // Basic usage
 * const program = initializeInstrumentationEffect()
 *
 * await Effect.runPromise(program)
 *
 * // With error handling
 * const program = initializeInstrumentationEffect().pipe(
 *   Effect.catchTag('ConfigError', (error) => {
 *     console.error('Config error:', error.reason)
 *     return Effect.succeed(null)
 *   }),
 *   Effect.catchTag('InitializationError', (error) => {
 *     console.error('Init error:', error.reason)
 *     return Effect.succeed(null)
 *   })
 * )
 *
 * await Effect.runPromise(program)
 *
 * // With custom options
 * const program = initializeInstrumentationEffect({
 *   otlp: { endpoint: 'https://otel.company.com:4318' },
 *   serviceName: 'my-service'
 * })
 * ```
 */
export const initializeInstrumentationEffect = (
  options: SdkInitializationOptions = {}
): Effect.Effect<NodeSDK | null, InitializationError | ConfigError> =>
  Effect.gen(function* () {
    // Initialize SDK with error handling
    const sdk = yield* Effect.tryPromise({
      try: () => initializeSdk(options),
      catch: (error) =>
        new InitializationError({
          reason: 'SDK initialization failed',
          cause: error
        })
    })

    // If SDK was initialized, set up pattern matcher
    if (sdk) {
      yield* Effect.tryPromise({
        try: () => loadConfigWithOptions(options),
        catch: (error) =>
          new ConfigError({
            reason: 'Failed to load config for pattern matcher',
            cause: error
          })
      }).pipe(
        Effect.tap((config) =>
          Effect.sync(() => {
            initializePatternMatcher(config)
          })
        )
      )
    }

    return sdk
  })

/**
 * Initialize pattern matching only (Effect version)
 *
 * Use this if you want manual OpenTelemetry setup with pattern filtering.
 *
 * @param options - Configuration options
 * @returns Effect that yields void
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { initializePatternMatchingOnlyEffect } from '@atrim/instrumentation'
 *
 * const program = initializePatternMatchingOnlyEffect({
 *   configPath: './instrumentation.yaml'
 * }).pipe(
 *   Effect.catchAll((error) => {
 *     console.error('Pattern matching setup failed:', error.reason)
 *     return Effect.succeed(undefined)
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 */
export const initializePatternMatchingOnlyEffect = (
  options: SdkInitializationOptions = {}
): Effect.Effect<void, ConfigError> =>
  Effect.gen(function* () {
    const config = yield* Effect.tryPromise({
      try: () => loadConfigWithOptions(options),
      catch: (error) =>
        new ConfigError({
          reason: 'Failed to load configuration',
          cause: error
        })
    })

    yield* Effect.sync(() => {
      initializePatternMatcher(config)
      logger.log('@atrim/instrumentation: Pattern matching initialized (legacy mode)')
      logger.log(
        '  Note: NodeSDK is not initialized. Use initializeInstrumentation() for complete setup.'
      )
    })
  })
