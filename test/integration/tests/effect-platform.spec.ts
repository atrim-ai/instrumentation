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
  clearCollectorLogs,
  collectorReceivedTraces,
  waitFor,
  getCollectorLogs,
  type TestServer
} from './helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/effect-platform')
const PORT = 3103

let server: TestServer

// Use serial mode for trace collection tests to avoid race conditions
test.describe.serial('Pure Effect-TS Example', () => {
  test.beforeAll(async () => {
    server = await startExample('Effect-Platform', EXAMPLE_DIR, PORT)
    await clearCollectorLogs()
  })

  test.afterAll(async () => {
    if (server) {
      await stopServer(server)
    }
  })

  test('should respond to requests', async ({ page }) => {
    const response = await page.goto(`http://localhost:${PORT}/health`)
    expect(response?.status()).toBe(200)

    const body = await response?.json()
    expect(body).toEqual({ status: 'ok' })
  })

  test('should send Effect.withSpan() traces', async ({ page }) => {
    await clearCollectorLogs()

    // Make request to trigger Effect spans
    await page.goto(`http://localhost:${PORT}/users`)
    await page.waitForTimeout(6000) // Wait for batch processor export (default 5s interval)

    // Verify traces were received
    const receivedTraces = await waitFor(collectorReceivedTraces, 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify Effect spans are present
    const logs = await getCollectorLogs(100)

    // Should have HTTP span from @effect/platform
    expect(logs).toContain('http.users.list')

    // Should have business logic span from Effect.withSpan()
    expect(logs).toContain('app.users.list')
  })

  test('should handle Effect errors gracefully', async ({ page }) => {
    await clearCollectorLogs()

    // Request non-existent user
    const response = await page.request.get(`http://localhost:${PORT}/users/999`)
    expect(response.status()).toBe(404)

    await page.waitForTimeout(2000)

    // Should still have traces even for errors
    const receivedTraces = await collectorReceivedTraces()
    expect(receivedTraces).toBeTruthy()
  })

  test('auto-instrumentation should be disabled', async ({ page }) => {
    // This is a pure Effect app with no Express/Fastify
    // Auto-instrumentation should be auto-detected as disabled

    await clearCollectorLogs()
    await page.goto(`http://localhost:${PORT}/users`)
    await page.waitForTimeout(2000)

    const logs = await getCollectorLogs(100)

    // Should NOT have Express/HTTP auto-instrumentation spans
    // All spans should be from Effect.withSpan()
    const hasAutoInstrumentationSpans =
      logs.includes('express.middleware') || logs.includes('@opentelemetry/instrumentation-http')

    expect(hasAutoInstrumentationSpans).toBeFalsy()

    console.log('✅ Verified: Auto-instrumentation correctly disabled for pure Effect app')
  })
})
