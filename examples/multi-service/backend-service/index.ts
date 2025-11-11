/**
 * Backend Service - Multi-Service Example
 *
 * This is the middle-tier service that:
 * 1. Receives requests from UI Service
 * 2. Processes business logic
 * 3. Calls DB Service for data
 * 4. Returns results to UI
 *
 * It demonstrates how traces are propagated both:
 * - Incoming: From UI (continues the trace)
 * - Outgoing: To DB (propagates the trace)
 */

import express from 'express'
import { initializeInstrumentation, setSpanAttributes, markSpanSuccess, markSpanError } from '@atrim/instrumentation'
import { trace } from '@opentelemetry/api'

const DB_URL = process.env.DB_URL || 'http://localhost:3102'
const PORT = process.env.PORT || 3101

async function setupInstrumentation() {
  console.log('🔧 [Backend Service] Setting up instrumentation...\n')

  // One line initialization!
  await initializeInstrumentation({
    serviceName: 'backend-service'
  })

  console.log('✅ [Backend Service] Instrumentation initialized')
  console.log(`   🔗 DB Service: ${DB_URL}`)
  console.log(`   ✅ W3C Trace Context propagation enabled (incoming & outgoing)\n`)
}

// Query database service
async function queryDatabase(table: string, query: string): Promise<any> {
  const tracer = trace.getTracer('backend-service')
  const span = tracer.startSpan('app.db.call')

  try {
    setSpanAttributes(span, {
      'db.table': table,
      'db.query': query
    })

    // Make HTTP request to DB service
    // NodeSDK will automatically:
    // 1. Continue the existing trace from UI
    // 2. Add traceparent header to DB request
    // 3. DB service will be part of the same trace
    const response = await fetch(`${DB_URL}/query?table=${table}&query=${query}`)

    if (!response.ok) {
      throw new Error(`DB service returned ${response.status}`)
    }

    const data = await response.json()
    markSpanSuccess(span)
    span.end()

    return data
  } catch (error) {
    markSpanError(span, error instanceof Error ? error.message : 'DB call failed')
    span.recordException(error instanceof Error ? error : new Error(String(error)))
    span.end()
    throw error
  }
}

// Create Express app
function createApp() {
  const app = express()
  app.use(express.json())

  const tracer = trace.getTracer('backend-service')

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'backend-service' })
  })

  // Get users from database
  app.get('/api/users', async (req, res) => {
    // This span is created within the context of the incoming HTTP span
    // which is already part of the trace from the UI service
    const span = tracer.startSpan('app.users.list')

    try {
      setSpanAttributes(span, {
        'operation.type': 'list',
        'service.tier': 'backend'
      })

      // Call database service
      // This will be a child span of the current trace
      const users = await queryDatabase('users', 'SELECT * FROM users')

      setSpanAttributes(span, {
        'result.count': users.length
      })

      markSpanSuccess(span)
      res.json(users)
    } catch (error) {
      markSpanError(span, 'Failed to fetch users')
      res.status(500).json({ error: 'Failed to fetch users' })
    } finally {
      span.end()
    }
  })

  // Get user by ID
  app.get('/api/users/:id', async (req, res) => {
    const span = tracer.startSpan('app.users.get')

    try {
      setSpanAttributes(span, {
        'operation.type': 'get',
        'user.id': req.params.id
      })

      const users = await queryDatabase('users', `SELECT * FROM users WHERE id = '${req.params.id}'`)
      const user = users.find((u: any) => u.id === req.params.id)

      if (user) {
        markSpanSuccess(span)
        res.json(user)
      } else {
        markSpanError(span, 'User not found')
        res.status(404).json({ error: 'User not found' })
      }
    } catch (error) {
      markSpanError(span, 'Failed to fetch user')
      res.status(500).json({ error: 'Failed to fetch user' })
    } finally {
      span.end()
    }
  })

  return app
}

// Main
async function main() {
  console.log('═'.repeat(60))
  console.log('🔧 Backend Service - Multi-Service Tracing Example')
  console.log('═'.repeat(60))
  console.log()

  try {
    await setupInstrumentation()

    const app = createApp()
    app.listen(PORT, () => {
      console.log('═'.repeat(60))
      console.log(`🌐 Backend Service listening on http://localhost:${PORT}`)
      console.log()
      console.log('📥 Receives traces from: UI Service')
      console.log('📤 Propagates traces to: DB Service')
      console.log()
      console.log('Endpoints:')
      console.log(`   GET  http://localhost:${PORT}/health`)
      console.log(`   GET  http://localhost:${PORT}/api/users`)
      console.log(`   GET  http://localhost:${PORT}/api/users/:id`)
      console.log('═'.repeat(60))
      console.log()
    })
  } catch (error) {
    console.error('❌ Failed to start backend service:', error)
    process.exit(1)
  }
}

main()
