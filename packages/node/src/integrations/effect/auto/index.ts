/**
 * Unified Tracing for Effect-TS
 *
 * Provides automatic tracing of all Effect operations, fibers, and fork hierarchies.
 * Configuration-driven via instrumentation.yaml.
 *
 * RECOMMENDED API:
 * - `UnifiedTracingLive` - Layer for Effect.provide()
 * - `withUnifiedTracing` - Simple wrapper for pipe()
 *
 * @example
 * ```typescript
 * import { withUnifiedTracing, withoutAutoTracing, setSpanName } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Automatically traced - operations, fibers, and fork hierarchy
 *   yield* Effect.all([doA(), doB()])
 *   yield* Effect.fork(backgroundTask())
 *
 *   // Opt-out for internal operations
 *   yield* withoutAutoTracing(internalWork())
 *
 *   // Custom span name override
 *   yield* setSpanName('custom.operation')(criticalWork())
 * }).pipe(withUnifiedTracing)
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Unified Tracing (RECOMMENDED)
// Combines operation + fiber tracing with correct fork span hierarchy
// ============================================================================

/**
 * Unified Tracing - The recommended API for Effect tracing
 *
 * UnifiedTracingLive provides:
 * - Automatic fiber-level tracing
 * - Operation tracing (Effect.all, Effect.forEach, Effect.fork)
 * - Correct fork span hierarchy (fork spans are parents of fiber spans)
 * - Source location capture for meaningful span names
 * - Auto OTel context bridging
 *
 * @example
 * ```typescript
 * import { UnifiedTracingLive, withUnifiedTracing } from '@atrim/instrument-node/effect/auto'
 *
 * // Option 1: Using the layer
 * const program = myEffect.pipe(Effect.provide(UnifiedTracingLive))
 *
 * // Option 2: Using the wrapper (simpler)
 * const program = myEffect.pipe(withUnifiedTracing)
 * ```
 *
 * Resulting trace hierarchy:
 * ```
 * http.server GET
 * ├── effect.fork (index.ts:15)
 * │   └── effect.fiber (index.ts:15)  ← child of fork span
 * └── effect.all (index.ts:18)
 *     ├── effect.fiber (task1)
 *     └── effect.fiber (task2)
 * ```
 */
export {
  // Simplest API - wraps effect with unified tracing
  withUnifiedTracing,
  // Layer for Effect.provide()
  UnifiedTracingLive,
  createUnifiedTracingLayer,
  // Supervisor class (for advanced use)
  UnifiedTracingSupervisor,
  // Provider shutdown (call before exit to ensure spans are exported)
  flushAndShutdown,
  forceFlush,
  // Helper to enable OpSupervision manually
  enableOpSupervision,
  // Span control utilities
  withoutAutoTracing,
  setSpanName,
  // FiberRefs (for advanced use)
  AutoTracingEnabled,
  AutoTracingSpanName
} from './unified-tracing-supervisor.js'

// Re-export OperationMeta type for advanced users
export type { OperationMeta } from './unified-tracing-supervisor.js'

// ============================================================================
// Configuration
// ============================================================================

export {
  AutoTracingConfig,
  AutoTracingConfigLive,
  AutoTracingConfigLayer,
  loadAutoTracingConfig,
  loadAutoTracingConfigSync,
  loadFullConfigSync,
  defaultAutoTracingConfig
} from './config.js'
export type { AutoInstrumentationConfig } from './config.js'

// ============================================================================
// Naming utilities (for advanced use)
// ============================================================================

export { inferSpanName, sanitizeSpanName } from './naming.js'
export type { SourceInfo, TemplateVariables } from './naming.js'

// ============================================================================
// Legacy utilities (maintained for backward compatibility)
// ============================================================================

/**
 * @deprecated Use Effect.fork() with UnifiedTracingLive instead.
 * The UnifiedTracingSupervisor traces Effect.fork automatically.
 */
export {
  tracedFork,
  tracedForkDaemon,
  CapturedSourceLocation,
  captureCallSite
} from './traced-fork.js'

/**
 * @deprecated Fork patching is no longer needed with UnifiedTracingLive.
 * The UnifiedTracingSupervisor captures source locations natively.
 */
export { patchEffectFork, unpatchEffectFork, isEffectForkPatched } from './patch-fork.js'

// ============================================================================
// Backward compatibility aliases
// ============================================================================

// For gradual migration, provide aliases to the old names
// These should be removed in a future major version

/**
 * @deprecated Use UnifiedTracingLive instead
 */
export { UnifiedTracingLive as FullAutoTracingLive } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use createUnifiedTracingLayer instead
 */
export { createUnifiedTracingLayer as createFullAutoTracingLayer } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingLive instead
 */
export { UnifiedTracingLive as AutoTracingLive } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use createUnifiedTracingLayer instead
 */
export { createUnifiedTracingLayer as createAutoTracingLayer } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingLive instead
 */
export { UnifiedTracingLive as SourceCaptureTracingLive } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingLive instead
 */
export { UnifiedTracingLive as CombinedTracingLive } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingLive instead
 */
export { UnifiedTracingLive as OperationTracingLive } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use withUnifiedTracing instead
 */
export { withUnifiedTracing as withOperationTracing } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use withUnifiedTracing instead
 *
 * Note: This version accepts a config and optional rootSpanName for backward compatibility
 * with tests that need custom configs.
 */
export { withAutoTracing } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingSupervisor instead
 */
export { UnifiedTracingSupervisor as AutoTracingSupervisor } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use UnifiedTracingSupervisor instead
 */
export { UnifiedTracingSupervisor as SourceCaptureSupervisor } from './unified-tracing-supervisor.js'

/**
 * @deprecated Use new UnifiedTracingSupervisor(config) instead
 */
export const createAutoTracingSupervisor = (
  config: import('./config.js').AutoInstrumentationConfig
) => new (require('./unified-tracing-supervisor.js').UnifiedTracingSupervisor)(config)
