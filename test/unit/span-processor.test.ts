/**
 * Unit tests for span-processor
 */
import { describe, it, expect, vi } from 'vitest'
import { PatternSpanProcessor } from '../../src/core/span-processor.js'
import type { InstrumentationConfig } from '../../src/core/instrumentation-schema.js'
import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'

// Mock span for testing
function createMockSpan(name: string): ReadableSpan {
  return {
    name,
    spanContext: () => ({
      traceId: 'test-trace-id',
      spanId: 'test-span-id',
      traceFlags: 1
    }),
    startTime: [0, 0],
    endTime: [0, 0],
    status: { code: 0 },
    attributes: {},
    events: [],
    duration: [0, 0],
    ended: true,
    instrumentationLibrary: { name: 'test', version: '1.0.0' },
    resource: {} as any,
    kind: 0,
    links: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0
  } as ReadableSpan
}

// Mock wrapped processor
function createMockProcessor(): SpanProcessor & {
  onStartCalls: Array<{ span: Span; context: Context }>
  onEndCalls: Array<ReadableSpan>
} {
  return {
    onStartCalls: [],
    onEndCalls: [],
    onStart(span: Span, context: Context) {
      this.onStartCalls.push({ span, context })
    },
    onEnd(span: ReadableSpan) {
      this.onEndCalls.push(span)
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
    forceFlush: vi.fn().mockResolvedValue(undefined)
  }
}

describe('span-processor', () => {
  describe('PatternSpanProcessor', () => {
    it('should forward spans that match instrument patterns', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      const span = createMockSpan('app.operation')
      processor.onEnd(span)

      expect(mockProcessor.onEndCalls).toHaveLength(1)
      expect(mockProcessor.onEndCalls[0]?.name).toBe('app.operation')
    })

    it('should drop spans that match ignore patterns', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: [{ pattern: '^app\\.health', enabled: true }]
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      const span = createMockSpan('app.health')
      processor.onEnd(span)

      // Should not forward to wrapped processor
      expect(mockProcessor.onEndCalls).toHaveLength(0)
    })

    it('should forward spans with fail-open behavior', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      // Span that doesn't match any pattern should still be forwarded (fail-open)
      const span = createMockSpan('database.query')
      processor.onEnd(span)

      expect(mockProcessor.onEndCalls).toHaveLength(1)
      expect(mockProcessor.onEndCalls[0]?.name).toBe('database.query')
    })

    it('should drop all spans when globally disabled', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: false,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      const span = createMockSpan('app.operation')
      processor.onEnd(span)

      // Should not forward when globally disabled
      expect(mockProcessor.onEndCalls).toHaveLength(0)
    })

    it('should forward shutdown calls to wrapped processor', async () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [],
          ignore_patterns: []
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      await processor.shutdown()

      expect(mockProcessor.shutdown).toHaveBeenCalledOnce()
    })

    it('should forward forceFlush calls to wrapped processor', async () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [],
          ignore_patterns: []
        }
      }

      const mockProcessor = createMockProcessor()
      const processor = new PatternSpanProcessor(config, mockProcessor)

      await processor.forceFlush()

      expect(mockProcessor.forceFlush).toHaveBeenCalledOnce()
    })
  })
})
