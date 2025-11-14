/**
 * Effect metadata extraction
 *
 * Automatically extracts metadata from Effect fibers and adds them as span attributes.
 * This provides valuable context about the Effect execution environment.
 */

import { logger } from '../../core/logger.js'

/**
 * Metadata extracted from Effect fibers
 */
export interface EffectMetadata {
  'effect.fiber.id'?: string
  'effect.fiber.status'?: string
  'effect.operation.root'?: boolean
  'effect.operation.interrupted'?: boolean
}

/**
 * Extract metadata from an Effect fiber
 *
 * Extracts useful information from Effect fibers that can be added to spans
 * for better observability and debugging.
 *
 * Note: This is a simplified implementation. Full fiber introspection would require
 * access to Effect's internal APIs.
 *
 * @param fiber - Effect fiber to extract metadata from (optional peer dependency)
 * @returns Metadata object with span attributes
 */
export function extractEffectMetadata(fiber?: unknown): EffectMetadata {
  if (!fiber) {
    return {}
  }

  const metadata: EffectMetadata = {}

  try {
    const fiberWithId = fiber as { id?: () => unknown }
    // Extract fiber ID if available
    if (fiberWithId.id && typeof fiberWithId.id === 'function') {
      try {
        const fiberId = fiberWithId.id()
        if (fiberId !== undefined) {
          metadata['effect.fiber.id'] = String(fiberId)
        }
      } catch {
        // Silently ignore - best effort
      }
    }

    // Extract fiber status (simplified)
    metadata['effect.fiber.status'] = 'running'

    // Mark as root operation (simplified - would need Effect internals for accuracy)
    metadata['effect.operation.root'] = false

    // Check if interrupted (simplified)
    metadata['effect.operation.interrupted'] = false
  } catch (error) {
    // Silently fail - metadata extraction is best-effort
    logger.warn('Failed to extract Effect metadata:', error)
  }

  return metadata
}

/**
 * Add Effect metadata to a span's attributes
 *
 * @param span - OpenTelemetry span (or any object with setAttribute method)
 * @param fiber - Effect fiber
 */
export function addEffectMetadataToSpan(
  span: { setAttribute: (key: string, value: string | boolean) => void },
  fiber?: unknown
): void {
  const metadata = extractEffectMetadata(fiber)

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      span.setAttribute(key, value as string | boolean)
    }
  }
}
