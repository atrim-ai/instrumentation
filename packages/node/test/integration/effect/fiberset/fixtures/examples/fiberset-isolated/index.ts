/**
 * FiberSet Automatic Isolation - Using runIsolated() Helper
 *
 * This example demonstrates the NEW runIsolated() helper from
 * @atrim/instrument-node/effect that automatically:
 * 1. Creates root spans to prevent context leakage
 * 2. Tracks logical parent via OpenTelemetry span links
 * 3. Adds custom attributes as universal fallback
 *
 * This is the RECOMMENDED approach for using FiberSet.run.
 */

import { Effect, FiberSet } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import {
  runIsolated,
  annotateSpawnedTasks
} from '../../../../../../../src/integrations/effect/fiberset.js'
import {
  autoEnrichSpan,
  annotatePriority
} from '../../../../../../../src/integrations/effect/index.js'
import { suppressEconnrefused } from '../../test-helpers.js'

// Suppress ECONNREFUSED errors during shutdown in test environment
suppressEconnrefused()

const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: 'fiberset-isolated' },
  spanProcessor: new BatchSpanProcessor(
    new ConsoleSpanExporter() // Output to console to see span links!
  )
}))

// Background task - no need to manually add { root: true }!
const backgroundTask = (id: number, priority: 'high' | 'medium' | 'low') =>
  Effect.gen(function* () {
    // Auto-enrich with Effect metadata
    yield* autoEnrichSpan()

    // Annotate with priority
    yield* annotatePriority(priority, `Background task ${id}`)

    console.log(`  🔄 Background task ${id} starting...`)
    yield* Effect.sleep('10 millis')
    console.log(`  ✅ Background task ${id} completed`)

    // Nested operation - will be child of background-task
    yield* Effect.gen(function* () {
      yield* autoEnrichSpan()
      yield* Effect.sleep('5 millis')
    }).pipe(Effect.withSpan(`nested-${id}`))
  })

const program = Effect.scoped(
  Effect.gen(function* () {
    console.log('\n📋 Automatic FiberSet Isolation Demo\n')
    console.log('='.repeat(60))

    const set = yield* FiberSet.make()

    // Parent operation
    yield* Effect.gen(function* () {
      // Auto-enrich parent with Effect metadata
      yield* autoEnrichSpan()

      console.log('👨 Parent operation starting...\n')

      // Annotate parent with spawn metadata
      yield* annotateSpawnedTasks([
        { name: 'background-task-1', category: 'high_priority' },
        { name: 'background-task-2', category: 'medium_priority' },
        { name: 'background-task-3', category: 'low_priority' }
      ])

      // Use runIsolated - automatically handles everything!
      console.log('🚀 Spawning tasks with runIsolated()...\n')

      yield* runIsolated(set, backgroundTask(1, 'high'), 'background-task-1', {
        attributes: { 'task.priority': 'high' }
      })

      yield* runIsolated(set, backgroundTask(2, 'medium'), 'background-task-2', {
        attributes: { 'task.priority': 'medium' }
      })

      yield* runIsolated(set, backgroundTask(3, 'low'), 'background-task-3', {
        attributes: { 'task.priority': 'low' }
      })

      console.log('\n👨 Parent operation completed')
    }).pipe(Effect.withSpan('parent-operation'))

    // Wait for background tasks
    console.log('⏳ Waiting for background tasks...')
    yield* Effect.sleep('200 millis')

    console.log('\n' + '='.repeat(60))
    console.log('✅ Demo completed\n')
    console.log('📊 Check console output above for spans with:')
    console.log('   - root: true (no context leakage)')
    console.log('   - links: [...] (logical parent tracking)')
    console.log('   - atrim.* attributes (universal fallback)')
    console.log('\n' + '='.repeat(60) + '\n')
  })
)

const main = program.pipe(Effect.provide(TracingLive))

Effect.runPromise(main)
  .then(() => {
    console.log('✅ Effect program completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Effect program failed:', error)
    process.exit(1)
  })
