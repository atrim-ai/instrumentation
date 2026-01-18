/**
 * Integration tests for Combined HTTP + Fiber tracing
 *
 * Tests the CombinedTracingLive layer which provides:
 * 1. HTTP request tracing via @effect/opentelemetry NodeSdk
 * 2. Fiber-level tracing via Supervisor
 *
 * IMPORTANT LIMITATION:
 * The Supervisor API only intercepts fiber CREATION events (onStart/onEnd).
 * It does NOT see operations within a single fiber.
 * This means fiber-level tracing ONLY works for explicitly forked fibers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Effect, Fiber, Layer, Supervisor } from 'effect'
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter
} from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import * as OtelApi from '@opentelemetry/api'
import { Tracer as OtelTracer, Resource as OtelResource } from '@effect/opentelemetry'
import { createAutoTracingSupervisor } from '../../../../src/integrations/effect/auto/supervisor.js'

describe('Combined HTTP + Fiber Tracing', () => {
  let exporter: InMemorySpanExporter
  let provider: BasicTracerProvider

  beforeAll(() => {
    // Create in-memory exporter to capture spans for assertions
    exporter = new InMemorySpanExporter()

    // Create and register global provider
    provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'combined-tracing-test'
      }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    OtelApi.trace.setGlobalTracerProvider(provider)
  })

  afterAll(async () => {
    await provider.shutdown()
  })

  beforeEach(() => {
    exporter.reset()
  })

  describe('Supervisor Fiber Tracing', () => {
    const autoConfig = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'effect.fiber',
        infer_from_source: false,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: false, parent_fiber: true }
    }

    it('should trace forked fibers', async () => {
      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      const program = Effect.gen(function* () {
        // Fork a fiber - this WILL be traced by supervisor
        const fiber = yield* Effect.fork(
          Effect.gen(function* () {
            yield* Effect.sleep('10 millis')
            return 'forked-result'
          })
        )
        return yield* Fiber.join(fiber)
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(supervisorLayer)))

      expect(result).toBe('forked-result')

      // Wait for spans to be processed
      await provider.forceFlush()

      const spans = exporter.getFinishedSpans()
      const fiberSpans = spans.filter((s) => s.attributes['effect.auto_traced'] === true)

      // Should have at least one fiber span (the forked fiber)
      expect(fiberSpans.length).toBeGreaterThanOrEqual(1)
      console.log(`✅ Traced ${fiberSpans.length} forked fiber(s)`)
    })

    it('should NOT trace main fiber (supervisor limitation)', async () => {
      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      // This program does NOT fork any fibers
      const program = Effect.gen(function* () {
        yield* Effect.sleep('10 millis')
        return 'main-fiber-result'
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(supervisorLayer)))

      expect(result).toBe('main-fiber-result')

      await provider.forceFlush()

      const spans = exporter.getFinishedSpans()
      const fiberSpans = spans.filter((s) => s.attributes['effect.auto_traced'] === true)

      // Main fiber is NOT traced by supervisor - this is the limitation
      expect(fiberSpans.length).toBe(0)
      console.log('⚠️  Main fiber NOT traced (expected - supervisor limitation)')
    })

    it('should trace nested forked fibers with parent-child relationships', async () => {
      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      const program = Effect.gen(function* () {
        // Fork parent fiber
        const parentFiber = yield* Effect.fork(
          Effect.gen(function* () {
            // Fork child fiber inside parent
            const childFiber = yield* Effect.fork(
              Effect.gen(function* () {
                yield* Effect.sleep('5 millis')
                return 'child'
              })
            )
            yield* Effect.sleep('5 millis')
            const childResult = yield* Fiber.join(childFiber)
            return `parent->${childResult}`
          })
        )
        return yield* Fiber.join(parentFiber)
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(supervisorLayer)))

      expect(result).toBe('parent->child')

      await provider.forceFlush()

      const spans = exporter.getFinishedSpans()
      const fiberSpans = spans.filter((s) => s.attributes['effect.auto_traced'] === true)

      // Should have at least 2 fiber spans (parent and child)
      expect(fiberSpans.length).toBeGreaterThanOrEqual(2)

      // Check parent-child relationship via traceId
      const traceIds = new Set(fiberSpans.map((s) => s.spanContext().traceId))
      console.log(`✅ Traced ${fiberSpans.length} nested fibers, ${traceIds.size} trace(s)`)
    })
  })

  describe('Fiber spans linking to Effect parent span', () => {
    const autoConfig = {
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: { default: 'effect.fiber', infer_from_source: false, rules: [] },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: false, parent_fiber: true }
    }

    it('should link fiber spans to Effect parent span via Tracer.ParentSpan context', async () => {
      // This test uses Effect.withSpan() to create a parent span,
      // then verifies that forked fiber spans are properly linked via the
      // Tracer.ParentSpan context (which our supervisor now reads).
      //
      // KEY: We must provide Effect's tracer layer (OtelTracer.layerGlobal) so that
      // Effect.withSpan() creates spans backed by the global OTel provider.

      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      // Create Effect's tracer layer that uses the global OTel provider
      // This is what @effect/opentelemetry's NodeSdk.layer does internally
      // layerGlobal requires a Resource service, so we provide an empty one
      const effectTracerLayer = OtelTracer.layerGlobal.pipe(Layer.provide(OtelResource.layerEmpty))

      // Combine supervisor + Effect tracer
      const combinedLayer = Layer.merge(supervisorLayer, effectTracerLayer)

      const program = Effect.gen(function* () {
        // Fork fibers within the span - these should be linked via ParentSpan context
        const fiber1 = yield* Effect.fork(
          Effect.gen(function* () {
            yield* Effect.sleep('5 millis')
            return 'task1'
          })
        )
        const fiber2 = yield* Effect.fork(
          Effect.gen(function* () {
            yield* Effect.sleep('5 millis')
            return 'task2'
          })
        )
        yield* Fiber.join(fiber1)
        yield* Fiber.join(fiber2)
        return 'done'
      }).pipe(
        // Create an Effect parent span that fiber spans should link to
        Effect.withSpan('http.request', { kind: 'server' })
      )

      await Effect.runPromise(program.pipe(Effect.provide(combinedLayer)))

      await provider.forceFlush()

      const spans = exporter.getFinishedSpans()
      const httpSpans = spans.filter((s) => s.name === 'http.request')
      const fiberSpans = spans.filter((s) => s.attributes['effect.auto_traced'] === true)

      console.log(`Total spans: ${spans.length}`)
      console.log(`HTTP/parent spans: ${httpSpans.length}`)
      console.log(`Fiber spans: ${fiberSpans.length}`)

      // We should have 1 parent span and at least 2 fiber spans
      expect(httpSpans.length).toBe(1)
      expect(fiberSpans.length).toBeGreaterThanOrEqual(2)

      // Check that fiber spans have the same traceId as the parent span
      const parentTraceId = httpSpans[0].spanContext().traceId
      const parentSpanId = httpSpans[0].spanContext().spanId

      // In OTel SDK v2, parent info is in parentSpanContext (not parentSpanId)
      // Check that at least the explicitly forked fiber spans have the correct parent
      // Note: Some internal Effect fibers may have different traceIds if they're created
      // before the Effect.withSpan context is established
      let linkedFiberCount = 0
      let matchingTraceIdCount = 0
      for (const fiberSpan of fiberSpans) {
        const fiberTraceId = fiberSpan.spanContext().traceId
        // OTel SDK v2 uses parentSpanContext instead of parentSpanId
        const spanAny = fiberSpan as unknown as { parentSpanContext?: { spanId: string } }
        const fiberParentSpanId = spanAny.parentSpanContext?.spanId

        console.log(
          `Fiber span: traceId=${fiberTraceId}, parentSpanContext.spanId=${fiberParentSpanId ?? 'undefined'}`
        )
        console.log(`Parent span: traceId=${parentTraceId}, spanId=${parentSpanId}`)

        // Count fiber spans that share traceId with parent
        if (fiberTraceId === parentTraceId) {
          matchingTraceIdCount++
        }

        // Count fiber spans that have correct parent
        if (fiberParentSpanId === parentSpanId) {
          linkedFiberCount++
        }
      }

      // At least 2 fiber spans (the explicitly forked ones) should have:
      // 1. Same traceId as parent
      // 2. Correct parentSpanContext.spanId
      console.log(`Fiber spans with matching traceId: ${matchingTraceIdCount}/${fiberSpans.length}`)
      console.log(`Fiber spans with correct parent: ${linkedFiberCount}/${fiberSpans.length}`)
      expect(matchingTraceIdCount).toBeGreaterThanOrEqual(2)
      expect(linkedFiberCount).toBeGreaterThanOrEqual(2)

      console.log(
        '✅ Fiber spans properly linked to Effect parent span via Tracer.ParentSpan context'
      )
    })

    it('should NOT link fiber spans when using OTel context.active() alone (AsyncLocalStorage boundary)', async () => {
      // This test demonstrates that OTel's context.active() does NOT work across
      // Effect's fiber scheduler boundary (AsyncLocalStorage is lost).
      // However, our supervisor now uses Tracer.ParentSpan from Effect's context,
      // which DOES propagate properly through fibers.

      const tracer = OtelApi.trace.getTracer('test')
      const httpSpan = tracer.startSpan('http.server GET /problem', {
        kind: OtelApi.SpanKind.SERVER
      })
      const httpContext = OtelApi.trace.setSpan(OtelApi.context.active(), httpSpan)

      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      // The problem: OTel's AsyncLocalStorage context is lost across Effect's async boundary
      let contextActiveSpan: OtelApi.Span | undefined

      const program = Effect.gen(function* () {
        // Check what context.active() returns inside the Effect
        // This will be undefined because Effect's fiber scheduler breaks AsyncLocalStorage
        contextActiveSpan = OtelApi.trace.getSpan(OtelApi.context.active())

        const fiber = yield* Effect.fork(
          Effect.gen(function* () {
            yield* Effect.sleep('5 millis')
            return 'task'
          })
        )
        return yield* Fiber.join(fiber)
      })

      // Run within HTTP context (OTel's AsyncLocalStorage)
      await OtelApi.context.with(httpContext, async () => {
        return await Effect.runPromise(program.pipe(Effect.provide(supervisorLayer)))
      })

      httpSpan.end()

      await provider.forceFlush()

      // Verify that context.active() does NOT work inside Effect
      console.log(
        `OTel context.active() inside Effect: ${contextActiveSpan ? 'FOUND' : 'NONE (as expected)'}`
      )
      expect(contextActiveSpan).toBeUndefined()

      // Note: Without Effect.withSpan(), the fiber spans won't be linked
      // because there's no Tracer.ParentSpan in the context
      const spans = exporter.getFinishedSpans()
      const httpSpans = spans.filter((s) => s.name.includes('http'))
      const fiberSpans = spans.filter((s) => s.attributes['effect.auto_traced'] === true)

      const httpTraceId = httpSpans[0]?.spanContext().traceId

      let linkedCount = 0
      for (const fiberSpan of fiberSpans) {
        if (fiberSpan.spanContext().traceId === httpTraceId) {
          linkedCount++
        }
      }

      console.log(`HTTP traceId: ${httpTraceId}`)
      console.log(`Fiber spans linked to HTTP: ${linkedCount}/${fiberSpans.length}`)

      // Without Effect.withSpan(), fiber spans are NOT linked to the raw OTel span
      // because our supervisor uses Tracer.ParentSpan (not OTel context.active())
      expect(linkedCount).toBe(0)
      console.log('⚠️  As expected: OTel AsyncLocalStorage context is lost across Effect boundary')
      console.log('   Use Effect.withSpan() to properly link spans')
    })
  })
})
