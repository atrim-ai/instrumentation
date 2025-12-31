/**
 * OpenTelemetry SpanProcessor for pattern-based filtering
 *
 * This processor filters spans based on configured patterns before they are exported.
 * It wraps another processor (typically BatchSpanProcessor) and only forwards spans
 * that match the instrumentation patterns.
 *
 * Also maintains an in-memory SpanTree for runtime querying of span hierarchy.
 * Supports both legacy sync SpanTree and new Effect-based SpanTreeService.
 */

import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { trace, type Context } from '@opentelemetry/api'
import { PatternMatcher, type InstrumentationConfig } from '@atrim/instrument-core'
import {
  SpanTreeImpl,
  setGlobalSpanTree,
  SpanStarted,
  SpanEnded,
  type SpanTreeConfig,
  type SpanTree,
  type SpanTreeService
} from './span-tree.js'
import { Context as EffectContext } from 'effect'

/**
 * SpanProcessor that filters spans based on pattern configuration
 *
 * This processor sits in the processing pipeline and decides whether a span
 * should be forwarded to the next processor (for export) or dropped.
 *
 * Usage:
 * ```typescript
 * const exporter = new OTLPTraceExporter()
 * const batchProcessor = new BatchSpanProcessor(exporter)
 * const patternProcessor = new PatternSpanProcessor(config, batchProcessor)
 *
 * const sdk = new NodeSDK({
 *   spanProcessor: patternProcessor
 * })
 * ```
 */
export interface PatternSpanProcessorOptions {
  /** Pattern matching configuration */
  config: InstrumentationConfig
  /** The processor to forward matching spans to */
  wrappedProcessor: SpanProcessor
  /** SpanTree configuration (optional, used for legacy mode) */
  spanTreeConfig?: SpanTreeConfig
  /**
   * SpanTreeService instance for Effect-based event processing.
   * If provided, events are pushed via the service's sync interface.
   * If not provided, falls back to legacy SpanTreeImpl.
   */
  spanTreeService?: EffectContext.Tag.Service<typeof SpanTreeService>
  /**
   * Legacy SpanTreeImpl instance for backward compatibility.
   * If provided along with spanTreeService, both will receive events.
   * This allows the global SpanTree API to work with the Effect-based service.
   */
  legacySpanTree?: SpanTreeImpl
}

export class PatternSpanProcessor implements SpanProcessor {
  private matcher: PatternMatcher
  private wrappedProcessor: SpanProcessor
  private spanTree: SpanTreeImpl | null = null
  private spanTreeService: EffectContext.Tag.Service<typeof SpanTreeService> | null = null

  constructor(config: InstrumentationConfig, wrappedProcessor: SpanProcessor)
  constructor(options: PatternSpanProcessorOptions)
  constructor(
    configOrOptions: InstrumentationConfig | PatternSpanProcessorOptions,
    wrappedProcessor?: SpanProcessor
  ) {
    if ('config' in configOrOptions) {
      // New options-based constructor
      this.matcher = new PatternMatcher(configOrOptions.config)
      this.wrappedProcessor = configOrOptions.wrappedProcessor

      if (configOrOptions.spanTreeService) {
        // Use Effect-based SpanTreeService
        this.spanTreeService = configOrOptions.spanTreeService
        // Also use legacy SpanTree if provided (for backward compatibility with global SpanTree API)
        if (configOrOptions.legacySpanTree) {
          this.spanTree = configOrOptions.legacySpanTree
        }
      } else {
        // Fall back to legacy SpanTreeImpl only
        this.spanTree = new SpanTreeImpl(configOrOptions.spanTreeConfig)
        setGlobalSpanTree(this.spanTree)
      }
    } else {
      // Legacy constructor for backward compatibility
      this.matcher = new PatternMatcher(configOrOptions)
      this.wrappedProcessor = wrappedProcessor!
      this.spanTree = new SpanTreeImpl()
      setGlobalSpanTree(this.spanTree)
    }
  }

