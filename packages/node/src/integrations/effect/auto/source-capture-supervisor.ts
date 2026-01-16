/**
 * Source Capture Supervisor for Effect-TS (POC)
 *
 * Uses Effect's native source capture feature (from @clayroach/effect@3.19.14-source-capture.0)
 * to automatically capture call-site locations when fibers are forked.
 *
 * This is the POC implementation for issue #145:
 * https://github.com/atrim-ai/instrumentation/issues/145
 *
 * @example
 * ```typescript
 * import { SourceCaptureTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   yield* Effect.fork(doWork())  // Automatically traced with source location!
 * }).pipe(Effect.provide(SourceCaptureTracingLive))
 *
 * // Span name will be "effect.sendEmail (user-handlers.ts:42)" instead of "effect.anonymous"
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
  Tracer as EffectTracer,
  GlobalValue
} from 'effect'
import { Tracer as OtelTracer } from '@effect/opentelemetry'
import * as fs from 'node:fs'
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

// ============================================================================
// Types
// ============================================================================

/**
 * Source location captured by Effect's native source capture feature
 */
export interface SourceLocation {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly functionName?: string
}

/**
 * Access Effect's native currentSourceLocation FiberRef
 *
 * Effect stores this FiberRef using globalValue with a well-known symbol.
 * We access it the same way to avoid importing from internal modules.
 *
 * @internal
 */
const currentSourceLocation = GlobalValue.globalValue(
  Symbol.for('effect/FiberRef/currentSourceLocation'),
  () => FiberRef.unsafeMake<SourceLocation | undefined>(undefined)
)

// ============================================================================
// Source Code Parsing for Function Name Extraction
// ============================================================================

/**
 * Cache for source file contents to avoid repeated file reads
 */
const sourceFileCache = new Map<string, string[]>()

/**
 * Extract the function name from source code at the given location
 *
 * Parses the source line to find what's being passed to Effect.fork(),
 * Effect.forkDaemon(), etc.
 *
 * Example: `yield* Effect.fork(sendEmail(...))` -> "sendEmail"
 */
function extractFunctionNameFromSource(location: SourceLocation): string | undefined {
  try {
    // Get cached lines or read file
    let lines = sourceFileCache.get(location.file)
    if (!lines) {
      // Only cache files, skip if file doesn't exist
      if (!fs.existsSync(location.file)) {
        return undefined
      }
      const content = fs.readFileSync(location.file, 'utf-8')
      lines = content.split('\n')
      sourceFileCache.set(location.file, lines)
    }

    // Get the line (1-indexed)
    const lineIndex = location.line - 1
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return undefined
    }

    const line = lines[lineIndex]
    if (!line) return undefined

    // Look for patterns like:
    // - Effect.fork(functionName(...))
    // - Effect.forkDaemon(functionName(...))
    // - tracedFork(functionName(...))
    // The column points to the start of Effect.fork or similar

    // Extract the portion of the line from the column onwards
    const fromColumn = line.slice(location.column - 1)

    // Pattern to match: fork/forkDaemon/forkScoped followed by (functionName
    // We want to capture the function name being passed
    const forkPattern = /(?:fork|forkDaemon|forkScoped|forkIn)\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/
    const match = fromColumn.match(forkPattern)

    if (match && match[1]) {
      return match[1]
    }

    // Also try looking backwards from column for yield* pattern
    // Pattern: yield* Effect.fork(name
    const fullLinePattern =
      /(?:fork|forkDaemon|forkScoped|forkIn)\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/
    const fullMatch = line.match(fullLinePattern)

    if (fullMatch && fullMatch[1]) {
      return fullMatch[1]
    }

    return undefined
  } catch {
    // Silently fail - source parsing is best-effort
    return undefined
  }
}

// ============================================================================
// FiberRefs for opt-out and name override
// ============================================================================

/**
 * FiberRef to enable/disable auto-tracing for specific fibers
 */
export const AutoTracingEnabled = FiberRef.unsafeMake<boolean>(true)

/**
 * FiberRef to override auto-generated span name
 */
export const AutoTracingSpanName = FiberRef.unsafeMake<Option.Option<string>>(Option.none())

// ============================================================================
// SourceCaptureSupervisor
// ============================================================================

/**
 * Supervisor that uses Effect's native source capture to create spans with
 * meaningful names based on the actual call site of Effect.fork().
 *
 * This supervisor reads from `currentSourceLocation` FiberRef which is
 * populated automatically by Effect when source capture is enabled via
 * `Layer.enableSourceCapture` or `Effect.withCaptureStackTraces(true)`.
 */
