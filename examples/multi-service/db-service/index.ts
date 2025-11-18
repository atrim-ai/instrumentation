/**
 * DB Service - Multi-Service Example
 *
 * This is the database service (bottom tier) that:
 * 1. Receives requests from Backend Service
 * 2. Simulates database queries
 * 3. Returns mock data
 *
 * It demonstrates how traces are continued from upstream services.
 */

import { Effect } from 'effect'
import * as http from 'node:http'
import {
  initializeInstrumentation,
  annotateDbQuery,
  setSpanAttributes,
  markSpanSuccess,
  markSpanError
} from '@atrim/instrument-node'
import { trace } from '@opentelemetry/api'

const PORT = process.env.PORT || 3102

// Mock database
const mockDb = {
  users: [
    { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' },
    { id: '2', name: 'Bob', email: 'bob@example.com', role: 'user' },
    { id: '3', name: 'Charlie', email: 'charlie@example.com', role: 'user' },
    { id: '4', name: 'Diana', email: 'diana@example.com', role: 'user' }
  ]
}

async function setupInstrumentation() {
  console.log('💾 [DB Service] Setting up instrumentation...\n')

  // One line initialization!
  await Effect.runPromise(
    initializeInstrumentation({
      serviceName: 'db-service'
    })
  )

  console.log('✅ [DB Service] Instrumentation initialized')
  console.log(`   ✅ W3C Trace Context propagation enabled (incoming)\n`)
}

// Simulate database query
async function executeQuery(table: string, query: string): Promise<any[]> {
  const tracer = trace.getTracer('db-service')

  return await tracer.startActiveSpan('db.query', async (span) => {
    try {
      // Annotate with database-specific attributes
      annotateDbQuery(span, 'mock-database', query, table)

      setSpanAttributes(span, {
        'db.operation': query.split(' ')[0], // SELECT, INSERT, etc.
        'db.rows_affected': 0
      })

      // Simulate query execution time
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50))

      // Execute mock query
      let results: any[] = []

      if (table === 'users') {
        results = mockDb.users
      }

      setSpanAttributes(span, {
        'db.rows_affected': results.length,
        'db.result_count': results.length
      })

      markSpanSuccess(span)
      span.end()

      return results
    } catch (error) {
      markSpanError(span, error instanceof Error ? error.message : 'Query failed')
      span.recordException(error instanceof Error ? error : new Error(String(error)))
      span.end()
      throw error
    }
  })
}

// Create HTTP server
function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', service: 'db-service' }))
      return
    }

    // Query endpoint
    if (url.pathname === '/query' && req.method === 'GET') {
      const table = url.searchParams.get('table') || 'users'
      const query = url.searchParams.get('query') || 'SELECT * FROM users'

      try {
        const results = await executeQuery(table, query)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(results))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Query failed' }))
      }
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
  console.log('═'.repeat(60))
  console.log('💾 DB Service - Multi-Service Tracing Example')
  console.log('═'.repeat(60))
  console.log()

  try {
    await setupInstrumentation()

    const server = createServer()
    server.listen(PORT, () => {
      console.log('═'.repeat(60))
      console.log(`🌐 DB Service listening on http://localhost:${PORT}`)
      console.log()
      console.log('📥 Receives traces from: Backend Service')
      console.log('💾 Simulates: Database queries')
      console.log()
      console.log('Endpoints:')
      console.log(`   GET  http://localhost:${PORT}/health`)
      console.log(`   GET  http://localhost:${PORT}/query?table=users&query=...`)
      console.log('═'.repeat(60))
      console.log()
    })
  } catch (error) {
    console.error('❌ Failed to start DB service:', error)
    process.exit(1)
  }
}

main()
