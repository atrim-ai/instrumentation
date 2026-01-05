import type { WebSocketConnectionConfig, WebSocketConnectionState } from './types.js'
import { ExponentialBackoffStrategy } from './utils/reconnection-strategy.js'

/**
 * WebSocket connection manager with handshake and reconnection support
 */
export class WebSocketConnection {
  private ws: WebSocket | null = null
  private state: WebSocketConnectionState
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectionPromise: Promise<void> | null = null
  private reconnectionStrategy: ExponentialBackoffStrategy

  constructor(private config: WebSocketConnectionConfig) {
    this.state = { status: 'disconnected', reconnectAttempts: 0 }
    this.reconnectionStrategy = new ExponentialBackoffStrategy(
      config.reconnectDelayMs ?? 1000,
      config.maxReconnectDelayMs ?? 30000,
      config.maxReconnectAttempts ?? 5
    )
  }

  /**
   * Connect to WebSocket server with optional handshake
   */
  connect(): Promise<void> {
    // If already connected or connecting, return existing promise
    if (this.state.status === 'connected') {
      return Promise.resolve()
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this._doConnect()
    return this.connectionPromise
  }

  private async _doConnect(): Promise<void> {
    this.state = { ...this.state, status: 'connecting' }

    return new Promise((resolve, reject) => {
      const timeout = this.config.connectionTimeoutMs ?? 5000
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      try {
        this.ws = new WebSocket(this.config.url)

        // Connection timeout
        timeoutId = setTimeout(() => {
          this.handleConnectionError(new Error(`Connection timeout after ${timeout}ms`))
          reject(new Error(`Connection timeout after ${timeout}ms`))
        }, timeout)

        // WebSocket opened
        this.ws.addEventListener('open', async () => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }

          try {
            // Perform handshake if enabled
            if (this.config.enableHandshake ?? true) {
              await this.performHandshake()
            }

            // Connection successful
            this.state = { status: 'connected', reconnectAttempts: 0 }
            this.connectionPromise = null
            resolve()
          } catch (error) {
            this.handleConnectionError(error instanceof Error ? error : new Error(String(error)))
            reject(error)
          }
        })

        // WebSocket error
        this.ws.addEventListener('error', (_event) => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          const error = new Error('WebSocket connection error')
          this.handleConnectionError(error)
          reject(error)
        })

        // WebSocket closed
        this.ws.addEventListener('close', () => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }

          // Only trigger reconnection if we were connected
          if (this.state.status === 'connected') {
            this.handleDisconnect()
          }
        })
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        this.handleConnectionError(error instanceof Error ? error : new Error(String(error)))
        reject(error)
      }
    })
  }

  /**
   * Perform handshake protocol (init-request/init-response)
   */
  private performHandshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'))
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Handshake timeout'))
      }, 5000)

      const messageHandler = (event: MessageEvent) => {
        const message = event.data
        if (message === 'init-response') {
          clearTimeout(timeout)
          this.ws?.removeEventListener('message', messageHandler)
          resolve()
        } else {
          clearTimeout(timeout)
          this.ws?.removeEventListener('message', messageHandler)
          reject(new Error(`Unexpected handshake response: ${message}`))
        }
      }

      this.ws.addEventListener('message', messageHandler)
      this.ws.send('init-request')
    })
  }

  /**
   * Send data through WebSocket
   */
  async send(data: string): Promise<void> {
    if (this.state.status !== 'connected' || !this.ws) {
      throw new Error(`Cannot send data: WebSocket is ${this.state.status}`)
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Cannot send data: WebSocket readyState is ${this.ws.readyState}`)
    }

    this.ws.send(data)
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.state = { status: 'disconnected', reconnectAttempts: 0 }
    this.connectionPromise = null
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketConnectionState {
    return { ...this.state }
  }

  /**
   * Handle disconnection and trigger reconnection if enabled
   */
  private handleDisconnect(): void {
    if (!(this.config.enableReconnect ?? true)) {
      this.state = { status: 'disconnected', reconnectAttempts: 0 }
      return
    }

    this.attemptReconnect()
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private attemptReconnect(): void {
    const attempt = this.state.reconnectAttempts

    if (!this.reconnectionStrategy.shouldRetry(attempt)) {
      this.state = {
        status: 'failed',
        reconnectAttempts: attempt,
        lastError: new Error(`Max reconnection attempts (${attempt}) exceeded`)
      }
      return
    }

    this.state = { status: 'reconnecting', reconnectAttempts: attempt }

    const delay = this.reconnectionStrategy.getDelay(attempt)

    this.reconnectTimer = setTimeout(async () => {
      try {
        this.state = {
          ...this.state,
          reconnectAttempts: attempt + 1
        }
        await this._doConnect()
      } catch (error) {
        // Reconnection failed, will try again
        this.attemptReconnect()
      }
    }, delay)
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Error): void {
    this.state = {
      ...this.state,
      status: 'disconnected',
      lastError: error
    }
    this.connectionPromise = null

    if (this.config.enableReconnect ?? true) {
      this.attemptReconnect()
    }
  }
}
