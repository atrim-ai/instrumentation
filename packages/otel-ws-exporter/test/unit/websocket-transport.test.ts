import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebSocketTransport } from '../../src/websocket-transport.js'
import { WebSocketConnection } from '../../src/websocket-connection.js'

// Create a spied constructor
const mockConnectionInstances: any[] = []

// Mock WebSocketConnection
vi.mock('../../src/websocket-connection.js', () => {
  const MockWebSocketConnection = vi.fn(function (this: any, ...args: any[]) {
    mockConnectionInstances.push({ args, instance: this })
    this.connect = vi.fn().mockResolvedValue(undefined)
    this.send = vi.fn().mockResolvedValue(undefined)
    this.close = vi.fn().mockResolvedValue(undefined)
    this.getState = vi.fn().mockReturnValue({
      status: 'connected',
      reconnectAttempts: 0
    })
  })

  return {
    WebSocketConnection: MockWebSocketConnection
  }
})

describe('WebSocketTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create transport with valid tenant ID', () => {
      expect(
        () =>
          new WebSocketTransport({
            tenantId: 'valid-tenant-123'
          })
      ).not.toThrow()
    })

    it('should throw error for invalid tenant ID', () => {
      expect(
        () =>
          new WebSocketTransport({
            tenantId: 'invalid tenant!'
          })
      ).toThrow('Invalid tenant ID')
    })

    it('should throw error for empty tenant ID', () => {
      expect(
        () =>
          new WebSocketTransport({
            tenantId: ''
          })
      ).toThrow('Invalid tenant ID')
    })

    it('should use provided URL', () => {
      const transport = new WebSocketTransport({
        url: 'wss://custom.example.com/traces',
        tenantId: 'tenant-123'
      })

      expect(WebSocketConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'wss://custom.example.com/traces'
        })
      )
    })

    it('should use default URL when not provided', () => {
      const transport = new WebSocketTransport({
        tenantId: 'tenant-123'
      })

      expect(WebSocketConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://localhost:4321/ws/traces'
        })
      )
    })

    it('should pass connection config to WebSocketConnection', () => {
      const transport = new WebSocketTransport({
        tenantId: 'tenant-123',
        connection: {
          enableReconnect: false,
          maxReconnectAttempts: 10
        }
      })

      expect(WebSocketConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          enableReconnect: false,
          maxReconnectAttempts: 10
        })
      )
    })
  })

  describe('send', () => {
    it('should send OTLP data wrapped with tenant ID', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >

      const otlpData = { resourceSpans: [{ resource: {} }] }
      const jsonString = JSON.stringify(otlpData)
      const encoder = new TextEncoder()
      const data = encoder.encode(jsonString)

      const result = await transport.send(data, 10000)

      expect(result.status).toBe('success')
      expect(mockConnection.connect).toHaveBeenCalled()
      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.stringContaining('"tenantId":"test-tenant"')
      )
      expect(mockConnection.send).toHaveBeenCalledWith(expect.stringContaining('"resourceSpans"'))
    })

    it('should handle connection errors', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >
      mockConnection.connect = vi.fn().mockRejectedValue(new Error('Connection failed'))

      const data = new TextEncoder().encode(JSON.stringify({}))
      const result = await transport.send(data, 10000)

      expect(result.status).toBe('failure')
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Connection failed')
    })

    it('should handle send errors', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >
      mockConnection.send = vi.fn().mockRejectedValue(new Error('Send failed'))

      const data = new TextEncoder().encode(JSON.stringify({}))
      const result = await transport.send(data, 10000)

      expect(result.status).toBe('failure')
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Send failed')
    })

    it('should handle invalid JSON data', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const invalidData = new TextEncoder().encode('not valid json{')
      const result = await transport.send(invalidData, 10000)

      expect(result.status).toBe('failure')
      expect(result.error).toBeDefined()
    })

    it('should format Atrim message correctly', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'my-tenant-123'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >

      const otlpData = {
        resourceSpans: [
          {
            resource: { attributes: [{ key: 'service.name', value: 'test' }] }
          }
        ]
      }
      const data = new TextEncoder().encode(JSON.stringify(otlpData))

      await transport.send(data, 10000)

      const sentMessage = (mockConnection.send as any).mock.calls[0][0]
      const parsed = JSON.parse(sentMessage)

      expect(parsed).toEqual({
        tenantId: 'my-tenant-123',
        traces: otlpData
      })
    })
  })

  describe('shutdown', () => {
    it('should close WebSocket connection', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >

      await transport.shutdown()

      expect(mockConnection.close).toHaveBeenCalled()
    })

    it('should handle shutdown errors gracefully', async () => {
      const transport = new WebSocketTransport({
        tenantId: 'test-tenant'
      })

      const mockConnection = (transport as any).connection as unknown as ReturnType<
        typeof vi.fn<[], WebSocketConnection>
      >
      mockConnection.close = vi.fn().mockRejectedValue(new Error('Close failed'))

      await expect(transport.shutdown()).rejects.toThrow('Close failed')
    })
  })

  describe('environment variable support', () => {
    it('should use ATRIM_WS_ENDPOINT from process.env', () => {
      const originalEnv = process.env.ATRIM_WS_ENDPOINT
      process.env.ATRIM_WS_ENDPOINT = 'ws://custom-env.com/traces'

      const transport = new WebSocketTransport({
        tenantId: 'tenant-123'
      })

      expect(WebSocketConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://custom-env.com/traces'
        })
      )

      // Restore
      if (originalEnv) {
        process.env.ATRIM_WS_ENDPOINT = originalEnv
      } else {
        delete process.env.ATRIM_WS_ENDPOINT
      }
    })

    it('should prioritize explicit URL over environment variable', () => {
      const originalEnv = process.env.ATRIM_WS_ENDPOINT
      process.env.ATRIM_WS_ENDPOINT = 'ws://env.com/traces'

      const transport = new WebSocketTransport({
        url: 'ws://explicit.com/traces',
        tenantId: 'tenant-123'
      })

      expect(WebSocketConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://explicit.com/traces'
        })
      )

      // Restore
      if (originalEnv) {
        process.env.ATRIM_WS_ENDPOINT = originalEnv
      } else {
        delete process.env.ATRIM_WS_ENDPOINT
      }
    })
  })

  describe('createWebSocketTransport factory', () => {
    it('should create transport instance', async () => {
      const { createWebSocketTransport } = await import('../../src/websocket-transport.js')

      const transport = createWebSocketTransport({
        tenantId: 'test-tenant'
      })

      expect(transport).toBeInstanceOf(WebSocketTransport)
    })
  })
})
