/**
 * Unified Tracing Supervisor for Effect-TS
 *
 * Combines operation tracing (Effect.all, Effect.forEach, Effect.fork) with
 * fiber-level tracing, ensuring correct parent-child span relationships.
 *
 * Key feature: Fork spans are correctly set as parents of their resulting fiber spans.
 *
 * Requires the @clayroach/effect fork with OperationMeta and source capture support.
 *
 * @example
 * ```typescript
 * import { withUnifiedTracing } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Creates spans: effect.all -> child fiber spans
 *   yield* Effect.all([doA(), doB()])
 *
 *   // Creates spans: effect.fork -> forked fiber span (correct hierarchy!)
 *   yield* Effect.fork(backgroundTask())
 * }).pipe(withUnifiedTracing)
 * ```
 */

import {
  Supervisor,
  Effect,
  Layer,
  FiberRef,
  FiberRefs,
  Context,
  Option,
  Exit,
  Fiber,
  RuntimeFlags,
  RuntimeFlagsPatch,
  Tracer as EffectTracer,
  GlobalValue
} from 'effect'
import { Tracer as OtelTracer, Resource } from '@effect/opentelemetry'
import * as OtelApi from '@opentelemetry/api'
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  BasicTracerProvider
} from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import type { AutoInstrumentationConfig } from '@atrim/instrument-core'
import { logger } from '@atrim/instrument-core'
import { loadFullConfigSync } from './config.js'
import { AutoTracingEnabled, AutoTracingSpanName } from './span-control.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Operation metadata stored in the trace field by Effect.all, Effect.forEach, etc.
 */
export interface OperationMeta {
  readonly _tag: 'OperationMeta'
  readonly op: string
  readonly count?: number
  readonly capturedAt: string
}

/**
 * Source location from Effect's build-time injection via @effect/unplugin
 * Matches the SourceLocation interface from effect/SourceLocation
 */
interface SourceLocation {
  readonly path: string
  readonly line: number
  readonly column: number
  readonly label?: string
}

/**
 * Pending fork span waiting for its child fiber
 */
interface PendingFork {
  readonly forkSpan: OtelApi.Span
  readonly forkContext: OtelApi.Context
  readonly timestamp: bigint
  readonly spanEnded: boolean
}

/**
 * Configuration for which operations to trace
 */
interface OperationConfig {
  readonly name: string
  readonly includeCount?: boolean
  readonly includeStack?: boolean
}

// ============================================================================
// FiberRefs
// ============================================================================

/**
 * Access Effect's currentSourceTrace FiberRef from the @clayroach/effect fork
 * This FiberRef is set by @effect/unplugin during build-time transformation
 */
const currentSourceTrace = GlobalValue.globalValue(
  Symbol.for('effect/FiberRef/currentSourceTrace'),
  () => FiberRef.unsafeMake<SourceLocation | undefined>(undefined)
)

// ============================================================================
// Helpers
// ============================================================================

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
 * Parse source location from a raw stack trace string (used for OperationMeta.capturedAt)
 * Returns SourceLocation with path/line/column to match the interface
 */
function parseSourceLocation(stack: string): SourceLocation | undefined {
  const lines = stack.split('\n')

  for (const line of lines.slice(1)) {
    if (
      line.includes('node_modules') ||
      line.includes('/effect/') ||
      line.includes('fiberRuntime.ts') ||
      line.includes('core.ts')
    ) {
      continue
    }

    const match = line.match(/at\s+(?:.*?\s+\()?(.+):(\d+):(\d+)\)?/)
    if (match && match[1] && match[2]) {
      return {
        path: match[1],
        line: parseInt(match[2], 10),
        column: match[3] ? parseInt(match[3], 10) : 0
      }
    }
  }

  return undefined
}

/**
 * Create a source key for correlating fork operations with fibers
 */
function makeSourceKey(source: SourceLocation | undefined): string {
  if (!source) return 'unknown'
  return `${source.path}:${source.line}`
}

/**
 * Format source location for span name
 */
function formatLocation(source: SourceLocation | undefined): string {
  if (!source) return 'unknown'
  const filename = source.path.split('/').pop() ?? source.path
  return source.label
    ? `${filename}:${source.line} (${source.label})`
    : `${filename}:${source.line}`
}

// ============================================================================
// UnifiedTracingSupervisor
// ============================================================================

