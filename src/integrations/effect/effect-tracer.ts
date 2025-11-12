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

import { Effect, Layer } from 'effect'
import type { Tracer as EffectTracer } from 'effect'
import * as Otlp from '@effect/opentelemetry/Otlp'
import * as OtelTracer from '@effect/opentelemetry/Tracer'
import { FetchHttpClient } from '@effect/platform'
import { context, trace, type SpanContext, TraceFlags } from '@opentelemetry/api'
import { loadConfig, type ConfigLoaderOptions } from '../../core/config-loader.js'
import { initializePatternMatcher } from '../../core/pattern-matcher.js'
import { extractEffectMetadata } from './metadata-extractor.js'
import { logger } from '../../core/logger.js'

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

      // 2. Configure logger based on config
      yield* Effect.sync(() => {
        const loggingLevel = config.instrumentation.logging || 'on'
        logger.setLevel(loggingLevel)
      })

      // 3. Initialize pattern matcher
      yield* Effect.sync(() => initializePatternMatcher(config))

      // 4. Extract options with defaults
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

      logger.log('🔍 Effect OpenTelemetry instrumentation')
      logger.log(`   📡 Endpoint: ${otlpEndpoint}`)
      logger.log(`   🏷️  Service: ${serviceName}`)
      logger.log(`   ✅ Auto metadata extraction: ${autoExtractMetadata}`)
      logger.log(`   ✅ Continue existing traces: ${continueExistingTraces}`)

      // 5. Create Otlp layer for Effect operations
      // CRITICAL: Uses tracerContext callback to bridge Effect spans to OpenTelemetry context
      // This allows bidirectional context propagation:
      // - NodeSDK spans → Effect spans (child relationship)
      // - Effect spans → NodeSDK spans (subsequent auto-instrumented calls)
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
        },
        // Bridge Effect context to OpenTelemetry global context
        // This is essential for context propagation to work properly
        tracerContext: <X>(f: () => X, span: Tracer.AnySpan): X => {
          // Only bridge actual Effect spans (not ExternalSpan)
          if (span._tag !== 'Span') {
            return f()
          }

          // Create OpenTelemetry SpanContext from Effect span metadata
          const spanContext: SpanContext = {
            traceId: span.traceId,
            spanId: span.spanId,
            traceFlags: span.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE
          }

          // Create a non-recording span to represent the Effect span in OTel context
          const otelSpan = trace.wrapSpanContext(spanContext)

          // Set as active span in OpenTelemetry global context
          return context.with(trace.setSpan(context.active(), otelSpan), f)
        }
      }).pipe(Layer.provide(FetchHttpClient.layer))

      // 6. If auto-metadata extraction is enabled, add a layer that extracts
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
 * Uses the global OpenTelemetry tracer provider that was set up by
 * initializeInstrumentation(). This ensures all traces (Express, Effect, etc.)
 * go to the same OTLP endpoint.
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
export const EffectInstrumentationLive: Layer.Layer<never, never, never> =
  Effect.sync(() => {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
    const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
    const serviceVersion = process.env.npm_package_version || '1.0.0'

    logger.log('🔍 Effect OpenTelemetry tracer (Otlp.layer)')
    logger.log(`   📡 Endpoint: ${endpoint}`)
    logger.log(`   🏷️  Service: ${serviceName}`)

    // Use Otlp.layer() like atrim platform
    // This creates Effect-specific spans that get exported via OTLP
    return Otlp.layer({
      baseUrl: endpoint,
      resource: {
        serviceName,
        serviceVersion,
        attributes: {
          'platform.component': 'effect'
        }
      },
      // CRITICAL: Bridge Effect context to OpenTelemetry global context
      // This allows NodeSDK auto-instrumentation to see Effect spans as parent spans
      tracerContext: <X>(f: () => X, span: EffectTracer.AnySpan): X => {
        // Only bridge actual Effect spans (not ExternalSpan)
        if (span._tag !== 'Span') {
          return f()
        }

        // Create OpenTelemetry SpanContext from Effect span metadata
        const spanContext: SpanContext = {
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: span.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE
        }

        // Create a non-recording span to represent the Effect span in OTel context
        const otelSpan = trace.wrapSpanContext(spanContext)

        // Set as active span in OpenTelemetry global context
        return context.with(trace.setSpan(context.active(), otelSpan), f)
      }
    }).pipe(Layer.provide(FetchHttpClient.layer))
  }).pipe(Layer.unwrapEffect)