export class SourceCaptureSupervisor extends Supervisor.AbstractSupervisor<void> {
  // WeakMap to associate fibers with their OTel spans
  private readonly fiberSpans = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, OtelApi.Span>()

  // WeakMap for fiber start times (for min_duration filtering)
  private readonly fiberStartTimes = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, bigint>()

  // OpenTelemetry tracer - lazily initialized
  private _tracer: OtelApi.Tracer | null = null

  // Active fiber count (for max_concurrent limiting)
  private activeFiberCount = 0

  // Default root span for fibers without a ParentSpan in their context
  // This enables auto-instrumentation without requiring Effect.withSpan()
  private _rootSpan: OtelApi.Span | null = null

  constructor(private readonly config: AutoInstrumentationConfig) {
    super()
    logger.log('@atrim/source-capture: Supervisor initialized (native source capture)')
    logger.log(`  Granularity: ${config.granularity || 'fiber'}`)
    logger.log(`  Sampling rate: ${config.performance?.sampling_rate ?? 1.0}`)
  }

  /**
   * Set the default root span for auto-instrumentation.
   * Fibers without a ParentSpan will use this as their parent.
   */
  setRootSpan(span: OtelApi.Span): void {
    this._rootSpan = span
    logger.log(`@atrim/source-capture: Root span set - spanId=${span.spanContext().spanId}`)
  }

  /**
   * Get the root span (if set)
   */
  get rootSpan(): OtelApi.Span | null {
    return this._rootSpan
  }