/**
 * Unified supervisor that handles both operation tracing and fiber tracing,
 * ensuring correct parent-child relationships for fork spans.
 */
export class UnifiedTracingSupervisor extends Supervisor.AbstractSupervisor<void> {
  // ========== Fork span registry ==========
  // Maps sourceKey -> pending fork span (for correlating with child fibers)
  private readonly pendingForkSpans = new Map<string, PendingFork>()

  // ========== Fiber tracking ==========
  private readonly fiberSpans = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, OtelApi.Span>()
  private readonly fiberContexts = new WeakMap<
    Fiber.RuntimeFiber<unknown, unknown>,
    OtelApi.Context
  >()
  private readonly fiberStartTimes = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, bigint>()

  // ========== Operation tracking ==========
  private readonly processedEffects = new WeakSet<object>()
  private readonly configuredOps: Map<string, OperationConfig>

  // ========== OTel ==========
  private _tracer: OtelApi.Tracer | null = null
  private activeFiberCount = 0

  constructor(private readonly config: AutoInstrumentationConfig) {
    super()

    // Default operations to trace
    const defaultOps: OperationConfig[] = [
      { name: 'all', includeCount: true, includeStack: true },
      { name: 'forEach', includeCount: true, includeStack: true },
      { name: 'fork', includeStack: true }
    ]
    this.configuredOps = new Map(defaultOps.map((op) => [op.name, op]))

    logger.log('@atrim/unified-tracing: Supervisor initialized')
    logger.log(`  Operations: ${Array.from(this.configuredOps.keys()).join(', ')}`)
  }

  private get tracer(): OtelApi.Tracer {
    if (!this._tracer) {
      this._tracer = OtelApi.trace.getTracer('@atrim/unified-tracing', '1.0.0')
    }
    return this._tracer
  }

  override get value(): Effect.Effect<void> {
    return Effect.void
  }

  // ==========================================================================
  // onEffect - Operation-level tracing (Effect.all, Effect.forEach, Effect.fork)
  // ==========================================================================

  override onEffect<A, E>(
    fiber: Fiber.RuntimeFiber<A, E>,
    effect: Effect.Effect<unknown, unknown, unknown>
  ): void {
    if (this.processedEffects.has(effect as object)) {
      return
    }

    const meta = getOperationMeta(effect)
    if (!meta) {
      return
    }

    const opConfig = this.configuredOps.get(meta.op)
    if (!opConfig) {
      return
    }

    this.processedEffects.add(effect as object)

    const fiberId = fiber.id().id
    const location = parseSourceLocation(meta.capturedAt)
    const sourceKey = makeSourceKey(location)

    logger.log(`@atrim/unified-tracing: onEffect "${meta.op}" in fiber ${fiberId} at ${sourceKey}`)

    // Get parent context
    const parentContext = this.resolveParentContext(fiber)

    // Build span name
    const spanName = location
      ? `effect.${meta.op} (${formatLocation(location)})`
      : `effect.${meta.op}`

    // Create operation span
    const span = this.tracer.startSpan(spanName, { kind: OtelApi.SpanKind.INTERNAL }, parentContext)

    // Set attributes
    span.setAttribute('effect.operation', meta.op)
    if (opConfig.includeCount && meta.count !== undefined) {
      span.setAttribute('effect.item_count', meta.count)
    }
    if (opConfig.includeStack && location) {
      span.setAttribute('code.filepath', location.path)
      span.setAttribute('code.lineno', location.line)
      span.setAttribute('code.column', location.column)
    }

    logger.log(
      `@atrim/unified-tracing: Created operation span "${spanName}" spanId=${span.spanContext().spanId}`
    )

    // For fork operations, register the span for the child fiber to find
    if (meta.op === 'fork') {
      const forkContext = OtelApi.trace.setSpan(parentContext, span)
      this.pendingForkSpans.set(sourceKey, {
        forkSpan: span,
        forkContext,
        timestamp: process.hrtime.bigint(),
        spanEnded: false
      })
      logger.log(`@atrim/unified-tracing: Registered pending fork at ${sourceKey}`)

      // Don't end fork span yet - will be ended when child fiber starts
      // This ensures the fork span has non-zero duration
    } else {
      // For non-fork operations (all, forEach), end immediately
      span.setStatus({ code: OtelApi.SpanStatusCode.OK })
      span.end()
    }
  }

