/**
 * Effect 4.x Simple Example
 *
 * Demonstrates Effect 4.x with OtlpTracer for span instrumentation.
 * Uses auto-instrumentation via @clayroach/effect-unplugin for source tracing.
 *
 * Run:
 *   pnpm dev           # Run with tsx (no transformation)
 *   pnpm build         # Build with unplugin transformation
 *   pnpm start:otlp    # Run built output with OTLP export
 */

import { Effect, Console, Fiber, Layer } from 'effect'
import { OtlpTracer } from 'effect/unstable/observability'
import { FetchHttpClient } from 'effect/unstable/http'

// Configuration from environment
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const API_KEY = process.env.ATRIM_API_KEY ?? 'atrim_internal_tenant_000000000002'

// Helper tasks - NO explicit withSpan, relying on auto-instrumentation
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${id}...`)
    yield* Effect.sleep('100 millis')
    return { id, name: `User ${id}` }
  })

const fetchOrders = (userId: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching orders for ${userId}...`)
    yield* Effect.sleep('50 millis')
    return [{ id: '1', product: 'Widget' }]
  })

const processOrder = (order: { id: string; product: string }) =>
  Effect.gen(function* () {
    yield* Console.log(`Processing order ${order.id}...`)
    yield* Effect.sleep('75 millis')
    return { ...order, status: 'processed' }
  })

// Main program demonstrating various Effect operations
const program = Effect.gen(function* () {
  yield* Console.log('\n=== Effect 4.x Example ===\n')

  // Concurrent operations
  yield* Console.log('1. Fetching users concurrently with Effect.all...')
  const users = yield* Effect.all([fetchUser('alice'), fetchUser('bob'), fetchUser('charlie')])

  yield* Console.log(`   Fetched ${users.length} users\n`)

  // Iterative operations
  yield* Console.log('2. Fetching orders with Effect.forEach...')
  const allOrders = yield* Effect.forEach(users, (user) => fetchOrders(user.id))

  const orderCount = allOrders.flat().length
  yield* Console.log(`   Fetched ${orderCount} orders\n`)

  // Background task with forkChild
  yield* Console.log('3. Processing orders in background with Effect.forkChild...')
  const backgroundTask = Effect.gen(function* () {
    yield* Effect.sleep('200 millis')
    yield* Console.log('   Background task complete!')
  })

  const fiber = yield* Effect.forkChild(backgroundTask)

  // Process orders while background task runs
  const processedOrders = yield* Effect.forEach(allOrders.flat(), processOrder)

  yield* Console.log(`   Processed ${processedOrders.length} orders`)

  // Wait for background task
  yield* Fiber.join(fiber)

  yield* Console.log('\n=== Example Complete ===\n')
  return { users: users.length, orders: processedOrders.length }
})

// Create tracing layer if OTLP endpoint is configured
const TracingLayer = OTLP_ENDPOINT
  ? OtlpTracer.layer({
      url: `${OTLP_ENDPOINT}/v1/traces`,
      resource: {
        serviceName: 'effect-4x-simple',
        serviceVersion: '1.0.0',
        attributes: {
          'deployment.environment': 'development'
        }
      },
      headers: {
        'x-api-key': API_KEY
      },
      exportInterval: '1 second'
    }).pipe(Layer.provide(FetchHttpClient.layer))
  : Layer.empty

// Run the program
const main = async () => {
  console.log('Starting Effect 4.x example...')
  if (OTLP_ENDPOINT) {
    console.log(`OTLP export enabled: ${OTLP_ENDPOINT}/v1/traces`)
    console.log(`API Key: ${API_KEY.substring(0, 20)}...`)
  } else {
    console.log('OTLP export disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
  }

  const result = await Effect.runPromise(program.pipe(Effect.provide(TracingLayer)))
  console.log('\nResult:', result)

  // Give time for spans to export
  if (OTLP_ENDPOINT) {
    console.log('\nWaiting for spans to export...')
    await new Promise((resolve) => setTimeout(resolve, 2000))
    console.log('Done!')
  }
}

main().catch(console.error)
