/**
 * Integration test for shared tracer interoperability
 *
 * This test verifies that traditional OTel spans (TaskEither-style) and Effect spans
 * can share the same tracer and export to the same collector.
 *
 * Use case: Migrating from fp-ts/TaskEither tracing to Effect while maintaining
 * context propagation across both systems.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer, ManagedRuntime, Tracer } from 'effect'
import { Tracer as OtelEffectTracer } from '@effect/opentelemetry'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { BatchSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  startCollectorContainer,
  stopCollectorContainer,
  getCollectorLogs,
  waitFor,
  type CollectorContainer
} from '../../shared/helpers.js'

const SERVICE_NAME = 'shared-tracer-interop-test'

let collector: CollectorContainer
let provider: NodeTracerProvider
let memoryExporter: InMemorySpanExporter
let otelTracer: ReturnType<typeof trace.getTracer>
let runtime: ManagedRuntime.ManagedRuntime<never, never>

// Helper to run traditional span (simulates TaskEither pattern)
async function withTraditionalSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>
): Promise<T> {
  const span = otelTracer.startSpan(spanName)

  try {
    span.setAttributes(attributes)

    return await context.with(trace.setSpan(context.active(), span), async () => {
      const result = await operation()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    })
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  } finally {
    span.end()
  }
}

describe('Shared Tracer Interoperability', () => {
  beforeAll(async () => {
    // Start isolated collector container
    collector = await startCollectorContainer()

    // Create exporters
    memoryExporter = new InMemorySpanExporter()
    const otlpExporter = new OTLPTraceExporter({
      url: `http://localhost:${collector.httpPort}/v1/traces`
    })

    // Create provider with both exporters (memory for assertions, OTLP for collector/Atrim)
    provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME
      }),
      spanProcessors: [new BatchSpanProcessor(memoryExporter), new BatchSpanProcessor(otlpExporter)]
    })

    provider.register()

    otelTracer = trace.getTracer(SERVICE_NAME, '1.0.0')

    // Effect layer setup - share the existing tracer
    const OtelTracerLayer = Layer.succeed(OtelEffectTracer.OtelTracer, otelTracer)
    const EffectTracerLayer = Layer.effect(Tracer.Tracer, OtelEffectTracer.make)
    const SharedTracerLayer = EffectTracerLayer.pipe(Layer.provide(OtelTracerLayer))

    runtime = ManagedRuntime.make(SharedTracerLayer)

    console.log(`✅ Shared tracer test setup complete (collector port: ${collector.httpPort})`)
  })

  afterAll(async () => {
    if (runtime) {
      await runtime.dispose()
    }

    if (provider) {
      await provider.forceFlush()
      await provider.shutdown()
    }

    // Only cleanup collectors in local development
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector (local dev mode)')
    } else if (collector && process.env.CI) {
      console.log('⏭️  Leaving collector for CI cleanup')
    }
  })

  it('should create traditional spans that export to collector', async () => {
    memoryExporter.reset()

    await withTraditionalSpan(
      'traditional.parent-span',
      { 'test.scenario': 'basic-traditional' },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'result'
      }
    )

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()
    const traditionalSpan = spans.find((s) => s.name === 'traditional.parent-span')

    expect(traditionalSpan).toBeDefined()
    expect(traditionalSpan?.attributes['test.scenario']).toBe('basic-traditional')

    // Verify spans reached the collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.parent-span')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Traditional span exported to collector')
  })

  it('should run Effect operations inside traditional span context', async () => {
    memoryExporter.reset()

    const effectOperation = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan('effect.test', true)
      yield* Effect.sleep('10 millis')
      return 'effect-result'
    }).pipe(Effect.withSpan('effect.child-operation'))

    await withTraditionalSpan(
      'traditional.wrapper-for-effect',
      { 'test.scenario': 'effect-inside-traditional' },
      async () => {
        return await runtime.runPromise(effectOperation)
      }
    )

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()
    const traditionalSpan = spans.find((s) => s.name === 'traditional.wrapper-for-effect')

    expect(traditionalSpan).toBeDefined()

    // Verify span reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.wrapper-for-effect')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Traditional span wrapping Effect exported to collector')
  })

  it('should propagate context in nested traditional spans', async () => {
    memoryExporter.reset()

    await withTraditionalSpan('traditional.level-1', { level: 1 }, async () => {
      await withTraditionalSpan('traditional.level-2', { level: 2 }, async () => {
        await withTraditionalSpan('traditional.level-3', { level: 3 }, async () => {
          const activeSpan = trace.getActiveSpan()
          expect(activeSpan).toBeDefined()
          return 'nested-result'
        })
        return 'level-2'
      })
      return 'level-1'
    })

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()

    // All spans should share the same traceId
    const traceIds = new Set(spans.map((s) => s.spanContext().traceId))
    expect(traceIds.size).toBe(1)

    // Verify all levels exist
    expect(spans.find((s) => s.name === 'traditional.level-1')).toBeDefined()
    expect(spans.find((s) => s.name === 'traditional.level-2')).toBeDefined()
    expect(spans.find((s) => s.name === 'traditional.level-3')).toBeDefined()

    // Verify spans reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return (
          logs.includes('traditional.level-1') &&
          logs.includes('traditional.level-2') &&
          logs.includes('traditional.level-3')
        )
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Nested traditional spans exported with same traceId')
  })

  it('should handle Effect calling traditional code', async () => {
    memoryExporter.reset()

    const mixedWorkflow = Effect.gen(function* () {
      const result = yield* Effect.promise(() =>
        withTraditionalSpan('traditional.called-from-effect', { source: 'effect' }, async () => {
          return { success: true }
        })
      )
      return result
    }).pipe(Effect.withSpan('effect.caller'))

    await runtime.runPromise(mixedWorkflow)

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()
    const traditionalSpan = spans.find((s) => s.name === 'traditional.called-from-effect')

    expect(traditionalSpan).toBeDefined()
    expect(traditionalSpan?.attributes['source']).toBe('effect')

    // Verify span reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.called-from-effect')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Traditional span called from Effect exported to collector')
  })

  it('should handle concurrent Effect operations inside traditional span', async () => {
    memoryExporter.reset()

    const concurrentOps = Effect.all(
      [
        Effect.succeed('task-1').pipe(Effect.delay('10 millis'), Effect.withSpan('effect.task-1')),
        Effect.succeed('task-2').pipe(Effect.delay('15 millis'), Effect.withSpan('effect.task-2')),
        Effect.succeed('task-3').pipe(Effect.delay('5 millis'), Effect.withSpan('effect.task-3'))
      ],
      { concurrency: 'unbounded' }
    ).pipe(Effect.withSpan('effect.concurrent-parent'))

    await withTraditionalSpan(
      'traditional.concurrent-wrapper',
      { test: 'concurrent' },
      async () => {
        return await runtime.runPromise(concurrentOps)
      }
    )

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()
    const wrapper = spans.find((s) => s.name === 'traditional.concurrent-wrapper')

    expect(wrapper).toBeDefined()

    // Verify span reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.concurrent-wrapper')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Concurrent Effect operations inside traditional span exported')
  })

  it('should handle Traditional → Traditional → Effect hierarchy', async () => {
    memoryExporter.reset()

    await withTraditionalSpan('traditional.api-handler', { handler: 'getUsers' }, async () => {
      await withTraditionalSpan(
        'traditional.validate-request',
        { validation: 'schema' },
        async () => {
          // Effect operations inside nested traditional spans
          const effectWork = Effect.all(
            [
              Effect.succeed('task-1').pipe(
                Effect.delay('10 millis'),
                Effect.withSpan('effect.parallel.task-1')
              ),
              Effect.succeed('task-2').pipe(
                Effect.delay('10 millis'),
                Effect.withSpan('effect.parallel.task-2')
              )
            ],
            { concurrency: 'unbounded' }
          ).pipe(Effect.withSpan('effect.parallel-workflow'))

          return await runtime.runPromise(effectWork)
        }
      )
    })

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()

    expect(spans.find((s) => s.name === 'traditional.api-handler')).toBeDefined()
    expect(spans.find((s) => s.name === 'traditional.validate-request')).toBeDefined()

    // Verify span reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return (
          logs.includes('traditional.api-handler') && logs.includes('traditional.validate-request')
        )
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Traditional → Traditional → Effect hierarchy exported')
  })

  it('should handle Effect → Traditional → Effect hierarchy', async () => {
    memoryExporter.reset()

    const mixedWorkflow = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan('workflow.type', 'mixed')

      // Call traditional code from Effect
      const dbResult = yield* Effect.promise(() =>
        withTraditionalSpan('traditional.database-query', { db: 'postgresql' }, async () => {
          // Call Effect again from within traditional
          const cacheResult = await runtime.runPromise(
            Effect.gen(function* () {
              yield* Effect.sleep('10 millis')
              return { cached: true }
            }).pipe(Effect.withSpan('effect.cache-update'))
          )

          return { rows: 10, cached: cacheResult.cached }
        })
      )

      yield* Effect.annotateCurrentSpan('db.row_count', dbResult.rows)
      return dbResult
    }).pipe(Effect.withSpan('effect.mixed-workflow'))

    await runtime.runPromise(mixedWorkflow)

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()
    expect(spans.find((s) => s.name === 'traditional.database-query')).toBeDefined()

    // Verify span reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.database-query')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Effect → Traditional → Effect hierarchy exported')
  })

  it('should handle Traditional → Effect → Traditional hierarchy', async () => {
    memoryExporter.reset()

    await withTraditionalSpan('traditional.request-handler', { request: 'http' }, async () => {
      // Effect layer
      await runtime.runPromise(
        Effect.gen(function* () {
          yield* Effect.log('In Effect business logic')

          // Call traditional from within Effect
          const dbResult = yield* Effect.promise(() =>
            withTraditionalSpan('traditional.db-query', { query: 'SELECT' }, async () => {
              await new Promise((r) => setTimeout(r, 10))
              return { rows: 5 }
            })
          )

          return dbResult
        }).pipe(Effect.withSpan('effect.business-logic'))
      )
    })

    await provider.forceFlush()

    const spans = memoryExporter.getFinishedSpans()

    expect(spans.find((s) => s.name === 'traditional.request-handler')).toBeDefined()
    expect(spans.find((s) => s.name === 'traditional.db-query')).toBeDefined()

    // Verify all spans reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return logs.includes('traditional.request-handler') && logs.includes('traditional.db-query')
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ Traditional → Effect → Traditional hierarchy exported')
  })
})