  // ==========================================================================
  // onStart - Fiber-level tracing
  // ==========================================================================

  override onStart<A, E, R>(
    _context: Context.Context<R>,
    _effect: Effect.Effect<A, E, R>,
    parent: Option.Option<Fiber.RuntimeFiber<unknown, unknown>>,
    fiber: Fiber.RuntimeFiber<A, E>
  ): void {
    const fiberId = fiber.id().id
    const fiberRefs = fiber.getFiberRefs()

    // ========================================================================
    // Check span control FiberRefs
    // ========================================================================

    // Check if auto-tracing is enabled for this fiber (via FiberRef)
    const enabled = FiberRefs.getOrDefault(fiberRefs, AutoTracingEnabled)
    if (!enabled) {
      logger.log(`@atrim/unified-tracing: Auto-tracing disabled for fiber ${fiberId}`)
      return
    }

    // Check sampling rate from config
    const samplingRate = this.config.performance?.sampling_rate ?? 1.0
    if (samplingRate < 1.0 && Math.random() > samplingRate) {
      return
    }

    // Check for span name override
    const nameOverride = FiberRefs.getOrDefault(fiberRefs, AutoTracingSpanName)

    // Get source location from FiberRef (set by @effect/unplugin build-time transformation)
    const sourceLocation = FiberRefs.getOrDefault(fiberRefs, currentSourceTrace) as
      | SourceLocation
      | undefined
    const sourceKey = makeSourceKey(sourceLocation)

    logger.log(`@atrim/unified-tracing: onStart fiber ${fiberId} at ${sourceKey}`)

    // ========================================================================
    // KEY: Check if this fiber is the result of a pending fork operation
    // ========================================================================
    let parentContext: OtelApi.Context
    const pendingFork = this.pendingForkSpans.get(sourceKey)

    if (pendingFork) {
      // This fiber is the child of a fork operation!
      // Use the fork span's context as the parent
      parentContext = pendingFork.forkContext
      logger.log(
        `@atrim/unified-tracing: Matched fiber ${fiberId} to fork span at ${sourceKey} - using fork span as parent`
      )

      // End the fork span now that we've matched it
      if (!pendingFork.spanEnded) {
        pendingFork.forkSpan.setStatus({ code: OtelApi.SpanStatusCode.OK })
        pendingFork.forkSpan.end()
        logger.log(`@atrim/unified-tracing: Ended fork span at ${sourceKey}`)
      }

      // Remove from pending
      this.pendingForkSpans.delete(sourceKey)
    } else {
      // No pending fork - use normal parent resolution
      parentContext = this.resolveParentContextFromFiberRefs(
        fiberRefs,
        _context as Context.Context<unknown>,
        parent
      )
    }

    // Generate span name - use override if set, otherwise infer from source
    let spanName: string
    if (Option.isSome(nameOverride)) {
      spanName = nameOverride.value
    } else if (sourceLocation) {
      spanName = `effect.fiber (${formatLocation(sourceLocation)})`
    } else {
      spanName = `effect.fiber-${fiberId}`
    }

    // Create fiber span
    const span = this.tracer.startSpan(spanName, { kind: OtelApi.SpanKind.INTERNAL }, parentContext)

    // Set attributes
    span.setAttribute('effect.auto_traced', true)
    span.setAttribute('effect.fiber.id', fiberId)
    if (sourceLocation) {
      span.setAttribute('code.filepath', sourceLocation.path)
      span.setAttribute('code.lineno', sourceLocation.line)
      span.setAttribute('code.column', sourceLocation.column)
      if (sourceLocation.label) {
        span.setAttribute('code.function', sourceLocation.label)
      }
    }
    if (Option.isSome(parent)) {
      span.setAttribute('effect.fiber.parent_id', parent.value.id().id)
    }

    logger.log(
      `@atrim/unified-tracing: Created fiber span "${spanName}" spanId=${span.spanContext().spanId}`
    )

    // Store for onEnd and child lookups
    const newContext = OtelApi.trace.setSpan(parentContext, span)
    this.fiberSpans.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, span)
    this.fiberContexts.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, newContext)
    this.fiberStartTimes.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, process.hrtime.bigint())
    this.activeFiberCount++
  }

  // ==========================================================================
  // onEnd - Fiber completion
  // ==========================================================================

  override onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    const fiberId = fiber.id().id
    const span = this.fiberSpans.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)

    if (!span) {
      return
    }

    // Check min_duration
    const startTime = this.fiberStartTimes.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    if (startTime) {
      const duration = process.hrtime.bigint() - startTime
      const minDuration = this.parseMinDuration(this.config.performance?.min_duration)
      if (minDuration > 0 && duration < minDuration) {
        this.cleanup(fiber)
        return
      }
    }

    // Set status
    if (Exit.isSuccess(exit)) {
      span.setStatus({ code: OtelApi.SpanStatusCode.OK })
    } else {
      span.setStatus({ code: OtelApi.SpanStatusCode.ERROR, message: 'Fiber failed' })
      span.setAttribute('effect.fiber.failed', true)
    }

    span.end()
    logger.log(`@atrim/unified-tracing: Ended fiber span for fiber ${fiberId}`)

    this.cleanup(fiber)
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private cleanup(fiber: Fiber.RuntimeFiber<unknown, unknown>): void {
    this.fiberSpans.delete(fiber)
    this.fiberContexts.delete(fiber)
    this.fiberStartTimes.delete(fiber)
    this.activeFiberCount--
  }

  private resolveParentContext(fiber: Fiber.RuntimeFiber<unknown, unknown>): OtelApi.Context {
    const fiberContext = fiber.currentContext
    const maybeParentSpan = Context.getOption(fiberContext, EffectTracer.ParentSpan)

    if (Option.isSome(maybeParentSpan)) {
      const effectSpan = maybeParentSpan.value
      return OtelApi.trace.setSpan(
        OtelApi.ROOT_CONTEXT,
        OtelApi.trace.wrapSpanContext({
          traceId: effectSpan.traceId,
          spanId: effectSpan.spanId,
          traceFlags: OtelApi.TraceFlags.SAMPLED
        })
      )
    }

    return OtelApi.ROOT_CONTEXT
  }

  private resolveParentContextFromFiberRefs(
    fiberRefs: FiberRefs.FiberRefs,
    context: Context.Context<unknown>,
    parent: Option.Option<Fiber.RuntimeFiber<unknown, unknown>>
  ): OtelApi.Context {
    // ========================================================================
    // Parent context resolution priority:
    // 1. Effect's ParentSpan in Context (Effect's native span tracking)
    // 2. Active OTel context (auto-bridging from OTel → Effect)
    // 3. Parent fiber's tracked context
    // 4. ROOT_CONTEXT (no parent)
    // ========================================================================

    // 1. Check Effect's ParentSpan in Context
    const maybeParentSpan = Context.getOption(context, EffectTracer.ParentSpan)
    if (Option.isSome(maybeParentSpan)) {
      const effectSpan = maybeParentSpan.value
      logger.log(
        `@atrim/unified-tracing: Using Effect ParentSpan - traceId=${effectSpan.traceId.slice(0, 8)}..., spanId=${effectSpan.spanId.slice(0, 8)}...`
      )
      return OtelApi.trace.setSpan(
        OtelApi.ROOT_CONTEXT,
        OtelApi.trace.wrapSpanContext({
          traceId: effectSpan.traceId,
          spanId: effectSpan.spanId,
          traceFlags: OtelApi.TraceFlags.SAMPLED
        })
      )
    }

    // 2. Auto-bridge: Check active OTel context (OTel → Effect bridging)
    // This allows spans created by non-Effect code (e.g., HTTP middleware) to be parents
    const activeContext = OtelApi.context.active()
    const activeSpan = OtelApi.trace.getSpan(activeContext)
    if (activeSpan && activeSpan.spanContext().traceFlags === OtelApi.TraceFlags.SAMPLED) {
      logger.log(
        `@atrim/unified-tracing: Auto-bridging from active OTel context - spanId=${activeSpan.spanContext().spanId}`
      )
      return activeContext
    }

    // 3. Check parent fiber's tracked context
    if (Option.isSome(parent)) {
      const parentCtx = this.fiberContexts.get(parent.value)
      if (parentCtx) {
        logger.log(`@atrim/unified-tracing: Using parent fiber's context`)
        return parentCtx
      }
    }

    // 4. No parent found
    return OtelApi.ROOT_CONTEXT
  }

  private parseMinDuration(duration: string | undefined): bigint {
    if (!duration || duration === '0ms') return BigInt(0)

    const match = duration.match(/^(\d+)\s*(ms|millis|s|sec|seconds|us|micros)?$/i)
    if (!match) return BigInt(0)

    const value = parseInt(match[1] ?? '0', 10)
    const unit = (match[2] ?? 'ms').toLowerCase()

    switch (unit) {
      case 'us':
      case 'micros':
        return BigInt(value) * BigInt(1000)
      case 'ms':
      case 'millis':
        return BigInt(value) * BigInt(1000000)
      case 's':
      case 'sec':
      case 'seconds':
        return BigInt(value) * BigInt(1000000000)
      default:
        return BigInt(value) * BigInt(1000000)
    }
  }
}

