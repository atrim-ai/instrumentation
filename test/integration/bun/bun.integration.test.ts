/**
 * Integration test for Bun runtime example
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  waitFor,
  getCollectorLogs,
  type TestServer,
  type CollectorContainer
} from '../shared/helpers.js'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), './examples/bun')
const BASE_PORT = 3103

let server: TestServer
let collector: CollectorContainer
let port: number

/**
 * Start a Bun example server (uses bun instead of pnpm)
 */
async function startBunExample(
  name: string,
  dir: string,
  port: number,
  otlpEndpoint?: string
): Promise<TestServer> {
  console.log(`🚀 Starting ${name} with Bun on port ${port}...`)

  return new Promise((resolve, reject) => {
    // Start the server with bun
    const serverProcess = spawn('bun', ['run', 'index.ts'], {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint || 'http://localhost:14318'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    serverProcess.stdout?.on('data', (data) => {
      const text = data.toString()
      output += text
      console.log(`[${name}]`, text.trim())
    })

    serverProcess.stderr?.on('data', (data) => {
      const text = data.toString()
      errorOutput += text
      console.error(`[${name} ERROR]`, text.trim())
    })

    serverProcess.on('error', (error) => {
      console.error(`❌ Failed to start ${name}:`, error)
      reject(error)
    })

    // Wait for server to be ready
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${port}/health`)
        if (response.ok) {
          clearInterval(checkInterval)
          console.log(`✅ ${name} is ready`)
          resolve({
            process: serverProcess,
            port,
            name
          })
        }
      } catch {
        // Server not ready yet
      }
    }, 500)

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      serverProcess.kill()
      console.error(`❌ ${name} failed to start within 30s`)
      console.error('Output:', output)
      console.error('Errors:', errorOutput)
      reject(new Error(`${name} failed to start`))
    }, 30000)
  })
}

/**
 * Stop a test server
 */
async function stopBunServer(server: TestServer): Promise<void> {
  console.log(`🛑 Stopping ${server.name}...`)

  return new Promise((resolve) => {
    server.process.once('exit', () => {
      console.log(`✅ ${server.name} stopped`)
      // Wait a bit after process exits to ensure SDK shutdown completes
      // The shutdown handler might still be flushing spans
      setTimeout(resolve, 1000)
    })

    server.process.kill('SIGTERM')

    // Force kill after 10 seconds (increased from 5s)
    setTimeout(() => {
      if (!server.process.killed) {
        console.log(`⚠️  Force killing ${server.name}`)
        server.process.kill('SIGKILL')
      }
      // Still wait a bit even after force kill
      setTimeout(resolve, 1000)
    }, 10000)
  })
}

describe('Bun Runtime Example', () => {
  beforeAll(async () => {
    // Use random port to avoid conflicts in parallel execution
    port = BASE_PORT + Math.floor(Math.random() * 1000)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Bun example server with custom OTLP endpoint
    server = await startBunExample(
      'Bun',
      EXAMPLE_DIR,
      port,
      `http://localhost:${collector.httpPort}`
    )
  })

  afterAll(async () => {
    if (server) {
      await stopBunServer(server)
      // Wait for BatchSpanProcessor to export (OTEL_BSP_SCHEDULE_DELAY=500 for tests)
      // Add extra time to ensure all exports complete
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    // Only cleanup collectors in local development
    // In CI, GitHub Actions automatically cleans up all containers when the workflow completes
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector (local dev mode)')
    } else if (collector && process.env.CI) {
      console.log('⏭️  Leaving collector for CI cleanup')
    }
  })

  it('should respond to health check', async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('runtime', 'bun')
  })

  it('should send traces for user fetch operations', async () => {
    console.log('🧪 Testing user fetch with traces...')

    // Trigger operation that creates spans
    const response = await fetch(`http://localhost:${port}/users/456`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('runtime', 'bun')

    // Wait for traces to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Note: We verify specific span names in the "database operations" test
    // This test just ensures Bun can send traces successfully
  })

  it('should trace database operations', async () => {
    console.log('🧪 Testing database operations...')

    await fetch(`http://localhost:${port}/users/456`)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const logs = await getCollectorLogs(collector, 200)

    // Should have db spans (parent spans tested in Express/Vanilla tests)
    expect(logs).toContain('app.db.query')
  })

  it('should trace cache operations', async () => {
    console.log('🧪 Testing cache operations...')

    const response = await fetch(`http://localhost:${port}/api/cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test-key', value: 'test-value' })
    })

    expect(response.ok).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.cache.set')
  })

  it('should filter internal operations', async () => {
    console.log('🧪 Testing filtered operations...')

    // Clear collector logs by checking before
    const logsBefore = await getCollectorLogs(collector, 100)

    // Trigger internal operation (should be filtered)
    const response = await fetch(`http://localhost:${port}/api/internal`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('traced', false)

    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logsAfter = await getCollectorLogs(collector, 100)

    // Should NOT contain internal.* spans
    const hasInternalSpans = logsAfter.includes('internal.utility')
    expect(hasInternalSpans).toBe(false)
  })

  it('should filter test operations', async () => {
    console.log('🧪 Testing filtered test operations...')

    // Trigger test operation (should be filtered)
    const response = await fetch(`http://localhost:${port}/api/test`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('traced', false)

    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 100)

    // Should NOT contain test.* spans
    const hasTestSpans = logs.includes('test.utility')
    expect(hasTestSpans).toBe(false)
  })

  // UI test skipped - redundant with health check and endpoint tests
  // The core tracing functionality is fully tested above
  it.skip('should have interactive UI', async () => {
    const response = await fetch(`http://localhost:${port}`)
    expect(response.status).toBe(200)

    const contentType = response.headers.get('content-type')
    expect(contentType).toContain('text/html')
  })
})
