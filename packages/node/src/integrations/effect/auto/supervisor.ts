/**
 * Auto-Tracing Supervisor for Effect-TS
 *
 * Provides automatic tracing of all Effect fibers without manual Effect.withSpan() calls.
 * Uses Effect's Supervisor API to intercept fiber creation/termination and create
 * OpenTelemetry spans automatically.
 *
 * @example
 * ```typescript
 * import { AutoTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   yield* doWork()  // Automatically traced!
 * }).pipe(Effect.provide(AutoTracingLive))
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
  Fiber
} from 'effect'
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
import type { AutoInstrumentationConfig, ExporterConfig } from '@atrim/instrument-core'
import { logger } from '@atrim/instrument-core'
import { inferSpanName, type SourceInfo } from './naming.js'
import { loadAutoTracingConfig, loadFullConfig } from './config.js'

// ============================================================================
// FiberRefs for opt-out and name override
// ============================================================================

/**
 * FiberRef to enable/disable auto-tracing for specific fibers
 * Use withoutAutoTracing() to disable
 */
export const AutoTracingEnabled = FiberRef.unsafeMake<boolean>(true)

/**
 * FiberRef to override auto-generated span name
 * Use setSpanName() to override
 */
export const AutoTracingSpanName = FiberRef.unsafeMake<Option.Option<string>>(Option.none())

// ============================================================================
// AutoTracingSupervisor
// ============================================================================

/**
 * Supervisor that automatically creates OpenTelemetry spans for all Effect fibers
 *
 * This supervisor intercepts fiber creation and termination, creating spans
 * based on configuration from instrumentation.yaml.
 */
export class AutoTracingSupervisor extends Supervisor.AbstractSupervisor<void> {
  // WeakMap to associate fibers with their OTel spans
  private readonly fiberSpans = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, OtelApi.Span>()

  // WeakMap for fiber start times (for min_duration filtering)
  private readonly fiberStartTimes = new WeakMap<Fiber.RuntimeFiber<unknown, unknown>, bigint>()

  // OpenTelemetry tracer - lazily initialized
  private _tracer: OtelApi.Tracer | null = null

  // Compiled filter patterns
  private readonly includePatterns: RegExp[]
  private readonly excludePatterns: RegExp[]

  // Active fiber count (for max_concurrent limiting)
  private activeFiberCount = 0

  // Root span for parent context (set by withAutoTracing)
  private _rootSpan: OtelApi.Span | null = null

  constructor(private readonly config: AutoInstrumentationConfig) {
    super()

    // Compile filter patterns
    this.includePatterns = (config.filter?.include || []).map((p) => new RegExp(p))
    this.excludePatterns = (config.filter?.exclude || []).map((p) => new RegExp(p))

    logger.log('@atrim/auto-trace: Supervisor initialized')
    logger.log(`  Granularity: ${config.granularity || 'fiber'}`)
    logger.log(`  Sampling rate: ${config.performance?.sampling_rate ?? 1.0}`)
    logger.log(`  Infer from source: ${config.span_naming?.infer_from_source ?? true}`)
  }

  /**
   * Set the root span for parent context propagation
   */
  setRootSpan(span: OtelApi.Span): void {
    this._rootSpan = span
  }

