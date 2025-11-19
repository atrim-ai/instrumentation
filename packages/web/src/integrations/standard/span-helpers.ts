/**
 * Browser Span Helpers
 *
 * Utility functions for adding metadata to spans in browser applications
 */

import { Span, SpanStatusCode } from '@opentelemetry/api'

/**
 * Set multiple attributes on a span
 *
 * @param span - OpenTelemetry span
 * @param attributes - Key-value pairs to set as attributes
 *
 * @example
 * ```typescript
 * setSpanAttributes(span, {
 *   'user.id': '123',
 *   'page.url': window.location.href
 * })
 * ```
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
 * Record an exception on a span
 *
 * @param span - OpenTelemetry span
 * @param error - Error object to record
 * @param context - Additional context attributes
 *
 * @example
 * ```typescript
 * try {
 *   // ...
 * } catch (error) {
 *   recordException(span, error, { 'page.url': window.location.href })
 * }
 * ```
 */
export function recordException(
  span: Span,
  error: Error,
  context?: Record<string, string | number | boolean>
): void {
  span.recordException(error)

  if (context) {
    setSpanAttributes(span, context)
  }
}

/**
 * Mark a span as successful
 *
 * Sets status to OK and adds optional attributes
 *
 * @param span - OpenTelemetry span
 * @param attributes - Optional attributes to add
 */
export function markSpanSuccess(
  span: Span,
  attributes?: Record<string, string | number | boolean>
): void {
  span.setStatus({ code: SpanStatusCode.OK })

  if (attributes) {
    setSpanAttributes(span, attributes)
  }
}

/**
 * Mark a span as failed
 *
 * Sets status to ERROR and adds optional error message/attributes
 *
 * @param span - OpenTelemetry span
 * @param message - Error message
 * @param attributes - Optional attributes to add
 */
export function markSpanError(
  span: Span,
  message?: string,
  attributes?: Record<string, string | number | boolean>
): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: message || 'Operation failed'
  })

  if (attributes) {
    setSpanAttributes(span, attributes)
  }
}

/**
 * Annotate span with HTTP request details
 *
 * @param span - OpenTelemetry span
 * @param options - HTTP request details
 *
 * @example
 * ```typescript
 * annotateHttpRequest(span, {
 *   method: 'GET',
 *   url: 'https://api.example.com/users',
 *   statusCode: 200,
 *   responseTime: 150
 * })
 * ```
 */
export function annotateHttpRequest(
  span: Span,
  options: {
    method?: string
    url?: string
    statusCode?: number
    responseTime?: number
    requestSize?: number
    responseSize?: number
  }
): void {
  const attrs: Record<string, string | number> = {}

  if (options.method) attrs['http.method'] = options.method
  if (options.url) attrs['http.url'] = options.url
  if (options.statusCode) attrs['http.status_code'] = options.statusCode
  if (options.responseTime) attrs['http.response_time_ms'] = options.responseTime
  if (options.requestSize) attrs['http.request.body.size'] = options.requestSize
  if (options.responseSize) attrs['http.response.body.size'] = options.responseSize

  setSpanAttributes(span, attrs)
}

/**
 * Annotate span with cache operation details
 *
 * @param span - OpenTelemetry span
 * @param options - Cache operation details
 *
 * @example
 * ```typescript
 * annotate CacheOperation(span, {
 *   operation: 'get',
 *   key: 'user:123',
 *   hit: true
 * })
 * ```
 */
export function annotateCacheOperation(
  span: Span,
  options: {
    operation: 'get' | 'set' | 'delete' | 'clear'
    key?: string
    hit?: boolean
    size?: number
  }
): void {
  const attrs: Record<string, string | number | boolean> = {
    'cache.operation': options.operation
  }

  if (options.key) attrs['cache.key'] = options.key
  if (options.hit !== undefined) attrs['cache.hit'] = options.hit
  if (options.size) attrs['cache.size'] = options.size

  setSpanAttributes(span, attrs)
}

/**
 * Annotate span with user interaction details
 *
 * @param span - OpenTelemetry span
 * @param options - User interaction details
 *
 * @example
 * ```typescript
 * annotateUserInteraction(span, {
 *   type: 'click',
 *   target: 'button#submit',
 *   page: '/checkout'
 * })
 * ```
 */
export function annotateUserInteraction(
  span: Span,
  options: {
    type: 'click' | 'submit' | 'input' | 'navigation'
    target?: string
    page?: string
  }
): void {
  const attrs: Record<string, string> = {
    'user.interaction.type': options.type
  }

  if (options.target) attrs['user.interaction.target'] = options.target
  if (options.page) attrs['user.interaction.page'] = options.page

  setSpanAttributes(span, attrs)
}

/**
 * Annotate span with page navigation details
 *
 * @param span - OpenTelemetry span
 * @param options - Navigation details
 *
 * @example
 * ```typescript
 * annotateNavigation(span, {
 *   from: '/home',
 *   to: '/profile',
 *   type: 'client-side'
 * })
 * ```
 */
export function annotateNavigation(
  span: Span,
  options: {
    from?: string
    to?: string
    type?: 'client-side' | 'server-side' | 'initial'
  }
): void {
  const attrs: Record<string, string> = {}

  if (options.from) attrs['navigation.from'] = options.from
  if (options.to) attrs['navigation.to'] = options.to
  if (options.type) attrs['navigation.type'] = options.type

  setSpanAttributes(span, attrs)
}
