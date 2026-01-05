/**
 * OpenTelemetry SpanProcessor for pattern-based filtering
 *
 * This processor filters spans based on configured patterns before they are exported.
 * It wraps another processor (typically BatchSpanProcessor) and only forwards spans
 * that match the instrumentation patterns.
 *
 * Filtering is applied at two levels:
 * 1. Span name patterns (instrument_patterns / ignore_patterns)
 * 2. HTTP path patterns (http.ignore_incoming_paths) - for HTTP spans
 */

import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'
import { PatternMatcher, type InstrumentationConfig } from '@atrim/instrument-core'

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
  private httpIgnorePatterns: RegExp[] = []

  constructor(config: InstrumentationConfig, wrappedProcessor: SpanProcessor) {
    this.matcher = new PatternMatcher(config)
    this.wrappedProcessor = wrappedProcessor

    // Compile HTTP ignore patterns for attribute-based filtering
    // These patterns filter spans based on their url.path or http.route attributes
    if (config.http?.ignore_incoming_paths) {
      this.httpIgnorePatterns = config.http.ignore_incoming_paths.map(
        (pattern) => new RegExp(pattern)
      )
    }
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
   * We check both span name patterns and HTTP path patterns.
   */
  onEnd(span: ReadableSpan): void {
    const spanName = span.name

    // 1. Check span name patterns first
    if (!this.matcher.shouldInstrument(spanName)) {
      return // Drop span
    }

    // 2. Check HTTP path patterns against span attributes
    if (this.shouldIgnoreHttpSpan(span)) {
      return // Drop span
    }

    // Forward to wrapped processor for export
    this.wrappedProcessor.onEnd(span)
  }

  /**
   * Check if span should be ignored based on HTTP path attributes
   *
   * This checks the span's url.path, http.route, or http.target attributes
   * against the configured http.ignore_incoming_paths patterns.
   *
   * This enables filtering of Effect HTTP spans (and any other HTTP spans)
   * based on path patterns, which is essential for filtering out OTLP
   * endpoint requests like /v1/traces, /v1/logs, /v1/metrics.
   */
  private shouldIgnoreHttpSpan(span: ReadableSpan): boolean {
    if (this.httpIgnorePatterns.length === 0) {
      return false
    }

    // Get HTTP path from span attributes (standard OpenTelemetry semantic conventions)
    // Try multiple attribute names to handle different instrumentation libraries
    const urlPath = span.attributes['url.path'] as string | undefined
    const httpRoute = span.attributes['http.route'] as string | undefined
    const httpTarget = span.attributes['http.target'] as string | undefined

    const pathToCheck = urlPath || httpRoute || httpTarget
    if (!pathToCheck) {
      return false // Not an HTTP span or no path attribute
    }

    // Check against ignore patterns
    return this.httpIgnorePatterns.some((pattern) => pattern.test(pathToCheck))
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
