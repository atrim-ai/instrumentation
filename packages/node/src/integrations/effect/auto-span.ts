/**
 * Auto-Span Pipeable Operators for Effect
 *
 * Provides pipeable operators for automatic span creation with optional
 * span name inference from call stack.
 *
 * Usage:
 * ```typescript
 * import { withAutoSpan, traced, withAutoMetadata } from '@atrim/instrument-node/effect'
 *
 * // Auto-infer span name from call stack
 * const fetchUsers = Effect.gen(function* () {
 *   yield* queryDb()
 *   return users
 * }).pipe(withAutoSpan())  // Span name: "fetchUsers"
 *
 * // Explicit name with auto metadata
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(traced('app.operation'))
 *
 * // Just metadata without creating span
 * const program2 = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(
 *   withAutoMetadata(),
 *   Effect.withSpan('my.span')
 * )
 * ```
 */

import { Effect, Function as F } from 'effect'
import { extractEffectMetadata } from './metadata-extractor.js'

/**
 * Options for auto-span creation
 */
export interface AutoSpanOptions {
  /**
   * Standard span attributes
   */
  readonly attributes?: Record<string, unknown>

  /**
   * Span kind
   */
  readonly kind?: 'client' | 'server' | 'producer' | 'consumer' | 'internal'

  /**
   * Whether to capture stack trace for span name inference
   * @default true
   */
  readonly captureStackTrace?: boolean

  /**
   * Whether to extract Effect fiber metadata
   * @default true
   */
  readonly extractFiberInfo?: boolean

  /**
   * Maximum stack frames to search for meaningful name
   * @default 10
   */
  readonly maxStackDepth?: number
}

/**
 * Options for metadata extraction
 */
export interface AutoMetadataOptions {
  /**
   * Whether to extract fiber information
   * @default true
   */
  readonly extractFiberInfo?: boolean
}

/**
 * Internal: Parse stack trace to infer span name
 *
 * Skips internal Effect frames and node_modules to find meaningful caller.
 *
 * @param maxDepth - Maximum frames to search
 * @returns Inferred span name or default
 */
function inferSpanNameFromStack(maxDepth: number = 10): string {
  const error = new Error()
  const stack = error.stack

  if (!stack) {
    return 'effect.operation'
  }

  const lines = stack.split('\n')

  // Patterns to skip (internal frames)
  const skipPatterns = [
    /node_modules/,
    /at inferSpanNameFromStack/,
    /at withAutoSpan/,
    /at traced/,
    /at withAutoMetadata/,
    /at autoEnrichSpan/,
    /at Effect\.gen/,
    /at Generator\.next/,
    /at __awaiter/,
    /at new Promise/,
    /^Error$/,
    /at Object\.<anonymous>/,
    /at Module\._compile/,
    /at processTicksAndRejections/,
    /internal\//
  ]

  let framesChecked = 0

  for (const line of lines) {
    if (framesChecked >= maxDepth) break

    // Skip if matches any skip pattern
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      continue
    }

    framesChecked++

    // Try to extract function name
    // Format: "    at functionName (file:line:col)"
    // Or: "    at Object.functionName (file:line:col)"
    // Or: "    at file:line:col"
    const functionMatch = line.match(/at\s+(?:Object\.)?(\w+)\s+\(/)
    if (functionMatch && functionMatch[1]) {
      const name = functionMatch[1]
      // Skip generic names
      if (!['anonymous', 'eval', 'Object', 'Module'].includes(name)) {
        return name
      }
    }

    // Try to extract from arrow function or method
    // Format: "    at ClassName.methodName (file:line:col)"
    const methodMatch = line.match(/at\s+(\w+)\.(\w+)\s+\(/)
    if (methodMatch && methodMatch[2]) {
      const method = methodMatch[2]
      if (!['anonymous', 'eval'].includes(method)) {
        return `${methodMatch[1]}.${method}`
      }
    }

    // Fallback: extract file:line
    const fileMatch = line.match(/\(([^)]+):(\d+):\d+\)/)
    if (fileMatch && fileMatch[1] && fileMatch[2]) {
      const file =
        fileMatch[1]
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'unknown'
      const lineNum = fileMatch[2]
      return `${file}:${lineNum}`
    }

    // Alternative format: "    at file:line:col" (no parens)
    const altFileMatch = line.match(/at\s+([^:]+):(\d+):\d+/)
    if (altFileMatch && altFileMatch[1] && altFileMatch[2]) {
      const file =
        altFileMatch[1]
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'unknown'
      const lineNum = altFileMatch[2]
      return `${file}:${lineNum}`
    }
  }

  return 'effect.operation'
}

