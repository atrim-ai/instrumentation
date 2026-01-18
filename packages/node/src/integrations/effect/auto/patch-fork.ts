/**
 * Effect.fork Patching Utilities
 *
 * Due to ESM module immutability, we cannot directly patch Effect.fork at runtime.
 * This module provides status tracking and documentation for users.
 *
 * **For reliable call-site capture, use the explicit wrappers:**
 * - `tracedFork(effect)` - replacement for `Effect.fork(effect)`
 * - `tracedForkDaemon(effect)` - replacement for `Effect.forkDaemon(effect)`
 *
 * **Future options for true auto-instrumentation:**
 * - ESM loader hooks (requires Node.js --import flag)
 * - Build-time transforms (Babel/SWC plugin)
 * - Effect upstream enhancement (proposed)
 */

import { logger } from '@atrim/instrument-core'

// Track patching state
let patchAttempted = false

/**
 * Check if Effect.fork patching was attempted
 *
 * Note: Due to ESM limitations, actual patching is not currently supported.
 * Use `tracedFork()` for reliable call-site capture.
 */
export function isEffectForkPatched(): boolean {
  return false // Patching not supported in ESM
}

/**
 * Attempt to enable automatic call-site capture for Effect.fork.
 *
 * **Note:** Due to ESM module immutability, this is currently a no-op.
 * Use `tracedFork()` and `tracedForkDaemon()` for explicit call-site capture.
 *
 * @example
 * ```typescript
 * // Instead of:
 * yield* Effect.fork(myEffect)  // Span: "effect.anonymous"
 *
 * // Use:
 * import { tracedFork } from '@atrim/instrument-node/effect/auto'
 * yield* tracedFork(myEffect)   // Span: "effect.myFile:42"
 * ```
 */
export function patchEffectFork(): void {
  if (patchAttempted) {
    return
  }
  patchAttempted = true

  // Log once that patching is not available
  logger.log('@atrim/auto-trace: Effect.fork auto-patching not available (ESM limitation)')
  logger.log('@atrim/auto-trace: Use tracedFork() for call-site capture')
}

/**
 * No-op for API compatibility.
 */
export function unpatchEffectFork(): void {
  patchAttempted = false
}
