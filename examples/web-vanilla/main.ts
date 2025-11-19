/**
 * Vanilla TypeScript Example for @atrim/instrument-web
 *
 * This example shows how to use @atrim/instrument-web in a browser application.
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    pnpm dev
 */

import { Effect } from 'effect'
import { initializeInstrumentation } from '@atrim/instrument-web'
import { trace } from '@opentelemetry/api'

// Helper to log to both console and UI
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  console.log(message)

  const output = document.getElementById('output')
  if (output) {
    const timestamp = new Date().toLocaleTimeString()
    output.textContent += `[${timestamp}] ${message}\n`
  }
}

// Helper to update status
function updateStatus(message: string, type: 'default' | 'success' | 'error' = 'default') {
  const status = document.getElementById('status')
  if (status) {
    status.textContent = message
    status.className = 'status'
    if (type === 'success') status.className += ' success'
    if (type === 'error') status.className += ' error'
  }
}

async function main() {
  try {
    log('🚀 Initializing OpenTelemetry...')
    updateStatus('Initializing OpenTelemetry...', 'default')

    // Initialize instrumentation
    await Effect.runPromise(
      initializeInstrumentation({
        serviceName: 'web-vanilla-example',
        serviceVersion: '1.0.0',
        otlpEndpoint: 'http://localhost:4318/v1/traces',
        // Optionally disable specific instrumentations
        enableDocumentLoad: true,
        enableUserInteraction: true,
        enableFetch: true,
        enableXhr: true
      })
    )

    log('✅ OpenTelemetry initialized successfully!')
    log('📊 Traces will be sent to: http://localhost:4318/v1/traces')
    log('')
    log('Auto-instrumentations enabled:')
    log('  - Document Load (page load metrics)')
    log('  - User Interactions (clicks, submits)')
    log('  - Fetch API (HTTP requests)')
    log('  - XMLHttpRequest (legacy AJAX)')
    log('')
    log('Ready! Click buttons to generate traces.')

    updateStatus('✅ OpenTelemetry ready! Click buttons to generate traces.', 'success')
  } catch (error) {
    const errorMessage = `❌ Failed to initialize OpenTelemetry: ${error}`
    log(errorMessage, 'error')
    updateStatus(errorMessage, 'error')
    throw error
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}

// Get tracer for manual instrumentation
const tracer = trace.getTracer('web-vanilla-example')

// Fetch button - demonstrates auto-instrumentation of fetch
document.getElementById('fetch-btn')?.addEventListener('click', async () => {
  log('📡 Fetching data from API...')

  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/todos/1')
    const data = await response.json()

    log(`✅ Fetch successful: ${JSON.stringify(data, null, 2)}`, 'success')
    log(`   Status: ${response.status}`)
    log(`   Response headers: ${response.headers.get('content-type')}`)
    log('')
  } catch (error) {
    log(`❌ Fetch failed: ${error}`, 'error')
  }
})

// Error button - demonstrates error tracking
document.getElementById('error-btn')?.addEventListener('click', () => {
  log('⚠️  Triggering intentional error...')

  tracer.startActiveSpan('app.trigger-error', (span) => {
    try {
      // Intentional error for demonstration
      throw new Error('This is an intentional error for testing')
    } catch (error) {
      log(`❌ Error caught: ${(error as Error).message}`, 'error')

      // Record the exception in the span
      span.recordException(error as Error)
      span.setStatus({ code: 2 }) // ERROR
      span.setAttribute('error.intentional', true)
      log('   Error recorded in span')
      log('')
    } finally {
      span.end()
    }
  })
})

// Custom span button - demonstrates manual instrumentation
document.getElementById('custom-span-btn')?.addEventListener('click', () => {
  log('🎯 Creating custom span...')

  tracer.startActiveSpan('app.custom-operation', (span) => {
    try {
      // Simulate some work
      const startTime = performance.now()

      // Add custom attributes
      span.setAttribute('operation.type', 'demo')
      span.setAttribute('user.id', '123')
      span.setAttribute('page.url', window.location.href)

      // Simulate processing
      let sum = 0
      for (let i = 0; i < 1000000; i++) {
        sum += i
      }

      const duration = performance.now() - startTime
      span.setAttribute('operation.duration_ms', Math.round(duration))
      span.setAttribute('operation.result', sum)

      log(`✅ Custom operation completed`, 'success')
      log(`   Duration: ${duration.toFixed(2)}ms`)
      log(`   Result: ${sum}`)
      log(`   Span created with custom attributes`)
      log('')

      span.setStatus({ code: 1 }) // OK
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({ code: 2 }) // ERROR
      log(`❌ Operation failed: ${error}`, 'error')
    } finally {
      span.end()
    }
  })
})

// Clear button - clear the output
document.getElementById('clear-btn')?.addEventListener('click', () => {
  const output = document.getElementById('output')
  if (output) {
    output.textContent = 'Output cleared.\n'
  }
  log('🧹 Output cleared')
})
