/**
 * Auto-Tracing for Effect-TS
 *
 * Provides automatic tracing of all Effect fibers without manual Effect.withSpan() calls.
 * Configuration-driven via instrumentation.yaml.
 *
 * @example
 * ```typescript
 * import { AutoTracingLive, withoutAutoTracing, setSpanName } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Automatically traced based on instrumentation.yaml
 *   yield* publicWork()
 *
 *   // Opt-out for internal operations
 *   yield* withoutAutoTracing(internalWork())
 *
 *   // Custom span name
 *   yield* setSpanName('custom.operation')(criticalWork())
 * }).pipe(Effect.provide(AutoTracingLive))
 * ```
 *
 * @packageDocumentation
 */

// Effect-native tracing (RECOMMENDED for HTTP apps)
export { EffectTracingLive, createEffectTracingLayer } from './effect-tracing.js'

// Combined tracing: HTTP + Fiber-level (MOST COMPREHENSIVE)
export { CombinedTracingLive, createCombinedTracingLayer } from './effect-tracing.js'

// Core supervisor and layers
export {
  // Full YAML-driven fiber tracing
  FullAutoTracingLive,
  createFullAutoTracingLayer,
  // Supervisor-only layer (requires separate exporter setup)
  AutoTracingLive,
  createAutoTracingLayer,
  AutoTracingSupervisor,
  createAutoTracingSupervisor,
  // Effect wrapper (uses Effect.supervised)
  withAutoTracing,
  // Opt-out utilities
  withoutAutoTracing,
  setSpanName,
  // FiberRefs (for advanced use)
  AutoTracingEnabled,
  AutoTracingSpanName
} from './supervisor.js'

// Configuration
export {
  AutoTracingConfig,
  AutoTracingConfigLive,
  AutoTracingConfigLayer,
  loadAutoTracingConfig,
  loadAutoTracingConfigSync,
  defaultAutoTracingConfig
} from './config.js'
export type { AutoInstrumentationConfig } from './config.js'

// Naming utilities (for advanced use)
export { inferSpanName, sanitizeSpanName } from './naming.js'
export type { SourceInfo, TemplateVariables } from './naming.js'

// Traced fork utilities (for better span names)
export {
  tracedFork,
  tracedForkDaemon,
  CapturedSourceLocation,
  captureCallSite
} from './traced-fork.js'

// Runtime patching for automatic call-site capture
export { patchEffectFork, unpatchEffectFork, isEffectForkPatched } from './patch-fork.js'

// ============================================================================
// POC: Native Source Capture (issue #145)
// Uses Effect's native source capture instead of manual tracedFork() wrapper
// ============================================================================

/**
 * Native Source Capture Tracing - POC for issue #145
 *
 * This uses Effect's native source capture feature from the custom Effect build
 * (@clayroach/effect@3.19.14-source-capture.0) to automatically capture call-site
 * locations when fibers are forked - NO wrapper functions needed!
 *
 * @example
 * ```typescript
 * import { SourceCaptureTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Just use regular Effect.fork() - source location captured automatically!
 *   yield* Effect.fork(sendEmail())  // Span: "effect.sendEmail (user-handlers.ts:42)"
 * }).pipe(Effect.provide(SourceCaptureTracingLive))
 * ```
 */
export {
  // Main layer - enables native source capture + supervisor
  SourceCaptureTracingLive,
  createSourceCaptureTracingLayer,
  // Supervisor class (for advanced use)
  SourceCaptureSupervisor,
  // Opt-out utilities
  withoutSourceCapture,
  // Provider shutdown (call before exit to ensure spans are exported)
  flushAndShutdown,
  forceFlush
} from './source-capture-supervisor.js'

// ============================================================================
// POC: OpSupervision-based Operation Tracing (issue #XXX)
// Traces Effect.all, Effect.forEach, etc. using the trace field metadata
// ============================================================================

/**
 * Operation Tracing - Automatic tracing of Effect.all, Effect.forEach, etc.
 *
 * Zero-config by default - just provide the layer and it works. Customize
 * via instrumentation.yaml only if needed. Requires the @clayroach/effect fork.
 *
 * @example
 * ```typescript
 * import { OperationTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Automatically traced with span "effect.all" and item count
 *   yield* Effect.all([doA(), doB(), doC()])
 *
 *   // Automatically traced with span "effect.forEach"
 *   yield* Effect.forEach(items, processItem)
 * }).pipe(Effect.provide(OperationTracingLive))
 * ```
 */
export {
  // Simplest API - wraps effect with operation tracing
  withOperationTracing,
  // Layer for manual composition
  OperationTracingLive,
  makeOperationTracingLayer,
  // Helper to manually enable OpSupervision
  enableOpSupervision,
  // Supervisor class (for advanced use)
  OperationTracingSupervisor
} from './operation-tracing-supervisor.js'
export type { OperationConfig, OperationMeta } from './operation-tracing-supervisor.js'

// ============================================================================
// Unified Tracing (RECOMMENDED) - Correct fork span hierarchy
// Combines operation + fiber tracing with fork spans as parents of fiber spans
// ============================================================================

/**
 * Unified Tracing - RECOMMENDED for correct fork span hierarchy
 *
 * This supervisor combines operation tracing and fiber tracing, ensuring that
 * fork spans are correctly set as parents of their resulting fiber spans.
 *
 * @example
 * ```typescript
 * import { withUnifiedTracing } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Fork span is PARENT of the forked fiber span (correct hierarchy!)
 *   yield* Effect.fork(backgroundTask())
 *
 *   // effect.all span contains item count
 *   yield* Effect.all([doA(), doB()])
 * }).pipe(withUnifiedTracing)
 * ```
 *
 * Resulting trace hierarchy:
 * ```
 * http.server GET
 * ├── effect.fork (index.ts:15)
 * │   └── effect.fiber (index.ts:15)  ← child of fork!
 * └── effect.all (index.ts:18)
 * ```
 */
export {
  // Simplest API - wraps effect with unified tracing
  withUnifiedTracing,
  // Layer for manual composition
  UnifiedTracingLive,
  createUnifiedTracingLayer,
  // Supervisor class (for advanced use)
  UnifiedTracingSupervisor,
  // Provider shutdown
  flushAndShutdown as unifiedFlushAndShutdown,
  forceFlush as unifiedForceFlush
} from './unified-tracing-supervisor.js'
