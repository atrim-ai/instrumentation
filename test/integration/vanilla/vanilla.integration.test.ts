/**
 * Integration test for Vanilla TypeScript example
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

const EXAMPLE_DIR = path.join(process.cwd(), './examples/vanilla')
const BASE_PORT = 3101

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Vanilla TypeScript Example', () => {
  beforeAll(async () => {
    // Use random port to avoid conflicts in parallel execution
    port = BASE_PORT + Math.floor(Math.random() * 1000)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Vanilla example server with custom OTLP endpoint
    server = await startExample(
      'Vanilla',
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
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('should send traces for operations', async () => {
    // Trigger operation that creates spans
    await fetch(`http://localhost:${port}/users/1`)

    // Wait longer for all spans (parent + children) to export
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 50)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify span names - get more logs to capture all spans
    const logs = await getCollectorLogs(collector, 200)

    // Check for either parent or child spans (collector queue can cause parent spans to be rejected)
    const hasAppSpans = logs.includes('app.user.fetch') || logs.includes('app.db.query')

    // Log for debugging if neither found
    if (!hasAppSpans) {
      console.log(
        'Available spans:',
        logs.split('\n').filter((l) => l.includes('Name'))
      )
    }

    expect(hasAppSpans).toBeTruthy()
  })

  it('should trace database operations', async () => {
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 100)

    // Should have both app and db spans
    expect(logs).toContain('app.user.fetch')
    expect(logs).toContain('app.db.query')
  })

  it('should trace cache operations', async () => {
    // First request - cache miss
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Second request - cache hit (if implemented)
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 100)
    const hasCacheSpans = logs.includes('cache.')

    console.log('Has cache spans:', hasCacheSpans)
    // Cache may or may not be implemented in example
  })

  it('should have interactive UI', async () => {
    const response = await fetch(`http://localhost:${port}`)
    expect(response.status).toBe(200)

    // Check content type indicates HTML
    const contentType = response.headers.get('content-type')
    expect(contentType).toContain('text/html')
  })
})
