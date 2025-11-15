/**
 * OTLP Exporter Factory
 *
 * Creates and configures OTLP trace exporters with smart defaults
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export interface OtlpExporterOptions {
  /**
   * OTLP endpoint URL
   * Defaults to OTEL_EXPORTER_OTLP_ENDPOINT or http://localhost:4318/v1/traces
   */
  endpoint?: string

  /**
   * Custom headers to send with requests
   * Useful for authentication, custom routing, etc.
   */
  headers?: Record<string, string>
}

/**
 * Default OTLP endpoint
 */
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces'

/**
 * Create an OTLP trace exporter with smart defaults
 *
 * Priority for endpoint:
 * 1. Explicit endpoint option
 * 2. OTEL_EXPORTER_OTLP_TRACES_ENDPOINT environment variable
 * 3. OTEL_EXPORTER_OTLP_ENDPOINT environment variable
 * 4. Default: http://localhost:4318/v1/traces
 */
export function createOtlpExporter(options: OtlpExporterOptions = {}): OTLPTraceExporter {
  const endpoint =
    options.endpoint ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    DEFAULT_OTLP_ENDPOINT

  // Ensure endpoint has /v1/traces path if not already present
  const normalizedEndpoint = normalizeEndpoint(endpoint)

  const config: { url: string; headers?: Record<string, string>; timeoutMillis?: number } = {
    url: normalizedEndpoint
  }

  if (options.headers) {
    config.headers = options.headers
  }

  return new OTLPTraceExporter(config)
}

/**
 * Normalize OTLP endpoint URL
 *
 * If the endpoint doesn't include a path, append /v1/traces
 */
function normalizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint)

    // If path is empty or just /, append /v1/traces
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1/traces'
      return url.toString()
    }

    // Otherwise, use as-is
    return endpoint
  } catch {
    // Invalid URL, return as-is and let OTLPTraceExporter handle the error
    return endpoint
  }
}

/**
 * Get the OTLP endpoint that would be used with current configuration
 *
 * Useful for debugging and logging
 */
export function getOtlpEndpoint(options: OtlpExporterOptions = {}): string {
  const endpoint =
    options.endpoint ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    DEFAULT_OTLP_ENDPOINT

  return normalizeEndpoint(endpoint)
}
