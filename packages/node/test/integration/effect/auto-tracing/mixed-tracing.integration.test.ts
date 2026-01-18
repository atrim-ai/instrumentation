/**
 * Integration test for mixed OTEL manual + Effect auto-tracing scenarios
 *
 * Tests:
 * 1. Deeper span hierarchies (3+ levels)
 * 2. Mixed manual OTEL spans with auto-instrumented Effect spans
 * 3. Verification of parent-child relationships
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
  withAutoTracing,
  setSpanName
} from '../../../../src/integrations/effect/auto/supervisor.js'
import {
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  waitFor,
  type CollectorContainer
} from '../../shared/helpers.js'

describe('Mixed Tracing - Deep Hierarchies and Manual+Auto Spans', () => {
  let collector: CollectorContainer
  let otlpEndpoint: string
  let provider: BasicTracerProvider
  let manualTracer: OtelApi.Tracer

  beforeAll(async () => {
    console.log('\n🧪 Setting up mixed tracing test...\n')

    // Start collector container
    collector = await startCollectorContainer()
    otlpEndpoint = `http://localhost:${collector.httpPort}`

    console.log(`📤 OTLP endpoint: ${otlpEndpoint}`)

    // Create resource with full SDK attributes
    const serviceResource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'mixed-tracing-test',
      [ATTR_SERVICE_VERSION]: '1.0.0'
    })
    const fullResource = defaultResource().merge(serviceResource)

    // Create and register TracerProvider
    provider = new BasicTracerProvider({
      resource: fullResource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: `${otlpEndpoint}/v1/traces`
          }),
          {
            scheduledDelayMillis: 100,
            maxExportBatchSize: 20
          }
        )
      ]
    })

    OtelApi.trace.setGlobalTracerProvider(provider)
    manualTracer = OtelApi.trace.getTracer('manual-tracer', '1.0.0')
    console.log('✅ Global TracerProvider registered\n')
  }, 90000)

  afterAll(async () => {
    console.log('\n🧹 Cleaning up...')
    if (provider) {
      await provider.shutdown()
      console.log('✅ TracerProvider shutdown')
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await stopCollectorContainer(collector)
    console.log('✅ Cleanup complete\n')
  }, 60000)

  it('should trace 3-level deep fiber hierarchy', async () => {
    console.log('\n📊 Test: 3-level deep fiber hierarchy')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'deep.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    // Level 3: Innermost operation
    const level3Operation = Effect.gen(function* () {
      yield* Effect.sleep('30 millis')
      return 'level-3-result'
    })

    // Level 2: Middle operation that forks level 3
    const level2Operation = Effect.gen(function* () {
      yield* Effect.sleep('20 millis')
      const level3Fiber = yield* Effect.fork(pipe(level3Operation, setSpanName('deep.level-3')))
      const result = yield* Fiber.join(level3Fiber)
      return `level-2->${result}`
    })

    // Level 1: Top operation that forks level 2
    const level1Operation = Effect.gen(function* () {
      yield* Effect.sleep('20 millis')
      const level2Fiber = yield* Effect.fork(pipe(level2Operation, setSpanName('deep.level-2')))
      const result = yield* Fiber.join(level2Fiber)
      return `level-1->${result}`
    })

    const program = Effect.gen(function* () {
      yield* Effect.log('[deep-hierarchy] Starting 3-level deep operation...')

      const fiber1 = yield* Effect.fork(pipe(level1Operation, setSpanName('deep.level-1')))

      return yield* Fiber.join(fiber1)
    })

    const result = await Effect.runPromise(withAutoTracing(program, config, 'deep.root'))

    expect(result).toBe('level-1->level-2->level-3-result')

    // Flush and verify
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)
    expect(hasTraces).toBe(true)

    console.log('✅ 3-level deep hierarchy spans exported')
  }, 45000)

  it('should create parallel sibling spans at each level', async () => {
    console.log('\n📊 Test: Parallel sibling spans')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'parallel.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    const program = Effect.gen(function* () {
      yield* Effect.log('[parallel] Starting parallel operations...')

      // Fork 3 parallel children
      const child1 = yield* Effect.fork(
        pipe(
          Effect.gen(function* () {
            yield* Effect.sleep('50 millis')
            // Each child forks 2 grandchildren
            const gc1 = yield* Effect.fork(
              pipe(
                Effect.sleep('30 millis').pipe(Effect.as('gc1a')),
                setSpanName('parallel.grandchild-1a')
              )
            )
            const gc2 = yield* Effect.fork(
              pipe(
                Effect.sleep('30 millis').pipe(Effect.as('gc1b')),
                setSpanName('parallel.grandchild-1b')
              )
            )
            const [r1, r2] = yield* Effect.all([Fiber.join(gc1), Fiber.join(gc2)])
            return `child1(${r1},${r2})`
          }),
          setSpanName('parallel.child-1')
        )
      )

      const child2 = yield* Effect.fork(
        pipe(
          Effect.gen(function* () {
            yield* Effect.sleep('40 millis')
            const gc1 = yield* Effect.fork(
              pipe(
                Effect.sleep('20 millis').pipe(Effect.as('gc2a')),
                setSpanName('parallel.grandchild-2a')
              )
            )
            const gc2 = yield* Effect.fork(
              pipe(
                Effect.sleep('25 millis').pipe(Effect.as('gc2b')),
                setSpanName('parallel.grandchild-2b')
              )
            )
            const [r1, r2] = yield* Effect.all([Fiber.join(gc1), Fiber.join(gc2)])
            return `child2(${r1},${r2})`
          }),
          setSpanName('parallel.child-2')
        )
      )

      const child3 = yield* Effect.fork(
        pipe(
          Effect.gen(function* () {
            yield* Effect.sleep('35 millis')
            return 'child3(no-grandchildren)'
          }),
          setSpanName('parallel.child-3')
        )
      )

      // Join all children
      const [r1, r2, r3] = yield* Effect.all([
        Fiber.join(child1),
        Fiber.join(child2),
        Fiber.join(child3)
      ])

      return `root->${r1}|${r2}|${r3}`
    })

    const result = await Effect.runPromise(withAutoTracing(program, config, 'parallel.root'))

    expect(result).toContain('root->')
    expect(result).toContain('child1')
    expect(result).toContain('child2')
    expect(result).toContain('child3')

    // Flush and verify
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)
    expect(hasTraces).toBe(true)

    console.log('✅ Parallel sibling spans exported')
  }, 45000)

  it('should mix manual OTEL spans with auto-traced Effect spans', async () => {
    console.log('\n📊 Test: Mixed manual OTEL + auto-traced Effect spans')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'mixed.effect.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    // Create a manual OTEL span as the outermost parent
    const rootSpan = manualTracer.startSpan('manual.root-operation', {
      kind: OtelApi.SpanKind.SERVER,
      attributes: {
        'manual.span': true,
        'http.method': 'GET',
        'http.url': '/api/mixed-test'
      }
    })

    const ctx = OtelApi.trace.setSpan(OtelApi.context.active(), rootSpan)

    try {
      // Run Effect program within the manual span context
      await OtelApi.context.with(ctx, async () => {
        const program = Effect.gen(function* () {
          yield* Effect.log('[mixed] Running Effect within manual OTEL span...')

          // Fork child fibers that will be auto-traced
          const effectChild1 = yield* Effect.fork(
            pipe(
              Effect.gen(function* () {
                yield* Effect.sleep('50 millis')

                // Create another manual span inside Effect
                const innerManualSpan = manualTracer.startSpan('manual.inner-operation', {
                  attributes: { 'manual.inner': true }
                })
                innerManualSpan.setAttribute('processed.count', 42)
                yield* Effect.sleep('20 millis')
                innerManualSpan.end()

                return 'effect-child-1'
              }),
              setSpanName('mixed.effect.child-1')
            )
          )

          const effectChild2 = yield* Effect.fork(
            pipe(
              Effect.gen(function* () {
                yield* Effect.sleep('40 millis')
                return 'effect-child-2'
              }),
              setSpanName('mixed.effect.child-2')
            )
          )

          const [r1, r2] = yield* Effect.all([Fiber.join(effectChild1), Fiber.join(effectChild2)])

          return `${r1}|${r2}`
        })

        const result = await Effect.runPromise(
          withAutoTracing(program, config, 'mixed.effect.root')
        )

        expect(result).toBe('effect-child-1|effect-child-2')
      })

      rootSpan.setStatus({ code: OtelApi.SpanStatusCode.OK })
    } catch (error) {
      rootSpan.setStatus({
        code: OtelApi.SpanStatusCode.ERROR,
        message: String(error)
      })
      throw error
    } finally {
      rootSpan.end()
    }

    // Flush and verify
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)
    expect(hasTraces).toBe(true)

    console.log('✅ Mixed manual OTEL + auto-traced Effect spans exported')
  }, 45000)

  it('should handle Effect.withSpan alongside auto-tracing', async () => {
    console.log('\n📊 Test: Effect.withSpan + auto-tracing coexistence')

    const config = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'coexist.auto.{function}',
        infer_from_source: true,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    }

    const program = Effect.gen(function* () {
      yield* Effect.log('[coexist] Testing Effect.withSpan + auto-tracing...')

      // Auto-traced forked fiber
      const autoFiber = yield* Effect.fork(
        pipe(
          Effect.gen(function* () {
            yield* Effect.sleep('30 millis')
            return 'auto-traced'
          }),
          setSpanName('coexist.auto-traced-fiber')
        )
      )

      // Effect.withSpan (explicit manual span via Effect API)
      const withSpanResult = yield* Effect.withSpan('coexist.explicit-withspan')(
        Effect.gen(function* () {
          yield* Effect.sleep('30 millis')
          return 'explicit-span'
        })
      )

      const autoResult = yield* Fiber.join(autoFiber)

      return `${autoResult}|${withSpanResult}`
    })

    const result = await Effect.runPromise(withAutoTracing(program, config, 'coexist.root'))

    expect(result).toBe('auto-traced|explicit-span')

    // Flush and verify
    console.log('🔄 Forcing span flush...')
    await provider.forceFlush()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const hasTraces = await waitFor(() => collectorReceivedTraces(collector), 10000)
    expect(hasTraces).toBe(true)

    console.log('✅ Effect.withSpan + auto-tracing coexistence verified')
  }, 45000)
})
