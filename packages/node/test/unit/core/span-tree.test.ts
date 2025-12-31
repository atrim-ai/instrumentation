/**
 * Unit tests for SpanTree - in-memory span tree with query API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Effect } from 'effect'
import {
  SpanTreeImpl,
  resetGlobalSpanTree,
  makeSpanTreeService,
  SpanStarted,
  SpanEnded
} from '../../../src/core/span-tree.js'
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

    it('should find deepest path among multiple branches with varying depths', () => {
      // Build a tree with multiple branches at different depths:
      // root -> branch1 -> level2 -> level3 -> level4 (depth 5)
      //      -> branch2 -> level2b (depth 3)
      //      -> branch3 -> level2c -> level3c -> level4c -> level5c -> level6c (depth 7) <- deepest
      //      -> branch4 (depth 2)

      const root = createMockSpan('root', 'span-root', 'trace-1')
      spanTree.recordStart(root, ROOT_CONTEXT)

      // Branch 1: depth 5
      const branch1 = createMockSpan('branch1', 'span-branch1', 'trace-1')
      spanTree.recordStart(branch1, createParentContext('span-root', 'trace-1'))

      const b1_level2 = createMockSpan('b1-level2', 'span-b1-l2', 'trace-1')
      spanTree.recordStart(b1_level2, createParentContext('span-branch1', 'trace-1'))

      const b1_level3 = createMockSpan('b1-level3', 'span-b1-l3', 'trace-1')
      spanTree.recordStart(b1_level3, createParentContext('span-b1-l2', 'trace-1'))

      const b1_level4 = createMockSpan('b1-level4', 'span-b1-l4', 'trace-1')
      spanTree.recordStart(b1_level4, createParentContext('span-b1-l3', 'trace-1'))

      // Branch 2: depth 3
      const branch2 = createMockSpan('branch2', 'span-branch2', 'trace-1')
      spanTree.recordStart(branch2, createParentContext('span-root', 'trace-1'))

      const b2_level2 = createMockSpan('b2-level2', 'span-b2-l2', 'trace-1')
      spanTree.recordStart(b2_level2, createParentContext('span-branch2', 'trace-1'))

      // Branch 3: depth 7 (deepest)
      const branch3 = createMockSpan('branch3', 'span-branch3', 'trace-1')
      spanTree.recordStart(branch3, createParentContext('span-root', 'trace-1'))

      const b3_level2 = createMockSpan('b3-level2', 'span-b3-l2', 'trace-1')
      spanTree.recordStart(b3_level2, createParentContext('span-branch3', 'trace-1'))

      const b3_level3 = createMockSpan('b3-level3', 'span-b3-l3', 'trace-1')
      spanTree.recordStart(b3_level3, createParentContext('span-b3-l2', 'trace-1'))

      const b3_level4 = createMockSpan('b3-level4', 'span-b3-l4', 'trace-1')
      spanTree.recordStart(b3_level4, createParentContext('span-b3-l3', 'trace-1'))

      const b3_level5 = createMockSpan('b3-level5', 'span-b3-l5', 'trace-1')
      spanTree.recordStart(b3_level5, createParentContext('span-b3-l4', 'trace-1'))

      const b3_level6 = createMockSpan('b3-level6', 'span-b3-l6', 'trace-1')
      spanTree.recordStart(b3_level6, createParentContext('span-b3-l5', 'trace-1'))

      // Branch 4: depth 2
      const branch4 = createMockSpan('branch4', 'span-branch4', 'trace-1')
      spanTree.recordStart(branch4, createParentContext('span-root', 'trace-1'))

      // Verify deepest path is branch3 with depth 7
      const deepest = spanTree.getDeepestPath('trace-1')
      expect(deepest).toEqual([
        'root',
        'branch3',
        'b3-level2',
        'b3-level3',
        'b3-level4',
        'b3-level5',
        'b3-level6'
      ])
      expect(spanTree.getMaxDepth('trace-1')).toBe(7)

      // Verify other branch depths
      const branch1Path = spanTree.getPath('span-b1-l4')
      expect(branch1Path.length).toBe(5)

      const branch2Path = spanTree.getPath('span-b2-l2')
      expect(branch2Path.length).toBe(3)

      const branch4Path = spanTree.getPath('span-branch4')
      expect(branch4Path.length).toBe(2)
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

// ============================================
// Effect-Based SpanTreeService Tests
// ============================================

describe('SpanTreeService (Effect-based)', () => {
  describe('event recording', () => {
    it('should record span events and query after flush', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Record a span start
          const accepted = service.recordStart(
            new SpanStarted({
              spanId: 'span-1',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )
          expect(accepted).toBe(true)

          // Flush to ensure event is processed
          yield* service.flush

          // Query the path
          const path = yield* service.getPath('span-1')
          expect(path).toEqual(['root'])
        }).pipe(Effect.scoped)
      )
    })

    it('should build parent-child hierarchy', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Record root span
          service.recordStart(
            new SpanStarted({
              spanId: 'span-root',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )

          // Record child span
          service.recordStart(
            new SpanStarted({
              spanId: 'span-child',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          const path = yield* service.getPath('span-child')
          expect(path).toEqual(['root', 'child'])

          const children = yield* service.getChildren('span-root')
          expect(children.length).toBe(1)
          expect(children[0].name).toBe('child')
        }).pipe(Effect.scoped)
      )
    })

    it('should record span end and update status', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          service.recordStart(
            new SpanStarted({
              spanId: 'span-1',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'test',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush
          let isRunning = yield* service.isRunning('span-1')
          expect(isRunning).toBe(true)

          service.recordEnd(
            new SpanEnded({
              spanId: 'span-1',
              traceId: 'trace-1',
              endTimeMs: Date.now()
            })
          )

          yield* service.flush
          isRunning = yield* service.isRunning('span-1')
          expect(isRunning).toBe(false)

          const spanInfo = yield* service.getSpan('span-1')
          expect(spanInfo?.status).toBe('ended')
          expect(spanInfo?.endTime).toBeDefined()
        }).pipe(Effect.scoped)
      )
    })
  })

  describe('trace queries', () => {
    it('should get deepest path in trace', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // root -> child1 (depth 2)
          // root -> child2 -> grandchild (depth 3) <- deepest
          service.recordStart(
            new SpanStarted({
              spanId: 'span-root',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-child1',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child1',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-child2',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child2',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-grandchild',
              traceId: 'trace-1',
              parentSpanId: 'span-child2',
              name: 'grandchild',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          const deepest = yield* service.getDeepestPath('trace-1')
          expect(deepest).toEqual(['root', 'child2', 'grandchild'])

          const maxDepth = yield* service.getMaxDepth('trace-1')
          expect(maxDepth).toBe(3)
        }).pipe(Effect.scoped)
      )
    })

    it('should find deepest path among multiple branches with varying depths', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Build a tree with multiple branches at different depths:
          // root -> branch1 -> level2 -> level3 -> level4 (depth 5)
          //      -> branch2 -> level2b (depth 3)
          //      -> branch3 -> level2c -> level3c -> level4c -> level5c -> level6c (depth 7) <- deepest
          //      -> branch4 (depth 2)

          // Root
          service.recordStart(
            new SpanStarted({
              spanId: 'span-root',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )

          // Branch 1: depth 5
          service.recordStart(
            new SpanStarted({
              spanId: 'span-branch1',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'branch1',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b1-l2',
              traceId: 'trace-1',
              parentSpanId: 'span-branch1',
              name: 'b1-level2',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b1-l3',
              traceId: 'trace-1',
              parentSpanId: 'span-b1-l2',
              name: 'b1-level3',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b1-l4',
              traceId: 'trace-1',
              parentSpanId: 'span-b1-l3',
              name: 'b1-level4',
              startTimeMs: Date.now()
            })
          )

          // Branch 2: depth 3
          service.recordStart(
            new SpanStarted({
              spanId: 'span-branch2',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'branch2',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b2-l2',
              traceId: 'trace-1',
              parentSpanId: 'span-branch2',
              name: 'b2-level2',
              startTimeMs: Date.now()
            })
          )

          // Branch 3: depth 7 (deepest)
          service.recordStart(
            new SpanStarted({
              spanId: 'span-branch3',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'branch3',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b3-l2',
              traceId: 'trace-1',
              parentSpanId: 'span-branch3',
              name: 'b3-level2',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b3-l3',
              traceId: 'trace-1',
              parentSpanId: 'span-b3-l2',
              name: 'b3-level3',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b3-l4',
              traceId: 'trace-1',
              parentSpanId: 'span-b3-l3',
              name: 'b3-level4',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b3-l5',
              traceId: 'trace-1',
              parentSpanId: 'span-b3-l4',
              name: 'b3-level5',
              startTimeMs: Date.now()
            })
          )
          service.recordStart(
            new SpanStarted({
              spanId: 'span-b3-l6',
              traceId: 'trace-1',
              parentSpanId: 'span-b3-l5',
              name: 'b3-level6',
              startTimeMs: Date.now()
            })
          )

          // Branch 4: depth 2
          service.recordStart(
            new SpanStarted({
              spanId: 'span-branch4',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'branch4',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          // Verify deepest path is branch3 with depth 7
          const deepest = yield* service.getDeepestPath('trace-1')
          expect(deepest).toEqual([
            'root',
            'branch3',
            'b3-level2',
            'b3-level3',
            'b3-level4',
            'b3-level5',
            'b3-level6'
          ])

          const maxDepth = yield* service.getMaxDepth('trace-1')
          expect(maxDepth).toBe(7)

          // Verify other branch depths
          const branch1Path = yield* service.getPath('span-b1-l4')
          expect(branch1Path.length).toBe(5)

          const branch2Path = yield* service.getPath('span-b2-l2')
          expect(branch2Path.length).toBe(3)

          const branch4Path = yield* service.getPath('span-branch4')
          expect(branch4Path.length).toBe(2)
        }).pipe(Effect.scoped)
      )
    })

    it('should get trace summary', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          service.recordStart(
            new SpanStarted({
              spanId: 'span-root',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-child',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          const summary = yield* service.getTraceSummary('trace-1', {
            traceUrlBase: 'https://honeycomb.io'
          })

          expect(summary.traceId).toBe('trace-1')
          expect(summary.depth).toBe(2)
          expect(summary.spanCount).toBe(2)
          expect(summary.formattedPath).toBe('root → child')
          expect(summary.traceUrl).toBe('https://honeycomb.io/trace/trace-1')
        }).pipe(Effect.scoped)
      )
    })

    it('should get leaf spans', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // root -> child1 (leaf)
          //      -> child2 -> grandchild (leaf)
          service.recordStart(
            new SpanStarted({
              spanId: 'span-root',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'root',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-child1',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child1',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-child2',
              traceId: 'trace-1',
              parentSpanId: 'span-root',
              name: 'child2',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-grandchild',
              traceId: 'trace-1',
              parentSpanId: 'span-child2',
              name: 'grandchild',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          const leaves = yield* service.getLeafSpans('trace-1')
          expect(leaves.length).toBe(2)
          expect(leaves.map((l) => l.name).sort()).toEqual(['child1', 'grandchild'])
        }).pipe(Effect.scoped)
      )
    })
  })

  describe('queue behavior', () => {
    it('should handle queue overflow with sliding strategy', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          // Create service with small queue
          const service = yield* makeSpanTreeService({ queueCapacity: 3 })

          // Fill queue beyond capacity
          for (let i = 0; i < 10; i++) {
            service.recordStart(
              new SpanStarted({
                spanId: `span-${i}`,
                traceId: 'trace-1',
                parentSpanId: undefined,
                name: `span-${i}`,
                startTimeMs: Date.now()
              })
            )
          }

          yield* service.flush

          // Should have processed some spans (sliding drops oldest)
          const stats = yield* service.stats
          expect(stats.spanCount).toBeGreaterThan(0)
          // With sliding queue, newer events survive
        }).pipe(Effect.scoped)
      )
    })
  })

  describe('memory statistics', () => {
    it('should provide accurate memory estimates', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Add some spans
          for (let i = 0; i < 10; i++) {
            service.recordStart(
              new SpanStarted({
                spanId: `span-${i}`,
                traceId: 'trace-1',
                parentSpanId: i > 0 ? `span-${i - 1}` : undefined,
                name: `span-${i}`,
                startTimeMs: Date.now()
              })
            )
          }

          yield* service.flush

          const stats = yield* service.stats
          expect(stats.spanCount).toBe(10)
          expect(stats.traceCount).toBe(1)
          expect(stats.memory.totalBytes).toBeGreaterThan(0)
          expect(stats.memory.spanRecordsBytes).toBeGreaterThan(0)
          expect(stats.memory.avgBytesPerSpan).toBeGreaterThan(0)
          expect(stats.memory.estimatedCapacityPercent).toBeGreaterThan(0)
          expect(stats.memory.estimatedCapacityPercent).toBeLessThan(1) // 10 out of 10000 default
        }).pipe(Effect.scoped)
      )
    })

    it('should track child references in memory', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Create parent with multiple children
          service.recordStart(
            new SpanStarted({
              spanId: 'parent',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'parent',
              startTimeMs: Date.now()
            })
          )

          for (let i = 0; i < 5; i++) {
            service.recordStart(
              new SpanStarted({
                spanId: `child-${i}`,
                traceId: 'trace-1',
                parentSpanId: 'parent',
                name: `child-${i}`,
                startTimeMs: Date.now()
              })
            )
          }

          yield* service.flush

          const stats = yield* service.stats
          expect(stats.memory.childRefsBytes).toBeGreaterThan(0)
        }).pipe(Effect.scoped)
      )
    })
  })

  describe('disabled state', () => {
    it('should return false for recordStart when disabled', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService({ enabled: false })

          const accepted = service.recordStart(
            new SpanStarted({
              spanId: 'span-1',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'test',
              startTimeMs: Date.now()
            })
          )

          expect(accepted).toBe(false)

          const isEnabled = yield* service.isEnabled()
          expect(isEnabled).toBe(false)
        }).pipe(Effect.scoped)
      )
    })

    it('should return empty results when disabled', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService({ enabled: false })

          const path = yield* service.getPath('any')
          expect(path).toEqual([])

          const deepest = yield* service.getDeepestPath('any')
          expect(deepest).toEqual([])

          const stats = yield* service.stats
          expect(stats.spanCount).toBe(0)
          expect(stats.memory.totalBytes).toBe(0)
        }).pipe(Effect.scoped)
      )
    })
  })

  describe('clear and management', () => {
    it('should clear a specific trace', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* makeSpanTreeService()

          // Add spans to two traces
          service.recordStart(
            new SpanStarted({
              spanId: 'span-1',
              traceId: 'trace-1',
              parentSpanId: undefined,
              name: 'trace1-span',
              startTimeMs: Date.now()
            })
          )

          service.recordStart(
            new SpanStarted({
              spanId: 'span-2',
              traceId: 'trace-2',
              parentSpanId: undefined,
              name: 'trace2-span',
              startTimeMs: Date.now()
            })
          )

          yield* service.flush

          let stats = yield* service.stats
          expect(stats.traceCount).toBe(2)
          expect(stats.spanCount).toBe(2)

          // Clear trace-1
          yield* service.clear('trace-1')

          stats = yield* service.stats
          expect(stats.traceCount).toBe(1)
          expect(stats.spanCount).toBe(1)

          // trace-2 should still exist
          const spans = yield* service.getTraceSpans('trace-2')
          expect(spans.length).toBe(1)
        }).pipe(Effect.scoped)
      )
    })
  })
})
