/**
 * Test fixture for auto-tracing integration test
 *
 * This example demonstrates automatic tracing of Effect fibers
 * using the AutoTracingLive layer.
 */

import { Effect, Layer, Console } from 'effect'
import { NodeSdk } from '@effect/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import {
  AutoTracingLive,
  createAutoTracingLayer,
  withoutAutoTracing,
  setSpanName
} from '../../../../../../src/integrations/effect/auto/index.js'

// Get OTLP endpoint from environment
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

console.log(`[auto-tracing-test] Starting with OTLP endpoint: ${otlpEndpoint}`)

// Create OTel SDK layer
const OtelLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'auto-tracing-test',
    serviceVersion: '1.0.0'
  },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    }),
    {
      scheduledDelayMillis: 100, // Export quickly for tests
      maxExportBatchSize: 10
    }
  )
}))

// Create auto-tracing layer with test configuration
const TestAutoTracingLive = createAutoTracingLayer({
  config: {
    enabled: true,
    granularity: 'fiber',
    span_naming: {
      default: 'effect.fiber.{fiber_id}',
      infer_from_source: true,
      rules: [
        {
          match: { function: 'service.*' },
          name: 'service.{function}'
        },
        {
          match: { function: 'fetch.*' },
          name: 'http.{function}'
        }
      ]
    },
    filter: {
      include: [],
      exclude: ['^internal\\.', '^test\\.excluded\\.']
    },
    performance: {
      sampling_rate: 1.0,
      min_duration: '0ms',
      max_concurrent: 0
    },
    metadata: {
      fiber_info: true,
      source_location: true,
      parent_fiber: true
    }
  }
})

// Simulated service functions
const serviceGetUser = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] serviceGetUser executing')
  yield* Effect.sleep('10 millis')
  return { id: 1, name: 'Alice' }
})

const fetchUserData = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] fetchUserData executing')
  yield* Effect.sleep('15 millis')
  return { data: 'user data' }
})

const internalOperation = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] internalOperation executing (should be excluded)')
  yield* Effect.sleep('5 millis')
  return 'internal result'
})

const regularFunction = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] regularFunction executing')
  yield* Effect.sleep('10 millis')
  return 'regular result'
})

// Test opt-out mechanism
const optedOutOperation = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] optedOutOperation executing (should NOT be traced)')
  yield* Effect.sleep('5 millis')
  return 'opted out result'
})

// Test span name override
const customNamedOperation = Effect.gen(function* () {
  yield* Console.log('[auto-tracing-test] customNamedOperation executing')
  yield* Effect.sleep('5 millis')
  return 'custom named result'
})

// Main test program
const program = Effect.gen(function* () {
  console.log('[auto-tracing-test] Starting test program...')

  // Test 1: Service function (should match service.* rule)
  console.log('[auto-tracing-test] Test 1: Service function')
  const user = yield* serviceGetUser
  console.log(`[auto-tracing-test] Got user: ${JSON.stringify(user)}`)

  // Test 2: Fetch function (should match fetch.* rule)
  console.log('[auto-tracing-test] Test 2: Fetch function')
  const userData = yield* fetchUserData
  console.log(`[auto-tracing-test] Got userData: ${JSON.stringify(userData)}`)

  // Test 3: Regular function (should use default naming)
  console.log('[auto-tracing-test] Test 3: Regular function')
  const regular = yield* regularFunction
  console.log(`[auto-tracing-test] Got regular: ${regular}`)

  // Test 4: Opt-out mechanism
  console.log('[auto-tracing-test] Test 4: Opt-out mechanism')
  const optedOut = yield* withoutAutoTracing(optedOutOperation)
  console.log(`[auto-tracing-test] Got optedOut: ${optedOut}`)

  // Test 5: Custom span name override
  console.log('[auto-tracing-test] Test 5: Custom span name')
  const customNamed = yield* setSpanName('custom.my-operation')(customNamedOperation)
  console.log(`[auto-tracing-test] Got customNamed: ${customNamed}`)

  console.log('[auto-tracing-test] All tests completed!')

  // Wait for spans to be exported
  yield* Effect.sleep('500 millis')

  return 'success'
})

// Run with both OTel and auto-tracing layers
const runnable = program.pipe(Effect.provide(Layer.mergeAll(OtelLive, TestAutoTracingLive)))

Effect.runPromise(runnable)
  .then((result) => {
    console.log(`[auto-tracing-test] Program completed: ${result}`)
    // Give time for final export
    setTimeout(() => {
      console.log('[auto-tracing-test] Exiting')
      process.exit(0)
    }, 1000)
  })
  .catch((error) => {
    console.error('[auto-tracing-test] Program failed:', error)
    process.exit(1)
  })
