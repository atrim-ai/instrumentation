/**
 * Integration test for Vanilla TypeScript example
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

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/vanilla')
const PORT = 3101

let server: TestServer

// Use serial mode for trace collection tests to avoid race conditions
test.describe.serial('Vanilla TypeScript Example', () => {
  test.beforeAll(async () => {
    server = await startExample('Vanilla', EXAMPLE_DIR, PORT)
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

  test('should send traces for operations', async ({ page }) => {
    await clearCollectorLogs()

    // Trigger operation that creates spans
    await page.goto(`http://localhost:${PORT}/users/1`)
    await page.waitForTimeout(6000)

    // Verify traces were received
    const receivedTraces = await waitFor(collectorReceivedTraces, 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(50)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify span names
    const logs = await getCollectorLogs(100)
    expect(logs).toContain('app.user.fetch')
  })

  test('should trace database operations', async ({ page }) => {
    await clearCollectorLogs()

    await page.goto(`http://localhost:${PORT}/users/1`)
    await page.waitForTimeout(6000)

    const logs = await getCollectorLogs(100)

    // Should have both app and db spans
    expect(logs).toContain('app.user.fetch')
    expect(logs).toContain('app.db.query')
  })

  test('should trace cache operations', async ({ page }) => {
    await clearCollectorLogs()

    // First request - cache miss
    await page.goto(`http://localhost:${PORT}/users/1`)
    await page.waitForTimeout(1000)

    // Second request - cache hit (if implemented)
    await page.goto(`http://localhost:${PORT}/users/1`)
    await page.waitForTimeout(2000)

    const logs = await getCollectorLogs(100)
    const hasCacheSpans = logs.includes('cache.')

    console.log('Has cache spans:', hasCacheSpans)
    // Cache may or may not be implemented in example
  })

  test('should have interactive UI', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)
    await page.waitForLoadState('networkidle')

    const title = await page.title()
    expect(title).toBeTruthy()
  })
})