  /**
   * Get the tracer lazily from global OTel API
   */
  private get tracer(): OtelApi.Tracer {
    if (!this._tracer) {
      logger.log('@atrim/source-capture: Getting tracer from global API')
      this._tracer = OtelApi.trace.getTracer('@atrim/source-capture', '1.0.0')
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
   * Called when a fiber starts executing
   */
  override onStart<A, E, R>(
    _context: Context.Context<R>,
    _effect: Effect.Effect<A, E, R>,
    parent: Option.Option<Fiber.RuntimeFiber<unknown, unknown>>,
    fiber: Fiber.RuntimeFiber<A, E>
  ): void {
    const fiberId = fiber.id().id
    logger.log(`@atrim/source-capture: onStart called for fiber ${fiberId}`)

    // Check if auto-tracing is enabled for this fiber
    const fiberRefsValue = fiber.getFiberRefs()
    const enabled = FiberRefs.getOrDefault(fiberRefsValue, AutoTracingEnabled)
    if (!enabled) {
      logger.log(`@atrim/source-capture: Auto-tracing disabled for fiber ${fiberId}`)
      return
    }

    // Check sampling
    const samplingRate = this.config.performance?.sampling_rate ?? 1.0
    if (samplingRate < 1.0 && Math.random() > samplingRate) {
      return
    }

    // Check max concurrent
    const maxConcurrent = this.config.performance?.max_concurrent ?? 0
    if (maxConcurrent > 0 && this.activeFiberCount >= maxConcurrent) {
      return
    }

    // Check for span name override
    const nameOverride = FiberRefs.getOrDefault(fiberRefsValue, AutoTracingSpanName)

    // ============================================================================
    // KEY: Read native source location from Effect's FiberRef
    // This is populated automatically when source capture is enabled!
    // ============================================================================
    const nativeSourceLocation = FiberRefs.getOrDefault(fiberRefsValue, currentSourceLocation) as
      | SourceLocation
      | undefined

    if (nativeSourceLocation) {
      logger.log(`@atrim/source-capture: Found native source location for fiber ${fiberId}`)
      logger.log(`  file: ${nativeSourceLocation.file}`)
      logger.log(`  line: ${nativeSourceLocation.line}`)
      logger.log(`  column: ${nativeSourceLocation.column}`)
      logger.log(`  functionName: ${nativeSourceLocation.functionName ?? 'N/A'}`)
    } else {
      logger.log(
        `@atrim/source-capture: No source location for fiber ${fiberId} (source capture may be disabled)`
      )
    }

    // Generate span name
    let spanName: string
    let extractedFuncName: string | undefined
    if (Option.isSome(nameOverride)) {
      spanName = nameOverride.value
    } else if (nativeSourceLocation) {
      // Try to extract the actual function name from source code
      // This parses the source line to find what's being passed to Effect.fork()
      extractedFuncName = extractFunctionNameFromSource(nativeSourceLocation)

      // Use extracted name, or fall back to stack trace functionName, or 'anonymous'
      const funcName = extractedFuncName ?? nativeSourceLocation.functionName ?? 'anonymous'
      const fileName = nativeSourceLocation.file.split('/').pop() ?? 'unknown'
      spanName = `effect.${funcName} (${fileName}:${nativeSourceLocation.line})`

      if (extractedFuncName) {
        logger.log(
          `@atrim/source-capture: Extracted function name "${extractedFuncName}" from source`
        )
      }
    } else {
      // Fallback to fiber ID
      spanName = `effect.fiber-${fiberId}`
    }

    // Get parent span context
    // Priority: Effect ParentSpan (from context) > parent fiber's span > no parent
    let parentContext: OtelApi.Context = OtelApi.ROOT_CONTEXT
    let parentFiberId: number | undefined

    // First, try to get the Effect parent span from the context
    const maybeEffectParentSpan = Context.getOption(_context, EffectTracer.ParentSpan)

    if (Option.isSome(maybeEffectParentSpan)) {
      const effectSpan = maybeEffectParentSpan.value
      logger.log(
        `@atrim/source-capture: Found ParentSpan - traceId=${effectSpan.traceId}, spanId=${effectSpan.spanId}`
      )

      // Create an OTel SpanContext from the Effect span's identifiers
      const otelSpanContext: OtelApi.SpanContext = {
        traceId: effectSpan.traceId,
        spanId: effectSpan.spanId,
        traceFlags: effectSpan.sampled ? OtelApi.TraceFlags.SAMPLED : OtelApi.TraceFlags.NONE,
        isRemote: false
      }

      // Wrap the SpanContext in a span object for proper parent-child linking
      const wrappedSpan = OtelApi.trace.wrapSpanContext(otelSpanContext)
      parentContext = OtelApi.trace.setSpan(OtelApi.ROOT_CONTEXT, wrappedSpan)
    } else if (Option.isSome(parent)) {
      // Fiber has a parent fiber - try to find its span
      parentFiberId = parent.value.id().id
      const parentSpan = this.fiberSpans.get(parent.value)
      if (parentSpan) {
        parentContext = OtelApi.trace.setSpan(OtelApi.ROOT_CONTEXT, parentSpan)
      }
    }

    // Also capture parent fiber ID for metadata
    if (Option.isSome(parent)) {
      parentFiberId = parent.value.id().id
    }

    // Build span attributes
    const attributes: OtelApi.Attributes = {
      'effect.auto_traced': true,
      'effect.source_capture': true,
      'effect.fiber.id': fiberId
    }

    // Add source location attributes (OTel semantic conventions for code)
    if (nativeSourceLocation) {
      // Use extracted function name if available, otherwise fall back to stack trace name
      attributes['code.function'] =
        extractedFuncName ?? nativeSourceLocation.functionName ?? 'anonymous'
      attributes['code.filepath'] = nativeSourceLocation.file
      attributes['code.lineno'] = nativeSourceLocation.line
      attributes['code.column'] = nativeSourceLocation.column
    }

    // Add parent fiber info
    if (parentFiberId !== undefined) {
      attributes['effect.fiber.parent_id'] = parentFiberId
    }

    // Create the span
    const span = this.tracer.startSpan(
      spanName,
      {
        kind: OtelApi.SpanKind.INTERNAL,
        attributes
      },
      parentContext
    )

    logger.log(`@atrim/source-capture: Created span "${spanName}" for fiber ${fiberId}`)

    // Store span and start time
    this.fiberSpans.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, span)
    this.fiberStartTimes.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, process.hrtime.bigint())
    this.activeFiberCount++
  }

  /**
   * Called when a fiber completes (success or failure)
   */
  override onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    const fiberId = fiber.id().id
    logger.log(`@atrim/source-capture: onEnd called for fiber ${fiberId}`)

    const span = this.fiberSpans.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    if (!span) {
      logger.log(`@atrim/source-capture: No span found for fiber ${fiberId} (skipped or filtered)`)
      return
    }

    // Check min_duration filtering
    const startTime = this.fiberStartTimes.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    if (startTime) {
      const duration = process.hrtime.bigint() - startTime
      const minDuration = this.parseMinDuration(this.config.performance?.min_duration)
      if (minDuration > 0 && duration < minDuration) {
        // Drop span if too short
        this.fiberSpans.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
        this.fiberStartTimes.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
        this.activeFiberCount--
        return
      }
    }

    // Set span status based on exit
    if (Exit.isSuccess(exit)) {
      span.setStatus({ code: OtelApi.SpanStatusCode.OK })
    } else {
      span.setStatus({
        code: OtelApi.SpanStatusCode.ERROR,
        message: 'Fiber failed'
      })
      span.setAttribute('effect.fiber.failed', true)
    }

