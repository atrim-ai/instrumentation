/**
 * Integration test for Pure Effect-TS (@effect/platform) example
 *
 * Tests:
 * - Pure Effect HTTP server
 * - Auto-detection disabling auto-instrumentation
 * - Effect.withSpan() tracing
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
} from '../../shared/helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/effect-platform')
const BASE_PORT = 3103

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Pure Effect-TS Example', () => {
  beforeAll(async () => {
    // Use random port to avoid conflicts in parallel execution
    port = BASE_PORT + Math.floor(Math.random() * 1000)

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

  afterAll(async () => {
    if (server) {
      await stopServer(server)
      // Allow SDK time to flush remaining spans before stopping collector
      await new Promise((resolve) => setTimeout(resolve, 1000))
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
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('should send Effect.withSpan() traces', async () => {
    // Make request to trigger Effect spans
    await fetch(`http://localhost:${port}/users`)
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait for simple processor export

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    // Verify spans are present in collector logs
    const logs = await getCollectorLogs(collector, 100)

    // Should have HTTP span from @effect/platform with route info
    // CombinedTracingLive automatically traces HTTP requests without manual Effect.withSpan()
    expect(logs).toContain('http.route')
    expect(logs).toContain('/users')
  })

  it('should handle Effect errors gracefully', async () => {
    // Request non-existent user
    const response = await fetch(`http://localhost:${port}/users/999`)
    expect(response.status).toBe(404)

    // Wait for simple processor to export
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Should still have traces even for errors
    const receivedTraces = await collectorReceivedTraces(collector)
    expect(receivedTraces).toBeTruthy()
  })

  it('auto-instrumentation should be disabled', async () => {
    // This is a pure Effect app with no Express/Fastify
    // Auto-instrumentation should be auto-detected as disabled

    await fetch(`http://localhost:${port}/users`)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const logs = await getCollectorLogs(collector, 100)

    // Should NOT have Express/HTTP auto-instrumentation spans
    // All spans should be from Effect.withSpan()
    const hasAutoInstrumentationSpans =
      logs.includes('express.middleware') || logs.includes('@opentelemetry/instrumentation-http')

    expect(hasAutoInstrumentationSpans).toBeFalsy()

    console.log('✅ Verified: Auto-instrumentation correctly disabled for pure Effect app')
  })
})
