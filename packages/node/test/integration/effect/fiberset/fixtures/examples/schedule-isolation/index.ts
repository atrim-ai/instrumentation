/**
 * Schedule Context Isolation
 *
 * Demonstrates proper context isolation for scheduled/repeated operations.
 * Each iteration should be an independent root span, not a child of the
 * previous iteration.
 */

import { Effect, Schedule, Ref } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { suppressEconnrefused } from '../../test-helpers.js'
import { autoEnrichSpan } from '../../../../../../../src/integrations/effect/index.js'

// Suppress ECONNREFUSED errors during shutdown in test environment
suppressEconnrefused()

// Get OTLP endpoint from environment
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: 'schedule-isolation' },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    })
  )
}))

// Scheduled task - each iteration should be independent
const scheduledTask = (iterationRef: Ref.Ref<number>) =>
  Effect.gen(function* () {
    yield* autoEnrichSpan()
    const iteration = yield* Ref.getAndUpdate(iterationRef, (n) => n + 1)

    console.log(`  ⏰ Iteration ${iteration} started`)
    yield* Effect.sleep('50 millis')
    console.log(`  ✅ Iteration ${iteration} completed`)
  }).pipe(
    // ✅ IMPORTANT: Each iteration gets its own root span
    // Without { root: true }, iterations would chain as parent-child
    Effect.withSpan('scheduled-iteration', {
      root: true,
      attributes: { iteration: 0 } // Will be updated with actual iteration
    })
  )

const program = Effect.gen(function* () {
  console.log('\n📋 Starting schedule context isolation demonstration...\n')

  const iterationRef = yield* Ref.make(0)

  console.log('🔁 Running scheduled task 3 times...\n')

  // Run scheduled task 3 times with a delay between iterations
  yield* scheduledTask(iterationRef).pipe(
    Effect.repeat(
      Schedule.spaced('100 millis').pipe(
        Schedule.compose(Schedule.recurs(2)) // Run 3 times total (0, 1, 2)
      )
    )
  )

  // Give time for traces to be exported
  console.log('\n📤 Waiting for traces to be exported...')
  yield* Effect.sleep('500 millis')

  console.log('\n✅ Program completed\n')
  console.log('✅ Expected: Each iteration has its own ROOT span')
  console.log('✅ Expected: Iterations are NOT parent-child of each other')
})

const main = program.pipe(Effect.provide(TracingLive))

Effect.runPromise(main)
  .then(() => {
    console.log('\n✅ Effect program completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Effect program failed:', error)
    process.exit(1)
  })
