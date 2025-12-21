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
import * as Tracer from '@effect/opentelemetry/Tracer'
import * as Resource from '@effect/opentelemetry/Resource'
import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { context, trace, type SpanContext, TraceFlags } from '@opentelemetry/api'
import {
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS
} from '@opentelemetry/semantic-conventions'
import { initializePatternMatcher, logger } from '@atrim/instrument-core'
import { loadConfigWithOptions, type ConfigLoaderOptions } from '../../core/config-loader.js'

// SDK metadata for resource attributes
// telemetry.sdk.name identifies the INSTRUMENTATION library, not the exporter
const SDK_NAME = '@effect/opentelemetry'

// Custom attribute for exporter mode
const ATTR_TELEMETRY_EXPORTER_MODE = 'telemetry.exporter.mode'

/**
 * Configuration options for Effect instrumentation
 */
export interface EffectInstrumentationOptions extends ConfigLoaderOptions {
  /**
   * Service name for Effect spans
   * @default process.env.OTEL_SERVICE_NAME || 'effect-service'
   */
  serviceName?: string

  /**
   * Service version for Effect spans
   * @default process.env.npm_package_version || '1.0.0'
   */
  serviceVersion?: string

  /**
   * Whether to automatically extract Effect fiber metadata
   * @default true
   */
  autoExtractMetadata?: boolean

  /**
   * OTLP endpoint URL (only used when exporter mode is 'standalone')
   * @default process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
   */
  otlpEndpoint?: string

  /**
   * Exporter mode:
   * - 'unified': Use global TracerProvider from Node SDK (recommended, enables filtering)
   * - 'standalone': Use Effect's own OTLP exporter (bypasses Node SDK filtering)
   * @default 'unified'
   */
  exporterMode?: 'unified' | 'standalone'
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
export function createEffectInstrumentation(options: EffectInstrumentationOptions = {}) {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // 1. Load configuration
      const config = yield* Effect.tryPromise({
        try: () => loadConfigWithOptions(options),
        catch: (error) => ({
          _tag: 'ConfigError' as const,
          message: error instanceof Error ? error.message : String(error)
        })
      })

      // 2. Check effect.enabled flag (supports env var override)
      const effectEnabled =
        process.env.OTEL_EFFECT_ENABLED !== 'false' && (config.effect?.enabled ?? true)

      if (!effectEnabled) {
        logger.log('@atrim/instrumentation/effect: Effect tracing disabled via config')
        return Layer.empty
      }

      // 3. Configure logger based on config
      yield* Effect.sync(() => {
        const loggingLevel = config.instrumentation.logging || 'on'
        logger.setLevel(loggingLevel)
      })

      // 4. Initialize pattern matcher (for global shouldInstrumentSpan function)
      yield* Effect.sync(() => initializePatternMatcher(config))

      // 5. Extract service info and exporter mode
      const serviceName = options.serviceName || process.env.OTEL_SERVICE_NAME || 'effect-service'
      const serviceVersion = options.serviceVersion || process.env.npm_package_version || '1.0.0'
      const exporterMode = options.exporterMode ?? config.effect?.exporter ?? 'unified'

      // Common resource attributes
      const resourceAttributes = {
        'platform.component': 'effect',
        [ATTR_TELEMETRY_SDK_LANGUAGE]: TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
        [ATTR_TELEMETRY_SDK_NAME]: SDK_NAME,
        [ATTR_TELEMETRY_EXPORTER_MODE]: exporterMode
      }

      if (exporterMode === 'standalone') {
        // Standalone mode: Use Effect's own OTLP exporter
        // NOTE: This bypasses Node SDK filtering (PatternSpanProcessor)
        const otlpEndpoint =
          options.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

        logger.log('Effect OpenTelemetry instrumentation (standalone)')
        logger.log(`  Service: ${serviceName}`)
        logger.log(`  Endpoint: ${otlpEndpoint}`)
        logger.log('  WARNING: Standalone mode bypasses Node SDK filtering')

        return Otlp.layer({
          baseUrl: otlpEndpoint,
          resource: {
            serviceName,
            serviceVersion,
            attributes: resourceAttributes
          },
          // Bridge Effect context to OpenTelemetry global context
          tracerContext: <X>(f: () => X, span: EffectTracer.AnySpan): X => {
            if (span._tag !== 'Span') {
              return f()
            }
            const spanContext: SpanContext = {
              traceId: span.traceId,
              spanId: span.spanId,
              traceFlags: span.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE
            }
            const otelSpan = trace.wrapSpanContext(spanContext)
            return context.with(trace.setSpan(context.active(), otelSpan), f)
          }
        }).pipe(Layer.provide(FetchHttpClient.layer))
      } else {
        // Unified mode (default): Use global TracerProvider from Node SDK
        // This ensures Effect spans go through PatternSpanProcessor for filtering
        logger.log('Effect OpenTelemetry instrumentation (unified)')
        logger.log(`  Service: ${serviceName}`)
        logger.log('  Using global TracerProvider for span export')

        return Tracer.layerGlobal.pipe(
          Layer.provide(
            Resource.layer({
              serviceName,
              serviceVersion,
              attributes: resourceAttributes
            })
          )
        )
      }
    })
  ).pipe(Layer.orDie)
}

/**
 * Zero-config Effect instrumentation layer
 *
 * Uses the global OpenTelemetry tracer provider that was set up by
 * initializeInstrumentation(). This ensures all traces (Express, Effect, etc.)
 * go through the same TracerProvider and PatternSpanProcessor.
 *
 * Context Propagation:
 * - Automatically continues traces from NodeSDK auto-instrumentation
 * - Effect spans become children of HTTP request spans
 * - Respects http.ignore_incoming_paths and other filtering patterns
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
export const EffectInstrumentationLive = Effect.sync(() => {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'

  logger.minimal(`@atrim/instrumentation/effect: Effect tracing enabled (${serviceName})`)
  logger.log('Effect OpenTelemetry tracer (unified)')
  logger.log(`  Service: ${serviceName}`)

  // Use Tracer.layerGlobal which uses trace.getTracerProvider()
  // This connects to NodeSDK's TracerProvider with PatternSpanProcessor
  // for unified filtering based on instrumentation.yaml
  return Tracer.layerGlobal.pipe(
    Layer.provide(
      Resource.layer({
        serviceName,
        serviceVersion,
        attributes: {
          'platform.component': 'effect',
          [ATTR_TELEMETRY_SDK_LANGUAGE]: TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
          [ATTR_TELEMETRY_SDK_NAME]: SDK_NAME,
          [ATTR_TELEMETRY_EXPORTER_MODE]: 'unified'
        }
      })
    )
  )
}).pipe(Layer.unwrapEffect)
