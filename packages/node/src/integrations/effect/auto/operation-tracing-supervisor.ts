/**
 * Operation Tracing Supervisor for Effect-TS
 *
 * Uses OpSupervision to trace high-level Effect operations like Effect.all,
 * Effect.forEach, etc. This supervisor reads operation metadata from the
 * `trace` field that Effect populates when operations are created.
 *
 * Requires the @clayroach/effect fork which adds OperationMeta to the trace field.
 *
 * The `OperationTracingLive` layer automatically enables the OpSupervision runtime
 * flag, so no additional configuration is needed.
 *
 * @example
 * ```typescript
 * import { OperationTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Automatically traced with span "effect.all" including item count
 *   yield* Effect.all([doA(), doB(), doC()])
 *
 *   // Automatically traced with span "effect.forEach"
 *   yield* Effect.forEach(items, processItem)
 * }).pipe(Effect.provide(OperationTracingLive))
 * ```
 */

import {
  Supervisor,
  Effect,
  Layer,
  Exit,
  Fiber,
  RuntimeFlags,
  RuntimeFlagsPatch,
  Context,
  Option
} from 'effect'
import * as EffectTracer from 'effect/Tracer'
import * as OtelApi from '@opentelemetry/api'
import { logger } from '@atrim/instrument-core'
import { loadConfigWithOptions } from '../../../core/config-loader.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Operation metadata stored in the trace field by Effect.all, Effect.forEach, etc.
 * This matches the OperationMeta interface in the Effect fork's core.ts
 */
export interface OperationMeta {
  readonly _tag: 'OperationMeta'
  readonly op: string // 'all', 'forEach', 'retry', etc.
  readonly count?: number // Item count for all/forEach
  readonly capturedAt: string // Stack trace at creation time
}

/**
 * Global span naming configuration for operation tracing
 */
export interface SpanNamingConfig {
  /** Include source location in span name (default: true) */
  readonly includeLocation: boolean
  /** Span name template with variables: {op}, {file}, {filename}, {line}, {column} */
  readonly template: string
}

/**
 * Default span naming configuration
 */
const defaultSpanNaming: SpanNamingConfig = {
  includeLocation: true,
  template: 'effect.{op} ({filename}:{line})'
}

/**
 * Configuration for which operations to trace
 */
export interface OperationConfig {
  readonly name: string // 'all', 'forEach', 'retry'
  readonly spanNameTemplate?: string // Custom span name template (overrides global template)
  readonly includeCount?: boolean // Add item count to attributes
  readonly includeStack?: boolean // Add stack trace to attributes
}

/**
 * Source location parsed from stack trace
 */
interface ParsedSourceLocation {
  readonly file: string
  readonly line: number
  readonly column: number | undefined
}

// ============================================================================
// Stack trace parsing
// ============================================================================

/**
 * Parse source location from a raw stack trace string.
 * Skips internal Effect frames to find the user's call site.
 */
function parseSourceLocation(stack: string): ParsedSourceLocation | undefined {
  const lines = stack.split('\n')

  for (const line of lines.slice(1)) {
    // Skip internal frames
    if (
      line.includes('node_modules') ||
      line.includes('/effect/') ||
      line.includes('fiberRuntime.ts') ||
      line.includes('core.ts')
    ) {
      continue
    }

    // Parse: "    at functionName (file:line:column)" or "    at file:line:column"
    const match = line.match(/at\s+(?:.*?\s+\()?(.+):(\d+):(\d+)\)?/)
    if (match && match[1] && match[2]) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: match[3] ? parseInt(match[3], 10) : undefined
      }
    }
  }

  return undefined
}

/**
 * Check if an effect has OperationMeta in its trace field
 */
function getOperationMeta(
  effect: Effect.Effect<unknown, unknown, unknown>
): OperationMeta | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trace = (effect as any).trace
  if (trace && trace._tag === 'OperationMeta') {
    return trace as OperationMeta
  }
  return undefined
}

/**
 * Template variables for span naming
 */
interface TemplateVariables {
  op: string
  file: string
  filename: string
  line: string
  column: string
}

/**
 * Apply template variables to a span name template
 *
 * Supports: {op}, {file}, {filename}, {line}, {column}
 */