  /**
   * Get the tracer lazily - this allows time for the NodeSdk layer to register the global provider
   */
  private get tracer(): OtelApi.Tracer {
    if (!this._tracer) {
      this._tracer = OtelApi.trace.getTracer('@atrim/auto-trace', '1.0.0')
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
    // Check if auto-tracing is enabled for this fiber
    // Note: FiberRef access in supervisor hooks must be synchronous
    const fiberRefsValue = fiber.getFiberRefs()
    const enabled = FiberRefs.getOrDefault(fiberRefsValue, AutoTracingEnabled)
    if (!enabled) {
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

    // Parse source info for span naming and attributes
    const sourceInfo = this.config.span_naming?.infer_from_source
      ? this.parseStackTrace()
      : undefined

    // Infer span name
    let spanName: string
    if (Option.isSome(nameOverride)) {
      spanName = nameOverride.value
    } else {
      spanName = inferSpanName(fiber.id().id, sourceInfo, this.config)
    }

    // Check filter patterns
    if (!this.shouldTrace(spanName)) {
      return
    }

    // Get parent span context and fiber ID if available
    let parentContext = OtelApi.context.active()
    let parentFiberId: number | undefined
    if (Option.isSome(parent)) {
      parentFiberId = parent.value.id().id
      const parentSpan = this.fiberSpans.get(parent.value)
      if (parentSpan) {
        parentContext = OtelApi.trace.setSpan(parentContext, parentSpan)
      }
    } else if (this._rootSpan) {
      // No fiber parent, but we have a root span - use it as the parent
      parentContext = OtelApi.trace.setSpan(parentContext, this._rootSpan)
    }

    // Create the span with full attributes
    const span = this.tracer.startSpan(
      spanName,
      {
        kind: OtelApi.SpanKind.INTERNAL,
        attributes: this.getInitialAttributes(fiber, sourceInfo, parentFiberId)
      },
      parentContext
    )

    // Store span and start time
    this.fiberSpans.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, span)
    this.fiberStartTimes.set(fiber as Fiber.RuntimeFiber<unknown, unknown>, process.hrtime.bigint())
    this.activeFiberCount++
  }

  /**
   * Called when a fiber completes (success or failure)
   */
  override onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    const span = this.fiberSpans.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    if (!span) {
      return
    }

    // Check min_duration filtering
    const startTime = this.fiberStartTimes.get(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    if (startTime) {
      const duration = process.hrtime.bigint() - startTime
      const minDuration = this.parseMinDuration(this.config.performance?.min_duration)
      if (minDuration > 0 && duration < minDuration) {
        // Drop span if too short
        // Note: We can't actually "drop" a started span, but we can avoid ending it properly
        // In practice, this means the span will have no end time which is not ideal
        // A better approach would be to delay span creation, but that's more complex
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
      // Set error status
      span.setStatus({
        code: OtelApi.SpanStatusCode.ERROR,
        message: 'Fiber failed'
      })
      span.setAttribute('effect.fiber.failed', true)
    }

    // End the span
    span.end()

    // Cleanup
    this.fiberSpans.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    this.fiberStartTimes.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>)
    this.activeFiberCount--
  }

  /**
   * Check if a span name should be traced based on filter patterns
   */
  private shouldTrace(spanName: string): boolean {
    // Check exclude patterns first (they take precedence)
    for (const pattern of this.excludePatterns) {
      if (pattern.test(spanName)) {
        return false
      }
    }

    // If include patterns are specified, span must match at least one
    if (this.includePatterns.length > 0) {
      for (const pattern of this.includePatterns) {
        if (pattern.test(spanName)) {
          return true
        }
      }
      return false
    }

    // No include patterns = trace everything not excluded
    return true
  }

  /**
   * Get initial span attributes for a fiber
   */
  private getInitialAttributes(
    fiber: Fiber.RuntimeFiber<unknown, unknown>,
    sourceInfo: SourceInfo | undefined,
    parentFiberId: number | undefined
  ): OtelApi.Attributes {
    const attrs: OtelApi.Attributes = {
      'effect.auto_traced': true
    }

    // Add fiber info
    if (this.config.metadata?.fiber_info !== false) {
      attrs['effect.fiber.id'] = fiber.id().id
    }

    // Add source location info
    if (this.config.metadata?.source_location !== false && sourceInfo) {
      attrs['code.function'] = sourceInfo.function
      attrs['code.filepath'] = sourceInfo.file
      attrs['code.lineno'] = sourceInfo.line
      attrs['code.column'] = sourceInfo.column
    }

    // Add parent fiber info
    if (this.config.metadata?.parent_fiber !== false && parentFiberId !== undefined) {
      attrs['effect.fiber.parent_id'] = parentFiberId
    }

    return attrs
  }

  /**
   * Parse stack trace to get source info
   */
  private parseStackTrace(): SourceInfo | undefined {
    const stack = new Error().stack
    if (!stack) return undefined

    const lines = stack.split('\n')
    // Skip Error, parseStackTrace, onStart, Effect internals
    // Look for first line that's not from effect or this module
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue

      if (
        !line.includes('node_modules/effect') &&
        !line.includes('@atrim/instrument') &&
        !line.includes('auto/supervisor')
      ) {
        // Parse line like "    at functionName (file:line:col)"
        const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/)
        if (match) {
          const [, funcName, filePath, lineNum, colNum] = match
          return {
            function: funcName ?? 'anonymous',
            file: filePath ?? 'unknown',
            line: parseInt(lineNum ?? '0', 10),
            column: parseInt(colNum ?? '0', 10)
          }
        }
      }
    }

    return undefined
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
// Layers and factory functions
// ============================================================================

/**
 * Create a custom AutoTracingSupervisor with the given config
 */
export const createAutoTracingSupervisor = (
  config: AutoInstrumentationConfig
): AutoTracingSupervisor => {
  return new AutoTracingSupervisor(config)
}

/**
 * Layer that provides auto-tracing with custom configuration
 *
 * @example
 * ```typescript
 * const CustomAutoTracing = createAutoTracingLayer({
 *   enabled: true,
 *   span_naming: {
 *     default: 'app.{function}',
 *     rules: [{ match: { file: 'src/services/.*' }, name: 'service.{function}' }]
 *   }
 * })
 * ```
 */
export const createAutoTracingLayer = (options?: {
  config?: AutoInstrumentationConfig
}): Layer.Layer<never> => {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // Load config from options or instrumentation.yaml
      const config = options?.config ?? (yield* loadAutoTracingConfig())

      if (!config.enabled) {
        logger.log('@atrim/auto-trace: Auto-tracing disabled via config')
        return Layer.empty
      }

      // Create supervisor
      const supervisor = createAutoTracingSupervisor(config)

      // Return layer that adds the supervisor
      return Supervisor.addSupervisor(supervisor)
    })
  )
}

