/**
 * Vanilla TypeScript Example for @atrim/instrumentation
 *
 * This example shows how to use @atrim/instrumentation in a plain Node.js/TypeScript application
 * without any web framework.
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    npm start
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { trace } from '@opentelemetry/api'
import {
  initializeInstrumentation,
  PatternSpanProcessor,
  annotateDbQuery,
  annotateCacheOperation,
  markSpanSuccess,
  markSpanError,
  setSpanAttributes
} from '@atrim/instrumentation'
import { loadConfig } from '@atrim/instrumentation'

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry with @atrim/instrumentation...\n')

  // 1. Initialize pattern-based instrumentation
  await initializeInstrumentation()

  // 2. Create OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  })

  // 3. Create batch processor
  const batchProcessor = new BatchSpanProcessor(exporter)

  // 4. Wrap with pattern processor for filtering
  const config = await loadConfig()
  const patternProcessor = new PatternSpanProcessor(config, batchProcessor)

  // 5. Initialize SDK
  const sdk = new NodeSDK({
    spanProcessor: patternProcessor,
    serviceName: 'vanilla-example'
  })

  sdk.start()
  console.log('✅ OpenTelemetry SDK initialized\n')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\n👋 Shutting down...')
    await sdk.shutdown()
    process.exit(0)
  })

  return sdk
}

// Example business logic functions
async function fetchUserData(userId: string) {
  const tracer = trace.getTracer('vanilla-example')
  const span = tracer.startSpan('app.user.fetch')

  try {
    setSpanAttributes(span, {
      'user.id': userId,
      'operation.type': 'fetch'
    })

    // Simulate database query
    await simulateAsync(100)

    const dbSpan = tracer.startSpan('app.db.query')
    annotateDbQuery(dbSpan, 'postgresql', `SELECT * FROM users WHERE id = '${userId}'`, 'users')

    await simulateAsync(50)
    dbSpan.end()

    markSpanSuccess(span)
    return { id: userId, name: 'John Doe', email: 'john@example.com' }
  } catch (error) {
    markSpanError(span, 'Failed to fetch user')
    throw error
  } finally {
    span.end()
  }
}

async function cacheOperation(key: string, value: string) {
  const tracer = trace.getTracer('vanilla-example')
  const span = tracer.startSpan('app.cache.set')

  try {
    annotateCacheOperation(span, 'set', key, undefined)

    // Simulate cache operation
    await simulateAsync(20)

    markSpanSuccess(span)
  } catch (error) {
    markSpanError(span, 'Cache operation failed')
    throw error
  } finally {
    span.end()
  }
}

async function internalOperation() {
  // This span will be dropped by ignore pattern (^internal\.)
  const tracer = trace.getTracer('vanilla-example')
  const span = tracer.startSpan('internal.utility.operation')

  try {
    console.log('  📌 Internal operation (span will be dropped)')
    await simulateAsync(30)
    span.end()
  } catch (error) {
    span.end()
  }
}

async function demoWorkflow() {
  const tracer = trace.getTracer('vanilla-example')
  const rootSpan = tracer.startSpan('demo.workflow')

  try {
    console.log('🔄 Starting demo workflow...\n')

    // 1. Fetch user (will be instrumented)
    console.log('  📊 Fetching user data...')
    const userData = await fetchUserData('user-123')
    console.log(`  ✅ Fetched user: ${userData.name}\n`)

    // 2. Cache operation (will be instrumented)
    console.log('  💾 Caching user data...')
    await cacheOperation('user:123', JSON.stringify(userData))
    console.log('  ✅ Cached successfully\n')

    // 3. Internal operation (will be DROPPED by ignore pattern)
    console.log('  🔧 Running internal operation...')
    await internalOperation()
    console.log('  ✅ Internal operation complete\n')

    markSpanSuccess(rootSpan)
    console.log('✅ Demo workflow completed!\n')
  } catch (error) {
    markSpanError(rootSpan, 'Workflow failed')
    console.error('❌ Error:', error)
  } finally {
    rootSpan.end()
  }
}

function simulateAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Main
async function main() {
  console.log('📦 @atrim/instrumentation - Vanilla TypeScript Example\n')
  console.log('=' .repeat(60) + '\n')

  try {
    // Setup instrumentation
    const sdk = await setupInstrumentation()

    // Run demo workflow
    await demoWorkflow()

    // Give time for spans to be exported
    console.log('⏳ Waiting for spans to be exported...')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Shutdown
    console.log('👋 Shutting down gracefully...')
    await sdk.shutdown()

    console.log('\n' + '='.repeat(60))
    console.log('📊 Check your OpenTelemetry collector for traces!')
    console.log('   - Service: vanilla-example')
    console.log('   - Spans created: app.*, demo.* (matching patterns)')
    console.log('   - Spans dropped: internal.* (ignore pattern)\n')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
