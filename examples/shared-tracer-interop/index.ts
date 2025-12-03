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

// ============================================================================
// 5. ManagedRuntime for sharing across requests (like in Express/Fastify)
// ============================================================================

// Create a ManagedRuntime with the shared tracer layer
// This is what you'd use in your ManagedRuntime setup
const runtime = ManagedRuntime.make(EffectTracingFromExistingTracer)

// ============================================================================
// 6. Simple Demo: Traditional + Effect Tracing
// ============================================================================

async function demonstrateInterop() {
  console.log('='.repeat(60))
  console.log('🎯 Shared Tracer Interoperability Demo')
  console.log('='.repeat(60))
  console.log('')
  console.log('This example shows the basic pattern for sharing a tracer')
  console.log('between traditional OTel code and Effect-TS.')
  console.log('')

  // Basic example: Traditional span wrapping Effect operations
  console.log('📍 Traditional span → Effect span\n')

  await withTraditionalSpan(
    'traditional.http-request',
    { 'http.method': 'GET', 'http.url': '/api/users' },
    async () => {
      console.log('  Inside traditional span, calling Effect...')

      // Effect operation runs inside the traditional span's context
      const result = await runtime.runPromise(effectOperation)

      console.log('  Effect result:', result)
      console.log('')
      return result
    }
  )

  console.log('='.repeat(60))
  console.log('✅ Demo complete!')
  console.log('')
  console.log('💡 In production with an OTLP collector, you would see:')
  console.log('')
  console.log('   traditional.http-request')
  console.log('   └── effect.business-logic')
  console.log('')
  console.log('For comprehensive examples including nested hierarchies,')
  console.log('see: packages/node/test/integration/effect/shared-tracer-interop/')
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
