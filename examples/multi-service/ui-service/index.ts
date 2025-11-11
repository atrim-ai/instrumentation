/**
 * UI Service - Multi-Service Example
 *
 * This is the frontend service that makes HTTP requests to the backend.
 * It demonstrates how traces are propagated from the UI to downstream services.
 */

import * as http from 'node:http'
import { initializeInstrumentation } from '@atrim/instrumentation'
import { trace } from '@opentelemetry/api'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3101'
const PORT = process.env.PORT || 3100

async function setupInstrumentation() {
  console.log('🎨 [UI Service] Setting up instrumentation...\n')

  // One line initialization!
  await initializeInstrumentation({
    serviceName: 'ui-service'
  })

  console.log('✅ [UI Service] Instrumentation initialized')
  console.log(`   🔗 Backend: ${BACKEND_URL}`)
  console.log(`   ✅ W3C Trace Context propagation enabled\n`)
}

// Fetch users from backend
async function fetchUsers(): Promise<any> {
  const tracer = trace.getTracer('ui-service')
  const span = tracer.startSpan('ui.fetch.users')

  try {
    // Make HTTP request to backend
    // NodeSDK will automatically:
    // 1. Create http.client span
    // 2. Add traceparent header with current trace ID
    // 3. Backend will continue this trace
    const response = await fetch(`${BACKEND_URL}/api/users`)

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    const data = await response.json()
    span.setStatus({ code: 1 }) // OK
    span.end()

    return data
  } catch (error) {
    span.setStatus({ code: 2, message: error instanceof Error ? error.message : 'Error' })
    span.recordException(error instanceof Error ? error : new Error(String(error)))
    span.end()
    throw error
  }
}

// Create HTTP server
function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', service: 'ui-service' }))
      return
    }

    // Homepage - simple UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>UI Service - Multi-Service Example</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { color: #333; }
            button {
              background: #007bff;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
              margin: 10px 5px;
            }
            button:hover { background: #0056b3; }
            #output {
              margin-top: 20px;
              padding: 15px;
              background: #f8f9fa;
              border-radius: 4px;
              border-left: 4px solid #007bff;
            }
            .info {
              background: #e3f2fd;
              padding: 15px;
              border-radius: 4px;
              margin-bottom: 20px;
            }
            .trace-info {
              color: #666;
              font-size: 14px;
              margin-top: 10px;
            }
            pre {
              background: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎨 UI Service</h1>
            <div class="info">
              <strong>Multi-Service Tracing Example</strong><br>
              This demonstrates distributed tracing across 3 services with automatic context propagation.
            </div>

            <h2>Test Context Propagation</h2>
            <p>Click the button to fetch users. This will:</p>
            <ol>
              <li>Create a span in UI Service</li>
              <li>Make HTTP request to Backend Service</li>
              <li>Backend will continue the trace (same trace ID)</li>
              <li>Backend will call DB Service</li>
              <li>DB Service will continue the trace</li>
            </ol>

            <button onclick="fetchUsers()">Fetch Users from Backend</button>

            <div id="output"></div>
          </div>

          <script>
            async function fetchUsers() {
              const output = document.getElementById('output');
              output.innerHTML = '<p>⏳ Fetching users...</p>';

              try {
                const response = await fetch('/users');
                const data = await response.json();

                output.innerHTML = \`
                  <h3>✅ Success!</h3>
                  <p><strong>Users fetched from backend:</strong></p>
                  <pre>\${JSON.stringify(data, null, 2)}</pre>
                  <div class="trace-info">
                    <strong>Trace Flow:</strong><br>
                    UI Service → Backend Service → DB Service<br>
                    <em>All spans share the same trace ID (check collector logs)</em>
                  </div>
                \`;
              } catch (error) {
                output.innerHTML = \`
                  <h3>❌ Error</h3>
                  <p>\${error.message}</p>
                \`;
              }
            }
          </script>
        </body>
        </html>
      `)
      return
    }

    // API: Fetch users (proxies to backend)
    if (url.pathname === '/users') {
      try {
        const users = await fetchUsers()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(users))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to fetch users' }))
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
  console.log('🎨 UI Service - Multi-Service Tracing Example')
  console.log('═'.repeat(60))
  console.log()

  try {
    await setupInstrumentation()

    const server = createServer()
    server.listen(PORT, () => {
      console.log('═'.repeat(60))
      console.log(`🌐 UI Service listening on http://localhost:${PORT}`)
      console.log()
      console.log('👉 Open http://localhost:${PORT} in your browser')
      console.log('   Or: curl http://localhost:${PORT}/users')
      console.log()
      console.log('📊 Trace Flow:')
      console.log('   UI Service → Backend Service → DB Service')
      console.log('   (All spans share the same trace ID)')
      console.log('═'.repeat(60))
      console.log()
    })
  } catch (error) {
    console.error('❌ Failed to start UI service:', error)
    process.exit(1)
  }
}

main()