function applyTemplate(template: string, vars: TemplateVariables): string {
  return template
    .replace(/\{op\}/g, vars.op)
    .replace(/\{file\}/g, vars.file)
    .replace(/\{filename\}/g, vars.filename)
    .replace(/\{line\}/g, vars.line)
    .replace(/\{column\}/g, vars.column)
}

// ============================================================================
// OperationTracingSupervisor
// ============================================================================

/**
 * Supervisor that traces Effect operations using OpSupervision.
 *
 * When OpSupervision is enabled, the Effect runtime calls `onEffect(fiber, effect)`
 * for every Effect operation in the runLoop. This supervisor checks if the effect
 * has OperationMeta in its trace field and creates spans accordingly.
 */
export class OperationTracingSupervisor extends Supervisor.AbstractSupervisor<void> {
  // Map of configured operations by name
  private readonly configuredOps: Map<string, OperationConfig>

  // Global span naming configuration
  private readonly spanNaming: SpanNamingConfig

  // Track processed effects to avoid duplicate spans (using WeakSet for GC)
  private readonly processedEffects = new WeakSet<object>()

  // Track spans per fiber for proper lifecycle management
  private readonly fiberSpans = new WeakMap<
    Fiber.RuntimeFiber<unknown, unknown>,
    Map<string, OtelApi.Span>
  >()

  // OpenTelemetry tracer - lazily initialized
  private _tracer: OtelApi.Tracer | null = null

  constructor(operations: OperationConfig[], spanNaming: SpanNamingConfig = defaultSpanNaming) {
    super()
    this.configuredOps = new Map(operations.map((op) => [op.name, op]))
    this.spanNaming = spanNaming
    logger.log('@atrim/operation-tracing: Supervisor initialized')
    logger.log(`  Configured operations: ${Array.from(this.configuredOps.keys()).join(', ')}`)
  }

  /**
   * Get the tracer lazily from global OTel API
   */
  private get tracer(): OtelApi.Tracer {
    if (!this._tracer) {
      this._tracer = OtelApi.trace.getTracer('@atrim/operation-tracing', '1.0.0')
    }
    return this._tracer
  }

  /**
   * Returns the current value (void for this supervisor)
   */
  override get value(): Effect.Effect<void> {
    return Effect.void
  }

