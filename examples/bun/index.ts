/**
 * Bun Runtime Example for @atrim/instrumentation
 *
 * This example demonstrates that @atrim/instrumentation works seamlessly with Bun,
 * showcasing Bun's fast HTTP server and built-in APIs.
 *
 * To run this example:
 * 1. Make sure you have Bun installed:
 *    curl -fsSL https://bun.sh/install | bash
 *
 * 2. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 3. Run this example:
 *    bun run index.ts
 */

import { Effect } from 'effect'
import { trace } from '@opentelemetry/api'
import {
  initializeInstrumentation,
  annotateDbQuery,
  annotateCacheOperation,
  markSpanSuccess,
  markSpanError,
  setSpanAttributes
} from '@atrim/instrument-node'

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry with @atrim/instrumentation on Bun...\n')

  // One line initialization - handles everything!
  await Effect.runPromise(
    initializeInstrumentation({
      serviceName: 'bun-example',
      autoInstrument: true // Explicitly enable auto-instrumentation (Bun uses standard OpenTelemetry)
    })
  )

  console.log('✅ Ready to trace with Bun!\n')
}

// Example business logic functions
async function fetchUserData(userId: string) {
  const tracer = trace.getTracer('bun-example')

  return await tracer.startActiveSpan('app.user.fetch', async (span) => {
    try {
      setSpanAttributes(span, {
        'user.id': userId,
        'operation.type': 'fetch',
        runtime: 'bun'
      })

      // Simulate database query
      await Bun.sleep(100)

      await tracer.startActiveSpan('app.db.query', async (dbSpan) => {
        annotateDbQuery(dbSpan, 'postgresql', `SELECT * FROM users WHERE id = '${userId}'`, 'users')

        await Bun.sleep(50)
        dbSpan.end()
      })

      markSpanSuccess(span)
      return { id: userId, name: 'Jane Doe', email: 'jane@example.com', runtime: 'bun' }
    } catch (error) {
      markSpanError(span, 'Failed to fetch user')
      throw error
    } finally {
      span.end()
    }
  })
}

async function cacheOperation(key: string, value: string) {
  const tracer = trace.getTracer('bun-example')

  return await tracer.startActiveSpan('app.cache.set', async (span) => {
    try {
      annotateCacheOperation(span, 'set', key, undefined)
      setSpanAttributes(span, { runtime: 'bun' })

      // Simulate cache operation (using Bun's sleep)
      await Bun.sleep(20)

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
  const tracer = trace.getTracer('bun-example')

  return await tracer.startActiveSpan('internal.utility.operation', async (span) => {
    try {
      await Bun.sleep(30)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function testOperation() {
  // This span will be dropped by ignore pattern (^test\.)
  const tracer = trace.getTracer('bun-example')

  return await tracer.startActiveSpan('test.utility.operation', async (span) => {
    try {
      await Bun.sleep(20)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function demoWorkflow() {
  const tracer = trace.getTracer('bun-example')

  return await tracer.startActiveSpan('demo.workflow', async (rootSpan) => {
    try {
      setSpanAttributes(rootSpan, { runtime: 'bun' })

      // 1. Fetch user (will be instrumented)
      const userData = await fetchUserData('user-456')

      // 2. Cache operation (will be instrumented)
      await cacheOperation('user:456', JSON.stringify(userData))

      // 3. Internal operation (will be DROPPED by ignore pattern)
      await internalOperation()

      markSpanSuccess(rootSpan)

      return {
        userData,
        cached: true,
        runtime: 'bun',
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

// Bun HTTP Server
async function createServer() {
  return Bun.serve({
    port: process.env.PORT || 3003,
    async fetch(req) {
      const url = new URL(req.url)

      // Serve static files
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const file = Bun.file('./public/index.html')
        return new Response(file, {
          headers: { 'Content-Type': 'text/html' }
        })
      }

      // API: Run complete workflow
      if (req.method === 'POST' && url.pathname === '/api/workflow') {
        try {
          const result = await demoWorkflow()
          return Response.json(result)
        } catch (error) {
          return Response.json({ error: 'Workflow failed' }, { status: 500 })
        }
      }

      // API: Fetch user by ID
      if (req.method === 'GET' && url.pathname.match(/^\/users\/\d+$/)) {
        const userId = url.pathname.split('/').pop()
        try {
          const user = await fetchUserData(userId || 'unknown')
          return Response.json(user)
        } catch (error) {
          return Response.json({ error: 'Failed to fetch user' }, { status: 500 })
        }
      }

      // API: Fetch user (legacy route)
      if (req.method === 'GET' && url.pathname.startsWith('/api/user/')) {
        const userId = url.pathname.split('/').pop()
        try {
          const user = await fetchUserData(userId || 'unknown')
          return Response.json(user)
        } catch (error) {
          return Response.json({ error: 'Failed to fetch user' }, { status: 500 })
        }
      }

      // API: Cache operation
      if (req.method === 'POST' && url.pathname === '/api/cache') {
        try {
          const body = await req.json()
          const { key, value } = body
          await cacheOperation(key, value)
          return Response.json({ success: true })
        } catch (error) {
          return Response.json({ error: 'Cache operation failed' }, { status: 500 })
        }
      }

      // API: Internal operation (filtered)
      if (req.method === 'GET' && url.pathname === '/api/internal') {
        try {
          await internalOperation()
          return Response.json({ success: true, traced: false })
        } catch (error) {
          return Response.json({ error: 'Internal operation failed' }, { status: 500 })
        }
      }

      // API: Test operation (filtered)
      if (req.method === 'GET' && url.pathname === '/api/test') {
        try {
          await testOperation()
          return Response.json({ success: true, traced: false })
        } catch (error) {
          return Response.json({ error: 'Test operation failed' }, { status: 500 })
        }
      }

      // Health check endpoint
      if (req.method === 'GET' && url.pathname === '/health') {
        return Response.json({ status: 'ok', runtime: 'bun' })
      }

      // 404
      return new Response('Not Found', { status: 404 })
    }
  })
}

// Main
async function main() {
  console.log('📦 @atrim/instrumentation - Bun Runtime Example\n')
  console.log('='.repeat(60) + '\n')

  try {
    // Setup instrumentation
    await setupInstrumentation()

    // Create and start Bun server
    const server = await createServer()

    console.log(`🌐 Bun HTTP server listening on http://localhost:${server.port}`)
    console.log('\n' + '='.repeat(60))
    console.log('🎨 Interactive UI:')
    console.log(`   👉 Open http://localhost:${server.port} in your browser`)
    console.log('\n📊 Or try these curl requests:')
    console.log(`   curl -X POST http://localhost:${server.port}/api/workflow`)
    console.log(`   curl http://localhost:${server.port}/api/user/user-456`)
    console.log(`   curl http://localhost:${server.port}/api/internal  # Filtered`)
    console.log('\n' + '='.repeat(60))
    console.log('💡 Check your OpenTelemetry collector for traces!')
    console.log('   - Service: bun-example')
    console.log('   - Runtime: Bun')
    console.log('   - Spans created: app.*, demo.* (matching patterns)')
    console.log('   - Spans dropped: internal.*, test.* (ignore patterns)\n')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
