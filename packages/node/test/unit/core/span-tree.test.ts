/**
 * Unit tests for SpanTree - in-memory span tree with query API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SpanTreeImpl, resetGlobalSpanTree } from '../../../src/core/span-tree.js'
import type { Span } from '@opentelemetry/sdk-trace-base'
import type { Context, SpanContext } from '@opentelemetry/api'
import { ROOT_CONTEXT } from '@opentelemetry/api'

// Mock span factory
function createMockSpan(name: string, spanId: string, traceId: string): Span {
  return {
    name,
    spanContext: () => ({
      spanId,
      traceId,
      traceFlags: 1,
      traceState: undefined
    })
  } as Span
}

// Mock parent context with span
function createParentContext(parentSpanId: string, traceId: string): Context {
  // Create a context that will return the parent span when trace.getSpan() is called
  const mockContext = {
    getValue: () => ({
      spanContext: () => ({
        spanId: parentSpanId,
        traceId,
        traceFlags: 1
      })
    }),
    setValue: () => mockContext,
    deleteValue: () => mockContext
  } as unknown as Context
  return mockContext
}

describe('SpanTree', () => {
  let spanTree: SpanTreeImpl

  beforeEach(() => {
    spanTree = new SpanTreeImpl()
    resetGlobalSpanTree()
  })

  afterEach(() => {
    spanTree.reset()
  })

  describe('basic span recording', () => {
    it('should record a span start', () => {
      const span = createMockSpan('test-span', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)

      const info = spanTree.getSpan('span-1')
      expect(info).toBeDefined()
      expect(info?.name).toBe('test-span')
      expect(info?.spanId).toBe('span-1')
      expect(info?.traceId).toBe('trace-1')
      expect(info?.status).toBe('running')
    })

    it('should record a span end', () => {
      const span = createMockSpan('test-span', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)
      spanTree.recordEnd('span-1', 'trace-1')

      const info = spanTree.getSpan('span-1')
      expect(info?.status).toBe('ended')
      expect(info?.endTime).toBeDefined()
    })

    it('should track spans by trace', () => {
      const span1 = createMockSpan('span-1', 'span-1', 'trace-1')
      const span2 = createMockSpan('span-2', 'span-2', 'trace-1')
      const span3 = createMockSpan('span-3', 'span-3', 'trace-2')

      spanTree.recordStart(span1, ROOT_CONTEXT)
      spanTree.recordStart(span2, ROOT_CONTEXT)
      spanTree.recordStart(span3, ROOT_CONTEXT)

      const trace1Spans = spanTree.getTraceSpans('trace-1')
      const trace2Spans = spanTree.getTraceSpans('trace-2')

      expect(trace1Spans.length).toBe(2)
      expect(trace2Spans.length).toBe(1)
    })
  })

  describe('path queries', () => {
    it('should return path for root span', () => {
      const span = createMockSpan('root', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)

      const path = spanTree.getPath('span-1')
      expect(path).toEqual(['root'])
    })

    it('should return formatted path', () => {
      const span = createMockSpan('root', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)

      const formatted = spanTree.getFormattedPath('span-1')
      expect(formatted).toBe('root')
    })

    it('should return empty path for unknown span', () => {
      const path = spanTree.getPath('unknown')
      expect(path).toEqual([])
    })
  })

  describe('nested spans and hierarchy', () => {
    it('should build parent-child relationships', () => {
      // Create root span
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      // Create child span with parent context
      const child = createMockSpan('child', 'span-child', 'trace-1')
      const parentContext = createParentContext('span-root', 'trace-1')
      spanTree.recordStart(child, parentContext)

      const children = spanTree.getChildren('span-root')
      expect(children.length).toBe(1)
      expect(children[0].name).toBe('child')
    })

    it('should return path through hierarchy', () => {
      // root -> child -> grandchild
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child = createMockSpan('child', 'span-child', 'trace-1')
      const childContext = createParentContext('span-root', 'trace-1')
      spanTree.recordStart(child, childContext)

      const grandchild = createMockSpan('grandchild', 'span-grandchild', 'trace-1')
      const grandchildContext = createParentContext('span-child', 'trace-1')
      spanTree.recordStart(grandchild, grandchildContext)

      const path = spanTree.getPath('span-grandchild')
      expect(path).toEqual(['root', 'child', 'grandchild'])
    })

    it('should get deepest path in trace', () => {
      // root -> child1 (depth 2)
      // root -> child2 -> grandchild (depth 3) <- deepest
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child1 = createMockSpan('child1', 'span-child1', 'trace-1')
      spanTree.recordStart(child1, createParentContext('span-root', 'trace-1'))

      const child2 = createMockSpan('child2', 'span-child2', 'trace-1')
      spanTree.recordStart(child2, createParentContext('span-root', 'trace-1'))

      const grandchild = createMockSpan('grandchild', 'span-grandchild', 'trace-1')
      spanTree.recordStart(grandchild, createParentContext('span-child2', 'trace-1'))

      const deepest = spanTree.getDeepestPath('trace-1')
      expect(deepest).toEqual(['root', 'child2', 'grandchild'])
      expect(spanTree.getMaxDepth('trace-1')).toBe(3)
    })
  })

  describe('leaf spans', () => {
    it('should identify leaf spans (no children)', () => {
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child = createMockSpan('child', 'span-child', 'trace-1')
      spanTree.recordStart(child, createParentContext('span-root', 'trace-1'))

      const leaves = spanTree.getLeafSpans('trace-1')
      expect(leaves.length).toBe(1)
      expect(leaves[0].name).toBe('child')
    })

    it('should return all leaves in complex tree', () => {
      // root -> child1 (leaf)
      //      -> child2 -> grandchild (leaf)
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child1 = createMockSpan('child1', 'span-child1', 'trace-1')
      spanTree.recordStart(child1, createParentContext('span-root', 'trace-1'))

      const child2 = createMockSpan('child2', 'span-child2', 'trace-1')
      spanTree.recordStart(child2, createParentContext('span-root', 'trace-1'))

      const grandchild = createMockSpan('grandchild', 'span-grandchild', 'trace-1')
      spanTree.recordStart(grandchild, createParentContext('span-child2', 'trace-1'))

      const leaves = spanTree.getLeafSpans('trace-1')
      expect(leaves.length).toBe(2)
      expect(leaves.map((l) => l.name).sort()).toEqual(['child1', 'grandchild'])
    })
  })

  describe('trace summary', () => {
    it('should return complete trace summary', () => {
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child = createMockSpan('child', 'span-child', 'trace-1')
      spanTree.recordStart(child, createParentContext('span-root', 'trace-1'))

      const summary = spanTree.getTraceSummary('trace-1', {
        traceUrlBase: 'https://honeycomb.io'
      })

      expect(summary.traceId).toBe('trace-1')
      expect(summary.depth).toBe(2)
      expect(summary.spanCount).toBe(2)
      expect(summary.formattedPath).toBe('root → child')
      expect(summary.traceUrl).toBe('https://honeycomb.io/trace/trace-1')
    })

    it('should handle trace URL with trailing slash', () => {
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const summary = spanTree.getTraceSummary('trace-1', {
        traceUrlBase: 'https://honeycomb.io/'
      })

      expect(summary.traceUrl).toBe('https://honeycomb.io/trace/trace-1')
    })
  })

  describe('memory management', () => {
    it('should respect maxSpans limit', () => {
      const tree = new SpanTreeImpl({ maxSpans: 5, maxTraces: 10 })

      // Add 10 spans (should evict old ones)
      for (let i = 0; i < 10; i++) {
        const span = createMockSpan(`span-${i}`, `span-${i}`, `trace-${i}`)
        tree.recordStart(span, ROOT_CONTEXT)
      }

      const stats = tree.getStats()
      expect(stats.spanCount).toBeLessThanOrEqual(5)
    })

    it('should respect maxTraces limit', () => {
      const tree = new SpanTreeImpl({ maxSpans: 100, maxTraces: 3 })

      // Add 10 traces
      for (let i = 0; i < 10; i++) {
        const span = createMockSpan(`span-${i}`, `span-${i}`, `trace-${i}`)
        tree.recordStart(span, ROOT_CONTEXT)
      }

      const stats = tree.getStats()
      expect(stats.traceCount).toBeLessThanOrEqual(3)
    })

    it('should clear trace data on explicit clear', () => {
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      expect(spanTree.getTraceSpans('trace-1').length).toBe(1)

      spanTree.clear('trace-1')

      expect(spanTree.getTraceSpans('trace-1').length).toBe(0)
      expect(spanTree.getSpan('span-root')).toBeUndefined()
    })

    it('should schedule cleanup after all spans end', async () => {
      vi.useFakeTimers()

      const tree = new SpanTreeImpl({ ttlMs: 100 })

      const root = createMockSpan('root', 'span-root', 'trace-1')
      tree.recordStart(root, ROOT_CONTEXT)
      tree.recordEnd('span-root', 'trace-1')

      // Data should still exist immediately
      expect(tree.getSpan('span-root')).toBeDefined()

      // Advance past TTL
      vi.advanceTimersByTime(150)

      // Data should be cleaned up
      expect(tree.getSpan('span-root')).toBeUndefined()

      vi.useRealTimers()
    })

    it('should estimate memory usage', () => {
      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      const child = createMockSpan('child', 'span-child', 'trace-1')
      spanTree.recordStart(child, createParentContext('span-root', 'trace-1'))

      const stats = spanTree.getStats()
      expect(stats.estimatedMemoryBytes).toBeGreaterThan(0)
      // Rough check: 2 spans * ~420 bytes each + overhead
      expect(stats.estimatedMemoryBytes).toBeGreaterThan(800)
      expect(stats.estimatedMemoryBytes).toBeLessThan(2000)
    })

    it('should detect memory warning', () => {
      // Create a tree and add many spans
      for (let i = 0; i < 100; i++) {
        const span = createMockSpan(`span-${i}`, `span-${i}`, 'trace-1')
        spanTree.recordStart(span, ROOT_CONTEXT)
      }

      // Should not warn at low threshold
      expect(spanTree.isMemoryWarning(1024 * 1024)).toBe(false)

      // Should warn at very low threshold
      expect(spanTree.isMemoryWarning(1000)).toBe(true)
    })
  })

  describe('disabled state', () => {
    it('should not record when disabled', () => {
      const tree = new SpanTreeImpl({ enabled: false })

      const span = createMockSpan('test', 'span-1', 'trace-1')
      tree.recordStart(span, ROOT_CONTEXT)

      expect(tree.getSpan('span-1')).toBeUndefined()
      expect(tree.isEnabled()).toBe(false)
    })

    it('should return empty results when disabled', () => {
      const tree = new SpanTreeImpl({ enabled: false })

      expect(tree.getPath('any')).toEqual([])
      expect(tree.getDeepestPath('any')).toEqual([])
      expect(tree.getTraceSpans('any')).toEqual([])
      expect(tree.getChildren('any')).toEqual([])
    })
  })

  describe('utility methods', () => {
    it('should check if span is running', () => {
      const span = createMockSpan('test', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)

      expect(spanTree.isRunning('span-1')).toBe(true)

      spanTree.recordEnd('span-1', 'trace-1')

      expect(spanTree.isRunning('span-1')).toBe(false)
    })

    it('should build trace URL', () => {
      const url = spanTree.getTraceUrl('trace-123', 'https://app.datadoghq.com')
      expect(url).toBe('https://app.datadoghq.com/trace/trace-123')
    })

    it('should reset all data', () => {
      const span = createMockSpan('test', 'span-1', 'trace-1')
      spanTree.recordStart(span, ROOT_CONTEXT)

      spanTree.reset()

      expect(spanTree.getStats().spanCount).toBe(0)
      expect(spanTree.getStats().traceCount).toBe(0)
    })
  })
})
