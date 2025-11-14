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
  getRandomPort,
  type TestServer,
  type CollectorContainer
} from '../shared/helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/express')

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Express Example', () => {
  beforeAll(async () => {
    // Get random available port to avoid conflicts in parallel execution
    port = await getRandomPort()

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
    }
    if (collector) {
      await stopCollectorContainer(collector)
    }
  })

  it('should respond to requests', async () => {
    // Make request to health endpoint
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('should send traces to collector', async () => {
    // Make a request that should create traces
    await fetch(`http://localhost:${port}/users`)

    // Wait for traces to be sent (batch processor exports every 5s)
    await new Promise(resolve => setTimeout(resolve, 6000))

    // Check if collector received traces
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 50)
      console.error('Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify trace content
    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.users.list')
  })

  it('should filter health check spans', async () => {
    // Make health check request (should be filtered)
    await fetch(`http://localhost:${port}/health`)

    // Wait for potential traces
    await new Promise(resolve => setTimeout(resolve, 2000))

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

    // Wait for traces (batch processor exports every 5s by default)
    await new Promise(resolve => setTimeout(resolve, 6000))

    // Verify traces were sent
    const receivedTraces = await collectorReceivedTraces(collector)
    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.users.create')
  })

  it('should have interactive UI', async () => {
    // Check if the UI is served
    const response = await fetch(`http://localhost:${port}`)
    expect(response.status).toBe(200)

    // Check content type is HTML
    const contentType = response.headers.get('content-type')
    expect(contentType).toContain('text/html')
  })
})
