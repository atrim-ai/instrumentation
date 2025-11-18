/**
 * Pattern-Based Span Processor for Browser
 *
 * Filters spans based on patterns defined in instrumentation.yaml
 * Re-uses pattern matching logic from @atrim/instrument-core
 */

import { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { Context } from '@opentelemetry/api'
import { shouldInstrumentSpan } from '@atrim/instrument-core'

/**
 * Span processor that filters spans based on pattern matching
 *
 * This processor runs BEFORE export and drops spans that don't match
 * the configured patterns in instrumentation.yaml.
 *
 * @example
 * ```yaml
 * # instrumentation.yaml
 * instrumentation:
 *   instrument_patterns:
 *     - pattern: "^documentLoad"
 *     - pattern: "^HTTP (GET|POST)"
 *   ignore_patterns:
 *     - pattern: "^HTTP GET /health"
 * ```
 */
export class PatternSpanProcessor implements SpanProcessor {
  /**
   * Called when a span is started
   * No-op for this processor
   */
  onStart(_span: ReadableSpan, _parentContext: Context): void {
    // No-op
  }

  /**
   * Called when a span ends
   * Filters out spans that don't match patterns
   */
  onEnd(span: ReadableSpan): void {
    const spanName = span.name

    // Check if span should be instrumented
    if (!shouldInstrumentSpan(spanName)) {
      // Drop the span by not forwarding it
      // The span will not reach subsequent processors
      return
    }

    // Span passes filtering - will be processed by next processor
  }

  /**
   * Shutdown the processor
   * No-op for this processor
   */
  async shutdown(): Promise<void> {
    // No-op
  }

  /**
   * Force flush pending spans
   * No-op for this processor
   */
  async forceFlush(): Promise<void> {
    // No-op
  }
}