  /**
   * Called for EVERY Effect operation when OpSupervision is enabled.
   *
   * This is the key hook for operation-level tracing. We check if the effect
   * has OperationMeta and create a span if configured.
   */
  override onEffect<A, E>(
    fiber: Fiber.RuntimeFiber<A, E>,
    effect: Effect.Effect<unknown, unknown, unknown>
  ): void {
    // Quick return if already processed (most common case)
    if (this.processedEffects.has(effect as object)) {
      return
    }

    // Check for operation metadata
    const meta = getOperationMeta(effect)
    if (!meta) {
      return
    }

    // Check if this operation is configured for tracing
    const config = this.configuredOps.get(meta.op)
    if (!config) {
      return
    }

    // Mark as processed to avoid duplicate spans
    this.processedEffects.add(effect as object)

    const fiberId = fiber.id().id
    logger.log(`@atrim/operation-tracing: Found operation "${meta.op}" in fiber ${fiberId}`)

    // Build span attributes (use OtelApi.Attributes like SourceCaptureSupervisor)
    const attributes: OtelApi.Attributes = {
      'effect.operation': meta.op
    }

    if (config.includeCount && meta.count !== undefined) {
      // Set as number directly (no conversion needed - already a number)
      attributes['effect.item_count'] = meta.count
    }

    // Parse source location first - we need it for span name and attributes
    const location = config.includeStack ? parseSourceLocation(meta.capturedAt) : undefined

    if (config.includeStack && location) {
      attributes['code.filepath'] = location.file
      // Set as numbers directly (parseInt already returns number)
      attributes['code.lineno'] = location.line
      if (location.column !== undefined) {
        attributes['code.column'] = location.column
      }
    }

    // Build span name using template system
    // Priority: per-operation template > global template > fallback
    let spanName: string

    // Build template variables
    const templateVars: TemplateVariables = {
      op: meta.op,
      file: location?.file ?? 'unknown',
      filename: location?.file?.split('/').pop() ?? 'unknown',
      line: location?.line?.toString() ?? '0',
      column: location?.column?.toString() ?? '0'
    }

    if (config.spanNameTemplate) {
      // Per-operation template override
      spanName = applyTemplate(config.spanNameTemplate, templateVars)
    } else if (this.spanNaming.includeLocation && location) {
      // Use global template with location info
      spanName = applyTemplate(this.spanNaming.template, templateVars)
    } else {
      // Fallback: just operation name without location
      spanName = `effect.${meta.op}`
    }

    // Get parent context from Effect fiber's context (like SourceCaptureSupervisor does)
    let parentContext: OtelApi.Context = OtelApi.ROOT_CONTEXT
    const fiberContext = fiber.currentContext
    const maybeEffectParentSpan = Context.getOption(fiberContext, EffectTracer.ParentSpan)

    if (Option.isSome(maybeEffectParentSpan)) {
      const effectSpan = maybeEffectParentSpan.value
      // Convert Effect span to OTel context
      parentContext = OtelApi.trace.setSpan(
        OtelApi.ROOT_CONTEXT,
        OtelApi.trace.wrapSpanContext({
          traceId: effectSpan.traceId,
          spanId: effectSpan.spanId,
          traceFlags: OtelApi.TraceFlags.SAMPLED
        })
      )
      logger.log(
        `@atrim/operation-tracing: Using parent span traceId=${effectSpan.traceId.slice(0, 8)}...`
      )
    }

    // Create span without attributes first
    const span = this.tracer.startSpan(
      spanName,
      {
        kind: OtelApi.SpanKind.INTERNAL
      },
      parentContext
    )

    // Set attributes after span creation using setAttribute() for proper type handling
    span.setAttribute('effect.operation', meta.op)

    if (config.includeCount && meta.count !== undefined) {
      span.setAttribute('effect.item_count', meta.count)
    }

    if (config.includeStack && location) {
      // Set source location attributes (already parsed above for span name)
      span.setAttribute('code.filepath', location.file)
      span.setAttribute('code.lineno', location.line)
      if (location.column !== undefined) {
        span.setAttribute('code.column', location.column)
      }
    }

    logger.log(
      `@atrim/operation-tracing: Created span "${spanName}" - spanId=${span.spanContext().spanId}`
    )

    // End span immediately - operation metadata capture is synchronous
    // OpSupervision only calls onEffect(), not onEnd(), so we can't rely on fiber lifecycle
    span.setStatus({ code: OtelApi.SpanStatusCode.OK })
    span.end()

    logger.log(`@atrim/operation-tracing: Ended span "${spanName}"`)

    // Store span for this fiber (keeping for now, but may not be needed)
    let spanMap = this.fiberSpans.get(fiber)
    if (!spanMap) {
      spanMap = new Map()
      this.fiberSpans.set(fiber, spanMap)
    }

    // Use operation + stack hash as key (since same operation might be called multiple times)
    const spanKey = `${meta.op}-${meta.capturedAt.slice(0, 100)}`
    spanMap.set(spanKey, span)
  }

  /**
   * Called when a fiber starts - we don't need this for operation tracing
   */
  override onStart(): void {
    // No-op for operation tracing
  }

  /**
   * Called when a fiber ends - end all spans for this fiber
   */
  override onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    const spanMap = this.fiberSpans.get(fiber)
    if (!spanMap) {
      return
    }

    const isError = exit._tag === 'Failure'
    const fiberId = fiber.id().id

    for (const [_key, span] of spanMap) {
      span.setStatus({
        code: isError ? OtelApi.SpanStatusCode.ERROR : OtelApi.SpanStatusCode.OK
      })
      span.end()
      logger.log(
        `@atrim/operation-tracing: Ended span for fiber ${fiberId} (${isError ? 'error' : 'success'})`
      )
    }

    this.fiberSpans.delete(fiber)
  }
}

// ============================================================================
// Layer Factory
// ============================================================================

/**
 * Default operation configurations
 */
const defaultOperations: OperationConfig[] = [
  { name: 'all', includeCount: true, includeStack: true },
  { name: 'forEach', includeCount: true, includeStack: true }
]

/**
 * Create a Layer that adds the OperationTracingSupervisor.
 *
 * NOTE: This layer adds the supervisor, but OpSupervision must also be enabled
 * for the runtime to call onEffect(). Use Effect.withRuntimeFlags to enable
 * OpSupervision, or use the enableOpSupervision helper.
 *
 * @param operations - Configuration for which operations to trace
 * @param spanNaming - Global span naming configuration
 */
