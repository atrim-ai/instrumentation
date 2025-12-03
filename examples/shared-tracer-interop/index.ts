/**
 * Shared Tracer Interoperability Example
 *
 * This example demonstrates how to share an existing OpenTelemetry tracer
 * between traditional Promise/TaskEither-style code and Effect-TS code.
 *
 * Use case: Migrating from fp-ts/TaskEither tracing to Effect while
 * maintaining context propagation across both systems.
 *
 * Key concepts demonstrated:
 * 1. Setting up a traditional OTel tracer (as used in TaskEither patterns)
 * 2. Providing that tracer to Effect via Layer.succeed(Tracer.OtelTracer, ...)
 * 3. OpenTelemetry CONTEXT PROPAGATION between traditional and Effect spans
 *
 * IMPORTANT NOTE ON SPAN EXPORT:
 * - Traditional spans: Exported via your configured SpanProcessor (ConsoleSpanExporter here)
 * - Effect spans: Use @effect/opentelemetry's internal export mechanism
 *
 * For production, you'd typically:
 * - Use OTLP export for both (they'll both send to your collector)
 * - OR use the same global TracerProvider so all spans go through the same exporter
 *
 * The KEY benefit of this approach is CONTEXT PROPAGATION:
 * - Effect spans become CHILDREN of traditional spans when called within their context
 * - Traditional spans become CHILDREN of Effect spans when called from Effect code
 * - All spans share the same traceId for distributed tracing correlation
 *
 * To run:
 *   cd examples/shared-tracer-interop
 *   pnpm install
 *   pnpm start
 */

import { Effect, Layer, ManagedRuntime, Tracer } from 'effect'
import { Tracer as OtelEffectTracer } from '@effect/opentelemetry'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

// ============================================================================
// 1. Traditional OpenTelemetry Setup (as you'd have for TaskEither)
// ============================================================================

const SERVICE_NAME = 'shared-tracer-demo'

// Create a TracerProvider with console exporter (you'd use OTLP in production)
// Note: SDK v2 uses resourceFromAttributes() instead of new Resource()
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME
  }),
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())]
})

provider.register()

// Get the tracer - this is what you'd use in TaskEither code
const otelTracer = trace.getTracer(SERVICE_NAME, '1.0.0')

console.log('✅ OpenTelemetry tracer initialized\n')

// ============================================================================
// 2. Traditional Tracing Function (TaskEither-style pattern)
// ============================================================================

/**
 * This simulates the trace function you'd have in TaskEither code:
 *
 *   trace: (operation, spanName, attributes) =>
 *     TE.bracket(
 *       TE.right(otelTrace.getTracer(serviceName).startSpan(spanName)),
 *       (span) => { ... operation inside context ... },
 *       (span) => { span.end(); return TE.right(undefined) }
 *     )
 */
async function withTraditionalSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>
): Promise<T> {
  const span = otelTracer.startSpan(spanName)

  try {
    span.setAttributes(attributes)

    // Run operation within the span's context
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
    span.recordException(error as Error)
    throw error
  } finally {
    span.end()
  }
}

// ============================================================================
// 3. Effect Layer that uses the EXISTING tracer
// ============================================================================

/**
 * OPTION A: Provide your existing OtelTracer directly to Effect
 *
 * This is the key insight - you can provide any OTel Tracer to Effect!
 *
 * Steps:
 * 1. Wrap your existing tracer in a Layer using Layer.succeed
 * 2. Use Tracer.make from @effect/opentelemetry to create Effect's Tracer
 * 3. Compose them using Layer.provide
 */

// Step 1: Wrap our existing OTel tracer in a Layer
const OtelTracerLayer = Layer.succeed(OtelEffectTracer.OtelTracer, otelTracer)

// Step 2: Create a Layer that builds Effect's Tracer from the OtelTracer
const EffectTracerLayer = Layer.effect(Tracer.Tracer, OtelEffectTracer.make)

// Step 3: Compose - provide OtelTracerLayer to satisfy EffectTracerLayer's requirement
const EffectTracingFromExistingTracer = EffectTracerLayer.pipe(Layer.provide(OtelTracerLayer))

/**
 * OPTION B: Use the global tracer provider (alternative approach)
 *
 * If you've already registered your tracer provider globally (as we did above),
 * you can use layerGlobal which picks it up automatically.
 *
 * Example:
 *   import { Resource } from '@effect/opentelemetry'
 *
 *   const EffectTracingFromGlobal = Resource.layer({ serviceName: SERVICE_NAME }).pipe(
 *     Layer.provideMerge(OtelEffectTracer.layerGlobal),
 *     Layer.provideMerge(OtelEffectTracer.layerWithoutOtelTracer)
 *   )
 */

// ============================================================================
// 4. Effect Operations
// ============================================================================

const effectOperation = Effect.gen(function* () {
  yield* Effect.log('Inside Effect operation')
  yield* Effect.annotateCurrentSpan('effect.source', 'effect-ts')
  yield* Effect.annotateCurrentSpan('effect.version', '3.x')

  // Simulate some work
  yield* Effect.sleep('50 millis')

  return { success: true, source: 'effect' }
}).pipe(Effect.withSpan('effect.business-logic'))