// ============================================================================
// Global TracerProvider Setup
// ============================================================================

const setupGlobalTracerProvider = (): {
  provider: BasicTracerProvider
  spanProcessor: BatchSpanProcessor | SimpleSpanProcessor
} | null => {
  const config = loadFullConfigSync()
  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'
  const exporterConfig = config.effect?.exporter_config ?? {
    type: 'otlp' as const,
    processor: 'batch' as const
  }

  logger.log('@atrim/unified-tracing: Setting up global TracerProvider')
  logger.log(`  Service: ${serviceName}`)
  logger.log(`  Exporter: ${exporterConfig.type}`)

  if (exporterConfig.type === 'none') {
    logger.log('@atrim/unified-tracing: Exporter type is "none", skipping provider setup')
    return null
  }

  let exporter
  if (exporterConfig.type === 'console') {
    exporter = new ConsoleSpanExporter()
  } else {
    const endpoint =
      exporterConfig.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
    const otlpConfig: { url: string; headers?: Record<string, string> } = {
      url: `${endpoint}/v1/traces`
    }
    if (exporterConfig.headers) {
      otlpConfig.headers = exporterConfig.headers
    }
    exporter = new OTLPTraceExporter(otlpConfig)
  }

  let spanProcessor: BatchSpanProcessor | SimpleSpanProcessor
  if (exporterConfig.processor === 'simple' || exporterConfig.type === 'console') {
    spanProcessor = new SimpleSpanProcessor(exporter)
  } else {
    const batchConfig = exporterConfig.batch ?? {
      scheduled_delay_millis: 1000,
      max_export_batch_size: 100
    }
    spanProcessor = new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: batchConfig.scheduled_delay_millis,
      maxExportBatchSize: batchConfig.max_export_batch_size
    })
  }

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion
    }),
    spanProcessors: [spanProcessor]
  })
  OtelApi.trace.setGlobalTracerProvider(provider)
  logger.log('@atrim/unified-tracing: Global TracerProvider registered')

  return { provider, spanProcessor }
}

