/**
 * Integration test for Pure Effect-TS (@effect/platform) example
 *
 * Tests:
 * - Pure Effect HTTP server
 * - Auto-detection disabling auto-instrumentation
 * - Effect.withSpan() tracing
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
} from '../../shared/helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), './examples/effect-platform')
const BASE_PORT = 3103

let server: TestServer
let collector: CollectorContainer
let port: number

test.describe('Pure Effect-TS Example', () => {
  test.beforeAll(async ({}, testInfo) => {
    // Use worker-specific port to avoid conflicts in parallel execution
    port = BASE_PORT + testInfo.workerIndex * 10

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Effect-Platform example server with custom OTLP endpoint
    server = await startExample(
      'Effect-Platform',
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
    const response = await page.goto(`http://localhost:${port}/health`)
    expect(response?.status()).toBe(200)

    const body = await response?.json()
    expect(body).toEqual({ status: 'ok' })
  })

  test('should send Effect.withSpan() traces', async ({ page }) => {
    // Make request to trigger Effect spans
    await page.goto(`http://localhost:${port}/users`)
    await page.waitForTimeout(1000) // Wait for simple processor export

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify Effect spans are present
    const logs = await getCollectorLogs(collector, 100)

    // Should have HTTP span from @effect/platform
    expect(logs).toContain('http.users.list')

    // Should have business logic span from Effect.withSpan()
    expect(logs).toContain('app.users.list')
  })

  test('should handle Effect errors gracefully', async ({ page }) => {
    // Request non-existent user
    const response = await page.request.get(`http://localhost:${port}/users/999`)
    expect(response.status()).toBe(404)

    // Wait for simple processor to export
    await page.waitForTimeout(1000)

    // Should still have traces even for errors
    const receivedTraces = await collectorReceivedTraces(collector)
    expect(receivedTraces).toBeTruthy()
  })

  test('auto-instrumentation should be disabled', async ({ page }) => {
    // This is a pure Effect app with no Express/Fastify
    // Auto-instrumentation should be auto-detected as disabled

    await page.goto(`http://localhost:${port}/users`)
    await page.waitForTimeout(1000)

    const logs = await getCollectorLogs(collector, 100)

    // Should NOT have Express/HTTP auto-instrumentation spans
    // All spans should be from Effect.withSpan()
    const hasAutoInstrumentationSpans =
      logs.includes('express.middleware') || logs.includes('@opentelemetry/instrumentation-http')

    expect(hasAutoInstrumentationSpans).toBeFalsy()

    console.log('✅ Verified: Auto-instrumentation correctly disabled for pure Effect app')
  })
})
