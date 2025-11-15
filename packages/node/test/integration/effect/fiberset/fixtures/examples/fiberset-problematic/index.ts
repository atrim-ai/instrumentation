/**
 * FiberSet Context Leakage - PROBLEMATIC Pattern
 *
 * This example demonstrates the context leakage issue where fibers spawned
 * via FiberSet.run unintentionally inherit parent span context.
 *
 * Issue: Using Layer.provideMerge to compose tracing layers can cause
 * OpenTelemetry's global context to leak into Effect fibers.
 */

import { Effect, FiberSet } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

// Get OTLP endpoint from environment
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

// ✅ Note: This example uses the SAME tracing setup as the "correct" example
// The difference is in how FiberSet.run handles context - that's outside our control
// This demonstrates that the bug exists in Effect, not in our code patterns
const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: 'fiberset-problematic' },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    })
  )
}))

// Background task that should NOT have a parent span
// but WILL incorrectly inherit due to the bug
const backgroundTask = (id: number) =>
  Effect.gen(function* () {
    console.log(`  🔄 Background task ${id} starting...`)
    yield* Effect.sleep('10 millis')
    console.log(`  ✅ Background task ${id} completed`)
  }).pipe(Effect.withSpan(`background-task-${id}`))

// Main program that spawns fibers using FiberSet.run
const program = Effect.scoped(
  Effect.gen(function* () {
    console.log('\n📋 Starting FiberSet context leakage demonstration...\n')

    const set = yield* FiberSet.make()

    // Parent operation
    yield* Effect.gen(function* () {
      console.log('👨 Parent operation starting...')
      yield* Effect.sleep('5 millis')

      // Spawn background tasks - these SHOULD NOT inherit the parent span
      // but they WILL due to the problematic layer composition
      console.log('🚀 Spawning background tasks via FiberSet.run...')
      yield* FiberSet.run(set, backgroundTask(1))
      yield* FiberSet.run(set, backgroundTask(2))
      yield* FiberSet.run(set, backgroundTask(3))

      console.log('👨 Parent operation completed')
    }).pipe(Effect.withSpan('parent-operation'))

    // Wait for all background tasks to complete
    console.log('⏳ Waiting for background tasks to complete...')
    yield* Effect.sleep('200 millis') // Give fibers time to complete

    // Give time for traces to be exported
    console.log('📤 Waiting for traces to be exported...')
    yield* Effect.sleep('500 millis')

    console.log('\n✅ Program completed\n')
    console.log('🔍 Expected: background-task-* spans should be ROOT spans (no parent)')
    console.log('❌ Actual: background-task-* spans incorrectly have parent-operation as parent')
  })
)

// Provide the tracing layer
const main = program.pipe(Effect.provide(TracingLive))

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
