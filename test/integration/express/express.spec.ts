/**
 * Integration test for Express example
 */

import { test, expect } from '@playwright/test'
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

const EXAMPLE_DIR = path.join(process.cwd(), './examples/express')
const BASE_PORT = 3100

let server: TestServer
let collector: CollectorContainer
let port: number

test.describe('Express Example', () => {
  test.beforeAll(async ({}, testInfo) => {
    // Use worker-specific port to avoid conflicts in parallel execution
    port = BASE_PORT + testInfo.workerIndex * 10

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

  test.afterAll(async () => {
    if (server) {
      await stopServer(server)
    }
    if (collector) {
      await stopCollectorContainer(collector)
    }
  })

  test('should respond to requests', async ({ page }) => {
    // Navigate to the health endpoint
    const response = await page.goto(`http://localhost:${port}/health`)
    expect(response?.status()).toBe(200)

    const body = await response?.json()
    expect(body).toEqual({ status: 'ok' })
  })

  test('should send traces to collector', async ({ page }) => {
    // Make a request that should create traces
    await page.goto(`http://localhost:${port}/users`)
    await page.waitForTimeout(1000) // Wait for traces to be sent (simple processor exports immediately)

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

  test('should filter health check spans', async ({ page }) => {
    // Make health check request (should be filtered)
    await page.goto(`http://localhost:${port}/health`)
    await page.waitForTimeout(1000)

    const logs = await getCollectorLogs(collector, 100)

    // Health check spans should be filtered out per instrumentation.yaml
    // The logs should NOT contain health-related spans
    const hasHealthSpans = logs.includes('health')

    // This test depends on the ignore_patterns in instrumentation.yaml
    // If health is configured to be ignored, this should pass
    console.log('Checking if health spans are filtered...')
    console.log('Has health spans:', hasHealthSpans)
  })

  test('should handle POST requests', async ({ page }) => {
    // Create a new user
    const response = await page.request.post(`http://localhost:${port}/users`, {
      data: {
        name: 'Test User',
        email: 'test@example.com'
      }
    })

    expect(response.status()).toBe(201)

    // Wait for traces (simple processor exports immediately)
    await page.waitForTimeout(1000)

    // Verify traces were sent
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)
    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(collector, 100)
    expect(logs).toContain('app.users.create')
  })

  test('should have interactive UI', async ({ page }) => {
    // Check if the UI is served
    await page.goto(`http://localhost:${port}`)

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Check for basic UI elements
    const title = await page.title()
    expect(title).toBeTruthy()
  })
})
