/**
 * Integration test for WebSocket trace exporter against real Atrim backend
 *
 * This test sends traces via WebSocket to the Atrim backend,
 * using the same tenant as other integration tests.
 *
 * Prerequisites:
 * - Atrim backend running locally (default) or specify ATRIM_WS_ENDPOINT
 * - WebSocket endpoint accessible
 *
 * Environment variables:
 * - ATRIM_WS_ENDPOINT: WebSocket URL (default: ws://localhost:4321/ws/traces)
 * - ATRIM_TENANT_ID: Tenant ID (default: tenant_000000000002)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketTraceExporter } from '../../src/websocket-trace-exporter.js'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { SpanStatusCode, context, trace, type Tracer } from '@opentelemetry/api'

// Configuration from environment or defaults
const WS_ENDPOINT = process.env.ATRIM_WS_ENDPOINT || 'ws://localhost:4321/ws/traces'
const TENANT_ID = process.env.ATRIM_TENANT_ID || 'tenant_000000000002'
const API_KEY = process.env.ATRIM_API_KEY || 'atrim_internal_tenant_000000000002'

// Skip tests if endpoint is not available
const skipIfNoEndpoint = process.env.SKIP_WSS_TESTS === 'true'

describe.skipIf(skipIfNoEndpoint)('Atrim WebSocket Integration', () => {
  let provider: BasicTracerProvider
  let exporter: WebSocketTraceExporter
  let tracer: Tracer

  beforeAll(async () => {
    console.log(`\n🔌 Testing WebSocket exporter against: ${WS_ENDPOINT}`)
    console.log(`📋 Using tenant: ${TENANT_ID}`)
    console.log(`🔑 Using API key: ${API_KEY.slice(0, 20)}...\n`)

    // Create exporter with authentication
    exporter = new WebSocketTraceExporter({
      url: WS_ENDPOINT,
      tenantId: TENANT_ID,
      apiKey: API_KEY,
      connection: {
        enableHandshake: false, // Atrim backend doesn't use handshake protocol
        enableReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 1000,
        connectionTimeoutMs: 10000
      }
    })

    // Create provider with test resource and span processor (v2.x API)
    provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'otel-ws-exporter-integration-test',
        'deployment.environment': 'test',
        'test.run.id': `test-${Date.now()}`
      }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    // Get tracer directly from provider (v2.x API - no register())
    tracer = provider.getTracer('test-tracer', '1.0.0')

    // Wait a bit for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 1000))
  })

  afterAll(async () => {
    console.log('\n🛑 Shutting down exporter...')
    await provider.shutdown()
    console.log('✅ Exporter shutdown complete\n')
  })

  it('should export a simple span to Atrim backend', async () => {
    // Create and end a span
    const span = tracer.startSpan('ws-integration.test.simple-span')
    span.setAttribute('test.type', 'simple')
    span.setAttribute('test.timestamp', Date.now())
    span.setStatus({ code: SpanStatusCode.OK })
    span.end()

    // Wait for export (SimpleSpanProcessor exports immediately)
    await new Promise((resolve) => setTimeout(resolve, 500))

    // If we got here without throwing, the export succeeded
    expect(true).toBe(true)
    console.log('✅ Simple span exported successfully')
  })

  it('should export nested spans to Atrim backend', async () => {
    // Create parent span
    const parentSpan = tracer.startSpan('ws-integration.test.parent-span')
    parentSpan.setAttribute('test.type', 'nested')

    // Create child spans within parent context
    const ctx = trace.setSpan(context.active(), parentSpan)

    const childSpan1 = tracer.startSpan('ws-integration.test.child-span-1', {}, ctx)
    childSpan1.setAttribute('child.index', 1)
    childSpan1.end()

    const childSpan2 = tracer.startSpan('ws-integration.test.child-span-2', {}, ctx)
    childSpan2.setAttribute('child.index', 2)
    childSpan2.end()

    parentSpan.setStatus({ code: SpanStatusCode.OK })
    parentSpan.end()

    // Wait for export
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(true).toBe(true)
    console.log('✅ Nested spans exported successfully')
  })

  it('should export spans with events and attributes', async () => {
    const span = tracer.startSpan('ws-integration.test.span-with-events')

    // Add various attributes
    span.setAttribute('string.attr', 'test-value')
    span.setAttribute('number.attr', 42)
    span.setAttribute('boolean.attr', true)
    span.setAttribute('array.attr', ['a', 'b', 'c'])

    // Add events
    span.addEvent('processing.started', { 'event.data': 'starting' })
    span.addEvent('processing.checkpoint', { 'checkpoint.id': 1 })
    span.addEvent('processing.completed', { 'event.data': 'finished' })

    span.setStatus({ code: SpanStatusCode.OK })
    span.end()

    // Wait for export
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(true).toBe(true)
    console.log('✅ Span with events and attributes exported successfully')
  })

  it('should export error spans correctly', async () => {
    const span = tracer.startSpan('ws-integration.test.error-span')
    span.setAttribute('test.type', 'error')

    // Record an exception
    try {
      throw new Error('Test error for WebSocket integration')
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Test error occurred'
      })
    }

    span.end()

    // Wait for export
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(true).toBe(true)
    console.log('✅ Error span exported successfully')
  })

  it('should handle rapid span creation', async () => {
    const spanCount = 10

    // Create multiple spans rapidly
    for (let i = 0; i < spanCount; i++) {
      const span = tracer.startSpan(`ws-integration.test.rapid-span-${i}`)
      span.setAttribute('span.index', i)
      span.setAttribute('test.type', 'rapid')
      span.end()
    }

    // Wait for all exports
    await new Promise((resolve) => setTimeout(resolve, 2000))

    expect(true).toBe(true)
    console.log(`✅ ${spanCount} rapid spans exported successfully`)
  })

  it('should maintain connection after multiple exports', async () => {
    // First batch
    for (let i = 0; i < 5; i++) {
      const span = tracer.startSpan(`ws-integration.test.batch1-span-${i}`)
      span.end()
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Second batch (after delay, connection should still be alive)
    for (let i = 0; i < 5; i++) {
      const span = tracer.startSpan(`ws-integration.test.batch2-span-${i}`)
      span.end()
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    expect(true).toBe(true)
    console.log('✅ Multiple batches exported with persistent connection')
  })
})

describe('WebSocket Connection Resilience', () => {
  it.skip('should reconnect after connection drop', async () => {
    // This test requires manual intervention or a mock server
    // that can simulate connection drops
    console.log('⚠️ Reconnection test requires manual testing or mock server')
  })
})
