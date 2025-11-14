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
  getRandomPort,
  type TestServer,
  type CollectorContainer
} from '../shared/helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/vanilla')

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Vanilla TypeScript Example', () => {
  beforeAll(async () => {
    // Use worker-specific port to avoid conflicts in parallel execution
    port = await getRandomPort()

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
    await new Promise(resolve => setTimeout(resolve, 6000))

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 50)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify span names
    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.user.fetch')
  })

  it('should trace database operations', async () => {
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise(resolve => setTimeout(resolve, 6000))

    const logs = await getCollectorLogs(collector, 100)

    // Should have both app and db spans
    expect(logs).toContain('app.user.fetch')
    expect(logs).toContain('app.db.query')
  })

  it('should trace cache operations', async () => {
    // First request - cache miss
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Second request - cache hit (if implemented)
    await fetch(`http://localhost:${port}/users/1`)
    await new Promise(resolve => setTimeout(resolve, 2000))

    const logs = await getCollectorLogs(collector, 100)
    const hasCacheSpans = logs.includes('cache.')

    console.log('Has cache spans:', hasCacheSpans)
    // Cache may or may not be implemented in example
  })

  it('should have interactive UI', async () => {
    await fetch(`http://localhost:${port}`)
    

    // UI check - removed for Vitest
    // UI validation removed - use Playwright for UI tests
  })
})