const nestedEffectOperation = Effect.gen(function* () {
  yield* Effect.log('Starting nested operations')

  // Parallel operations with individual spans
  const results = yield* Effect.all(
    [
      Effect.succeed('task-1').pipe(
        Effect.delay('20 millis'),
        Effect.withSpan('effect.parallel.task-1')
      ),
      Effect.succeed('task-2').pipe(
        Effect.delay('30 millis'),
        Effect.withSpan('effect.parallel.task-2')
      )
    ],
    { concurrency: 'unbounded' }
  )

  yield* Effect.annotateCurrentSpan('parallel.task_count', results.length)

  return results
}).pipe(Effect.withSpan('effect.parallel-workflow'))

// ============================================================================
// 5. ManagedRuntime for sharing across requests (like in Express/Fastify)
// ============================================================================

// Create a ManagedRuntime with the shared tracer layer
// This is what you'd use in your ManagedRuntime setup
const runtime = ManagedRuntime.make(EffectTracingFromExistingTracer)

// ============================================================================
// 6. Demo: Mixed Traditional + Effect Tracing
// ============================================================================

async function demonstrateInterop() {
  console.log('='.repeat(60))
  console.log('🎯 Shared Tracer Interoperability Demo')
  console.log('='.repeat(60))
  console.log('')

  // Scenario 1: Traditional span wrapping Effect operations
  console.log('📍 Scenario 1: Traditional parent → Effect child\n')

  await withTraditionalSpan(
    'traditional.http-request',
    { 'http.method': 'GET', 'http.url': '/api/users' },
    async () => {
      console.log('  Inside traditional span, calling Effect...')

      // Effect operation runs inside the traditional span's context
      // The Effect span should become a CHILD of the traditional span
      const result = await runtime.runPromise(effectOperation)

      console.log('  Effect result:', result)
      return result
    }
  )

  console.log('')

  // Scenario 2: Nested traditional + Effect spans
  console.log('📍 Scenario 2: Deeply nested hierarchy\n')

  await withTraditionalSpan('traditional.api-handler', { 'handler.name': 'getUsers' }, async () => {
    console.log('  Level 1: Traditional API handler')

    await withTraditionalSpan(
      'traditional.validate-request',
      { 'validation.type': 'schema' },
      async () => {
        console.log('  Level 2: Traditional validation')

        // Effect takes over here
        const results = await runtime.runPromise(nestedEffectOperation)

        console.log('  Effect parallel results:', results)
        return results
      }
    )

    return { validated: true }
  })

  console.log('')

  // Scenario 3: Effect calling back into traditional code
  console.log('📍 Scenario 3: Effect → Traditional → Effect\n')

  const mixedWorkflow = Effect.gen(function* () {
    yield* Effect.log('Effect: Starting mixed workflow')

    // Call traditional code from Effect
    // The traditional span will be a CHILD of the Effect span
    const traditionalResult = yield* Effect.promise(() =>
      withTraditionalSpan(
        'traditional.database-query',
        { 'db.system': 'postgresql', 'db.statement': 'SELECT * FROM users' },
        async () => {
          console.log('  Traditional: Database query')
          await new Promise((r) => setTimeout(r, 30))

          // Nested Effect from within traditional
          const nestedEffect = await runtime.runPromise(
            Effect.gen(function* () {
              yield* Effect.log('Effect: Cache update')
              return { cached: true }
            }).pipe(Effect.withSpan('effect.cache-update'))
          )

          return { rows: 10, cached: nestedEffect.cached }
        }
      )
    )

    yield* Effect.annotateCurrentSpan('db.row_count', traditionalResult.rows)

    return traditionalResult
  }).pipe(Effect.withSpan('effect.mixed-workflow'))

  const mixedResult = await runtime.runPromise(mixedWorkflow)
  console.log('  Mixed workflow result:', mixedResult)

  console.log('')
  console.log('='.repeat(60))
  console.log('✅ Demo complete!')
  console.log('')
  console.log('💡 Check the console output above for span hierarchy.')
  console.log('   In production with an OTLP collector, you would see:')
  console.log('')
  console.log('   traditional.http-request')
  console.log('   └── effect.business-logic')
  console.log('')
  console.log('   traditional.api-handler')
  console.log('   └── traditional.validate-request')
  console.log('       └── effect.parallel-workflow')
  console.log('           ├── effect.parallel.task-1')
  console.log('           └── effect.parallel.task-2')
  console.log('')
  console.log('='.repeat(60))
}

// ============================================================================
// 7. Cleanup and Run
// ============================================================================

async function main() {
  try {
    await demonstrateInterop()
  } finally {
    // Cleanup runtime
    await runtime.dispose()

    // Flush and shutdown the tracer provider
    await provider.forceFlush()
    await provider.shutdown()

    console.log('\n🧹 Cleanup complete')
  }
}

main().catch(console.error)