    // End the span
    span.end()
    logger.log(`@atrim/source-capture: Ended span for fiber ${fiberId}`)

    // Cleanup
    this.fiberSpans.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    this.fiberStartTimes.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    this.activeFiberCount--
  }

  /**
   * Parse min_duration string to nanoseconds
   */
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
        return BigInt(value) * BigInt(1000000) // Default to ms
    }
  }
}

// ============================================================================
// Global TracerProvider Setup
// ============================================================================

/**
 * Sets up the global TracerProvider synchronously.
 * This MUST happen before any layers try to access the global provider.
 *
 * Returns the provider and span processor for reference (needed for shutdown).
 */
const setupGlobalTracerProvider = (): {
  provider: BasicTracerProvider
  spanProcessor: BatchSpanProcessor | SimpleSpanProcessor
} | null => {
  // Load config synchronously
  const config = loadFullConfigSync()

  // Get service info
  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'

  // Get exporter config
  const exporterConfig = config.effect?.exporter_config ?? {
    type: 'otlp' as const,
    processor: 'batch' as const
  }

  logger.log('@atrim/source-capture: Setting up global TracerProvider')
  logger.log(`  Service: ${serviceName}`)
  logger.log(`  Exporter: ${exporterConfig.type}`)

  // Handle 'none' type
  if (exporterConfig.type === 'none') {
    logger.log('@atrim/source-capture: Exporter type is "none", skipping provider setup')
    return null
  }

  // Create span exporter based on config
  let exporter
  if (exporterConfig.type === 'console') {
    logger.log('@atrim/source-capture: Using ConsoleSpanExporter')
    exporter = new ConsoleSpanExporter()
  } else {
    const endpoint =
      exporterConfig.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
    logger.log(`@atrim/source-capture: Using OTLPTraceExporter (${endpoint})`)

    const otlpConfig: { url: string; headers?: Record<string, string> } = {
      url: `${endpoint}/v1/traces`
    }
    if (exporterConfig.headers) {
      otlpConfig.headers = exporterConfig.headers
      logger.log(
        `@atrim/source-capture: Using headers: ${Object.keys(exporterConfig.headers).join(', ')}`
      )
    }

    exporter = new OTLPTraceExporter(otlpConfig)
  }

  // Create span processor
  let spanProcessor: BatchSpanProcessor | SimpleSpanProcessor
  if (exporterConfig.processor === 'simple' || exporterConfig.type === 'console') {
    logger.log('@atrim/source-capture: Using SimpleSpanProcessor')
    spanProcessor = new SimpleSpanProcessor(exporter)
  } else {
    const batchConfig = exporterConfig.batch ?? {
      scheduled_delay_millis: 1000,
      max_export_batch_size: 100
    }
    logger.log('@atrim/source-capture: Using BatchSpanProcessor')
    spanProcessor = new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: batchConfig.scheduled_delay_millis,
      maxExportBatchSize: batchConfig.max_export_batch_size
    })
  }

  // Create and set global provider
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion
    }),
    spanProcessors: [spanProcessor]
  })
  OtelApi.trace.setGlobalTracerProvider(provider)
  logger.log('@atrim/source-capture: Global TracerProvider registered')

  return { provider, spanProcessor }
}

// Set up the global TracerProvider immediately at module load time
// This ensures it's available before any Effect layers try to access it
const globalProviderSetup = setupGlobalTracerProvider()

// ============================================================================
// Layers
// ============================================================================

/**
 * Create the SourceCaptureTracingLive layer
 *
 * This layer:
 * 1. Enables Effect's native source capture via Layer.enableSourceCapture
 * 2. Uses the global TracerProvider (set at module load time)
 * 3. Adds the SourceCaptureSupervisor that reads native source locations
 *
 * The key difference from CombinedTracingLive is that this uses Effect's
 * NATIVE source capture instead of our manual tracedFork() workaround.
 */
