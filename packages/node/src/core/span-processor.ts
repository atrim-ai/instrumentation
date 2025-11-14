/**
 * OpenTelemetry SpanProcessor for pattern-based filtering
 *
 * This processor filters spans based on configured patterns before they are exported.
 * It wraps another processor (typically BatchSpanProcessor) and only forwards spans
 * that match the instrumentation patterns.
 */

import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'
import { PatternMatcher } from '@atrim/instrumentation-core'
import type { InstrumentationConfig } from '@atrim/instrumentation-core'

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
export class PatternSpanProcessor implements SpanProcessor {
  private matcher: PatternMatcher
  private wrappedProcessor: SpanProcessor

  constructor(config: InstrumentationConfig, wrappedProcessor: SpanProcessor) {
    this.matcher = new PatternMatcher(config)
    this.wrappedProcessor = wrappedProcessor
  }

  /**
   * Called when a span is started
   *
   * We check if the span should be instrumented here. If not, we can mark it
   * to be dropped later in onEnd().
   */
  onStart(span: Span, parentContext: Context): void {
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
   */
  onEnd(span: ReadableSpan): void {
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
}
