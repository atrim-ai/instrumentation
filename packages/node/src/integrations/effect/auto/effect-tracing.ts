/**
 * Effect-Native Tracing Layer
 *
 * Uses @effect/opentelemetry's NodeSdk.layer for proper Effect integration.
 * This provides automatic HTTP request tracing and Effect.withSpan() support.
 *
 * Requires @effect/opentelemetry peer dependency to be installed.
 */

import { Effect, Layer, Supervisor } from 'effect'
import { NodeSdk, Tracer as OtelTracer, Resource } from '@effect/opentelemetry'
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  BasicTracerProvider
} from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import * as OtelApi from '@opentelemetry/api'
import { logger } from '@atrim/instrument-core'
import { loadFullConfig } from './config.js'
import { createAutoTracingSupervisor } from './supervisor.js'

/**
 * Create a layer that provides Effect-native tracing via NodeSdk.layer
 *
 * This integrates with Effect's built-in tracing system, which means:
 * - HTTP requests are automatically traced by @effect/platform
 * - Effect.withSpan() creates proper OTel spans
 * - Parent-child span relationships work correctly
 * - No need to fork fibers for tracing to work
 *
 * Configuration is loaded from instrumentation.yaml (exporter_config section).
 *
 * @example
 * ```typescript
 * import { EffectTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * // HTTP requests automatically traced!
 * const HttpLive = router.pipe(
 *   HttpServer.serve(),
 *   Layer.provide(ServerLive),
 *   Layer.provide(EffectTracingLive),
 * )
 * ```
 */
export const createEffectTracingLayer = (): Layer.Layer<never> => {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // Load config from instrumentation.yaml
      const config = yield* loadFullConfig()

      // Get service info
      const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
      const serviceVersion = process.env.npm_package_version || '1.0.0'

      // Get exporter config
      const exporterConfig = config.effect?.exporter_config ?? {
        type: 'otlp' as const,
        processor: 'batch' as const
      }

      logger.log('@atrim/auto-trace: Effect-native tracing enabled')
      logger.log(`  Service: ${serviceName}`)
      logger.log(`  Exporter: ${exporterConfig.type}`)

      // Handle 'none' type
      if (exporterConfig.type === 'none') {
        logger.log('@atrim/auto-trace: Exporter type is "none", using empty layer')
        return Layer.empty
      }

      // Create span processor based on config
      const createSpanProcessor = () => {
        // Console exporter
        if (exporterConfig.type === 'console') {
          logger.log('@atrim/auto-trace: Using ConsoleSpanExporter with SimpleSpanProcessor')
          return new SimpleSpanProcessor(new ConsoleSpanExporter())
        }

        // OTLP exporter
        const endpoint =
          exporterConfig.endpoint ||
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
          'http://localhost:4318'
        logger.log(`@atrim/auto-trace: Using OTLPTraceExporter (${endpoint})`)

        const otlpConfig: { url: string; headers?: Record<string, string> } = {
          url: `${endpoint}/v1/traces`
        }
        if (exporterConfig.headers) {
          otlpConfig.headers = exporterConfig.headers
          logger.log(
            `@atrim/auto-trace: Using custom headers: ${Object.keys(exporterConfig.headers).join(', ')}`
          )
        }

        const exporter = new OTLPTraceExporter(otlpConfig)

        if (exporterConfig.processor === 'simple') {
          logger.log('@atrim/auto-trace: Using SimpleSpanProcessor')
          return new SimpleSpanProcessor(exporter)
        }

        // Default: batch processor
        const batchConfig = exporterConfig.batch ?? {
          scheduled_delay_millis: 1000,
          max_export_batch_size: 100
        }
        logger.log('@atrim/auto-trace: Using BatchSpanProcessor')
        return new BatchSpanProcessor(exporter, {
          scheduledDelayMillis: batchConfig.scheduled_delay_millis,
          maxExportBatchSize: batchConfig.max_export_batch_size
        })
      }

      // Create NodeSdk layer - this provides Effect's Tracer and integrates with OTel
      const sdkLayer = NodeSdk.layer(() => ({
        resource: {
          serviceName,
          serviceVersion
        },
        spanProcessor: createSpanProcessor()
      }))

      logger.log('@atrim/auto-trace: NodeSdk layer created - HTTP requests will be auto-traced')

      // Return the layer, discarding the Resource output since we don't need it
      return Layer.discard(sdkLayer)
    })
  )
}

