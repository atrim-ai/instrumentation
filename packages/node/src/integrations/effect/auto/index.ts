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

// Core supervisor and layers
export {
  // Full YAML-driven layer (recommended)
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
