import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
import type { ExportResult } from '@opentelemetry/core'
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer'
import type { WebSocketExporterConfig } from './types.js'
import { WebSocketTransport } from './websocket-transport.js'

/**
 * WebSocket-based OpenTelemetry trace exporter
 *
 * Implements the standard SpanExporter interface to send traces via WebSocket.
 *
 * @example
 * ```typescript
 * import { WebSocketTraceExporter } from '@atrim/otel-ws-exporter'
 * import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
 *
 * const exporter = new WebSocketTraceExporter({
 *   url: 'wss://ui.atrim.ai/ws/traces',
 *   tenantId: 'my-tenant-123'
 * })
 *
 * provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
 * ```
 */
export class WebSocketTraceExporter implements SpanExporter {
  private transport: WebSocketTransport
  private isShutdown = false

  constructor(config: WebSocketExporterConfig) {
    this.transport = new WebSocketTransport(config)
  }

  /**
   * Export spans via WebSocket
   */
  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): Promise<void> {
    if (this.isShutdown) {
      resultCallback({ code: ExportResultCode.FAILED })
      return
    }

    if (spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS })
      return
    }

    try {
      // Serialize spans to OTLP JSON format
      const data = JsonTraceSerializer.serializeRequest(spans)

      if (!data) {
        throw new Error('Failed to serialize spans')
      }

      // Send via WebSocket transport
      const result = await this.transport.send(data, 10000)

      if (result.status === 'success') {
        resultCallback({ code: ExportResultCode.SUCCESS })
      } else {
        // status is 'failure' or 'retryable'
        const error =
          'error' in result && result.error
            ? result.error
            : new Error(`Export failed with status: ${result.status}`)

        resultCallback({
          code: ExportResultCode.FAILED,
          error
        })
      }
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Shutdown exporter and close WebSocket connection
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return
    }

    this.isShutdown = true
    await this.transport.shutdown()
  }

  /**
   * Force flush (no-op for WebSocket, sends immediately)
   */
  async forceFlush(): Promise<void> {
    // WebSocket sends immediately, no buffering to flush
    return Promise.resolve()
  }
}

/**
 * Factory function for creating WebSocket trace exporter
 *
 * @example
 * ```typescript
 * const exporter = createWebSocketTraceExporter({
 *   url: 'wss://ui.atrim.ai/ws/traces',
 *   tenantId: 'my-tenant-123'
 * })
 * ```
 */
export function createWebSocketTraceExporter(
  config: WebSocketExporterConfig
): WebSocketTraceExporter {
  return new WebSocketTraceExporter(config)
}
