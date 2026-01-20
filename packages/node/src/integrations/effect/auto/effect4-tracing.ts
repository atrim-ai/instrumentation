/**
 * Effect 4.x Tracing Layer
 *
 * Provides a simple OTLP tracing layer for Effect 4.x applications.
 *
 * In Effect 4.x:
 * - Spans are created at BUILD TIME by @clayroach/effect-unplugin
 * - Runtime just needs to export spans to OTLP collector
 * - No Supervisor needed - unplugin handles span creation
 *
 * @example
 * ```typescript
 * import { Effect4TracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Spans automatically created by unplugin for:
 *   // - Effect.gen, Effect.fork, Effect.all, Effect.forEach
 *   yield* Effect.all([doA(), doB()])
 * }).pipe(Effect.provide(Effect4TracingLive))
 * ```
 */

import { Effect, Layer } from 'effect'
import { OtlpTracer } from 'effect/unstable/observability'
import { FetchHttpClient } from 'effect/unstable/http'
import { loadFullConfigSync } from './config.js'
import { logger } from '@atrim/instrument-core/logger'

// ============================================================================
// Configuration
// ============================================================================

interface TracingConfig {
  readonly url: string
  readonly serviceName: string
  readonly serviceVersion: string
  readonly exportInterval?: number | undefined
  readonly maxBatchSize?: number | undefined
  readonly headers?: Record<string, string> | undefined
}

/**
 * Load tracing configuration from instrumentation.yaml and environment
 */
function loadTracingConfig(): TracingConfig {
  const config = loadFullConfigSync()
  const exporterConfig = config.effect?.exporter_config

  // Environment takes precedence, then config file, then defaults
  const url =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || exporterConfig?.endpoint || 'http://localhost:4318'

  // Ensure we're hitting the traces endpoint
  const tracesUrl = url.endsWith('/v1/traces') ? url : `${url}/v1/traces`

  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'

  return {
    url: tracesUrl,
    serviceName,
    serviceVersion,
    exportInterval: exporterConfig?.batch?.scheduled_delay_millis,
    maxBatchSize: exporterConfig?.batch?.max_export_batch_size,
    headers: exporterConfig?.headers
  }
}

// ============================================================================
// Layers
// ============================================================================

/**
 * Create the Effect 4.x tracing layer with custom configuration
 */
export const createEffect4TracingLayer = (
  customConfig?: Partial<TracingConfig>
): Layer.Layer<never, never, never> => {
  const config = { ...loadTracingConfig(), ...customConfig }

  logger.log('@atrim/effect4-tracing: Setting up OTLP tracer')
  logger.log(`  URL: ${config.url}`)
  logger.log(`  Service: ${config.serviceName}`)

  // Create OTLP tracer layer
  const otlpLayer = OtlpTracer.layer({
    url: config.url,
    resource: {
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion
    },
    headers: config.headers,
    exportInterval: config.exportInterval,
    maxBatchSize: config.maxBatchSize
  })

  // Provide the FetchHttpClient that OtlpTracer needs
  return otlpLayer.pipe(Layer.provide(FetchHttpClient.layer))
}

/**
 * Effect 4.x Tracing Layer - zero-config OTLP export
 *
 * Uses environment variables and instrumentation.yaml for configuration:
 * - OTEL_EXPORTER_OTLP_ENDPOINT (default: http://localhost:4318)
 * - OTEL_SERVICE_NAME (default: effect-service)
 *
 * @example
 * ```typescript
 * import { Effect4TracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   yield* myEffect()
 * }).pipe(Effect.provide(Effect4TracingLive))
 *
 * await Effect.runPromise(program)
 * ```
 */
export const Effect4TracingLive: Layer.Layer<never, never, never> = Layer.unwrap(
  Effect.sync(() => createEffect4TracingLayer())
)

/**
 * Wrapper to add tracing to an effect
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(
 *   withEffect4Tracing(myProgram)
 * )
 * ```
 */
export const withEffect4Tracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, never>> => effect.pipe(Effect.provide(Effect4TracingLive))
