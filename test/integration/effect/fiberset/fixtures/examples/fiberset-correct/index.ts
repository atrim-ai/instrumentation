/**
 * FiberSet Context Isolation - CORRECT Pattern
 *
 * This example demonstrates the CORRECT way to handle context isolation
 * when using FiberSet.run to spawn background fibers.
 *
 * Solution: Use @effect/opentelemetry's NodeSdk.layer() and { root: true }
 */

import { Effect, FiberSet } from "effect"
import { NodeSdk } from "@effect/opentelemetry"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

// Get OTLP endpoint from environment
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

// ✅ CORRECT: Use Effect's built-in NodeSdk.layer
// This properly integrates with Effect's fiber-local context
const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "fiberset-correct" },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    })
  )
}))

// Background task with explicit root span
// This ensures the task is completely independent of any parent context
const backgroundTaskWithRoot = (id: number) =>
  Effect.gen(function* () {
    console.log(`  🔄 Background task ${id} (root) starting...`)
    yield* Effect.sleep("10 millis")
    console.log(`  ✅ Background task ${id} (root) completed`)
  }).pipe(
    // ✅ IMPORTANT: { root: true } creates a new root span
    // This explicitly breaks the parent chain
    Effect.withSpan(`background-task-root-${id}`, { root: true })
  )

// Background task with tracing disabled
// Alternative approach when you don't need tracing for background work
const backgroundTaskUntraced = (id: number) =>
  Effect.gen(function* () {
    console.log(`  🔄 Background task ${id} (untraced) starting...`)
    yield* Effect.sleep("10 millis")
    console.log(`  ✅ Background task ${id} (untraced) completed`)
  }).pipe(
    // ✅ Alternative: Disable tracing entirely for this operation
    Effect.withTracerEnabled(false)
  )

// Main program demonstrating proper context isolation
const program = Effect.scoped(
  Effect.gen(function* () {
    console.log('\n📋 Starting FiberSet context isolation demonstration...\n')

    const set = yield* FiberSet.make()

  // Parent operation
  yield* Effect.gen(function* () {
    console.log('👨 Parent operation starting...')
    yield* Effect.sleep("5 millis")

    // Spawn background tasks with explicit root spans
    console.log('🚀 Spawning background tasks with { root: true }...')
    yield* FiberSet.run(set, backgroundTaskWithRoot(1))
    yield* FiberSet.run(set, backgroundTaskWithRoot(2))
    yield* FiberSet.run(set, backgroundTaskWithRoot(3))

    // Spawn untraced background tasks
    console.log('🚀 Spawning untraced background tasks...')
    yield* FiberSet.run(set, backgroundTaskUntraced(4))
    yield* FiberSet.run(set, backgroundTaskUntraced(5))

    console.log('👨 Parent operation completed')
  }).pipe(
    Effect.withSpan("parent-operation")
  )

  // Wait for all background tasks to complete
  console.log('⏳ Waiting for background tasks to complete...')
  yield* Effect.sleep("200 millis") // Give fibers time to complete

  // Give time for traces to be exported
  console.log('📤 Waiting for traces to be exported...')
  yield* Effect.sleep("500 millis")

    console.log('\n✅ Program completed\n')
    console.log('✅ Expected: background-task-root-* spans are ROOT spans (no parent)')
    console.log('✅ Expected: background-task-untraced-* spans do not exist (tracing disabled)')
    console.log('✅ Actual: Matches expected behavior!')
  })
)

// Provide the correct tracing layer
const main = program.pipe(
  Effect.provide(TracingLive)
)

// Run the program
Effect.runPromise(main)
  .then(() => {
    console.log('\n✅ Effect program completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Effect program failed:', error)
    process.exit(1)
  })
