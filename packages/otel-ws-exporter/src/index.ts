/**
 * @atrim/otel-ws-exporter
 *
 * WebSocket-based OpenTelemetry trace exporter for browser and Node.js environments.
 *
 * This package provides a SpanExporter implementation that sends trace data
 * via WebSocket instead of HTTP. It's particularly useful for WebContainer
 * environments where traditional HTTP export may not work.
 *
 * @packageDocumentation
 */

// Main exporter
export { WebSocketTraceExporter, createWebSocketTraceExporter } from './websocket-trace-exporter.js'

// Transport and connection (for advanced usage)
export { WebSocketTransport, createWebSocketTransport } from './websocket-transport.js'
export { WebSocketConnection } from './websocket-connection.js'

// Utilities (for advanced usage)
export { ExponentialBackoffStrategy } from './utils/reconnection-strategy.js'
export { formatAtrimMessage, isValidTenantId } from './utils/message-formatter.js'

// Type exports
export type {
  WebSocketConnectionConfig,
  WebSocketConnectionState,
  WebSocketTransportConfig,
  WebSocketExporterConfig,
  AtrimMessage,
  ReconnectionStrategy
} from './types.js'