/**
 * Effect-native tracing layer using @effect/opentelemetry
 *
 * This is the **recommended** layer for Effect HTTP applications. It provides:
 * - Automatic HTTP request tracing (built into @effect/platform)
 * - Full Effect.withSpan() support for manual spans
 * - Proper parent-child span relationships
 * - No need to fork fibers manually
 *
 * Configuration is loaded from your instrumentation.yaml file.
 *
 * @example
 * ```yaml
 * # instrumentation.yaml
 * effect:
 *   exporter_config:
 *     type: otlp        # or 'console' for dev
 *     endpoint: http://localhost:4318
 *     headers:
 *       x-api-key: your-key
 *     processor: batch   # or 'simple' for immediate export
 * ```
 *
 * @example
 * ```typescript
 * import { EffectTracingLive } from '@atrim/instrument-node/effect/auto'
 * import { HttpRouter, HttpServer } from "@effect/platform"
 * import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
 *
 * const router = HttpRouter.empty.pipe(
 *   HttpRouter.get("/", Effect.succeed(HttpServerResponse.text("Hello!"))),
 * )
 *
 * const HttpLive = router.pipe(
 *   HttpServer.serve(),
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 *   Layer.provide(EffectTracingLive),  // <- Just add this!
 * )
 *
 * NodeRuntime.runMain(Layer.launch(HttpLive))
 * // All HTTP requests now automatically traced!
 * ```
 */
export const EffectTracingLive: Layer.Layer<never> = createEffectTracingLayer()

// ============================================================================
// Combined Tracing Layer (Effect HTTP + Fiber Supervisor)
// ============================================================================

/**
 * Create a combined layer that provides both:
 * 1. Effect-native HTTP tracing (via Effect's Tracer + global OTel provider)
 * 2. Fiber-level auto-tracing (via Supervisor)
 *
 * This gives you automatic spans for:
 * - Every HTTP request (from Effect's platform middleware)
 * - Every forked fiber (from our Supervisor)
 *
 * No manual Effect.withSpan() calls needed.
 *
 * ARCHITECTURE NOTE:
 * Unlike EffectTracingLive which uses NodeSdk.layer (scoped provider),
 * CombinedTracingLive uses a single GLOBAL TracerProvider so that both
 * Effect's Tracer and our Supervisor use the same provider and exporter.
 *
 * This solves the dual-provider problem where HTTP spans and fiber spans
 * would otherwise go to different exporters.
 */
