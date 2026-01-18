import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExportResultCode } from '@opentelemetry/core'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { WebSocketTraceExporter } from '../../src/websocket-trace-exporter.js'
import { WebSocketTransport } from '../../src/websocket-transport.js'

// Mock WebSocketTransport
vi.mock('../../src/websocket-transport.js', () => {
  const MockWebSocketTransport = vi.fn(function (this: any) {
    this.send = vi.fn().mockResolvedValue({ status: 'success' })
    this.shutdown = vi.fn().mockResolvedValue(undefined)
  })

  return {
    WebSocketTransport: MockWebSocketTransport
  }
})

// Mock JsonTraceSerializer
vi.mock('@opentelemetry/otlp-transformer', () => {
  return {
    JsonTraceSerializer: {
      serializeRequest: vi.fn().mockReturnValue(
        new TextEncoder().encode(
          JSON.stringify({
            resourceSpans: []
          })
        )
      )
    }
  }
})

describe('WebSocketTraceExporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create exporter with config', () => {
      const exporter = new WebSocketTraceExporter({
        url: 'wss://test.example.com/traces',
        tenantId: 'test-tenant'
      })

      expect(exporter).toBeDefined()
      expect(WebSocketTransport).toHaveBeenCalledWith({
        url: 'wss://test.example.com/traces',
        tenantId: 'test-tenant'
      })
    })

    it('should pass connection config to transport', () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant',
        connection: {
          enableReconnect: false,
          maxReconnectAttempts: 3
        }
      })

      expect(WebSocketTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: {
            enableReconnect: false,
            maxReconnectAttempts: 3
          }
        })
      )
    })
  })

  describe('export', () => {
    it('should export spans successfully', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      const mockSpans: ReadableSpan[] = [
        {
          name: 'test-span',
          spanContext: () => ({
            traceId: '123',
            spanId: '456',
            traceFlags: 1
          })
        } as ReadableSpan
      ]

      const resultCallback = vi.fn()

      await exporter.export(mockSpans, resultCallback)

      expect(mockTransport.send).toHaveBeenCalled()
      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.SUCCESS
      })
    })

    it('should handle empty span array', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      const resultCallback = vi.fn()

      await exporter.export([], resultCallback)

      expect(mockTransport.send).not.toHaveBeenCalled()
      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.SUCCESS
      })
    })

    it('should handle send failures', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >
      mockTransport.send = vi.fn().mockResolvedValue({
        status: 'failure',
        error: new Error('Send failed')
      })

      const mockSpans: ReadableSpan[] = [{ name: 'test-span' } as ReadableSpan]

      const resultCallback = vi.fn()

      await exporter.export(mockSpans, resultCallback)

      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.FAILED,
        error: expect.any(Error)
      })
    })

    it('should handle serialization failures', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      // Mock serializer to return null
      const { JsonTraceSerializer } = await import('@opentelemetry/otlp-transformer')
      ;(JsonTraceSerializer.serializeRequest as any).mockReturnValueOnce(null)

      const mockSpans: ReadableSpan[] = [{ name: 'test-span' } as ReadableSpan]

      const resultCallback = vi.fn()

      await exporter.export(mockSpans, resultCallback)

      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.FAILED,
        error: expect.any(Error)
      })
    })

    it('should not export when shutdown', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      await exporter.shutdown()

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      const mockSpans: ReadableSpan[] = [{ name: 'test-span' } as ReadableSpan]

      const resultCallback = vi.fn()

      await exporter.export(mockSpans, resultCallback)

      expect(mockTransport.send).not.toHaveBeenCalled()
      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.FAILED
      })
    })

    it('should handle exceptions during export', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >
      mockTransport.send = vi.fn().mockRejectedValue(new Error('Unexpected error'))

      const mockSpans: ReadableSpan[] = [{ name: 'test-span' } as ReadableSpan]

      const resultCallback = vi.fn()

      await exporter.export(mockSpans, resultCallback)

      expect(resultCallback).toHaveBeenCalledWith({
        code: ExportResultCode.FAILED,
        error: expect.any(Error)
      })
    })
  })

  describe('shutdown', () => {
    it('should shutdown transport', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      await exporter.shutdown()

      expect(mockTransport.shutdown).toHaveBeenCalled()
    })

    it('should be safe to call multiple times', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      await exporter.shutdown()
      await exporter.shutdown()
      await exporter.shutdown()

      expect(mockTransport.shutdown).toHaveBeenCalledTimes(1)
    })

    it('should mark exporter as shutdown', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      await exporter.shutdown()

      expect((exporter as any).isShutdown).toBe(true)
    })
  })

  describe('forceFlush', () => {
    it('should resolve immediately', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const startTime = Date.now()
      await exporter.forceFlush()
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(50)
    })

    it('should not call transport methods', async () => {
      const exporter = new WebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      const mockTransport = (exporter as any).transport as unknown as ReturnType<
        typeof vi.fn<[], WebSocketTransport>
      >

      await exporter.forceFlush()

      expect(mockTransport.send).not.toHaveBeenCalled()
      expect(mockTransport.shutdown).not.toHaveBeenCalled()
    })
  })

  describe('createWebSocketTraceExporter factory', () => {
    it('should create exporter instance', async () => {
      const { createWebSocketTraceExporter } = await import('../../src/websocket-trace-exporter.js')

      const exporter = createWebSocketTraceExporter({
        tenantId: 'test-tenant'
      })

      expect(exporter).toBeInstanceOf(WebSocketTraceExporter)
    })
  })
})
