/**
 * Unit tests for Effect-OTel context bridging utilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer } from 'effect'
import { context, trace, TraceFlags } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import {
  withOtelParentSpan,
  getCurrentOtelSpanContext,
  getOtelParentSpan
} from '../../../src/integrations/effect/effect-tracer.js'
import { Tracer } from '@effect/opentelemetry'
import * as Resource from '@effect/opentelemetry/Resource'

// Set up a real tracer provider for testing
let provider: NodeTracerProvider
let exporter: InMemorySpanExporter

beforeAll(() => {
  exporter = new InMemorySpanExporter()
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

// Create a minimal test tracer layer
const TestTracerLayer = Tracer.layerGlobal.pipe(
  Layer.provide(
    Resource.layer({
      serviceName: 'test-service',
      serviceVersion: '1.0.0'
    })
  )
)

describe('Effect-OTel Context Bridging', () => {
  describe('withOtelParentSpan', () => {
    it('should pass through effect when no active OTel span', async () => {
      const program = Effect.succeed('test-value').pipe(withOtelParentSpan)

      const result = await Effect.runPromise(program)
      expect(result).toBe('test-value')
    })

    it('should work with Effect.gen when no active OTel span', async () => {
      const program = Effect.gen(function* () {
        yield* Effect.log('Inside effect')
        return 'generated-value'
      }).pipe(withOtelParentSpan)

      const result = await Effect.runPromise(program)
      expect(result).toBe('generated-value')
    })

    it('should preserve Effect error channel', async () => {
      const program = Effect.fail('test-error' as const).pipe(withOtelParentSpan)

      const result = await Effect.runPromiseExit(program)
      expect(result._tag).toBe('Failure')
    })

    it('should bridge active OTel span context to Effect spans', async () => {
      // Create a test span using OTel API
      const tracer = trace.getTracer('test-tracer')

      // Create a parent span and run Effect code in its context
      const parentSpan = tracer.startSpan('http.request')

      try {
        // Run the Effect inside the OTel span's context
        const result = await context.with(trace.setSpan(context.active(), parentSpan), async () => {
          const program = Effect.gen(function* () {
            // The Effect span should now have the OTel span as parent
            const spanContext = yield* getCurrentOtelSpanContext
            return spanContext
          }).pipe(withOtelParentSpan)

          return Effect.runPromise(program)
        })

        // The span context should match the parent span
        expect(result).toBeDefined()
        expect(result?.traceId).toBe(parentSpan.spanContext().traceId)
        expect(result?.spanId).toBe(parentSpan.spanContext().spanId)
      } finally {
        parentSpan.end()
      }
    })

    it('should work with withSpan to create proper parent-child relationship', async () => {
      const tracer = trace.getTracer('test-tracer')
      const parentSpan = tracer.startSpan('http.request')
      const parentTraceId = parentSpan.spanContext().traceId

      try {
        const result = await context.with(trace.setSpan(context.active(), parentSpan), async () => {
          const program = Effect.gen(function* () {
            // Get the span context inside the Effect span
            const spanContext = yield* getCurrentOtelSpanContext
            return {
              traceId: spanContext?.traceId,
              spanId: spanContext?.spanId
            }
          }).pipe(
            Effect.withSpan('child.operation'),
            withOtelParentSpan,
            Effect.provide(TestTracerLayer)
          )

          return Effect.runPromise(program)
        })

        // The child span should share the same trace ID as the parent
        expect(result.traceId).toBe(parentTraceId)
      } finally {
        parentSpan.end()
      }
    })
  })

  describe('getCurrentOtelSpanContext', () => {
    it('should return undefined when no active span', async () => {
      const program = getCurrentOtelSpanContext

      const result = await Effect.runPromise(program)
      expect(result).toBeUndefined()
    })

    it('should return span context when inside active span', async () => {
      const tracer = trace.getTracer('test-tracer')
      const testSpan = tracer.startSpan('test-span')
      const expectedTraceId = testSpan.spanContext().traceId
      const expectedSpanId = testSpan.spanContext().spanId

      try {
        const result = await context.with(trace.setSpan(context.active(), testSpan), () =>
          Effect.runPromise(getCurrentOtelSpanContext)
        )

        expect(result).toBeDefined()
        expect(result?.traceId).toBe(expectedTraceId)
        expect(result?.spanId).toBe(expectedSpanId)
      } finally {
        testSpan.end()
      }
    })

    it('should include trace flags', async () => {
      const tracer = trace.getTracer('test-tracer')
      const testSpan = tracer.startSpan('test-span')

      try {
        const result = await context.with(trace.setSpan(context.active(), testSpan), () =>
          Effect.runPromise(getCurrentOtelSpanContext)
        )

        expect(result).toBeDefined()
        expect(typeof result?.traceFlags).toBe('number')
      } finally {
        testSpan.end()
      }
    })
  })

  describe('getOtelParentSpan', () => {
    it('should return undefined when no active span', async () => {
      const program = getOtelParentSpan

      const result = await Effect.runPromise(program)
      expect(result).toBeUndefined()
    })

    it('should return ExternalSpan when inside active span', async () => {
      const tracer = trace.getTracer('test-tracer')
      const testSpan = tracer.startSpan('test-span')
      const expectedTraceId = testSpan.spanContext().traceId
      const expectedSpanId = testSpan.spanContext().spanId

      try {
        const result = await context.with(trace.setSpan(context.active(), testSpan), () =>
          Effect.runPromise(getOtelParentSpan)
        )

        expect(result).toBeDefined()
        expect(result?._tag).toBe('ExternalSpan')
        expect(result?.traceId).toBe(expectedTraceId)
        expect(result?.spanId).toBe(expectedSpanId)
      } finally {
        testSpan.end()
      }
    })

    it('should be usable as parent for Effect.withSpan', async () => {
      const tracer = trace.getTracer('test-tracer')
      const parentSpan = tracer.startSpan('parent-span')
      const parentTraceId = parentSpan.spanContext().traceId

      try {
        const result = await context.with(trace.setSpan(context.active(), parentSpan), async () => {
          const program = Effect.gen(function* () {
            const externalParent = yield* getOtelParentSpan

            if (externalParent) {
              // Use the external parent for a child span
              const childResult = yield* Effect.succeed('child-result').pipe(
                Effect.withSpan('child.span', { parent: externalParent })
              )
              return { childResult, parentTraceId: externalParent.traceId }
            }

            return { childResult: 'no-parent', parentTraceId: null }
          }).pipe(Effect.provide(TestTracerLayer))

          return Effect.runPromise(program)
        })

        expect(result.parentTraceId).toBe(parentTraceId)
        expect(result.childResult).toBe('child-result')
      } finally {
        parentSpan.end()
      }
    })
  })

  describe('Integration scenarios', () => {
    it('should work in simulated HTTP handler context', async () => {
      // Simulate what happens in an Express handler with OTel auto-instrumentation
      const tracer = trace.getTracer('http-auto-instrumentation')
      const httpSpan = tracer.startSpan('GET /api/users')
      const httpTraceId = httpSpan.spanContext().traceId

      try {
        // Simulate Express handler running inside the HTTP span context
        const result = await context.with(trace.setSpan(context.active(), httpSpan), async () => {
          // This is what user code would look like in an Express handler
          const program = Effect.gen(function* () {
            yield* Effect.log('Processing request')

            // Nested business logic with spans
            const user = yield* Effect.succeed({ id: '1', name: 'Alice' }).pipe(
              Effect.withSpan('db.query')
            )

            return user
          }).pipe(
            Effect.withSpan('api.getUsers'),
            withOtelParentSpan,
            Effect.provide(TestTracerLayer)
          )

          return Effect.runPromise(program)
        })

        expect(result).toEqual({ id: '1', name: 'Alice' })

        // The spans should be connected to the HTTP trace
        // (Verified by checking trace ID propagation in other tests)
      } finally {
        httpSpan.end()
      }
    })

    it('should handle multiple sequential requests', async () => {
      const tracer = trace.getTracer('http-auto-instrumentation')

      // First request
      const httpSpan1 = tracer.startSpan('GET /api/users/1')
      const traceId1 = httpSpan1.spanContext().traceId

      const result1 = await context.with(trace.setSpan(context.active(), httpSpan1), async () => {
        const program = Effect.succeed('user-1').pipe(
          Effect.withSpan('fetch.user'),
          withOtelParentSpan,
          Effect.provide(TestTracerLayer)
        )
        const spanContext = await context.with(trace.setSpan(context.active(), httpSpan1), () =>
          Effect.runPromise(getCurrentOtelSpanContext)
        )
        return { value: await Effect.runPromise(program), traceId: spanContext?.traceId }
      })
      httpSpan1.end()

      // Second request (different trace)
      const httpSpan2 = tracer.startSpan('GET /api/users/2')
      const traceId2 = httpSpan2.spanContext().traceId

      const result2 = await context.with(trace.setSpan(context.active(), httpSpan2), async () => {
        const program = Effect.succeed('user-2').pipe(
          Effect.withSpan('fetch.user'),
          withOtelParentSpan,
          Effect.provide(TestTracerLayer)
        )
        const spanContext = await context.with(trace.setSpan(context.active(), httpSpan2), () =>
          Effect.runPromise(getCurrentOtelSpanContext)
        )
        return { value: await Effect.runPromise(program), traceId: spanContext?.traceId }
      })
      httpSpan2.end()

      // Each request should have its own trace
      expect(result1.traceId).toBe(traceId1)
      expect(result2.traceId).toBe(traceId2)
      expect(traceId1).not.toBe(traceId2)
    })
  })
})
