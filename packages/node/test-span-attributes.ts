/**
 * Test script to verify annotation helpers add attributes to spans
 * Outputs spans to console so you can see the attributes
 */

import { Effect } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  autoEnrichSpan,
  annotateUser,
  annotateDataSize,
  annotateQuery,
  annotateBatch,
  annotatePriority
} from './src/integrations/effect/index.js'

// Use OTLP exporter if endpoint provided, otherwise use console
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const exporter = endpoint
  ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
  : new ConsoleSpanExporter()

const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: 'test-annotations' },
  spanProcessor: new BatchSpanProcessor(exporter)
}))

const program = Effect.gen(function* () {
  console.log('\n🧪 Testing annotation helpers...\n')

  // Auto-enrich with Effect metadata
  yield* autoEnrichSpan()

  // Add user annotations
  yield* annotateUser('user-123', 'test@example.com', 'testuser')

  // Add data size annotations
  yield* annotateDataSize(1024, 10, 0.5)

  // Add query annotations
  yield* annotateQuery('SELECT * FROM users', 150, 5, 'postgres')

  // Add batch annotations
  yield* annotateBatch(100, 10, 95, 5)

  // Add priority annotation
  yield* annotatePriority('high', 'Critical user operation')

  console.log('✅ All annotations applied\n')

  // Nested operation
  yield* Effect.gen(function* () {
    yield* autoEnrichSpan()
    yield* annotatePriority('low', 'Background cleanup')
  }).pipe(Effect.withSpan('nested.operation'))

  return 'done'
}).pipe(Effect.withSpan('test.annotations'))

console.log('📊 Look for these attributes in the span output below:\n')
console.log('   effect.fiber.id, effect.fiber.status, effect.operation.nested')
console.log('   user.id, user.email, user.name')
console.log('   data.size.bytes, data.size.items')
console.log('   db.statement, db.duration.ms, db.row_count, db.name')
console.log('   batch.size, batch.total_items, batch.count')
console.log('   operation.priority, operation.priority.reason')
console.log('\n' + '='.repeat(80) + '\n')

Effect.runPromise(program.pipe(Effect.provide(TracingLive)))
  .then(() => {
    setTimeout(() => {
      console.log('\n' + '='.repeat(80))
      console.log('✅ Test completed - Check the span output above for attributes')
      process.exit(0)
    }, 2000) // Wait for spans to flush
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
