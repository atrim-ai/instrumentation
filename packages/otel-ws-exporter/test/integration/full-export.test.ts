import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { WebSocketTraceExporter } from '../../src/websocket-trace-exporter.js'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ExportResultCode } from '@opentelemetry/core'
import type { Tracer } from '@opentelemetry/api'

// Skip these tests in CI - they use a local mock WebSocket server which is flaky in CI
// The atrim-wss.integration.test.ts tests against the real Atrim backend are more reliable
// Set SKIP_MOCK_WSS_TESTS=true to skip, or CI=true (automatically set in GitHub Actions)
const skipTests = process.env.SKIP_MOCK_WSS_TESTS === 'true' || process.env.CI === 'true'

describe.skipIf(skipTests)('WebSocket Trace Exporter Integration', () => {
  let server: WebSocketServer
  let port: number
  let receivedMessages: any[] = []

  beforeAll(async () => {
    // Use port 0 to let OS assign an available port
    await new Promise<void>((resolve, reject) => {
      server = new WebSocketServer({ port: 0 })

      server.on('listening', () => {
        // Get the actual port assigned by the OS
        const address = server.address()
        if (address && typeof address === 'object') {
          port = address.port
        }
        resolve()
      })

      server.on('error', (err) => {
        reject(err)
      })

      server.on('connection', (ws: WebSocket) => {
        // Handle handshake
        ws.on('message', (data) => {
          const message = data.toString()

          // Respond to handshake
          if (message === 'init-request') {
            ws.send('init-response')
            return
          }

          // Store received trace messages
          try {
            const parsed = JSON.parse(message)
            receivedMessages.push(parsed)
          } catch (error) {
            console.error('Failed to parse message:', error)
          }
        })
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  beforeEach(() => {
    receivedMessages = []
  })

  it('should export spans to WebSocket server', async () => {
    const exporter = new WebSocketTraceExporter({
      url: `ws://localhost:${port}`,
      tenantId: 'integration-test-tenant'
    })

    // Create a real tracer provider (v2.x API - no register())
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'test-service' }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    // Get tracer directly from provider
    const tracer: Tracer = provider.getTracer('test-tracer', '1.0.0')

    // Create and export a span
    const span = tracer.startSpan('test-span-1')
    span.setAttribute('test.type', 'export')
    span.end()

    // Wait for export
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify message was received
    expect(receivedMessages.length).toBeGreaterThan(0)

    const lastMessage = receivedMessages[receivedMessages.length - 1]
    expect(lastMessage).toHaveProperty('tenantId', 'integration-test-tenant')
    expect(lastMessage).toHaveProperty('traces')
    expect(lastMessage.traces).toHaveProperty('resourceSpans')

    // Cleanup
    await provider.shutdown()
  })

  it('should handle reconnection after disconnect', async () => {
    const exporter = new WebSocketTraceExporter({
      url: `ws://localhost:${port}`,
      tenantId: 'reconnect-test-tenant',
      connection: {
        enableReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectAttempts: 3
      }
    })

    // Create a real tracer provider (v2.x API)
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'reconnect-service' }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    const tracer: Tracer = provider.getTracer('test-tracer', '1.0.0')

    // First export should succeed
    const span1 = tracer.startSpan('test-span-reconnect-1')
    span1.end()

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(receivedMessages.length).toBeGreaterThan(0)

    const countAfterFirst = receivedMessages.length

    // Disconnect all clients (simulate server disconnect)
    server.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.close()
      }
    })

    // Wait for reconnection
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Second export should succeed after reconnection
    const span2 = tracer.startSpan('test-span-reconnect-2')
    span2.end()

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(receivedMessages.length).toBeGreaterThan(countAfterFirst)

    // Cleanup
    await provider.shutdown()
  })

  it('should handle handshake disabled', async () => {
    const exporter = new WebSocketTraceExporter({
      url: `ws://localhost:${port}`,
      tenantId: 'no-handshake-tenant',
      connection: {
        enableHandshake: false
      }
    })

    // Create a real tracer provider (v2.x API)
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'no-handshake-service' }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    const tracer: Tracer = provider.getTracer('test-tracer', '1.0.0')

    // Create and export a span
    const span = tracer.startSpan('test-span-no-handshake')
    span.end()

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(receivedMessages.length).toBeGreaterThan(0)

    // Cleanup
    await provider.shutdown()
  })

  it('should export multiple batches of spans', async () => {
    const exporter = new WebSocketTraceExporter({
      url: `ws://localhost:${port}`,
      tenantId: 'batch-test-tenant'
    })

    // Create a real tracer provider (v2.x API)
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'batch-service' }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    const tracer: Tracer = provider.getTracer('test-tracer', '1.0.0')
    const initialMessageCount = receivedMessages.length

    // Create multiple spans
    for (let i = 0; i < 5; i++) {
      const span = tracer.startSpan(`batch-span-${i}`)
      span.end()
    }

    // Wait for all exports
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Should have received multiple messages
    expect(receivedMessages.length - initialMessageCount).toBeGreaterThan(0)

    // All should have correct tenant ID
    const newMessages = receivedMessages.slice(initialMessageCount)
    newMessages.forEach((msg) => {
      expect(msg.tenantId).toBe('batch-test-tenant')
      expect(msg.traces).toBeDefined()
    })

    // Cleanup
    await provider.shutdown()
  })

  it('should shutdown gracefully', async () => {
    const exporter = new WebSocketTraceExporter({
      url: `ws://localhost:${port}`,
      tenantId: 'shutdown-test-tenant'
    })

    // Create a real tracer provider (v2.x API)
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'shutdown-service' }),
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })

    const tracer: Tracer = provider.getTracer('test-tracer', '1.0.0')

    // Connect by exporting a span
    const span = tracer.startSpan('test-before-shutdown')
    span.end()

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Shutdown
    await provider.shutdown()

    // After shutdown, exporter should fail
    // Direct export call to test shutdown behavior
    const result = await new Promise<{ code: number }>((resolve) => {
      exporter.export([], (result) => resolve(result))
    })

    expect(result.code).toBe(ExportResultCode.FAILED)
  })
})
