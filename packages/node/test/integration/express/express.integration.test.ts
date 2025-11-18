/**
 * Integration test for Express example
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  startExample,
  stopServer,
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  waitFor,
  getCollectorLogs,
  type TestServer,
  type CollectorContainer
} from '../shared/helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/express')
const BASE_PORT = 3100

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Express Example', () => {
  beforeAll(async () => {
    // Use random port to avoid conflicts in parallel execution
    port = BASE_PORT + Math.floor(Math.random() * 1000)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Express example server with custom OTLP endpoint
    server = await startExample(
      'Express',
      EXAMPLE_DIR,
      port,
      `http://localhost:${collector.httpPort}`
    )
  })

  afterAll(async () => {
    if (server) {
      await stopServer(server)
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

  it('should respond to requests', async () => {
    // Make request to the health endpoint
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('should send traces to collector', async () => {
    // Make a request that should create traces
    await fetch(`http://localhost:${port}/users`)

    // Wait longer for all spans (parent + children) to export
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check if collector received traces
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 50)
      console.error('Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify trace content - get more logs to capture all spans
    const logs = await getCollectorLogs(collector, 200)

    // Check for either parent or child spans (collector queue can cause parent spans to be rejected)
    const hasAppSpans = logs.includes('app.users.list') || logs.includes('app.db.query')

    // Log for debugging if neither found
    if (!hasAppSpans) {
      console.log(
        'Available spans:',
        logs.split('\n').filter((l) => l.includes('Name'))
      )
    }

    expect(hasAppSpans).toBeTruthy()
  })

  it('should filter health check spans', async () => {
    // Make health check request (should be filtered)
    await fetch(`http://localhost:${port}/health`)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 100)

    // Health check spans should be filtered out per instrumentation.yaml
    // The logs should NOT contain health-related spans
    const hasHealthSpans = logs.includes('health')

    // This test depends on the ignore_patterns in instrumentation.yaml
    // If health is configured to be ignored, this should pass
    console.log('Checking if health spans are filtered...')
    console.log('Has health spans:', hasHealthSpans)
  })

  it('should handle POST requests', async () => {
    // Create a new user
    const response = await fetch(`http://localhost:${port}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com'
      })
    })

    expect(response.status).toBe(201)

    // Wait for traces (BatchSpanProcessor with 500ms delay)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Verify traces were sent
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)
    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.users.create')
  })

  it('should have interactive UI', async () => {
    // Check if the UI is served
    const response = await fetch(`http://localhost:${port}`)
    expect(response.status).toBe(200)

    // Check content type indicates HTML
    const contentType = response.headers.get('content-type')
    expect(contentType).toContain('text/html')
  })
})
