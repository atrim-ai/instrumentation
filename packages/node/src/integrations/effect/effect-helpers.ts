/**
 * Effect-specific span annotation helpers
 *
 * Provides reusable helper functions for adding common span attributes.
 * These helpers follow OpenTelemetry semantic conventions and platform patterns.
 *
 * Usage:
 * ```typescript
 * Effect.gen(function* () {
 *   yield* annotateUser(userId, email)
 *   yield* annotateBatch(items.length, 5)
 *   const results = yield* storage.writeBatch(items)
 *   yield* annotateBatch(items.length, 5, results.success, results.failures)
 * }).pipe(Effect.withSpan('storage.writeBatch'))
 * ```
 */

import { Effect } from 'effect'

/**
 * Annotate span with user context
 *
 * @param userId - User identifier
 * @param email - Optional user email
 * @param username - Optional username
 */
export function annotateUser(
  userId: string,
  email?: string,
  username?: string
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string> = {
    'user.id': userId
  }
  if (email) attributes['user.email'] = email
  if (username) attributes['user.name'] = username

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with data size metrics
 *
 * @param bytes - Total bytes processed
 * @param items - Number of items
 * @param compressionRatio - Optional compression ratio
 */
export function annotateDataSize(
  bytes: number,
  items: number,
  compressionRatio?: number
): Effect.Effect<void, never, never> {
  const attributes: Record<string, number> = {
    'data.size.bytes': bytes,
    'data.size.items': items
  }
  if (compressionRatio !== undefined) {
    attributes['data.compression.ratio'] = compressionRatio
  }

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with batch operation metadata
 *
 * @param totalItems - Total number of items in batch
 * @param batchSize - Size of each batch
 * @param successCount - Optional number of successful items
 * @param failureCount - Optional number of failed items
 */
export function annotateBatch(
  totalItems: number,
  batchSize: number,
  successCount?: number,
  failureCount?: number
): Effect.Effect<void, never, never> {
  const attributes: Record<string, number> = {
    'batch.size': batchSize,
    'batch.total_items': totalItems,
    'batch.count': Math.ceil(totalItems / batchSize)
  }

  if (successCount !== undefined) {
    attributes['batch.success_count'] = successCount
  }
  if (failureCount !== undefined) {
    attributes['batch.failure_count'] = failureCount
  }

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with LLM operation metadata
 *
 * @param model - Model name (e.g., 'gpt-4', 'claude-3-opus')
 * @param provider - LLM provider (e.g., 'openai', 'anthropic')
 * @param tokens - Optional token usage information
 */
export function annotateLLM(
  model: string,
  provider: string,
  tokens?: { prompt?: number; completion?: number; total?: number }
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string | number> = {
    'llm.model': model,
    'llm.provider': provider
  }

  if (tokens) {
    if (tokens.prompt !== undefined) attributes['llm.tokens.prompt'] = tokens.prompt
    if (tokens.completion !== undefined) attributes['llm.tokens.completion'] = tokens.completion
    if (tokens.total !== undefined) attributes['llm.tokens.total'] = tokens.total
  }

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with database query metadata
 *
 * @param query - SQL query or query description
 * @param duration - Optional query duration in milliseconds
 * @param rowCount - Optional number of rows returned/affected
 * @param database - Optional database name
 */
export function annotateQuery(
  query: string,
  duration?: number,
  rowCount?: number,
  database?: string
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string | number> = {
    'db.statement': query.length > 1000 ? query.substring(0, 1000) + '...' : query
  }

  if (duration !== undefined) attributes['db.duration.ms'] = duration
  if (rowCount !== undefined) attributes['db.row_count'] = rowCount
  if (database) attributes['db.name'] = database

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with HTTP request metadata
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Request URL
 * @param statusCode - Optional HTTP status code
 * @param contentLength - Optional response content length
 */
export function annotateHttpRequest(
  method: string,
  url: string,
  statusCode?: number,
  contentLength?: number
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string | number> = {
    'http.method': method,
    'http.url': url
  }

  if (statusCode !== undefined) attributes['http.status_code'] = statusCode
  if (contentLength !== undefined) attributes['http.response.content_length'] = contentLength

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with error context
 *
 * @param error - Error object or message
 * @param recoverable - Whether the error is recoverable
 * @param errorType - Optional error type/category
 */
export function annotateError(
  error: Error | string,
  recoverable: boolean,
  errorType?: string
): Effect.Effect<void, never, never> {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorStack = typeof error === 'string' ? undefined : error.stack

  const attributes: Record<string, string | boolean> = {
    'error.message': errorMessage,
    'error.recoverable': recoverable
  }

  if (errorType) attributes['error.type'] = errorType
  if (errorStack) attributes['error.stack'] = errorStack

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with operation priority
 *
 * @param priority - Priority level (high, medium, low)
 * @param reason - Optional reason for priority level
 */
export function annotatePriority(
  priority: 'high' | 'medium' | 'low',
  reason?: string
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string> = {
    'operation.priority': priority
  }

  if (reason) attributes['operation.priority.reason'] = reason

  return Effect.annotateCurrentSpan(attributes)
}

/**
 * Annotate span with cache operation metadata
 *
 * @param hit - Whether the cache was hit
 * @param key - Cache key
 * @param ttl - Optional time-to-live in seconds
 */
export function annotateCache(
  hit: boolean,
  key: string,
  ttl?: number
): Effect.Effect<void, never, never> {
  const attributes: Record<string, string | number | boolean> = {
    'cache.hit': hit,
    'cache.key': key
  }

  if (ttl !== undefined) attributes['cache.ttl.seconds'] = ttl

  return Effect.annotateCurrentSpan(attributes)
}
