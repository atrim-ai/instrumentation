/**
 * Standard OpenTelemetry span helpers (no Effect dependency)
 */
import type { Span } from '@opentelemetry/api'

export function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value)
  }
}

export function recordException(
  span: Span,
  error: Error,
  context?: Record<string, unknown>
): void {
  span.recordException(error)
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      span.setAttribute(`error.${key}`, String(value))
    }
  }
}
