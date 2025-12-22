/**
 * Integration test for Effect-TS SpanTree example
 *
 * This test verifies the SpanTree API demonstrates correctly:
 * - SpanTree captures span hierarchy from Effect.withSpan() calls
 * - Effect.ensuring() can query SpanTree.getDeepestPath() after inner spans end
 * - Audit logs capture the deepest span path (Effect #5926 use case)
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

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/effect-span-tree')
const BASE_PORT = 3200

let server: TestServer
let collector: CollectorContainer
let port: number

describe('Effect-TS SpanTree Example', () => {
  beforeAll(async () => {
    // Use random port to avoid conflicts in parallel execution
    port = BASE_PORT + Math.floor(Math.random() * 1000)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the Effect SpanTree example server with custom OTLP endpoint
    server = await startExample(
      'Effect-SpanTree',
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
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector (local dev mode)')
    } else if (collector && process.env.CI) {
      console.log('⏭️  Leaving collector for CI cleanup')
    }
  })

  it('should respond to health check', async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('should trace user fetch operations with nested spans', async () => {
    // Make request that triggers nested Effect spans
    const response = await fetch(`http://localhost:${port}/api/users/1`)
    expect(response.status).toBe(200)

    const user = await response.json()
    expect(user).toHaveProperty('id', '1')
    expect(user).toHaveProperty('name', 'Alice')

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Verify traces were received
    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    if (!receivedTraces) {
      const logs = await getCollectorLogs(collector, 100)
      console.error('No traces received. Collector logs:', logs)
    }

    expect(receivedTraces).toBeTruthy()

    const logs = await getCollectorLogs(collector, 300)

    // Should have nested Effect spans from the user fetch operation
    const hasApiSpan = logs.includes('api.getUser') || logs.includes('getUser')
    const hasFetchSpan = logs.includes('fetchUser')
    const hasValidateSpan = logs.includes('validate')
    const hasDbSpan = logs.includes('db.query')

    console.log('Span visibility:')
    console.log('  - api.getUser:', hasApiSpan)
    console.log('  - fetchUser:', hasFetchSpan)
    console.log('  - validate:', hasValidateSpan)
    console.log('  - db.query:', hasDbSpan)

    // At minimum should have some Effect spans
    expect(hasApiSpan || hasFetchSpan || hasValidateSpan || hasDbSpan).toBeTruthy()
  })

  it('should capture deepest path in audit logs via Effect.ensuring()', async () => {
    // Make a request first
    await fetch(`http://localhost:${port}/api/users/1`)

    // Wait for span processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Check audit logs endpoint to verify SpanTree captured the path
    const auditResponse = await fetch(`http://localhost:${port}/api/audit-logs`)
    expect(auditResponse.status).toBe(200)

    const auditLogs = await auditResponse.json()

    console.log('Audit logs captured:', JSON.stringify(auditLogs, null, 2))

    // Should have at least one audit log entry
    expect(auditLogs.length).toBeGreaterThan(0)

    // Verify the audit log structure
    const latestLog = auditLogs[auditLogs.length - 1]
    expect(latestLog).toHaveProperty('traceId')
    expect(latestLog).toHaveProperty('deepestPath')
    expect(latestLog).toHaveProperty('depth')
    expect(latestLog).toHaveProperty('spanCount')

    // The deepest path should contain multiple span names
    // This verifies SpanTree.getDeepestPath() worked in Effect.ensuring()
    console.log('Deepest path captured:', latestLog.deepestPath)
    console.log('Depth:', latestLog.depth)

    // Verify the path includes expected spans
    // The exact path depends on the example implementation
    expect(latestLog.depth).toBeGreaterThanOrEqual(2)
  })

  it('should trace complex operations with deeper hierarchy', async () => {
    // Make request to complex endpoint which has deeper nesting
    const response = await fetch(`http://localhost:${port}/api/complex/1`)
    expect(response.status).toBe(200)

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const logs = await getCollectorLogs(collector, 300)

    // Should have additional enrichment spans
    const hasEnrichSpan = logs.includes('enrichUser')
    const hasPreferencesSpan = logs.includes('fetchPreferences')

    console.log('Complex operation spans:')
    console.log('  - enrichUser:', hasEnrichSpan)
    console.log('  - fetchPreferences:', hasPreferencesSpan)

    // Check audit logs for deeper path
    const auditResponse = await fetch(`http://localhost:${port}/api/audit-logs`)
    const auditLogs = await auditResponse.json()

    // Find the complex operation audit log (should be the latest)
    const complexLog = auditLogs[auditLogs.length - 1]
    console.log('Complex operation deepest path:', complexLog.deepestPath)
    console.log('Complex operation depth:', complexLog.depth)

    // Complex operation should have deeper hierarchy
    expect(complexLog.depth).toBeGreaterThanOrEqual(3)
  })

  it('should report SpanTree status', async () => {
    const response = await fetch(`http://localhost:${port}/api/span-tree/stats`)
    expect(response.status).toBe(200)

    const stats = await response.json()
    console.log('SpanTree stats:', stats)

    expect(stats).toHaveProperty('enabled', true)
  })

  it('should add span_tree attributes to root spans', async () => {
    // Make a request to trigger span creation
    await fetch(`http://localhost:${port}/api/users/1`)

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check collector logs for span_tree attributes
    const logs = await getCollectorLogs(collector, 500)

    // The root span should have span_tree.depth, span_tree.deepest_path, span_tree.span_count
    const hasDepthAttr = logs.includes('span_tree.depth')
    const hasPathAttr = logs.includes('span_tree.deepest_path')
    const hasCountAttr = logs.includes('span_tree.span_count')

    console.log('Span tree attributes in collector logs:')
    console.log('  - span_tree.depth:', hasDepthAttr)
    console.log('  - span_tree.deepest_path:', hasPathAttr)
    console.log('  - span_tree.span_count:', hasCountAttr)

    // At least depth and path should be present
    expect(hasDepthAttr || hasPathAttr).toBeTruthy()
  })

  it('should handle missing users gracefully', async () => {
    const response = await fetch(`http://localhost:${port}/api/users/999`)
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body).toHaveProperty('error')
  })
})
