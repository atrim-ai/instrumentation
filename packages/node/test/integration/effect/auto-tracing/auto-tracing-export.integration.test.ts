/**
 * Integration test for Effect auto-tracing with OTLP export to Atrim platform
 *
 * This test sends auto-traced spans through an OTEL collector which forwards
 * them to the Atrim backend at localhost:4319.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Fiber, pipe } from 'effect'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import * as OtelApi from '@opentelemetry/api'
// Import directly from supervisor.js to avoid triggering the module-level
// side effect in source-capture-supervisor.js that auto-creates a global
// TracerProvider with the default endpoint (which would overwrite our test's provider)
import {
  createAutoTracingLayer,
  withAutoTracing,
  withoutAutoTracing,
  setSpanName
} from '../../../../src/integrations/effect/auto/supervisor.js'
import {
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  getCollectorLogs,
  waitFor,
  type CollectorContainer
} from '../../shared/helpers.js'

describe('Effect Auto-Tracing Export to Atrim', () => {
  let collector: CollectorContainer
  let otlpEndpoint: string
  let provider: BasicTracerProvider

  beforeAll(async () => {
    console.log('\n🧪 Setting up auto-tracing export test...\n')

    // Start collector container which forwards to Atrim backend
    collector = await startCollectorContainer()
    otlpEndpoint = `http://localhost:${collector.httpPort}`

    console.log(`📤 OTLP endpoint: ${otlpEndpoint}`)
    console.log('📤 Traces will be forwarded to Atrim backend via collector')

    // Create resource with full SDK/process/host attributes
    // defaultResource() includes SDK info, process info, and service instance ID
    const serviceResource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'effect-auto-trace-test',
      [ATTR_SERVICE_VERSION]: '1.0.0'
    })
    const fullResource = defaultResource().merge(serviceResource)

    // Create and register a global TracerProvider
    provider = new BasicTracerProvider({
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

    // Register globally so AutoTracingSupervisor can use it
    OtelApi.trace.setGlobalTracerProvider(provider)
    console.log('✅ Global TracerProvider registered')

    // Verify the tracer is working by creating a test span
    const testTracer = OtelApi.trace.getTracer('test-tracer')
    const testSpan = testTracer.startSpan('test-span-verify-provider')
    testSpan.setAttribute('test', 'value')
    testSpan.end()
    console.log('✅ Test span created and ended')

    // Force flush to verify export works
    await provider.forceFlush()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log('✅ Test span flushed\n')
  }, 90000)

  afterAll(async () => {
    console.log('\n🧹 Cleaning up...')

    // Shutdown provider to flush pending spans
    if (provider) {
      await provider.shutdown()
      console.log('✅ TracerProvider shutdown')
    }

    // Wait for any pending exports
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Stop collector
    await stopCollectorContainer(collector)

    console.log('✅ Cleanup complete\n')
  }, 60000)

  it('should export auto-traced spans to Atrim via collector', async () => {
    console.log('\n📊 Test: Auto-tracing with export to Atrim')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'atrim-test.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    // Run a test program that forks child fibers (supervisors track forked fibers)
    const program = Effect.gen(function* () {
      yield* Effect.log('[atrim-test] Starting auto-traced operation...')
      yield* Effect.sleep('50 millis')

      // Fork child fibers - supervisors track these
      const fiber1 = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return 'step-1'
        })
      )

      const fiber2 = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return 'step-2'
        })
      )

      // Join the fibers to get results
      const result1 = yield* Fiber.join(fiber1)
      const result2 = yield* Fiber.join(fiber2)

      return `${result1}-${result2}`
    })

    // Use withAutoTracing (which uses Effect.supervised) instead of Layer
    const result = await Effect.runPromise(withAutoTracing(program, config))

    expect(result).toBe('step-1-step-2')

    // Force flush all pending spans
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify collector received traces
    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)

    if (!hasTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('❌ No traces received. Collector logs:', logs)
    }

    expect(hasTraces).toBe(true)

    console.log('✅ Auto-traced spans exported to Atrim successfully')
  }, 45000)

  it('should export service layer spans to Atrim', async () => {
    console.log('\n📊 Test: Service layer spans to Atrim')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'atrim-service.{function}',
        infer_from_source: true,
        rules: [
          { match: { function: 'fetch.*' }, name: 'http.{function}' },
          { match: { function: '.*Service.*' }, name: 'service.{function}' }
        ]
      },
      filter: { include: [], exclude: ['^internal\\.'] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    // Simulated service layer - fork fibers for proper tracing
    const UserService = {
      getUser: (id: number) =>
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return { id, name: 'Alice', email: 'alice@example.com' }
        }),

      listUsers: () =>
        Effect.gen(function* () {
          yield* Effect.sleep('100 millis')
          return [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ]
        })
    }

    const fetchUserProfile = (userId: number) =>
      Effect.gen(function* () {
        yield* Effect.sleep('30 millis')
        return { userId, avatar: 'avatar.png', bio: 'Hello!' }
      })

    const program = Effect.gen(function* () {
      yield* Effect.log('[atrim-service] Running service layer test...')

      // Fork service calls to create child fibers
      const usersFiber = yield* Effect.fork(UserService.listUsers())
      const userFiber = yield* Effect.fork(UserService.getUser(1))
      const profileFiber = yield* Effect.fork(fetchUserProfile(1))

      // Join to get results
      const users = yield* Fiber.join(usersFiber)
      const user = yield* Fiber.join(userFiber)
      const profile = yield* Fiber.join(profileFiber)

      // Concurrent operations (also forked)
      const user2Fiber = yield* Effect.fork(UserService.getUser(2))
      const profile2Fiber = yield* Effect.fork(fetchUserProfile(2))
      const user2 = yield* Fiber.join(user2Fiber)
      const profile2 = yield* Fiber.join(profile2Fiber)

      return {
        userCount: users.length,
        userName: user.name,
        profileBio: profile.bio,
        user2Name: user2.name,
        profile2Bio: profile2.bio
      }
    })

    const result = await Effect.runPromise(withAutoTracing(program, config, 'service-layer-test'))

    expect(result.userCount).toBe(2)
    expect(result.userName).toBe('Alice')
    expect(result.profileBio).toBe('Hello!')

    // Force flush all pending spans
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify collector received traces
    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)

    if (!hasTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('❌ No traces received. Collector logs:', logs)
    }

    expect(hasTraces).toBe(true)

    console.log('✅ Service layer spans exported to Atrim successfully')
  }, 45000)

  it('should export spans with custom names to Atrim', async () => {
    console.log('\n📊 Test: Custom span names to Atrim')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'atrim-custom.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    const program = Effect.gen(function* () {
      yield* Effect.log('[atrim-custom] Running custom span name test...')

      // Fork a fiber with custom span name
      const customFiber = yield* Effect.fork(
        pipe(
          Effect.gen(function* () {
            yield* Effect.sleep('50 millis')
            return 'custom-operation-result'
          }),
          setSpanName('atrim.custom-important-operation')
        )
      )

      return yield* Fiber.join(customFiber)
    })

    const result = await Effect.runPromise(withAutoTracing(program, config, 'custom-span-test'))

    expect(result).toBe('custom-operation-result')

    // Force flush all pending spans
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify collector received traces
    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)

    if (!hasTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('❌ No traces received. Collector logs:', logs)
    }

    expect(hasTraces).toBe(true)

    console.log('✅ Custom-named spans exported to Atrim successfully')
  }, 45000)
})