  /**
   * Set the SpanTreeService after construction.
   * Useful when the service is created asynchronously during SDK initialization.
   */
  setSpanTreeService(service: EffectContext.Tag.Service<typeof SpanTreeService>): void {
    this.spanTreeService = service
    // Clear legacy spanTree if we're switching to the service
    this.spanTree = null
  }

  /**
   * Called when a span is started
   *
   * We check if the span should be instrumented here. If not, we can mark it
   * to be dropped later in onEnd().
   *
   * All spans are recorded in the SpanTree regardless of filtering,
   * to maintain accurate hierarchy for runtime querying.
   */
  onStart(span: Span, parentContext: Context): void {
    const ctx = span.spanContext()
    const parentSpan = trace.getSpan(parentContext)
    const parentSpanId = parentSpan?.spanContext().spanId

    // Record to SpanTree (for runtime querying)
    // Record to both SpanTreeService and legacy SpanTree if both are present
    if (this.spanTreeService) {
      // Effect-based: emit event via sync interface (uses Queue.unsafeOffer internally)
      this.spanTreeService.recordStart(
        new SpanStarted({
          spanId: ctx.spanId,
          traceId: ctx.traceId,
          parentSpanId,
          name: span.name,
          startTimeMs: Date.now()
        })
      )
    }
    // Also record to legacy SpanTree for global API compatibility
    if (this.spanTree) {
      this.spanTree.recordStart(span, parentContext)
    }

    const spanName = span.name

    if (this.matcher.shouldInstrument(spanName)) {
      // Forward to wrapped processor
      this.wrappedProcessor.onStart(span, parentContext)
    }
    // If should not instrument, we simply don't forward to the wrapped processor
    // The span will still be created (for correct parent-child relationships)
    // but won't be exported
  }

  /**
   * Called when a span is ended
   *
   * This is where we make the final decision on whether to export the span.
   * All spans are recorded in the SpanTree regardless of filtering.
   */
  onEnd(span: ReadableSpan): void {
    const ctx = span.spanContext()

    // Record to SpanTree (for runtime querying)
    // Record to both SpanTreeService and legacy SpanTree if both are present
    if (this.spanTreeService) {
      // Effect-based: emit event via sync interface (uses Queue.unsafeOffer internally)
      this.spanTreeService.recordEnd(
        new SpanEnded({
          spanId: ctx.spanId,
          traceId: ctx.traceId,
          endTimeMs: Date.now()
        })
      )
    }
    // Also record to legacy SpanTree for global API compatibility
    if (this.spanTree) {
      this.spanTree.recordEnd(ctx.spanId, ctx.traceId)
    }

    const spanName = span.name

    if (this.matcher.shouldInstrument(spanName)) {
      // Forward to wrapped processor for export
      this.wrappedProcessor.onEnd(span)
    }
    // Otherwise, drop the span (don't export)
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    return this.wrappedProcessor.shutdown()
  }

  /**
   * Force flush any pending spans
   */
  async forceFlush(): Promise<void> {
    return this.wrappedProcessor.forceFlush()
  }

  /**
   * Get the pattern matcher (for debugging/testing)
   */
  getPatternMatcher(): PatternMatcher {
    return this.matcher
  }

  /**
   * Get the legacy SpanTree instance for querying span hierarchy.
   * Returns null if using the Effect-based SpanTreeService.
   */
  getSpanTree(): SpanTree | null {
    return this.spanTree
  }

  /**
   * Get the SpanTreeService instance for Effect-based querying.
   * Returns null if using legacy SpanTreeImpl.
   */
  getSpanTreeService(): EffectContext.Tag.Service<typeof SpanTreeService> | null {
    return this.spanTreeService
  }

  /**
   * Get SpanTree stats for monitoring (legacy mode only).
   * For Effect-based stats, use spanTreeService.stats instead.
   */
  getSpanTreeStats(): ReturnType<SpanTreeImpl['getStats']> | null {
    return this.spanTree?.getStats() ?? null
  }

  /**
   * Check if the processor is using Effect-based SpanTreeService
   */
  isUsingSpanTreeService(): boolean {
    return this.spanTreeService !== null
  }
}
