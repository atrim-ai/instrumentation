/**
 * Integration test for shared OTLP endpoint interoperability
 *
 * This test verifies that traditional OTel spans (TaskEither-style) and Effect spans
 * can export to the SAME collector while maintaining context propagation.
 *
 * IMPORTANT: Traditional and Effect spans use SEPARATE export mechanisms:
 * - Traditional: NodeTracerProvider → SpanProcessors → OTLP Exporter
 * - Effect: Effect Tracer → Otlp.layer → OTLP HTTP Export
 *
 * Both export to the same collector endpoint for unified traces in Atrim/observability backend.
 *
 * Use case: Migrating from fp-ts/TaskEither tracing to Effect while maintaining
 * context propagation and unified trace visibility.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { Tracer as OtelEffectTracer, Otlp } from '@effect/opentelemetry'
import { FetchHttpClient } from '@effect/platform'
import { trace, context, SpanStatusCode, SpanContext, TraceFlags } from '@opentelemetry/api'
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

// Helper to run Effect with active OTel span as parent
function runEffectWithOtelParent<A, E>(effect: Effect.Effect<A, E>) {
  const activeSpan = trace.getActiveSpan()

  if (!activeSpan) {
    // No active span - run normally
    return runtime.runPromise(effect)
  }

  // Create ExternalSpan from active OTel span
  const spanContext = activeSpan.spanContext()
  const externalSpan = OtelEffectTracer.makeExternalSpan({
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags
  })

  // Provide as parent to Effect
  return runtime.runPromise(effect.pipe(Effect.provide(Layer.parentSpan(externalSpan))))
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

    // Effect layer setup - use Otlp.layer with tracerContext callback
    // The tracerContext callback is CRITICAL for bidirectional context propagation:
    // - Traditional → Effect: Effect spans pick up active OTel context as parent
    // - Effect → Traditional: Effect spans set themselves in OTel context
    const EffectTracingLayer = Otlp.layer({
      baseUrl: `http://localhost:${collector.httpPort}`,
      resource: {
        serviceName: SERVICE_NAME
      },
      // Bridge Effect spans to OpenTelemetry global context
      tracerContext: <X>(f: () => X, span: Tracer.AnySpan): X => {
        // Only bridge actual Effect spans (not ExternalSpan)
        if (span._tag !== 'Span') {
          return f()
        }

        // Create OpenTelemetry SpanContext from Effect span
        const spanContext: SpanContext = {
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: span.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE
        }

        // Create a non-recording span to represent Effect span in OTel context
        const otelSpan = trace.wrapSpanContext(spanContext)

        // Set as active span in OpenTelemetry global context
        // This allows traditional spans created inside Effect to be children
        return context.with(trace.setSpan(context.active(), otelSpan), f)
      }
    }).pipe(Layer.provide(FetchHttpClient.layer))

    runtime = ManagedRuntime.make(EffectTracingLayer)

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
        // Use helper that provides active OTel span as parent to Effect
        return await runEffectWithOtelParent(effectOperation)
      }
    )

    await provider.forceFlush()
    // Wait for Effect's async export to complete
    await new Promise((r) => setTimeout(r, 1500))

    const spans = memoryExporter.getFinishedSpans()

    // Traditional span captured in memory exporter
    const traditionalSpan = spans.find((s) => s.name === 'traditional.wrapper-for-effect')
    expect(traditionalSpan).toBeDefined()

    // Effect span NOT in memory exporter (uses separate export path)
    // But BOTH should appear in collector logs
    console.log('\n📊 Traditional spans in memory:')
    spans.forEach((s) => console.log(`  - ${s.name}`))

    // Verify BOTH spans reached collector (this is the critical check)
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return (
          logs.includes('traditional.wrapper-for-effect') && logs.includes('effect.child-operation')
        )
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log(
      '✅ BOTH traditional and Effect spans exported to collector (separate export paths)'
    )
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

          return await runEffectWithOtelParent(effectWork)
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
      // Use helper to provide active OTel span as parent to Effect
      await runEffectWithOtelParent(
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
    // Wait for Effect's async export
    await new Promise((r) => setTimeout(r, 1500))

    const spans = memoryExporter.getFinishedSpans()

    // Traditional spans in memory exporter
    const requestHandler = spans.find((s) => s.name === 'traditional.request-handler')
    const dbQuery = spans.find((s) => s.name === 'traditional.db-query')

    expect(requestHandler).toBeDefined()
    expect(dbQuery).toBeDefined()

    console.log('\n📊 Traditional spans in memory:')
    spans.forEach((s) => console.log(`  - ${s.name}`))

    // Verify all 3 spans (including Effect span) reached collector
    const receivedTraces = await waitFor(
      async () => {
        const logs = await getCollectorLogs(collector)
        return (
          logs.includes('traditional.request-handler') &&
          logs.includes('effect.business-logic') &&
          logs.includes('traditional.db-query')
        )
      },
      10000,
      500
    )

    expect(receivedTraces).toBe(true)
    console.log('✅ All 3 spans (Traditional → Effect → Traditional) exported to collector')
  })
})
