/**
 * Test script to verify auto-span pipeable operators work correctly
 * Creates spans and exports them to verify they appear in the collector
 */

import { Effect } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  withAutoSpan,
  traced,
  withAutoMetadata,
  annotateUser,
  annotateBatch
} from './src/integrations/effect/index.js'

// Use OTLP exporter if endpoint provided, otherwise use console
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const exporter = endpoint
  ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
  : new ConsoleSpanExporter()

const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: 'test-auto-span' },
  spanProcessor: new BatchSpanProcessor(exporter)
}))

// Test function to demonstrate span name inference
const fetchUsers = Effect.gen(function* () {
  yield* annotateUser('user-123')
  return [1, 2, 3]
}).pipe(withAutoSpan('app.fetchUsers'))

const processData = (items: number[]) =>
  Effect.gen(function* () {
    yield* annotateBatch(items.length, 2)
    return items.reduce((a, b) => a + b, 0)
  }).pipe(traced('app.processData'))

const program = Effect.gen(function* () {
  console.log('\n🧪 Testing auto-span pipeable operators...\n')

  // Test withAutoSpan with explicit name
  const result1 = yield* Effect.gen(function* () {
    return 'explicit-span'
  }).pipe(withAutoSpan('test.explicit'))

  console.log('✅ withAutoSpan with explicit name:', result1)

  // Test withAutoSpan with inferred name (no name provided)
  const result2 = yield* Effect.gen(function* () {
    return 'inferred-span'
  }).pipe(withAutoSpan())

  console.log('✅ withAutoSpan with inferred name:', result2)

  // Test traced convenience operator
  const result3 = yield* Effect.gen(function* () {
    yield* annotateUser('traced-user')
    return 'traced-result'
  }).pipe(traced('test.traced'))

  console.log('✅ traced operator:', result3)

  // Test withAutoMetadata with Effect.withSpan
  const result4 = yield* Effect.gen(function* () {
    return 'metadata-only'
  }).pipe(withAutoMetadata(), Effect.withSpan('test.withMetadata'))

  console.log('✅ withAutoMetadata:', result4)

  // Test complex workflow
  const users = yield* fetchUsers
  const total = yield* processData(users)
  console.log('✅ Complex workflow total:', total)

  // Test nested spans
  const nestedResult = yield* Effect.gen(function* () {
    const inner = yield* Effect.gen(function* () {
      return 'inner-value'
    }).pipe(traced('nested.inner'))

    return { outer: 'outer-value', inner }
  }).pipe(withAutoSpan('nested.outer'))

  console.log('✅ Nested spans:', nestedResult)

  // Test with span options
  const withOptions = yield* Effect.gen(function* () {
    return 'with-options'
  }).pipe(
    traced('test.withOptions', {
      kind: 'client',
      attributes: { 'custom.attr': 'value' }
    })
  )

  console.log('✅ With options:', withOptions)

  console.log('\n✅ All auto-span tests completed\n')

  return 'done'
})

console.log('📊 Look for these span names in the output:\n')
console.log('   test.explicit, test.traced, test.withMetadata')
console.log('   app.fetchUsers, app.processData')
console.log('   nested.outer, nested.inner')
console.log('   test.withOptions')
console.log('\n' + '='.repeat(80) + '\n')

Effect.runPromise(program.pipe(Effect.provide(TracingLive)))
  .then(() => {
    setTimeout(() => {
      console.log('\n' + '='.repeat(80))
      console.log('✅ Test completed - Check the span output above')
      process.exit(0)
    }, 2000) // Wait for spans to flush
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