/**
 * Wrap an Effect with auto-tracing supervision
 *
 * This creates a span for the main effect AND supervises all child fibers.
 * Use this when you need to ensure all fibers in an effect are traced.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* doWork()  // Automatically traced!
 * })
 *
 * const tracedProgram = withAutoTracing(program, { enabled: true, ... })
 * Effect.runPromise(tracedProgram)
 * ```
 */
export const withAutoTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config: AutoInstrumentationConfig,
  mainSpanName?: string
): Effect.Effect<A, E, R> => {
  if (!config.enabled) {
    logger.log('@atrim/auto-trace: Auto-tracing disabled via config')
    return effect
  }

  const supervisor = createAutoTracingSupervisor(config)

  // Get the tracer
  const tracer = OtelApi.trace.getTracer('@atrim/auto-trace', '1.0.0')

  // Determine span name for main effect
  const spanName = mainSpanName ?? inferSpanName(0, undefined, config)

  // Start span for main effect
  const mainSpan = tracer.startSpan(spanName, {
    kind: OtelApi.SpanKind.INTERNAL,
    attributes: {
      'effect.auto_traced': true,
      'effect.fiber.id': 0, // Main fiber
      'effect.main_fiber': true
    }
  })

  // Set the root span on the supervisor so child fibers use it as parent
  supervisor.setRootSpan(mainSpan)

  // Wrap the effect to handle the main span lifecycle
  return Effect.acquireUseRelease(
    // Acquire: return the span (already started)
    Effect.succeed(mainSpan),
    // Use: run the supervised effect
    () => Effect.supervised(supervisor)(effect),
    // Release: end the span
    (span, exit) =>
      Effect.sync(() => {
        if (Exit.isSuccess(exit)) {
          span.setStatus({ code: OtelApi.SpanStatusCode.OK })
        } else {
          span.setStatus({
            code: OtelApi.SpanStatusCode.ERROR,
            message: 'Effect failed'
          })
        }
        span.end()
      })
  )
}

/**
 * Zero-config auto-tracing layer
 *
 * Loads configuration from instrumentation.yaml and automatically traces
 * all Effect fibers based on the configuration.
 *
 * @example
 * ```typescript
 * import { AutoTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * const program = Effect.gen(function* () {
 *   yield* doWork()  // Automatically traced!
 * }).pipe(Effect.provide(AutoTracingLive))
 * ```
 */
export const AutoTracingLive: Layer.Layer<never> = createAutoTracingLayer()

// ============================================================================
// Opt-out utilities
// ============================================================================

/**
 * Disable auto-tracing for a specific Effect
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* publicWork()  // Traced
 *   yield* withoutAutoTracing(internalWork())  // NOT traced
 * })
 * ```
 */
export const withoutAutoTracing = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => effect.pipe(Effect.locally(AutoTracingEnabled, false))

/**
 * Override the auto-generated span name for a specific Effect
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* setSpanName('custom.operation.name')(myEffect)
 * })
 * ```
 */