// Lazy initialization of the global TracerProvider
// Only sets up the provider when first accessed, not at module load time
// This allows tests to set OTEL_EXPORTER_OTLP_ENDPOINT before the provider is created
let _globalProviderSetup: ReturnType<typeof setupGlobalTracerProvider> | undefined

function getGlobalProviderSetup() {
  if (_globalProviderSetup === undefined) {
    _globalProviderSetup = setupGlobalTracerProvider()
  }
  return _globalProviderSetup
}

// ============================================================================
// Layers and Wrappers
// ============================================================================

/**
 * Create the UnifiedTracingLive layer
 */
export const createUnifiedTracingLayer = (): Layer.Layer<never> => {
  const config = loadFullConfigSync()

  const autoConfig = config.effect?.auto_instrumentation ?? {
    enabled: true,
    granularity: 'fiber' as const,
    span_naming: { default: 'effect.{function}', infer_from_source: true, rules: [] },
    span_relationships: { type: 'parent-child' as const },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  if (!getGlobalProviderSetup()) {
    logger.log('@atrim/unified-tracing: No TracerProvider, using empty layer')
    return Layer.empty
  }

  const supervisor = new UnifiedTracingSupervisor(autoConfig)
  const supervisorLayer = Supervisor.addSupervisor(supervisor)

  // Use layerGlobal for HTTP tracing integration with Effect Platform
  // This gives us automatic http.server spans for all endpoints
  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'

  // Create the Resource layer required by layerGlobal
  const resourceLayer = Resource.layer({ serviceName, serviceVersion })

  // effectTracerLayer uses OtelApi.trace.getTracerProvider() internally
  const effectTracerLayer = OtelTracer.layerGlobal

  // Provide Resource to effectTracerLayer and discard the output service
  const tracerWithResource = effectTracerLayer.pipe(Layer.provide(resourceLayer))

  // Enable OpSupervision runtime flag so onEffect hook fires
  // This allows us to trace Effect.all, Effect.forEach, Effect.fork operations
  const opSupervisionLayer = Layer.effectDiscard(
    Effect.patchRuntimeFlags(RuntimeFlagsPatch.enable(RuntimeFlags.OpSupervision))
  )

  // Note: Source location is now captured at build-time via @effect/unplugin
  // No runtime source capture layer is needed
  return Layer.mergeAll(Layer.discard(tracerWithResource), supervisorLayer, opSupervisionLayer)
}

/**
 * Unified Tracing Layer - combines operation and fiber tracing with correct hierarchy
 *
 * NOTE: Uses Layer.suspend to defer provider setup until the layer is actually used.
 * This prevents the global TracerProvider from being set at module import time,
 * allowing tests to set up their own provider first.
 */
export const UnifiedTracingLive: Layer.Layer<never> = Layer.suspend(() =>
  createUnifiedTracingLayer()
)

/**
 * Helper to enable OpSupervision runtime flag
 */
export const enableOpSupervision = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.withRuntimeFlagsPatch(effect, RuntimeFlagsPatch.enable(RuntimeFlags.OpSupervision))

/**
 * Wrap an effect with unified tracing (OpSupervision + layer)
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* Effect.fork(myTask())  // Fork span is parent of fiber span!
 * }).pipe(withUnifiedTracing)
 * ```
 */
export const withUnifiedTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, never>> =>
  effect.pipe(enableOpSupervision, Effect.provide(UnifiedTracingLive))

/**
 * Wrap an effect with auto-tracing using a custom config
 *
 * This is the legacy API for backward compatibility. It allows passing a custom
 * config and optional root span name.
 *
 * @deprecated Use `withUnifiedTracing` with `UnifiedTracingLive` layer instead.
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(withAutoTracing(program, config, 'my-root-span'))
 * ```
 */
export const withAutoTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config?: AutoInstrumentationConfig,
  rootSpanName?: string
): Effect.Effect<A, E, R> => {
  // Create a supervisor with the given config (or default)
  const autoConfig = config ?? {
    enabled: true,
    granularity: 'fiber' as const,
    span_naming: { default: 'effect.{function}', infer_from_source: true, rules: [] },
    span_relationships: { type: 'parent-child' as const },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  const supervisor = new UnifiedTracingSupervisor(autoConfig)
  const supervisorLayer = Supervisor.addSupervisor(supervisor)

  // Enable OpSupervision (source capture is now handled at build-time via @effect/unplugin)
  const opSupervisionLayer = Layer.effectDiscard(
    Effect.patchRuntimeFlags(RuntimeFlagsPatch.enable(RuntimeFlags.OpSupervision))
  )

  const combinedLayer = Layer.mergeAll(supervisorLayer, opSupervisionLayer)

  // Wrap with root span if name provided
  const wrappedEffect = rootSpanName ? effect.pipe(Effect.withSpan(rootSpanName)) : effect

  return wrappedEffect.pipe(Effect.provide(combinedLayer))
}

// ============================================================================
// Provider Shutdown
// ============================================================================

export const flushAndShutdown = async (): Promise<void> => {
  const setup = getGlobalProviderSetup()
  if (setup?.provider) {
    logger.log('@atrim/unified-tracing: Flushing and shutting down TracerProvider...')
    await setup.provider.forceFlush()
    await setup.provider.shutdown()
    logger.log('@atrim/unified-tracing: TracerProvider shutdown complete')
  }
}

export const forceFlush = async (): Promise<void> => {
  const setup = getGlobalProviderSetup()
  if (setup?.provider) {
    logger.log('@atrim/unified-tracing: Force flushing TracerProvider...')
    await setup.provider.forceFlush()
    logger.log('@atrim/unified-tracing: Force flush complete')
  }
}

// ============================================================================
// Re-export span control utilities
// ============================================================================

export {
  withoutAutoTracing,
  setSpanName,
  AutoTracingEnabled,
  AutoTracingSpanName
} from './span-control.js'
