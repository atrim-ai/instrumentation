/**
 * Express Example for @atrim/instrumentation
 *
 * This example shows how to use @atrim/instrumentation with Express.js,
 * including NodeSDK auto-instrumentation for HTTP requests.
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    npm start
 *
 * 3. Make requests:
 *    curl http://localhost:3000/users
 *    curl http://localhost:3000/health  # Will be dropped by ignore pattern
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import express from 'express'
import {
  initializeInstrumentation,
  PatternSpanProcessor,
  annotateHttpRequest,
  annotateDbQuery,
  markSpanSuccess,
  markSpanError,
  setSpanAttributes
} from '@atrim/instrumentation'
import { loadConfig } from '@atrim/instrumentation'

// Setup instrumentation BEFORE importing app
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

  // 5. Initialize SDK with auto-instrumentations
  const sdk = new NodeSDK({
    spanProcessor: patternProcessor,
    serviceName: 'express-example',
    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP instrumentation will create spans automatically
        '@opentelemetry/instrumentation-http': {
          enabled: true
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true
        },
        // Disable noisy instrumentations
        '@opentelemetry/instrumentation-fs': {
          enabled: false
        }
      })
    ]
  })

  sdk.start()
  console.log('✅ OpenTelemetry SDK initialized with auto-instrumentation\n')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\n👋 Shutting down...')
    await sdk.shutdown()
    process.exit(0)
  })

  return sdk
}

// Mock database
const users = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' }
]

// Simulate async database query
async function queryDatabase(query: string): Promise<unknown[]> {
  const tracer = trace.getTracer('express-example')
  const span = tracer.startSpan('app.db.query')

  try {
    annotateDbQuery(span, 'postgresql', query, 'users')

    // Simulate query execution
    await new Promise((resolve) => setTimeout(resolve, 50))

    markSpanSuccess(span)
    return users
  } catch (error) {
    markSpanError(span, 'Database query failed')
    throw error
  } finally {
    span.end()
  }
}

// Create Express app
function createApp() {
  const app = express()
  app.use(express.json())

  // Serve static files from public directory
  app.use(express.static('public'))

  const tracer = trace.getTracer('express-example')

  // Health check endpoint (will be DROPPED by ignore pattern)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Metrics endpoint (will be DROPPED by ignore pattern)
  app.get('/metrics', (_req, res) => {
    res.json({ requests: 42 })
  })

  // Users list endpoint (will be INSTRUMENTED)
  app.get('/users', async (req, res) => {
    // HTTP span is created automatically by NodeSDK auto-instrumentation
    // We can get the active span from context and add custom attributes
    const activeSpan = trace.getActiveSpan()

    if (activeSpan) {
      setSpanAttributes(activeSpan, {
        'custom.handler': 'users-list',
        'custom.version': '1.0'
      })
    }

    // Create a custom application span
    const appSpan = tracer.startSpan('app.users.list')

    try {
      // Query database (creates child span)
      const result = await queryDatabase('SELECT * FROM users')

      annotateHttpRequest(appSpan, 'GET', req.path, 200)
      markSpanSuccess(appSpan)

      res.json(result)
    } catch (error) {
      markSpanError(appSpan, 'Failed to fetch users')
      res.status(500).json({ error: 'Internal server error' })
    } finally {
      appSpan.end()
    }
  })

  // Get user by ID (will be INSTRUMENTED)
  app.get('/users/:id', async (req, res) => {
    const appSpan = tracer.startSpan('app.users.get')

    try {
      setSpanAttributes(appSpan, {
        'user.id': req.params.id
      })

      // Simulate database query
      const user = users.find((u) => u.id === req.params.id)

      if (user) {
        annotateHttpRequest(appSpan, 'GET', req.path, 200)
        markSpanSuccess(appSpan)
        res.json(user)
      } else {
        annotateHttpRequest(appSpan, 'GET', req.path, 404)
        markSpanError(appSpan, 'User not found')
        res.status(404).json({ error: 'User not found' })
      }
    } catch (error) {
      markSpanError(appSpan, 'Failed to fetch user')
      res.status(500).json({ error: 'Internal server error' })
    } finally {
      appSpan.end()
    }
  })

  // Create user (will be INSTRUMENTED)
  app.post('/users', async (req, res) => {
    const appSpan = tracer.startSpan('app.users.create')

    try {
      const { name, email } = req.body

      setSpanAttributes(appSpan, {
        'user.name': name,
        'user.email': email
      })

      // Simulate user creation
      const newUser = {
        id: String(users.length + 1),
        name,
        email
      }
      users.push(newUser)

      annotateHttpRequest(appSpan, 'POST', req.path, 201)
      markSpanSuccess(appSpan)

      res.status(201).json(newUser)
    } catch (error) {
      markSpanError(appSpan, 'Failed to create user')
      res.status(500).json({ error: 'Internal server error' })
    } finally {
      appSpan.end()
    }
  })

  return app
}

// Main
async function main() {
  console.log('📦 @atrim/instrumentation - Express Example\n')
  console.log('='.repeat(60) + '\n')

  try {
    // Setup instrumentation
    await setupInstrumentation()

    // Create and start Express app
    const app = createApp()
    const PORT = process.env.PORT || 3000

    app.listen(PORT, () => {
      console.log(`🌐 Express server listening on http://localhost:${PORT}`)
      console.log('\n' + '='.repeat(60))
      console.log('🎨 Interactive UI:')
      console.log(`   👉 Open http://localhost:${PORT} in your browser`)
      console.log('\n📊 Or try these curl requests:')
      console.log(`   curl http://localhost:${PORT}/users`)
      console.log(`   curl http://localhost:${PORT}/users/1`)
      console.log(`   curl http://localhost:${PORT}/health  # Will be dropped`)
      console.log('\n' + '='.repeat(60))
      console.log('💡 Check your OpenTelemetry collector for traces!')
      console.log('   - Service: express-example')
      console.log('   - Auto-instrumented: HTTP requests')
      console.log('   - Custom spans: app.* operations')
      console.log('   - Dropped: /health and /metrics\n')
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
