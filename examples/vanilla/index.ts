/**
 * Vanilla TypeScript Example for @atrim/instrumentation
 *
 * This example shows how to use @atrim/instrumentation in a plain Node.js/TypeScript application
 * without any web framework - just the built-in http module.
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    npm start
 */

import { Effect } from 'effect'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { trace } from '@opentelemetry/api'
import {
  initializeInstrumentation,
  annotateDbQuery,
  annotateCacheOperation,
  markSpanSuccess,
  markSpanError,
  setSpanAttributes
} from '@atrim/instrument-node'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry with @atrim/instrumentation...\n')

  // One line initialization - handles everything!
  await Effect.runPromise(
    initializeInstrumentation({
      serviceName: 'vanilla-example'
    })
  )

  console.log('✅ Ready to trace!\n')
}

// Example business logic functions
async function fetchUserData(userId: string) {
  const tracer = trace.getTracer('vanilla-example')

  return await tracer.startActiveSpan('app.user.fetch', async (span) => {
    try {
      setSpanAttributes(span, {
        'user.id': userId,
        'operation.type': 'fetch'
      })

      // Simulate database query
      await simulateAsync(100)

      await tracer.startActiveSpan('app.db.query', async (dbSpan) => {
        annotateDbQuery(dbSpan, 'postgresql', `SELECT * FROM users WHERE id = '${userId}'`, 'users')

        await simulateAsync(50)
        dbSpan.end()
      })

      markSpanSuccess(span)
      return { id: userId, name: 'John Doe', email: 'john@example.com' }
    } catch (error) {
      markSpanError(span, 'Failed to fetch user')
      throw error
    } finally {
      span.end()
    }
  })
}

async function cacheOperation(key: string, value: string) {
  const tracer = trace.getTracer('vanilla-example')

  return await tracer.startActiveSpan('app.cache.set', async (span) => {
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
  })
}

async function internalOperation() {
  // This span will be dropped by ignore pattern (^internal\.)
  const tracer = trace.getTracer('vanilla-example')

  return await tracer.startActiveSpan('internal.utility.operation', async (span) => {
    try {
      await simulateAsync(30)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function testOperation() {
  // This span will be dropped by ignore pattern (^test\.)
  const tracer = trace.getTracer('vanilla-example')

  return await tracer.startActiveSpan('test.utility.operation', async (span) => {
    try {
      await simulateAsync(20)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function demoWorkflow() {
  const tracer = trace.getTracer('vanilla-example')

  return await tracer.startActiveSpan('demo.workflow', async (rootSpan) => {
    try {
      // 1. Fetch user (will be instrumented)
      const userData = await fetchUserData('user-123')

      // 2. Cache operation (will be instrumented)
      await cacheOperation('user:123', JSON.stringify(userData))

      // 3. Internal operation (will be DROPPED by ignore pattern)
      await internalOperation()

      markSpanSuccess(rootSpan)

      return {
        userData,
        cached: true,
        tracesGenerated: 4 // demo.workflow, app.user.fetch, app.db.query, app.cache.set
      }
    } catch (error) {
      markSpanError(rootSpan, 'Workflow failed')
      throw error
    } finally {
      rootSpan.end()
    }
  })
}

function simulateAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// HTTP Server
function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // Serve static files
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const filePath = path.join(__dirname, 'public', 'index.html')
      const content = fs.readFileSync(filePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
      return
    }

    // API: Run complete workflow
    if (req.method === 'POST' && url.pathname === '/api/workflow') {
      try {
        const result = await demoWorkflow()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Workflow failed' }))
      }
      return
    }

    // API: Fetch user by ID (new route for test compatibility)
    if (req.method === 'GET' && url.pathname.match(/^\/users\/\d+$/)) {
      const userId = url.pathname.split('/').pop()
      try {
        const user = await fetchUserData(userId || 'unknown')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(user))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to fetch user' }))
      }
      return
    }

    // API: Fetch user (legacy route)
    if (req.method === 'GET' && url.pathname.startsWith('/api/user/')) {
      const userId = url.pathname.split('/').pop()
      try {
        const user = await fetchUserData(userId || 'unknown')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(user))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to fetch user' }))
      }
      return
    }

    // API: Cache operation
    if (req.method === 'POST' && url.pathname === '/api/cache') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        try {
          const { key, value } = JSON.parse(body)
          await cacheOperation(key, value)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Cache operation failed' }))
        }
      })
      return
    }

    // API: Internal operation (filtered)
    if (req.method === 'GET' && url.pathname === '/api/internal') {
      try {
        await internalOperation()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, traced: false }))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal operation failed' }))
      }
      return
    }

    // API: Test operation (filtered)
    if (req.method === 'GET' && url.pathname === '/api/test') {
      try {
        await testOperation()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, traced: false }))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Test operation failed' }))
      }
      return
    }

    // Health check endpoint
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  return server
}

// Main
async function main() {
  console.log('📦 @atrim/instrumentation - Vanilla TypeScript Example\n')
  console.log('='.repeat(60) + '\n')

  try {
    // Setup instrumentation
    await setupInstrumentation()

    // Create and start HTTP server
    const server = createServer()
    const PORT = process.env.PORT || 3001

    server.listen(PORT, () => {
      console.log(`🌐 HTTP server listening on http://localhost:${PORT}`)
      console.log('\n' + '='.repeat(60))
      console.log('🎨 Interactive UI:')
      console.log(`   👉 Open http://localhost:${PORT} in your browser`)
      console.log('\n📊 Or try these curl requests:')
      console.log(`   curl -X POST http://localhost:${PORT}/api/workflow`)
      console.log(`   curl http://localhost:${PORT}/api/user/user-123`)
      console.log(`   curl http://localhost:${PORT}/api/internal  # Filtered`)
      console.log('\n' + '='.repeat(60))
      console.log('💡 Check your OpenTelemetry collector for traces!')
      console.log('   - Service: vanilla-example')
      console.log('   - Spans created: app.*, demo.* (matching patterns)')
      console.log('   - Spans dropped: internal.*, test.* (ignore patterns)\n')
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