export const setSpanName =
  (name: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(Effect.locally(AutoTracingSpanName, Option.some(name)))

// ============================================================================
// Full Auto-Instrumentation Layer (Exporter + Supervisor)
// ============================================================================

/**
 * Create and register a global TracerProvider based on exporter config
 *
 * Unlike @effect/opentelemetry's NodeSdk.layer(), this function creates a
 * standard OTel BasicTracerProvider and registers it globally so that
 * the AutoTracingSupervisor can access it via the OTel API.
 */
const createExporterLayer = (
  exporterConfig: ExporterConfig | undefined,
  serviceName: string,
  serviceVersion: string
): Layer.Layer<never> => {
  const config = exporterConfig ?? {
    type: 'otlp' as const,
    processor: 'batch' as const,
    batch: {
      scheduled_delay_millis: 1000,
      max_export_batch_size: 100
    }
  }

  // Handle 'none' type - no exporter
  if (config.type === 'none') {
    logger.log('@atrim/auto-trace: Exporter type is "none", no spans will be exported')
    return Layer.empty
  }

  // Create the span exporter
  const createSpanExporter = () => {
    if (config.type === 'console') {
      logger.log('@atrim/auto-trace: Using ConsoleSpanExporter')
      return new ConsoleSpanExporter()
    }

    // Default to OTLP
    const endpoint =
      config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
    logger.log(`@atrim/auto-trace: Using OTLPTraceExporter (${endpoint})`)
    return new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`
    })
  }

  // Create the span processor
  const createSpanProcessor = () => {
    const exporter = createSpanExporter()

    if (config.processor === 'simple' || config.type === 'console') {
      logger.log('@atrim/auto-trace: Using SimpleSpanProcessor')
      return new SimpleSpanProcessor(exporter)
    }

    // Default to batch processor
    const batchConfig = config.batch ?? {
      scheduled_delay_millis: 1000,
      max_export_batch_size: 100
    }
    logger.log('@atrim/auto-trace: Using BatchSpanProcessor')
    return new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: batchConfig.scheduled_delay_millis,
      maxExportBatchSize: batchConfig.max_export_batch_size
    })
  }

  // Create a Layer that sets up the global TracerProvider
  // This uses Effect.sync to run setup synchronously when the layer is built
  return Layer.effectDiscard(
    Effect.sync(() => {
      // Create the provider with resource info
      const provider = new BasicTracerProvider({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: serviceName,
          [ATTR_SERVICE_VERSION]: serviceVersion
        }),
        spanProcessors: [createSpanProcessor()]
      })

      // Register as the global tracer provider using OTel API
      // (BasicTracerProvider.register() was removed in v2, use OTel API directly)
      OtelApi.trace.setGlobalTracerProvider(provider)
      logger.log('@atrim/auto-trace: Global TracerProvider registered')

      // Return cleanup function (not used by Layer.effectDiscard but good practice)
      return () => {
        provider.shutdown().catch((err) => {
          logger.log(`@atrim/auto-trace: Error shutting down provider: ${err}`)
        })
      }
    })
  )
}

/**
 * Create a fully YAML-driven auto-instrumentation layer
 *
 * This layer reads all configuration from instrumentation.yaml including:
 * - Exporter configuration (type, endpoint, processor)
 * - Auto-tracing configuration (naming rules, filters, performance)
 * - Service metadata (name, version)
 *
 * @example
 * ```typescript
 * import { createFullAutoTracingLayer } from '@atrim/instrument-node/effect/auto'
 *
 * // Everything configured via instrumentation.yaml - no code config needed!
 * const AppLive = createFullAutoTracingLayer()
 *
 * Effect.runPromise(program.pipe(Effect.provide(AppLive)))
 * ```
 */
export const createFullAutoTracingLayer = (): Layer.Layer<never> => {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      // Load full config from instrumentation.yaml
      const config = yield* loadFullConfig()

      // Get service info from env or defaults
      const serviceName = process.env.OTEL_SERVICE_NAME || 'effect-service'
      const serviceVersion = process.env.npm_package_version || '1.0.0'

      // Get auto-tracing config
      const autoConfig = config.effect?.auto_instrumentation

      // If auto-instrumentation is disabled, return empty layer
      if (!autoConfig?.enabled) {
        logger.log('@atrim/auto-trace: Auto-instrumentation disabled via config')
        return Layer.empty
      }

      // Get exporter config
      const exporterConfig = config.effect?.exporter_config

      // Log configuration
      logger.log('@atrim/auto-trace: Full auto-instrumentation enabled')
      logger.log(`  Service: ${serviceName}`)
      logger.log(`  Exporter: ${exporterConfig?.type ?? 'otlp'}`)

      // Create exporter layer
      const exporterLayer = createExporterLayer(exporterConfig, serviceName, serviceVersion)

      // Create supervisor
      const supervisor = createAutoTracingSupervisor(autoConfig)
      const supervisorLayer = Supervisor.addSupervisor(supervisor)

      // Merge both layers
      return Layer.mergeAll(exporterLayer, supervisorLayer)
    })
  )
}

/**
 * Fully YAML-driven auto-instrumentation layer
 *
 * This is the recommended way to use auto-instrumentation. All configuration
 * comes from instrumentation.yaml - no code configuration needed.
 *
 * @example
 * ```yaml
 * # instrumentation.yaml
 * effect:
 *   auto_instrumentation:
 *     enabled: true
 *     span_naming:
 *       default: "effect.{function}"
 *       rules:
 *         - match: { function: "internal.*" }
 *           name: "internal.{function}"
 *     filter:
 *       exclude:
 *         - "^internal\\."
 *   exporter_config:
 *     type: otlp              # or 'console' for dev
 *     endpoint: http://localhost:4318
 *     processor: batch        # or 'simple' for dev
 * ```
 *
 * @example
 * ```typescript
 * import { FullAutoTracingLive } from '@atrim/instrument-node/effect/auto'
 *
 * // Just provide the layer - everything else from YAML!
 * Effect.runPromise(program.pipe(Effect.provide(FullAutoTracingLive)))
 * ```
 */
export const FullAutoTracingLive: Layer.Layer<never> = createFullAutoTracingLayer()
