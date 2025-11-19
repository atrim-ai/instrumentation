/**
 * OTLP Exporter Factory for Browser
 *
 * Creates OTLP HTTP exporters for sending traces from the browser.
 * Browser only supports HTTP/JSON protocol (no gRPC).
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export interface OtlpExporterOptions {
  /**
   * OTLP endpoint URL
   * Must end in /v1/traces for browser exporter
   * @default 'http://localhost:4318/v1/traces'
   */
  endpoint?: string

  /**
   * Custom HTTP headers (e.g., for authentication)
   * @example { 'Authorization': 'Bearer token' }
   */
  headers?: Record<string, string>

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  timeout?: number
}

/**
 * Create an OTLP HTTP trace exporter for browser
 *
 * @param options - Exporter configuration options
 * @returns OTLPTraceExporter instance
 *
 * @example
 * ```typescript
 * const exporter = createOtlpExporter({
 *   endpoint: 'http://localhost:4318/v1/traces',
 *   headers: { 'x-api-key': 'secret' }
 * })
 * ```
 */
export function createOtlpExporter(options: OtlpExporterOptions = {}): OTLPTraceExporter {
  const endpoint = options.endpoint || getOtlpEndpoint()

  return new OTLPTraceExporter({
    url: endpoint,
    headers: options.headers || {},
    timeoutMillis: options.timeout || 10000
  })
}

/**
 * Get OTLP endpoint from environment or use default
 *
 * Checks in order:
 * 1. import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT (Vite)
 * 2. window.OTEL_EXPORTER_OTLP_ENDPOINT (runtime config)
 * 3. Default: http://localhost:4318/v1/traces
 *
 * @returns OTLP endpoint URL
 */
export function getOtlpEndpoint(): string {
  // Check Vite environment variables
  try {
    if (typeof import.meta !== 'undefined') {
      const metaEnv = (import.meta as { env?: Record<string, unknown> }).env
      if (metaEnv && metaEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT) {
        return String(metaEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT)
      }
    }
  } catch {
    // import.meta may not be available in all environments
  }

  // Check window object (runtime config)
  if (typeof window !== 'undefined') {
    const windowConfig = (window as { OTEL_EXPORTER_OTLP_ENDPOINT?: unknown })
      .OTEL_EXPORTER_OTLP_ENDPOINT
    if (windowConfig) {
      return String(windowConfig)
    }
  }

  // Default endpoint
  return 'http://localhost:4318/v1/traces'
}
