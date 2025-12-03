/**
 * Shared OTLP Endpoint Interoperability Example
 *
 * This example demonstrates how to configure traditional Promise/TaskEither-style code
 * and Effect-TS code to export to the SAME OTLP collector endpoint.
 *
 * Use case: Migrating from fp-ts/TaskEither tracing to Effect while maintaining
 * unified trace visibility in your observability backend (Atrim, Honeycomb, etc.)
 *
 * IMPORTANT: Traditional and Effect spans use SEPARATE export mechanisms:
 * - Traditional: NodeTracerProvider → SpanProcessors → OTLP Exporter
 * - Effect: Otlp.layer → OTLP HTTP Export
 *
 * Both export to the SAME collector endpoint for unified traces.
 *
 * Key concepts demonstrated:
 * 1. Traditional OTel tracer setup with OTLP export
 * 2. Effect Otlp.layer configured to same endpoint
 * 3. Automatic context propagation via @opentelemetry/api (same traceId, parent-child relationships)
 *
 * To run:
 *   cd examples/shared-tracer-interop
 *   pnpm install
 *   pnpm start
 *
 * For comprehensive test scenarios, see:
 *   packages/node/test/integration/effect/shared-tracer-interop/
 */

import { Effect, Layer, ManagedRuntime } from 'effect'
import { Otlp } from '@effect/opentelemetry'
import { FetchHttpClient } from '@effect/platform'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

// ============================================================================
// 1. Traditional OpenTelemetry Setup (as you'd have for TaskEither)
// ============================================================================

const SERVICE_NAME = 'shared-tracer-demo'
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

// Create a TracerProvider with OTLP export (for traditional/TaskEither spans)
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME
  }),
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: `${OTLP_ENDPOINT}/v1/traces`
      })
    )
  ]
})

provider.register()

// Get the tracer - this is what you'd use in TaskEither code
const otelTracer = trace.getTracer(SERVICE_NAME, '1.0.0')

console.log(`✅ Traditional OTel tracer initialized (exporting to ${OTLP_ENDPOINT})\n`)

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
// 3. Effect Layer - Configure to export to SAME OTLP endpoint
// ============================================================================

/**
 * Configure Effect to export to the SAME collector endpoint
 *
 * Effect spans will export via Otlp.layer (separate from traditional spans)
 * but both go to the same collector for unified traces.
 *
 * Context propagation works automatically via @opentelemetry/api's global context.
 */
const EffectTracingLayer = Otlp.layer({
  baseUrl: OTLP_ENDPOINT,
  resource: {
    serviceName: SERVICE_NAME
  }
}).pipe(Layer.provide(FetchHttpClient.layer))

console.log(`✅ Effect OTLP layer configured (exporting to ${OTLP_ENDPOINT})\n`)

// ============================================================================
// 5. Effect Operations
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
// 6. ManagedRuntime for Effect operations
// ============================================================================

// Create a ManagedRuntime with the Effect OTLP layer
// This is what you'd use in your Effect-based ManagedRuntime setup
const runtime = ManagedRuntime.make(EffectTracingLayer)

// ============================================================================
// 7. Simple Demo: Traditional + Effect Tracing
// ============================================================================

async function demonstrateInterop() {
  console.log('='.repeat(60))
  console.log('🎯 Shared OTLP Endpoint Demo')
  console.log('='.repeat(60))
  console.log('')
  console.log('Traditional and Effect spans export to the SAME collector')
  console.log('via separate mechanisms, enabling unified trace visibility.')
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
// 8. Cleanup and Run
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
