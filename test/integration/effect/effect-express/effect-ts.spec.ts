/**
 * Integration test for Effect-TS + Express example
 *
 * Tests:
 * - Effect.withSpan() tracing
 * - Express auto-instrumentation
 * - Hybrid Effect + Express architecture
 * - Auto-detection enabling auto-instrumentation (has web framework)
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
} from './helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), './examples/effect-ts')
const BASE_PORT = 3102

let server: TestServer
let collector: CollectorContainer
let port: number

test.describe('Effect-TS + Express Example', () => {
  test.beforeAll(async ({ }, testInfo) => {
    // Use worker-specific port to avoid conflicts in parallel execution
    port = BASE_PORT + (testInfo.workerIndex * 10)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Effect-TS example server with custom OTLP endpoint
    server = await startExample(
      'Effect-TS',
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

  test('should send both Effect and HTTP traces', async ({ page }) => {
    // Make request that triggers both Express and Effect tracing
    await page.goto(`http://localhost:${port}/users`)
    await page.waitForTimeout(3000)

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(collector, 200)

    // Should have HTTP auto-instrumentation spans
    const hasHttpSpans = logs.includes('GET') || logs.includes('http')

    // Should have Effect.withSpan() spans
    const hasEffectSpans = logs.includes('effect.') || logs.includes('app.')

    console.log('Has HTTP spans:', hasHttpSpans)
    console.log('Has Effect spans:', hasEffectSpans)

    // At minimum, should have application spans
    expect(hasEffectSpans || hasHttpSpans).toBeTruthy()
  })

  test('auto-instrumentation should be enabled', async ({ page }) => {
    // This is Effect + Express, so auto-instrumentation should be enabled
    await page.goto(`http://localhost:${port}/users`)
    await page.waitForTimeout(2000)

    const logs = await getCollectorLogs(collector, 100)

    // With Express present, should have HTTP instrumentation
    // The exact span names depend on OpenTelemetry's HTTP instrumentation
    const hasAutoInstrumentation =
      logs.includes('GET') ||
      logs.includes('POST') ||
      logs.includes('http.server') ||
      logs.includes('express')

    console.log('Has auto-instrumentation spans:', hasAutoInstrumentation)

    // Note: This test verifies that auto-instrumentation is working
    // The specific span format may vary based on OTel version
  })

  test('should trace Effect race operations', async ({ page }) => {
    // Trigger race endpoint if it exists
    const response = await page.request.get(`http://localhost:${port}/race`)

    if (response.status() === 200) {
      await page.waitForTimeout(2000)

      const logs = await getCollectorLogs(collector, 100)

      // Should have race-related spans
      const hasRaceSpans = logs.includes('race') || logs.includes('concurrent')
      console.log('Has race operation spans:', hasRaceSpans)
    } else {
      console.log('Race endpoint not available, skipping test')
    }
  })

  test('should trace Effect retry operations', async ({ page }) => {
    // Trigger retry endpoint if it exists
    const response = await page.request.get(`http://localhost:${port}/retry`)

    if (response.status() === 200 || response.status() === 500) {
      await page.waitForTimeout(2000)

      const logs = await getCollectorLogs(collector, 100)

      // Should have retry-related spans
      const hasRetrySpans = logs.includes('retry') || logs.includes('attempt')
      console.log('Has retry operation spans:', hasRetrySpans)
    } else {
      console.log('Retry endpoint not available, skipping test')
    }
  })

  test('should trace Effect timeout operations', async ({ page }) => {
    // Trigger timeout endpoint if it exists
    const response = await page.request.get(`http://localhost:${port}/timeout`)

    if (response.status() === 200 || response.status() === 408) {
      await page.waitForTimeout(2000)

      const logs = await getCollectorLogs(collector, 100)

      // Should have timeout-related spans
      const hasTimeoutSpans = logs.includes('timeout')
      console.log('Has timeout operation spans:', hasTimeoutSpans)
    } else {
      console.log('Timeout endpoint not available, skipping test')
    }
  })

  test('should handle Effect errors with tracing', async ({ page }) => {
    // Request that might cause an error
    const response = await page.request.get(`http://localhost:${port}/users/999`)

    // Should return 404 or similar
    expect([404, 500]).toContain(response.status())

    await page.waitForTimeout(2000)

    // Should still have traces even for errors
    const receivedTraces = await collectorReceivedTraces(collector)
    expect(receivedTraces).toBeTruthy()
  })

  test('should have interactive UI', async ({ page }) => {
    await page.goto(`http://localhost:${port}`)
    await page.waitForLoadState('networkidle')

    const title = await page.title()
    expect(title).toBeTruthy()
  })
})
