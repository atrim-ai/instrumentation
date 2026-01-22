/**
 * Effect Source Trace Example
 *
 * This example demonstrates the @effect/unplugin source trace functionality.
 * The unplugin automatically injects source location attributes into Effect.withSpan() calls.
 *
 * Two transformers work together:
 * 1. sourceTrace - Injects source locations into yield* _() for logging
 * 2. spanTrace - Injects code.* attributes into Effect.withSpan() for tracing
 */

import { Effect, Console } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

// Simulated user service with explicit span
// The unplugin will automatically add code.filepath, code.lineno, code.column to the span
const fetchUser = (id: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`[fetchUser] Fetching user ${id}...`))
    yield* _(Effect.sleep('50 millis'))
    return { id, name: 'Alice', email: 'alice@example.com' }
  }).pipe(Effect.withSpan('fetchUser', { attributes: { 'user.id': id } }))

// Simulated order service with explicit span
const fetchOrders = (userId: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`[fetchOrders] Fetching orders for user ${userId}...`))
    yield* _(Effect.sleep('30 millis'))
    return [
      { id: 1, product: 'Widget', amount: 99.99 },
      { id: 2, product: 'Gadget', amount: 149.99 }
    ]
  }).pipe(Effect.withSpan('fetchOrders', { attributes: { 'user.id': userId } }))

// Main program with root span
const main = Effect.gen(function* (_) {
  yield* _(Console.log('=== Effect Source Trace Demo ==='))
  yield* _(Console.log(''))

  const user = yield* _(fetchUser(42))
  yield* _(Console.log(`Got user: ${user.name} (${user.email})`))

  const orders = yield* _(fetchOrders(user.id))
  yield* _(Console.log(`Got ${orders.length} orders`))

  const total = orders.reduce((sum, order) => sum + order.amount, 0)
  yield* _(Console.log(`Total order value: $${total.toFixed(2)}`))

  yield* _(Console.log(''))
  yield* _(Console.log('=== Demo Complete ==='))
}).pipe(Effect.withSpan('main'))

// Create the OpenTelemetry layer with OTLP export to Atrim
const OtelLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'effect-source-trace-demo',
    serviceVersion: '1.0.0'
  },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: 'http://localhost:4319/v1/traces',
      headers: {
        'x-api-key': 'atrim_internal_tenant_000000000002'
      }
    }),
    {
      scheduledDelayMillis: 100,
      maxExportBatchSize: 10
    }
  )
}))

// Run with OpenTelemetry tracing
console.log('Starting Effect Source Trace Demo...')
console.log('Traces will be exported to Atrim backend (http://localhost:4319)')
console.log('')

Effect.runPromise(main.pipe(Effect.provide(OtelLive), Effect.scoped))
  .then(() => {
    // Give time for spans to export
    setTimeout(() => {
      console.log('')
      console.log(
        'Done! Check Atrim UI for traces with code.filepath, code.lineno, and code.column attributes'
      )
      process.exit(0)
    }, 500)
  })
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
