/**
 * Effect Operation Tracing Example
 *
 * Demonstrates automatic span creation for Effect operations (Effect.all, Effect.forEach)
 * using OpSupervision and OperationTracingSupervisor.
 *
 * This shows how operations are automatically traced without manual Effect.withSpan() calls.
 */

import { Effect, Console } from 'effect'
import { withOperationTracing, SourceCaptureTracingLive } from '@atrim/instrument-node/effect/auto'

// Note: OTel exporter configuration is loaded from instrumentation.yaml
// - For production: Configure Atrim platform endpoint
// - For development: Uncomment console exporter in YAML

// Test program
const program = Effect.gen(function* () {
  yield* Console.log('=== Testing Effect Operation Tracing ===\n')

  // Test 1: Effect.all - should create a span "effect.all" with count=3
  yield* Console.log('Test 1: Effect.all with 3 items')
  const results = yield* Effect.all([Effect.succeed(1), Effect.succeed(2), Effect.succeed(3)])
  yield* Console.log(`✓ Effect.all results: ${results}\n`)

  // Test 2: Effect.forEach - should create a span "effect.forEach" with count=3
  yield* Console.log('Test 2: Effect.forEach with 3 items')
  const doubled = yield* Effect.forEach([10, 20, 30], (n) => Effect.succeed(n * 2))
  yield* Console.log(`✓ Effect.forEach results: ${doubled}\n`)

  // Test 3: Nested operations - should create multiple spans
  yield* Console.log('Test 3: Nested Effect.all inside Effect.forEach')
  yield* Effect.forEach([1, 2], (n) => Effect.all([Effect.succeed(n), Effect.succeed(n * 10)]))
  yield* Console.log('✓ Nested operations complete\n')

  yield* Console.log('=== All tests complete ===')
  yield* Console.log('Waiting for spans to export...\n')

  // Wait for spans to export
  yield* Effect.sleep('2 seconds')
})

// Run with operation tracing enabled
// withOperationTracing is the simplest API - handles all setup automatically
Effect.runPromise(
  program.pipe(
    Effect.withSpan('operation-tracing-example'), // Root span for all operations
    Effect.provide(SourceCaptureTracingLive), // OTel setup from instrumentation.yaml
    withOperationTracing // Operation tracing (one call does it all)
  )
)
  .then(() => {
    console.log('\n✅ Example complete - spans exported to configured endpoint')
    console.log('Check instrumentation.yaml to switch between console and Atrim platform')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