/**
 * Create a span with optional auto-inferred name
 *
 * When called without a name, infers span name from call stack.
 * Supports both data-first and data-last (pipeable) usage.
 *
 * @example
 * ```typescript
 * // Data-last (pipeable)
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(withAutoSpan())  // Name inferred from caller
 *
 * // With explicit name
 * const program2 = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(withAutoSpan('my.operation'))
 *
 * // Data-first
 * const program3 = withAutoSpan(myEffect, 'my.operation')
 * ```
 */
export const withAutoSpan: {
  // Data-last overloads (pipeable)
  (
    name?: string,
    options?: AutoSpanOptions
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

  // Data-first overload
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name?: string,
    options?: AutoSpanOptions
  ): Effect.Effect<A, E, R>
} = F.dual(
  (args) => Effect.isEffect(args[0]),
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name?: string,
    options?: AutoSpanOptions
  ): Effect.Effect<A, E, R> => {
    const {
      captureStackTrace = true,
      extractFiberInfo = true,
      maxStackDepth = 10,
      attributes,
      kind
    } = options || {}

    // Determine span name
    const spanName =
      name || (captureStackTrace ? inferSpanNameFromStack(maxStackDepth) : 'effect.operation')

    return Effect.gen(function* () {
      // Extract and apply metadata if enabled
      if (extractFiberInfo) {
        const metadata = yield* extractEffectMetadata()
        yield* Effect.annotateCurrentSpan(metadata as Record<string, unknown>)
      }

      // Execute the wrapped effect
      return yield* self
    }).pipe(Effect.withSpan(spanName, { attributes, kind }))
  }
)

/**
 * Convenience operator combining span creation with auto metadata extraction
 *
 * Equivalent to `withAutoSpan` but with explicit focus on tracing.
 * Always extracts fiber metadata.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(traced('app.operation'))
 *
 * // With options
 * const program2 = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(traced('app.operation', {
 *   attributes: { 'custom.key': 'value' },
 *   kind: 'client'
 * }))
 * ```
 */
export const traced: {
  // Data-last overloads (pipeable)
  (
    name?: string,
    options?: Omit<AutoSpanOptions, 'extractFiberInfo'>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

  // Data-first overload
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name?: string,
    options?: Omit<AutoSpanOptions, 'extractFiberInfo'>
  ): Effect.Effect<A, E, R>
} = F.dual(
  (args) => Effect.isEffect(args[0]),
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name?: string,
    options?: Omit<AutoSpanOptions, 'extractFiberInfo'>
  ): Effect.Effect<A, E, R> => {
    return withAutoSpan(self, name, { ...options, extractFiberInfo: true })
  }
)

/**
 * Extract Effect metadata without creating a span
 *
 * Useful when you want to add metadata to an existing span.
 * Must be used within an Effect.withSpan() context.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(
 *   withAutoMetadata(),
 *   Effect.withSpan('my.span')
 * )
 * ```
 */
export const withAutoMetadata: {
  // Data-last (pipeable)
  (options?: AutoMetadataOptions): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

  // Data-first
  <A, E, R>(self: Effect.Effect<A, E, R>, options?: AutoMetadataOptions): Effect.Effect<A, E, R>
} = F.dual(
  (args) => Effect.isEffect(args[0]),
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    options?: AutoMetadataOptions
  ): Effect.Effect<A, E, R> => {
    const { extractFiberInfo = true } = options || {}

    if (!extractFiberInfo) {
      return self
    }

    return Effect.gen(function* () {
      const metadata = yield* extractEffectMetadata()
      yield* Effect.annotateCurrentSpan(metadata as Record<string, unknown>)
      return yield* self
    })
  }
)