export const makeOperationTracingLayer = (
  operations: OperationConfig[] = defaultOperations,
  spanNaming: SpanNamingConfig = defaultSpanNaming
): Layer.Layer<never> => {
  const supervisor = new OperationTracingSupervisor(operations, spanNaming)
  return Supervisor.addSupervisor(supervisor)
}

/**
 * Helper to enable OpSupervision runtime flag for an effect.
 *
 * OpSupervision causes the runtime to call supervisor.onEffect() for every
 * Effect operation. This has a performance cost but enables operation-level tracing.
 *
 * @example
 * ```typescript
 * const program = myEffect.pipe(
 *   enableOpSupervision,
 *   Effect.provide(OperationTracingLive)
 * )
 * ```
 */
export const enableOpSupervision = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.withRuntimeFlagsPatch(effect, RuntimeFlagsPatch.enable(RuntimeFlags.OpSupervision))

/**
 * Load operation tracing config from instrumentation.yaml and create supervisor layer.
 *
 * If no config is found or operation_tracing section is missing, uses sensible defaults
 * (traces Effect.all and Effect.forEach with count and stack info).
 *
 * Only explicitly disabled (enabled: false) will turn off operation tracing.
 */
const loadOperationTracingLayer = (): Layer.Layer<never> =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      // Load config from instrumentation.yaml
      const config = yield* Effect.tryPromise({
        try: () => loadConfigWithOptions(),
        catch: (error) => {
          logger.log(`@atrim/operation-tracing: Failed to load config: ${error}`)
          return error
        }
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      // Extract operation_tracing config
      const opTracingConfig = config?.effect?.operation_tracing

      // Only disable if explicitly set to enabled: false
      if (opTracingConfig?.enabled === false) {
        logger.log('@atrim/operation-tracing: Operation tracing disabled in config')
        return Layer.empty
      }

      // Extract span naming config with defaults
      const spanNaming: SpanNamingConfig = {
        includeLocation: opTracingConfig?.span_naming?.include_location ?? true,
        template: opTracingConfig?.span_naming?.template ?? 'effect.{op} ({filename}:{line})'
      }

      logger.log(
        `@atrim/operation-tracing: Span naming - includeLocation=${spanNaming.includeLocation}, template="${spanNaming.template}"`
      )

      // Use config operations if provided, otherwise use defaults
      const operations: OperationConfig[] = opTracingConfig?.operations
        ? opTracingConfig.operations.map((op) => ({
            name: op.name,
            ...(op.span_name && { spanNameTemplate: op.span_name }),
            includeCount: op.include_count ?? true,
            includeStack: op.include_stack ?? true
          }))
        : defaultOperations

      const source = opTracingConfig?.operations ? 'instrumentation.yaml' : 'defaults'
      logger.log(
        `@atrim/operation-tracing: Loaded ${operations.length} operation configs from ${source}`
      )

      return makeOperationTracingLayer(operations, spanNaming)
    })
  )

/**
 * Pre-configured layer for automatic operation tracing.
 *
 * **Zero-config by default** - Works out of the box with sensible defaults:
 * - Traces `Effect.all` and `Effect.forEach` operations
 * - Includes item count and source location in span attributes
 *
 * **Important:** You must enable OpSupervision for operation tracing to work.
 * Use `withOperationTracing(effect)` for the simplest setup, or manually:
 * `enableOpSupervision` + `Effect.provide(OperationTracingLive)`.
 *
 * @example
 * ```typescript
 * // Simplest: use withOperationTracing wrapper
 * const program = Effect.gen(function* () {
 *   yield* Effect.all([doA(), doB()])  // Automatically traced
 * }).pipe(withOperationTracing)
 *
 * // Or manually enable OpSupervision + provide layer
 * const program = myEffect.pipe(
 *   enableOpSupervision,
 *   Effect.provide(OperationTracingLive)
 * )
 * ```
 */
export const OperationTracingLive = loadOperationTracingLayer()

/**
 * Convenience wrapper that enables operation tracing for an effect.
 *
 * This is the simplest way to use operation tracing - just wrap your effect:
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* Effect.all([doA(), doB()])  // Automatically creates "effect.all" span
 *   yield* Effect.forEach(items, process)  // Automatically creates "effect.forEach" span
 * }).pipe(withOperationTracing)
 *
 * Effect.runPromise(program)
 * ```
 */
export const withOperationTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => effect.pipe(enableOpSupervision, Effect.provide(OperationTracingLive))
