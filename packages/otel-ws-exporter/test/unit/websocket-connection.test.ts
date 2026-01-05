import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { WebSocketConnection } from '../../src/websocket-connection.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.trigger('open', {})
    }, 10)
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  removeEventListener(event: string, handler: Function) {
    this.listeners.get(event)?.delete(handler)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.trigger('close', {})
  }

  trigger(event: string, data: any) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler(data))
    }
  }
}

describe('WebSocketConnection', () => {
  beforeEach(() => {
    // @ts-ignore - Mock WebSocket globally
    global.WebSocket = MockWebSocket as any
    vi.clearAllTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('connect', () => {
    it('should establish connection successfully', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await connection.connect()

      const state = connection.getState()
      expect(state.status).toBe('connected')
      expect(state.reconnectAttempts).toBe(0)
    })

    it('should perform handshake when enabled', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: true
      })

      const connectPromise = connection.connect()

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Simulate init-response from server
      const ws = (connection as any).ws as MockWebSocket
      ws.trigger('message', { data: 'init-response' })

      await connectPromise

      expect(connection.getState().status).toBe('connected')
    })

    it('should return existing promise if already connecting', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      const promise1 = connection.connect()
      const promise2 = connection.connect()

      expect(promise1).toBe(promise2)

      // Wait for promises to complete
      await promise1
    })

    it('should resolve immediately if already connected', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await connection.connect()
      const startTime = Date.now()
      await connection.connect()
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(5) // Should be immediate
    })

    it('should reject on handshake timeout', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: true,
        enableReconnect: false // Disable reconnect to avoid unhandled promise rejections
      })

      const connectPromise = connection.connect()

      // Set up rejection handler BEFORE advancing timers to avoid unhandled rejection
      const rejectionPromise = expect(connectPromise).rejects.toThrow('Handshake timeout')

      // Fast-forward past connection opening
      await vi.advanceTimersByTimeAsync(10)

      // Fast-forward past handshake timeout (5000ms)
      await vi.advanceTimersByTimeAsync(5100)

      // Now await the rejection
      await rejectionPromise

      // Clean up and flush any remaining async operations
      await connection.close()
      await vi.runAllTimersAsync()

      vi.useRealTimers()
    })

    it('should reject on unexpected handshake response', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: true
      })

      const connectPromise = connection.connect()

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Simulate unexpected response
      const ws = (connection as any).ws as MockWebSocket
      ws.trigger('message', { data: 'unexpected-response' })

      await expect(connectPromise).rejects.toThrow('Unexpected handshake response')
    })
  })

  describe('send', () => {
    it('should send data when connected', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await connection.connect()

      const ws = (connection as any).ws as MockWebSocket
      const sendSpy = vi.spyOn(ws, 'send')

      await connection.send('test data')

      expect(sendSpy).toHaveBeenCalledWith('test data')
    })

    it('should throw when not connected', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await expect(connection.send('test')).rejects.toThrow('WebSocket is disconnected')
    })

    it('should throw when WebSocket is not open', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await connection.connect()

      // Mock readyState as CLOSING
      const ws = (connection as any).ws as MockWebSocket
      ws.readyState = MockWebSocket.CLOSING

      await expect(connection.send('test')).rejects.toThrow('WebSocket readyState is')
    })
  })

  describe('close', () => {
    it('should close connection gracefully', async () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false
      })

      await connection.connect()
      await connection.close()

      const state = connection.getState()
      expect(state.status).toBe('disconnected')
      expect(state.reconnectAttempts).toBe(0)
    })

    it('should clear reconnect timer on close', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false,
        enableReconnect: true
      })

      const connectPromise = connection.connect()
      await vi.advanceTimersByTimeAsync(20)
      await connectPromise

      // Trigger disconnect
      const ws = (connection as any).ws as MockWebSocket
      ws.trigger('close', {})

      // Close before reconnect happens
      await connection.close()

      // Advance timers past reconnect delay
      await vi.advanceTimersByTimeAsync(5000)

      // Should not have reconnected
      expect(connection.getState().status).toBe('disconnected')

      vi.useRealTimers()
    })

    it('should be safe to call multiple times', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false,
        enableReconnect: false // Disable reconnect to avoid timer issues
      })

      const connectPromise = connection.connect()
      await vi.advanceTimersByTimeAsync(20)
      await connectPromise

      await connection.close()
      await connection.close()
      await connection.close()

      expect(connection.getState().status).toBe('disconnected')

      vi.useRealTimers()
    })
  })

  describe('getState', () => {
    it('should return initial state', () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080'
      })

      const state = connection.getState()
      expect(state.status).toBe('disconnected')
      expect(state.reconnectAttempts).toBe(0)
      expect(state.lastError).toBeUndefined()
    })

    it('should return copy of state (not reference)', () => {
      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080'
      })

      const state1 = connection.getState()
      const state2 = connection.getState()

      expect(state1).toEqual(state2)
      expect(state1).not.toBe(state2) // Different objects
    })
  })

  describe('reconnection', () => {
    it('should not reconnect when disabled', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false,
        enableReconnect: false
      })

      const connectPromise = connection.connect()
      await vi.advanceTimersByTimeAsync(20)
      await connectPromise

      // Trigger disconnect
      const ws = (connection as any).ws as MockWebSocket
      ws.trigger('close', {})

      // Advance timers
      await vi.advanceTimersByTimeAsync(10000)

      expect(connection.getState().status).toBe('disconnected')
      expect(connection.getState().reconnectAttempts).toBe(0)

      vi.useRealTimers()
    })

    it('should attempt reconnection on disconnect', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false,
        enableReconnect: true,
        reconnectDelayMs: 1000
      })

      const connectPromise = connection.connect()
      await vi.advanceTimersByTimeAsync(20)
      await connectPromise

      expect(connection.getState().status).toBe('connected')

      // Trigger disconnect
      const ws = (connection as any).ws as MockWebSocket
      ws.trigger('close', {})

      expect(connection.getState().status).toBe('reconnecting')

      vi.useRealTimers()
    })

    it('should stop after max reconnect attempts', async () => {
      vi.useFakeTimers()

      const connection = new WebSocketConnection({
        url: 'ws://localhost:8080',
        enableHandshake: false,
        enableReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 100
      })

      // Mock WebSocket to always fail (don't call super to avoid parent's 'open' event)
      const originalWebSocket = global.WebSocket
      global.WebSocket = class FailingWebSocket {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        readyState = FailingWebSocket.CONNECTING
        url: string
        private listeners: Map<string, Set<Function>> = new Map()

        constructor(url: string) {
          this.url = url
          // Only trigger error, never open
          setTimeout(() => {
            this.trigger('error', {})
          }, 5)
        }

        addEventListener(event: string, handler: Function) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set())
          }
          this.listeners.get(event)!.add(handler)
        }

        removeEventListener(event: string, handler: Function) {
          this.listeners.get(event)?.delete(handler)
        }

        send(_data: string) {}
        close() {}

        trigger(event: string, data: any) {
          const handlers = this.listeners.get(event)
          if (handlers) {
            handlers.forEach((handler) => handler(data))
          }
        }
      } as any

      connection.connect().catch(() => {
        // Ignore the initial connection error
      })

      // Wait for initial connection attempt to fail
      await vi.advanceTimersByTimeAsync(10)

      // Wait for all retry attempts (3 retries with exponential backoff)
      // Initial delay: 100ms, then 200ms, then 400ms
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const state = connection.getState()
      expect(state.status).toBe('failed')
      expect(state.lastError?.message).toContain('Max reconnection attempts')

      global.WebSocket = originalWebSocket

      vi.useRealTimers()
    })
  })
})
