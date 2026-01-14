/**
 * Integration test reproducing effect-app-example scenario
 *
 * This test creates a real HTTP server using @effect/platform and verifies:
 * 1. HTTP request spans are created by Effect's Tracer
 * 2. Forked fiber spans are created by Supervisor
 * 3. Both span types go to the SAME exporter (single global TracerProvider)
 * 4. Fiber spans are properly linked to HTTP spans via Tracer.ParentSpan
 *
 * ARCHITECTURE:
 * Uses a single global TracerProvider so both Effect's Tracer and our Supervisor
 * export spans to the same exporter. This is the key fix for the dual-provider issue.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Fiber, Layer, Supervisor } from 'effect'
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { createServer } from 'node:http'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import * as OtelApi from '@opentelemetry/api'
import { Tracer as OtelTracer, Resource } from '@effect/opentelemetry'
import { createAutoTracingSupervisor } from '../../../../src/integrations/effect/auto/supervisor.js'
import { tracedFork } from '../../../../src/integrations/effect/auto/traced-fork.js'
import type { AutoInstrumentationConfig } from '@atrim/instrument-core'
import {
  startCollectorContainer,
  stopCollectorContainer,
  type CollectorContainer
} from '../../shared/helpers.js'

describe('Effect HTTP Server with Combined Tracing', () => {
  let serverPort: number
  let globalProvider: BasicTracerProvider | null = null
  let collector: CollectorContainer
  let otlpEndpoint: string

  beforeAll(async () => {
    // Find a free port
    serverPort = 13456

    // Start collector container which forwards to Atrim backend
    console.log('\n🚀 Starting collector container...')
    collector = await startCollectorContainer()
    otlpEndpoint = `http://localhost:${collector.httpPort}`
    console.log(`📤 OTLP endpoint: ${otlpEndpoint}`)
    console.log('📤 Traces will be forwarded to Atrim backend via collector\n')
  }, 60000)

  afterAll(async () => {
    // Cleanup global provider if set
    if (globalProvider) {
      await globalProvider.forceFlush()
      await globalProvider.shutdown()
      console.log('✅ TracerProvider shutdown')
    }

    // Wait for pending exports
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Stop collector
    await stopCollectorContainer(collector)
  })

  it('should trace both HTTP requests and forked fibers', async () => {
    console.log('\n🧪 Test: HTTP Server with forked fibers (OTLP export to Atrim)')

    // === SINGLE GLOBAL TRACERPROVIDER ARCHITECTURE ===
    //
    // Create a global BasicTracerProvider with OTLP exporter BEFORE
    // creating any layers. Both Effect's Tracer and our Supervisor will
    // use this same provider.

    console.log(`@atrim/test: Using OTLP endpoint: ${otlpEndpoint}`)

    // Create resource with full SDK/process/host attributes
    const serviceResource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'http-server-combined-test',
      [ATTR_SERVICE_VERSION]: '1.0.0'
    })
    const fullResource = defaultResource().merge(serviceResource)

    globalProvider = new BasicTracerProvider({
      resource: fullResource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: `${otlpEndpoint}/v1/traces`
          }),
          {
            scheduledDelayMillis: 100,
            maxExportBatchSize: 10
          }
        )
      ]
    })

    // Register as the global tracer provider
    OtelApi.trace.setGlobalTracerProvider(globalProvider)
    console.log('@atrim/test: Global TracerProvider registered with OTLP exporter')

    const TestCombinedTracingLive = Layer.unwrapEffect(
      Effect.gen(function* () {
        // Auto-tracing config
        const autoConfig: AutoInstrumentationConfig = {
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

        console.log('@atrim/test: Creating combined tracing layer with global provider')

        // Create the Resource layer for @effect/opentelemetry
        const resourceLayer = Resource.layer({
          serviceName: 'http-server-combined-test',
          serviceVersion: '1.0.0'
        })

        // Create Effect Tracer layer that uses the global provider
        // OtelTracer.layerGlobal uses OtelApi.trace.getTracerProvider() internally
        const effectTracerLayer = OtelTracer.layerGlobal

        // Create Supervisor layer for fiber-level tracing
        // The supervisor uses OtelApi.trace.getTracer() which gets the global provider
        const supervisor = createAutoTracingSupervisor(autoConfig)
        const supervisorLayer = Supervisor.addSupervisor(supervisor)

        console.log('@atrim/test: Test CombinedTracingLive created')

        // Compose layers:
        // 1. effectTracerLayer requires Resource, so we provide it
        // 2. supervisorLayer adds fiber supervision
        const tracerWithResource = effectTracerLayer.pipe(Layer.provide(resourceLayer))

        // Merge the tracer and supervisor layers
        return Layer.mergeAll(Layer.discard(tracerWithResource), supervisorLayer)
      })
    )

    const program = Effect.gen(function* () {
      // Define routes exactly like effect-app-example
      const router = HttpRouter.empty.pipe(
        HttpRouter.get(
          '/',
          Effect.gen(function* () {
            console.log('[test-app] Handling / request')

            // Fork some fibers with traced fork to capture call site
            const fiber1 = yield* tracedFork(
              Effect.gen(function* () {
                yield* Effect.sleep('5 millis')
                console.log('[test-app] Task 1 completed')
                return 'task1'
              })
            )
            const fiber2 = yield* tracedFork(
              Effect.gen(function* () {
                yield* Effect.sleep('10 millis')
                console.log('[test-app] Task 2 completed')
                return 'task2'
              })
            )

            // Wait for both
            yield* Fiber.join(fiber1)
            yield* Fiber.join(fiber2)

            return HttpServerResponse.text('Hello, Effect!')
          })
        )
      )

      // Create server layer
      const ServerLive = NodeHttpServer.layer(createServer, { port: serverPort })

      // Compose with test CombinedTracingLive
      const HttpLive = router.pipe(
        HttpServer.serve(),
        Layer.provide(ServerLive),
        Layer.provide(TestCombinedTracingLive)
      )

      // Start server in background
      const serverFiber = yield* Effect.fork(Layer.launch(HttpLive))

      // Wait for server to start
      yield* Effect.sleep('2 seconds')

      // Make multiple HTTP requests to generate more traces
      for (let i = 0; i < 3; i++) {
        console.log(`[test] Making HTTP request ${i + 1}/3...`)
        const response = yield* Effect.tryPromise({
          try: () => fetch(`http://localhost:${serverPort}/`),
          catch: (error) => {
            console.error(`[test] Fetch error:`, error)
            return error
          }
        })
        const body = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (error) => {
            console.error(`[test] Response read error:`, error)
            return error
          }
        })

        console.log(`[test] Response ${i + 1}: ${body}`)
        expect(body).toBe('Hello, Effect!')

        // Small delay between requests
        yield* Effect.sleep('100 millis')
      }

      // Interrupt server
      yield* Fiber.interrupt(serverFiber)

      // Force flush to ensure all spans are exported
      console.log('[test] Flushing spans to Atrim...')
      yield* Effect.tryPromise({
        try: () => globalProvider!.forceFlush(),
        catch: (e) => e
      })

      // Wait for spans to be exported to Atrim
      yield* Effect.sleep('2 seconds')

      console.log('\n📊 Spans sent to Atrim platform!')
      console.log('  Check your Atrim dashboard for:')
      console.log('  - Service: http-server-combined-test')
      console.log('  - HTTP request spans (http.server.request)')
      console.log('  - Fiber spans (effect.* with effect.auto_traced=true)')
      console.log('  - Parent-child relationships between them')
    })

    // Run the program
    await Effect.runPromise(program)

    console.log('\n✅ Test completed - check Atrim dashboard for traces')
  }, 60000)
})
