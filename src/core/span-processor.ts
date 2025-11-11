/**
 * OpenTelemetry SpanProcessor for pattern-based filtering
 */
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base'

export class PatternSpanProcessor implements SpanProcessor {
  // TODO: Implement PatternSpanProcessor
  onStart(): void {}
  onEnd(): void {}
  shutdown(): Promise<void> {
    return Promise.resolve()
  }
  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
}
