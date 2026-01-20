/**
 * Effect metadata extraction
 *
 * Automatically extracts metadata from Effect fibers and adds them as span attributes.
 * This provides valuable context about the Effect execution environment.
 *
 * Uses Effect's public APIs:
 * - Fiber.getCurrentFiber() - Get current fiber information
 * - Effect.currentSpan - Detect parent spans and nesting
 */

import { Effect, Fiber, FiberId, Option } from 'effect'

/**
 * Metadata extracted from Effect fibers
 */
export interface EffectMetadata {
  'effect.fiber.id'?: string
  'effect.fiber.status'?: string
  'effect.operation.root'?: boolean
  'effect.operation.nested'?: boolean
  'effect.parent.span.id'?: string
  'effect.parent.span.name'?: string
  'effect.parent.trace.id'?: string
}

/**
 * Extract Effect-native metadata from current execution context
 *
 * Uses Effect's native APIs:
 * - Fiber.getCurrentFiber() - Get current fiber information
 * - Effect.currentSpan - Detect parent spans and nesting
 *
 * @returns Effect that yields extracted metadata
 */
export function extractEffectMetadata(): Effect.Effect<EffectMetadata> {
  return Effect.gen(function* () {
    const metadata: EffectMetadata = {}

    // Extract fiber metadata using Fiber.getCurrentFiber()
    const currentFiber = Fiber.getCurrentFiber()

    if (Option.isSome(currentFiber)) {
      const fiber = currentFiber.value
      const fiberId = fiber.id()

      // Add fiber ID
      metadata['effect.fiber.id'] = FiberId.threadName(fiberId)

      // Get fiber status (returns an Effect)
      const status = yield* Fiber.status(fiber)
      if (status._tag) {
        metadata['effect.fiber.status'] = status._tag
      }
    }

    // Detect parent span for nesting analysis
    const parentSpanResult = yield* Effect.currentSpan.pipe(
      Effect.option // Convert NoSuchElementException to Option
    )

    if (Option.isSome(parentSpanResult)) {
      const parentSpan = parentSpanResult.value
      metadata['effect.operation.nested'] = true
      metadata['effect.operation.root'] = false

      // Extract parent span information
      if (parentSpan.spanId) {
        metadata['effect.parent.span.id'] = parentSpan.spanId
      }

      if (parentSpan.name) {
        metadata['effect.parent.span.name'] = parentSpan.name
      }

      // Detect forking: if parent span exists in different context
      // This is a best-effort detection based on span context
      if (parentSpan.traceId) {
        metadata['effect.parent.trace.id'] = parentSpan.traceId
      }
    } else {
      // No parent span - this is a root span
      metadata['effect.operation.nested'] = false
      metadata['effect.operation.root'] = true
    }

    return metadata
  })
}
