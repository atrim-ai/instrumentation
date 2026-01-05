import type { IExporterTransport, ExportResponse } from '@opentelemetry/otlp-exporter-base'
import type { WebSocketTransportConfig } from './types.js'
import { WebSocketConnection } from './websocket-connection.js'
import { formatAtrimMessage, isValidTenantId } from './utils/message-formatter.js'

/**
 * WebSocket transport implementation for OTLP exporter
 */
export class WebSocketTransport implements IExporterTransport {
  private connection: WebSocketConnection

  constructor(private config: WebSocketTransportConfig) {
    // Validate tenant ID
    if (!isValidTenantId(config.tenantId)) {
      throw new Error(
        `Invalid tenant ID: "${config.tenantId}". Must be alphanumeric with hyphens or underscores.`
      )
    }

    // Create WebSocket connection
    this.connection = new WebSocketConnection({
      url: config.url || this.getDefaultUrl(),
      ...(config.connection || {})
    })
  }

  /**
   * Send OTLP trace data via WebSocket
   * Required by IExporterTransport
   */
  async send(data: Uint8Array, _timeoutMillis: number): Promise<ExportResponse> {
    try {
      // Ensure connection is ready
      await this.connection.connect()

      // Convert Uint8Array to JSON
      const decoder = new TextDecoder()
      const jsonString = decoder.decode(data)
      const otlpJson = JSON.parse(jsonString)

      // Wrap in Atrim message format (with apiKey for authentication)
      const atrimMessage = formatAtrimMessage(this.config.tenantId, otlpJson, this.config.apiKey)

      // Send through WebSocket
      await this.connection.send(atrimMessage)

      return { status: 'success' }
    } catch (error) {
      // Connection or send error
      return {
        status: 'failure',
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  /**
   * Shutdown transport
   * Required by IExporterTransport
   */
  async shutdown(): Promise<void> {
    await this.connection.close()
  }

  /**
   * Get default WebSocket URL from environment or use fallback
   */
  private getDefaultUrl(): string {
    // Node.js environment
    if (typeof process !== 'undefined' && process.env?.ATRIM_WS_ENDPOINT) {
      return process.env.ATRIM_WS_ENDPOINT
    }

    // Browser environment - check window object
    if (typeof window !== 'undefined') {
      const windowConfig = (window as unknown as { ATRIM_WS_ENDPOINT?: string }).ATRIM_WS_ENDPOINT
      if (windowConfig) {
        return String(windowConfig)
      }
    }

    // Browser environment - check Vite import.meta.env
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { VITE_ATRIM_WS_ENDPOINT?: string } }).env
        ?.VITE_ATRIM_WS_ENDPOINT
    ) {
      return (import.meta as unknown as { env: { VITE_ATRIM_WS_ENDPOINT: string } }).env
        .VITE_ATRIM_WS_ENDPOINT
    }

    // Default: development endpoint
    return 'ws://localhost:4321/ws/traces'
  }
}

/**
 * Factory function for WebSocket transport
 */
export function createWebSocketTransport(config: WebSocketTransportConfig): WebSocketTransport {
  return new WebSocketTransport(config)
}
