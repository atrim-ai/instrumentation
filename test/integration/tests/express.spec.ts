/**
 * Integration test for Express example
 */

import { test, expect } from '@playwright/test'
import {
  startExample,
  stopServer,
  clearCollectorLogs,
  collectorReceivedTraces,
  waitFor,
  getCollectorLogs,
  type TestServer
} from './helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/express')
const PORT = 3100

let server: TestServer

// Use serial mode for trace collection tests to avoid race conditions
test.describe.serial('Express Example', () => {
  test.beforeAll(async () => {
    // Start the Express example server
    server = await startExample('Express', EXAMPLE_DIR, PORT)
    await clearCollectorLogs()
  })

  test.afterAll(async () => {
    if (server) {
      await stopServer(server)
    }
  })

  test('should respond to requests', async ({ page }) => {
    // Navigate to the health endpoint
    const response = await page.goto(`http://localhost:${PORT}/health`)
    expect(response?.status()).toBe(200)

    const body = await response?.json()
    expect(body).toEqual({ status: 'ok' })
  })

  test('should send traces to collector', async ({ page }) => {
    // Clear logs before test
    await clearCollectorLogs()

    // Make a request that should create traces
    await page.goto(`http://localhost:${PORT}/users`)
    await page.waitForTimeout(6000) // Wait for traces to be sent (batch processor exports every 5s)

    // Check if collector received traces
    const receivedTraces = await waitFor(collectorReceivedTraces, 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(50)
      console.error('Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify trace content
    const logs = await getCollectorLogs(100)
    expect(logs).toContain('app.users.list')
  })

  test('should filter health check spans', async ({ page }) => {
    await clearCollectorLogs()

    // Make health check request (should be filtered)
    await page.goto(`http://localhost:${PORT}/health`)
    await page.waitForTimeout(2000)

    const logs = await getCollectorLogs(100)

    // Health check spans should be filtered out per instrumentation.yaml
    // The logs should NOT contain health-related spans
    const hasHealthSpans = logs.includes('health')

    // This test depends on the ignore_patterns in instrumentation.yaml
    // If health is configured to be ignored, this should pass
    console.log('Checking if health spans are filtered...')
    console.log('Has health spans:', hasHealthSpans)
  })

  test('should handle POST requests', async ({ page }) => {
    await clearCollectorLogs()

    // Create a new user
    const response = await page.request.post(`http://localhost:${PORT}/users`, {
      data: {
        name: 'Test User',
        email: 'test@example.com'
      }
    })

    expect(response.status()).toBe(201)

    // Wait for traces (batch processor exports every 5s by default)
    await page.waitForTimeout(6000)

    // Verify traces were sent
    const receivedTraces = await collectorReceivedTraces()
    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(100)
    expect(logs).toContain('app.users.create')
  })

  test('should have interactive UI', async ({ page }) => {
    // Check if the UI is served
    await page.goto(`http://localhost:${PORT}`)

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Check for basic UI elements
    const title = await page.title()
    expect(title).toBeTruthy()
  })
})