export const createSourceCaptureTracingLayer = (): Layer.Layer<never> => {
  // Load config synchronously for supervisor
  const config = loadFullConfigSync()

  // Get auto-tracing config for supervisor
  const autoConfig = config.effect?.auto_instrumentation ?? {
    enabled: true,
    granularity: 'fiber' as const,
    span_naming: {
      default: 'effect.{function}',
      infer_from_source: true,
      rules: []
    },
    span_relationships: {
      type: 'parent-child' as const
    },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  // Handle case where provider wasn't set up (exporter type = 'none')
  if (!globalProviderSetup) {
    logger.log('@atrim/source-capture: No TracerProvider, using empty layer')
    return Layer.empty
  }

  // Create Supervisor layer for fiber-level tracing
  const supervisor = new SourceCaptureSupervisor(autoConfig)
  const supervisorLayer = Supervisor.addSupervisor(supervisor)

  logger.log('@atrim/source-capture: Creating layer')
  logger.log('  - Source capture: ENABLED via Layer.enableSourceCapture')
  logger.log('  - Effect.withSpan(): exports to OTel via our tracer')
  logger.log('  - Forked fibers: auto-traced via SourceCaptureSupervisor')

  // Create Effect Tracer layer that DIRECTLY uses our global provider's tracer
  // Use layerWithoutOtelTracer (not layerGlobal) so we can provide our own tracer
  const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
  const serviceVersion = process.env.npm_package_version || '1.0.0'

  // Get tracer directly from our global provider (set at module load time)
  const otelTracer = OtelApi.trace.getTracer(serviceName, serviceVersion)
  logger.log(`@atrim/source-capture: Using tracer "${serviceName}" from our provider`)

  // Use layerWithoutOtelTracer and provide our tracer directly
  // This ensures the Effect tracer uses our TracerProvider's tracer
  const effectTracerLayer = OtelTracer.layerWithoutOtelTracer.pipe(
    Layer.provide(Layer.succeed(OtelTracer.OtelTracer, otelTracer))
  )

  // Compose all layers
  return Layer.mergeAll(effectTracerLayer, Layer.enableSourceCapture, supervisorLayer)
}

/**
 * Native Source Capture Tracing Layer (POC for issue #145)
 *
 * This layer uses Effect's NATIVE source capture feature to automatically
 * capture call-site locations when fibers are forked. No more need for
 * manual `tracedFork()` calls!
 *
 * **Key difference from CombinedTracingLive:**
 * - CombinedTracingLive: Requires `tracedFork()` wrapper for source capture
 * - SourceCaptureTracingLive: Uses Effect's native source capture (no wrappers!)
 *
 * @example
 * ```yaml
 * # instrumentation.yaml
 * effect:
 *   auto_instrumentation:
 *     enabled: true
 *   exporter_config:
 *     type: console  # or 'otlp'
 * ```
 *
 * @example
 * ```typescript
 * import { SourceCaptureTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   // Just use regular Effect.fork() - no wrapper needed!
 *   yield* Effect.fork(sendEmail())  // Span: "effect.sendEmail (user-handlers.ts:42)"
 *   yield* Effect.fork(processOrder())  // Span: "effect.processOrder (order-service.ts:18)"
 * }).pipe(Effect.provide(SourceCaptureTracingLive))
 *
 * Effect.runPromise(program)
 * ```
 */
export const SourceCaptureTracingLive: Layer.Layer<never> = createSourceCaptureTracingLayer()

// ============================================================================
// Opt-out utilities
// ============================================================================

/**
 * Disable auto-tracing for a specific Effect
 */
export const withoutAutoTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => effect.pipe(Effect.locally(AutoTracingEnabled, false))

/**
 * Override the auto-generated span name for a specific Effect
 */
export const setSpanName =
  (name: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(Effect.locally(AutoTracingSpanName, Option.some(name)))

/**
 * Disable source capture for a hot path (opt-out)
 *
 * Use this to disable source capture for performance-critical code paths
 * where the ~0.001ms overhead is unacceptable.
 */
export const withoutSourceCapture = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => Effect.withCaptureStackTraces(false)(effect)

// ============================================================================
// Provider Shutdown
// ============================================================================

/**
 * Flush all pending spans and shutdown the TracerProvider.
 * Call this before your application exits to ensure all spans are exported.
 *
 * @example
 * ```typescript
 * import { flushAndShutdown } from '@atrim/instrument-node/effect/auto'
 *
 * // At the end of your application
 * await flushAndShutdown()
 * process.exit(0)
 * ```
 */
export const flushAndShutdown = async (): Promise<void> => {
  if (globalProviderSetup?.provider) {
    logger.log('@atrim/source-capture: Flushing and shutting down TracerProvider...')
    await globalProviderSetup.provider.forceFlush()
    await globalProviderSetup.provider.shutdown()
    logger.log('@atrim/source-capture: TracerProvider shutdown complete')
  }
}

/**
 * Force flush all pending spans without shutting down.
 * Use this if you need to ensure spans are exported but want to continue tracing.
 */
export const forceFlush = async (): Promise<void> => {
  if (globalProviderSetup?.provider) {
    logger.log('@atrim/source-capture: Force flushing TracerProvider...')
    await globalProviderSetup.provider.forceFlush()
    logger.log('@atrim/source-capture: Force flush complete')
  }
}
