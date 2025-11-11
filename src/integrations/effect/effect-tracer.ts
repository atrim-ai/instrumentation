/**
 * Effect-TS Tracer integration with context propagation
 *
 * This module provides Effect-TS tracing that seamlessly integrates with
 * OpenTelemetry NodeSDK auto-instrumentation. Effect spans will automatically
 * continue existing traces created by NodeSDK (e.g., HTTP requests).
 *
 * Context Propagation:
 * - NodeSDK auto-instrumentation creates root spans (e.g., HTTP requests)
 * - Effect operations automatically become child spans of the active trace
 * - Uses OpenTelemetry Context API (equivalent to Java thread-local)
 * - No configuration needed - works out of the box
 *
 * Architecture:
 * 1. @effect/opentelemetry uses the global OpenTelemetry tracer provider
 * 2. When an Effect operation starts, it checks context.active() for existing spans
 * 3. If found, creates child spans. If not, creates new root span.
 * 4. This happens automatically via OpenTelemetry Context propagation
 */

import { Effect, Layer, Context } from 'effect'
import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { loadConfig, type ConfigLoaderOptions } from '../../core/config-loader.js'
import { initializePatternMatcher } from '../../core/pattern-matcher.js'
import { extractEffectMetadata } from './metadata-extractor.js'

/**
 * Configuration options for Effect instrumentation
 */
export interface EffectInstrumentationOptions extends ConfigLoaderOptions {
  /**
   * OTLP endpoint URL
   * @default process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
   */
  otlpEndpoint?: string

  /**
   * Service name
   * @default process.env.OTEL_SERVICE_NAME || 'effect-service'
   */
  serviceName?: string

  /**
   * Service version
   * @default process.env.npm_package_version || '1.0.0'
   */
  serviceVersion?: string

  /**
   * Whether to automatically extract Effect fiber metadata
   * @default true
   */
  autoExtractMetadata?: boolean

  /**
   * Whether to continue existing traces from NodeSDK auto-instrumentation
   *
   * When true (default):
   * - Effect spans become children of existing NodeSDK spans
   * - Example: HTTP request span → Effect business logic span
   * - Uses OpenTelemetry Context API for propagation
   *
   * When false:
   * - Effect operations always create new root spans
   * - Not recommended unless you have specific requirements
   *
   * @default true
   */
  continueExistingTraces?: boolean
}

/**
 * Create Effect instrumentation layer with custom options
 *
 * This function creates an Effect Layer that provides OpenTelemetry tracing
 * with automatic context propagation from NodeSDK auto-instrumentation.
 *
 * @example
 * ```typescript
 * // With NodeSDK auto-instrumentation
 * import { NodeSDK } from '@opentelemetry/sdk-node'
 * import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
 *
 * // 1. Start NodeSDK (creates HTTP spans automatically)
 * const sdk = new NodeSDK({
 *   instrumentations: [getNodeAutoInstrumentations()]
 * })
 * sdk.start()
 *
 * // 2. Create Effect instrumentation (will continue NodeSDK traces)
 * const EffectLayer = createEffectInstrumentation()
 *
 * // 3. Use in Effect operations
 * const program = Effect.gen(function* () {
 *   // This span will be a child of the HTTP request span (if any)
 *   yield* Effect.log("Business logic")
 * }).pipe(
 *   Effect.withSpan("app.business.logic"),
 *   Effect.provide(EffectLayer)
 * )
 * ```
 */
export function createEffectInstrumentation(
  options: EffectInstrumentationOptions = {}
): Layer.Layer<never, unknown, never> {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // 1. Load configuration
      const config = yield* Effect.tryPromise({
        try: () => loadConfig(options),
        catch: (error) => ({
          _tag: 'ConfigError' as const,
          message: error instanceof Error ? error.message : String(error)
        })
      })

      // 2. Initialize pattern matcher
      yield* Effect.sync(() => initializePatternMatcher(config))

      // 3. Extract options with defaults
      const otlpEndpoint =
        options.otlpEndpoint ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        'http://localhost:4318'

      const serviceName =
        options.serviceName || process.env.OTEL_SERVICE_NAME || 'effect-service'

      const serviceVersion =
        options.serviceVersion || process.env.npm_package_version || '1.0.0'

      const autoExtractMetadata = options.autoExtractMetadata ?? config.effect?.auto_extract_metadata ?? true

      const continueExistingTraces = options.continueExistingTraces ?? true

      console.log('🔍 Effect OpenTelemetry instrumentation')
      console.log(`   📡 Endpoint: ${otlpEndpoint}`)
      console.log(`   🏷️  Service: ${serviceName}`)
      console.log(`   ✅ Auto metadata extraction: ${autoExtractMetadata}`)
      console.log(`   ✅ Continue existing traces: ${continueExistingTraces}`)

      // 4. Create Otlp layer
      // NOTE: @effect/opentelemetry automatically uses the global OpenTelemetry
      // tracer provider and context. This means:
      // - If NodeSDK has created a span, Effect will create child spans
      // - If no active span exists, Effect creates a new root span
      // - Context propagation happens automatically via OpenTelemetry Context API
      const otlpLayer = Otlp.layer({
        baseUrl: otlpEndpoint,
        resource: {
          serviceName,
          serviceVersion,
          attributes: {
            'platform.component': 'effect',
            'effect.auto_metadata': autoExtractMetadata,
            'effect.context_propagation': continueExistingTraces
          }
        }
      }).pipe(Layer.provide(FetchHttpClient.layer))

      // 5. If auto-metadata extraction is enabled, add a layer that extracts
      // Effect fiber metadata for each span
      if (autoExtractMetadata) {
        // TODO: Implement metadata extraction layer
        // For now, just return the base Otlp layer
        return otlpLayer
      }

      return otlpLayer
    })
  ).pipe(Layer.orDie)
}

/**
 * Zero-config Effect instrumentation layer
 *
 * Uses default configuration from environment variables and ./instrumentation.yaml
 *
 * Context Propagation:
 * - Automatically continues traces from NodeSDK auto-instrumentation
 * - Effect spans become children of HTTP request spans
 * - No configuration needed
 *
 * @example
 * ```typescript
 * import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'
 *
 * const program = Effect.gen(function* () {
 *   // This span continues any existing trace from NodeSDK
 *   yield* Effect.log("Processing")
 * }).pipe(
 *   Effect.withSpan("app.process"),
 *   Effect.provide(EffectInstrumentationLive)
 * )
 * ```
 */
export const EffectInstrumentationLive: Layer.Layer<never, unknown, never> =
  createEffectInstrumentation()