export const createCombinedTracingLayer = (): Layer.Layer<never> => {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // Load config from instrumentation.yaml
      const config = yield* loadFullConfig()

      // Get service info
      const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
      const serviceVersion = process.env.npm_package_version || '1.0.0'

      // Get exporter config
      const exporterConfig = config.effect?.exporter_config ?? {
        type: 'otlp' as const,
        processor: 'batch' as const
      }

      // Get auto-tracing config for supervisor
      const autoConfig = config.effect?.auto_instrumentation ?? {
        enabled: true,
        granularity: 'fiber' as const,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: []
        },
        span_relationships: {
          type: 'parent-child' as const
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }

      logger.log('@atrim/auto-trace: Combined tracing enabled (HTTP + Fiber)')
      logger.log(`  Service: ${serviceName}`)
      logger.log(`  Exporter: ${exporterConfig.type}`)

      // Handle 'none' type
      if (exporterConfig.type === 'none') {
        logger.log('@atrim/auto-trace: Exporter type is "none", using empty layer')
        return Layer.empty
      }

      // Create span exporter based on config
      const createSpanExporter = () => {
        if (exporterConfig.type === 'console') {
          logger.log('@atrim/auto-trace: Using ConsoleSpanExporter')
          return new ConsoleSpanExporter()
        }

        const endpoint =
          exporterConfig.endpoint ||
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
          'http://localhost:4318'
        logger.log(`@atrim/auto-trace: Using OTLPTraceExporter (${endpoint})`)

        const otlpConfig: { url: string; headers?: Record<string, string> } = {
          url: `${endpoint}/v1/traces`
        }
        if (exporterConfig.headers) {
          otlpConfig.headers = exporterConfig.headers
          logger.log(
            `@atrim/auto-trace: Using custom headers: ${Object.keys(exporterConfig.headers).join(', ')}`
          )
        }

        return new OTLPTraceExporter(otlpConfig)
      }

      // Create span processor
      const createSpanProcessor = () => {
        const exporter = createSpanExporter()

        if (exporterConfig.processor === 'simple' || exporterConfig.type === 'console') {
          logger.log('@atrim/auto-trace: Using SimpleSpanProcessor')
          return new SimpleSpanProcessor(exporter)
        }

        const batchConfig = exporterConfig.batch ?? {
          scheduled_delay_millis: 1000,
          max_export_batch_size: 100
        }
        logger.log('@atrim/auto-trace: Using BatchSpanProcessor')
        return new BatchSpanProcessor(exporter, {
          scheduledDelayMillis: batchConfig.scheduled_delay_millis,
          maxExportBatchSize: batchConfig.max_export_batch_size
        })
      }

      // === SINGLE GLOBAL TRACERPROVIDER ARCHITECTURE ===
      //
      // 1. Create a BasicTracerProvider with the exporter
      // 2. Register it as the GLOBAL provider
      // 3. Use Effect's Tracer.layerGlobal (uses global provider for Effect spans)
      // 4. Supervisor also uses global provider via OtelApi.trace.getTracer()
      //
      // This ensures ALL spans (HTTP + fiber) go to the same exporter.

      // Create a layer that sets up the global TracerProvider
      const globalProviderLayer = Layer.effectDiscard(
        Effect.sync(() => {
          const provider = new BasicTracerProvider({
            resource: resourceFromAttributes({
              [ATTR_SERVICE_NAME]: serviceName,
              [ATTR_SERVICE_VERSION]: serviceVersion
            }),
            spanProcessors: [createSpanProcessor()]
          })

          // Register as the global tracer provider
          OtelApi.trace.setGlobalTracerProvider(provider)
          logger.log('@atrim/auto-trace: Global TracerProvider registered')
        })
      )

      // Create the Resource layer for @effect/opentelemetry
      const resourceLayer = Resource.layer({
        serviceName,
        serviceVersion
      })

      // Create Effect Tracer layer that uses the global provider
      // OtelTracer.layerGlobal uses OtelApi.trace.getTracerProvider() internally
      const effectTracerLayer = OtelTracer.layerGlobal

      // Create Supervisor layer for fiber-level tracing
      // The supervisor uses OtelApi.trace.getTracer() which gets the global provider
      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      logger.log('@atrim/auto-trace: Combined layer created')
      logger.log('  - HTTP requests: auto-traced via Effect platform (global provider)')
      logger.log('  - Forked fibers: auto-traced via Supervisor (global provider)')

      // Compose layers:
      // 1. globalProviderLayer - sets up the global OTel provider
      // 2. resourceLayer - provides Resource service for effectTracerLayer
      // 3. effectTracerLayer - provides Effect's Tracer using global provider
      // 4. supervisorLayer - adds fiber supervision
      //
      // effectTracerLayer requires Resource, so we provide it
      const tracerWithResource = effectTracerLayer.pipe(Layer.provide(resourceLayer))

      // Merge all layers together
      return Layer.mergeAll(globalProviderLayer, Layer.discard(tracerWithResource), supervisorLayer)
    })
  )
}

/**
 * Combined tracing layer providing both HTTP and fiber-level auto-tracing
 *
 * This is the **most comprehensive** tracing option. You get automatic spans for:
 * - Every HTTP request (from Effect's @effect/platform middleware)
 * - Every forked fiber (from our Supervisor)
 *
 * No manual Effect.withSpan() calls needed - everything is traced automatically.
 *
 * @example
 * ```yaml
 * # instrumentation.yaml
 * effect:
 *   auto_instrumentation:
 *     enabled: true
 *     granularity: fiber
 *   exporter_config:
 *     type: otlp
 *     endpoint: http://localhost:4318
 * ```
 *
 * @example
 * ```typescript
 * import { CombinedTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const HttpLive = router.pipe(
 *   HttpServer.serve(),
 *   Layer.provide(ServerLive),
 *   Layer.provide(CombinedTracingLive),
 * )
 *
 * // Both HTTP requests AND forked fibers are auto-traced!
 * ```
 */
export const CombinedTracingLive: Layer.Layer<never> = createCombinedTracingLayer()
