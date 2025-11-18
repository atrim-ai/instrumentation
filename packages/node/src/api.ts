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
import { initializeSdkEffect, type SdkInitializationOptions } from './core/sdk-initializer.js'
import { initializePatternMatcher, loadConfigEffect, logger } from '@atrim/instrument-core'
import { InitializationError, ConfigError } from './core/errors.js'

// ============================================================================
// Effect-Based API
// ============================================================================

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
 * All errors are returned in the error channel, not thrown.
 *
 * @param options - Initialization options
 * @returns Effect that yields the initialized NodeSDK or null
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { initializeInstrumentation } from '@atrim/instrumentation'
 *
 * // Zero-config initialization (recommended)
 * const program = initializeInstrumentation()
 * await Effect.runPromise(program)
 *
 * // With error handling
 * const program = initializeInstrumentation().pipe(
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
 * // With custom OTLP endpoint
 * const program = initializeInstrumentation({
 *   otlp: { endpoint: 'https://otel.company.com:4318' },
 *   serviceName: 'my-service'
 * })
 * ```
 */
export const initializeInstrumentation = (
  options: SdkInitializationOptions = {}
): Effect.Effect<NodeSDK | null, InitializationError | ConfigError> =>
  Effect.gen(function* () {
    // Initialize SDK using Effect-based initializer
    const sdk = yield* initializeSdkEffect(options)

    // If SDK was initialized, set up pattern matcher
    // (in case users are using shouldInstrumentSpan directly)
    // Note: If SDK was skipped, initializeSdkEffect already initialized the pattern matcher
    if (sdk) {
      const config = yield* loadConfigEffect(options).pipe(
        Effect.mapError(
          (error) =>
            new ConfigError({
              reason: `Failed to load config for pattern matcher: ${error.reason}`,
              cause: error
            })
        )
      )
      initializePatternMatcher(config)
    }

    return sdk
  })

/**
 * Initialize pattern matching only
 *
 * Use this if you want manual OpenTelemetry setup with pattern filtering.
 *
 * @param options - Configuration options
 * @returns Effect that yields void
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { initializePatternMatchingOnly } from '@atrim/instrumentation'
 *
 * const program = initializePatternMatchingOnly({
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
export const initializePatternMatchingOnly = (
  options: SdkInitializationOptions = {}
): Effect.Effect<void, ConfigError> =>
  Effect.gen(function* () {
    const config = yield* loadConfigEffect(options).pipe(
      Effect.mapError(
        (error) =>
          new ConfigError({
            reason: `Failed to load configuration: ${error.reason}`,
            cause: error
          })
      )
    )

    yield* Effect.sync(() => {
      initializePatternMatcher(config)
      logger.log('@atrim/instrumentation: Pattern matching initialized (pattern-only mode)')
      logger.log(
        '  Note: NodeSDK is not initialized. Use initializeInstrumentation() for complete setup.'
      )
    })
  })
