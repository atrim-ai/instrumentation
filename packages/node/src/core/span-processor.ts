/**
 * OpenTelemetry SpanProcessor for pattern-based filtering
 *
 * This processor filters spans based on configured patterns before they are exported.
 * It wraps another processor (typically BatchSpanProcessor) and only forwards spans
 * that match the instrumentation patterns.
 *
 * Also maintains an in-memory SpanTree for runtime querying of span hierarchy.
 */

import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'
import { PatternMatcher, type InstrumentationConfig } from '@atrim/instrument-core'
import { SpanTreeImpl, setGlobalSpanTree, type SpanTreeConfig, type SpanTree } from './span-tree.js'

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
  /** SpanTree configuration (optional) */
  spanTreeConfig?: SpanTreeConfig
}

export class PatternSpanProcessor implements SpanProcessor {
  private matcher: PatternMatcher
  private wrappedProcessor: SpanProcessor
  private spanTree: SpanTreeImpl

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
      this.spanTree = new SpanTreeImpl(configOrOptions.spanTreeConfig)
    } else {
      // Legacy constructor for backward compatibility
      this.matcher = new PatternMatcher(configOrOptions)
      this.wrappedProcessor = wrappedProcessor!
      this.spanTree = new SpanTreeImpl()
    }

    // Register as global SpanTree
    setGlobalSpanTree(this.spanTree)
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
    // Always record to SpanTree (for runtime querying)
    this.spanTree.recordStart(span, parentContext)

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

    // Always record to SpanTree (for runtime querying)
    this.spanTree.recordEnd(ctx.spanId, ctx.traceId)

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
   * Get the SpanTree instance for querying span hierarchy
   */
  getSpanTree(): SpanTree {
    return this.spanTree
  }

  /**
   * Get SpanTree stats for monitoring
   */
  getSpanTreeStats(): ReturnType<SpanTreeImpl['getStats']> {
    return this.spanTree.getStats()
  }
}
