/**
 * Configuration for WebSocket connection management
 */
export interface WebSocketConnectionConfig {
  /**
   * WebSocket URL (ws:// or wss://)
   * @example 'wss://ui.atrim.ai/ws/traces'
   */
  url: string

  /**
   * Enable automatic reconnection on disconnect
   * @default true
   */
  enableReconnect?: boolean

  /**
   * Maximum reconnection attempts (0 = infinite)
   * @default 5
   */
  maxReconnectAttempts?: number

  /**
   * Initial reconnection delay in milliseconds
   * @default 1000
   */
  reconnectDelayMs?: number

  /**
   * Maximum reconnection delay (for exponential backoff)
   * @default 30000
   */
  maxReconnectDelayMs?: number

  /**
   * Connection timeout in milliseconds
   * @default 5000
   */
  connectionTimeoutMs?: number

  /**
   * Enable handshake protocol (init-request/init-response)
   * @default true
   */
  enableHandshake?: boolean
}

/**
 * WebSocket connection state
 */
export interface WebSocketConnectionState {
  /**
   * Current connection status
   */
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

  /**
   * Number of reconnection attempts made
   */
  readonly reconnectAttempts: number

  /**
   * Last error encountered (if any)
   */
  readonly lastError?: Error
}

/**
 * Configuration for WebSocket transport layer
 */
export interface WebSocketTransportConfig {
  /**
   * WebSocket URL
   * @default 'ws://localhost:4321/ws/traces' (development)
   */
  url?: string

  /**
   * Tenant ID for Atrim isolation (REQUIRED)
   */
  tenantId: string

  /**
   * API key for authentication (REQUIRED for Atrim backend)
   * Format: 'atrim_internal_<tenantId>' for internal tenants
   */
  apiKey?: string

  /**
   * Connection configuration (optional overrides)
   */
  connection?: Partial<WebSocketConnectionConfig>
}

/**
 * Configuration for WebSocket trace exporter
 */
export interface WebSocketExporterConfig extends WebSocketTransportConfig {
  // Inherits all properties from WebSocketTransportConfig
}

/**
 * Atrim message format for backend
 */
export interface AtrimMessage {
  /**
   * API key for authentication
   */
  apiKey?: string

  /**
   * Tenant identifier
   */
  tenantId: string

  /**
   * OTLP trace data in JSON format
   */
  traces: unknown
}

/**
 * Reconnection strategy interface
 */
export interface ReconnectionStrategy {
  /**
   * Calculate next reconnection delay
   * @param attempt - Current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  getDelay(attempt: number): number

  /**
   * Check if should continue reconnecting
   * @param attempt - Current attempt number (0-based)
   * @returns true if should continue
   */
  shouldRetry(attempt: number): boolean
}
