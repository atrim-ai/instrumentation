/**
 * Standard OpenTelemetry span helpers (no Effect dependency)
 *
 * These helpers work with any OpenTelemetry span and don't require Effect-TS.
 */
import type { Span, SpanStatusCode } from '@opentelemetry/api'

/**
 * Set multiple attributes on a span at once
 */
export function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value)
  }
}

/**
 * Record an exception on a span with optional context
 */
export function recordException(
  span: Span,
  error: Error,
  context?: Record<string, string | number | boolean>
): void {
  span.recordException(error)
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      span.setAttribute(`error.${key}`, value)
    }
  }
}

/**
 * Mark a span as successful (OK status)
 */
export function markSpanSuccess(span: Span): void {
  span.setStatus({ code: 1 as SpanStatusCode }) // SpanStatusCode.OK = 1
}

/**
 * Mark a span as failed with an error message
 */
export function markSpanError(span: Span, message?: string): void {
  if (message !== undefined) {
    span.setStatus({
      code: 2 as SpanStatusCode, // SpanStatusCode.ERROR = 2
      message
    })
  } else {
    span.setStatus({
      code: 2 as SpanStatusCode // SpanStatusCode.ERROR = 2
    })
  }
}

/**
 * Helper for HTTP request spans
 */
export function annotateHttpRequest(
  span: Span,
  method: string,
  url: string,
  statusCode?: number
): void {
  span.setAttribute('http.method', method)
  span.setAttribute('http.url', url)
  if (statusCode !== undefined) {
    span.setAttribute('http.status_code', statusCode)
    // Mark as error if status code >= 400
    if (statusCode >= 400) {
      markSpanError(span, `HTTP ${statusCode}`)
    } else {
      markSpanSuccess(span)
    }
  }
}

/**
 * Helper for database query spans
 */
export function annotateDbQuery(
  span: Span,
  system: string,
  statement: string,
  table?: string
): void {
  span.setAttribute('db.system', system)
  span.setAttribute('db.statement', statement)
  if (table) {
    span.setAttribute('db.table', table)
  }
}

/**
 * Helper for cache operation spans
 */
export function annotateCacheOperation(
  span: Span,
  operation: 'get' | 'set' | 'delete' | 'clear',
  key: string,
  hit?: boolean
): void {
  span.setAttribute('cache.operation', operation)
  span.setAttribute('cache.key', key)
  if (hit !== undefined) {
    span.setAttribute('cache.hit', hit)
  }
}
