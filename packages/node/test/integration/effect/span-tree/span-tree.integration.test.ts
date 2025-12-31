/**
 * Integration test for SpanTree with Effect
 *
 * Demonstrates the use case from Effect-TS/effect#5926:
 * Accessing span path hierarchy from Effect.ensuring()
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { trace, ROOT_CONTEXT } from '@opentelemetry/api'
import {
  SpanTreeImpl,
  setGlobalSpanTree,
  SpanTree,
  resetGlobalSpanTree
} from '../../../../src/core/span-tree.js'
import {
  startCollectorContainer,
  stopCollectorContainer,
  type CollectorContainer
} from '../../shared/helpers.js'

let collector: CollectorContainer
let spanTree: SpanTreeImpl

describe('SpanTree Effect Integration', () => {
  beforeAll(async () => {
    // Start collector for OTel export
    collector = await startCollectorContainer()
  })

  afterAll(async () => {
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
    }
  })

  beforeEach(() => {
    // Create fresh SpanTree for each test
    spanTree = new SpanTreeImpl({ ttlMs: 30000 })
    setGlobalSpanTree(spanTree)
  })

  it('should access deepest path from Effect.ensuring - solves Effect #5926', () => {
    /**
     * This test demonstrates the exact use case from Effect-TS/effect#5926:
     *
     * > "We wrap effects with span metadata and want to log the
     * > 'deepest' span path when the effect completes"
     *
     * Previously this was impossible because Effect.ensuring() runs
     * after inner spans close, losing access to the hierarchy.
     *
     * SpanTree solves this by maintaining the span tree in memory
     * with TTL-based cleanup, so the path is still queryable.
     */

    // Use mock spans with controlled hierarchy (same pattern as unit tests)
    const traceId = 'effect-5926-demo-' + Date.now()

    // Create span hierarchy: handleClick -> fetchData -> processResult -> validate
    const mockHandleClick = {
      spanContext: () => ({ spanId: 'span-handleClick', traceId, traceFlags: 1 })
    }
    const mockFetchData = {
      spanContext: () => ({ spanId: 'span-fetchData', traceId, traceFlags: 1 })
    }
    const mockProcessResult = {
      spanContext: () => ({ spanId: 'span-processResult', traceId, traceFlags: 1 })
    }
    const mockValidate = {
      spanContext: () => ({ spanId: 'span-validate', traceId, traceFlags: 1 })
    }

    // Helper to create parent context
    const makeParentContext = (parentSpan: any) =>
      ({
        getValue: () => parentSpan,
        setValue: (v: any) => makeParentContext(v),
        deleteValue: () => makeParentContext(parentSpan)
      }) as any

    // Record span starts (simulating Effect.withSpan calls)
    spanTree.recordStart(mockHandleClick as any, ROOT_CONTEXT, 'handleClick')
    spanTree.recordStart(mockFetchData as any, makeParentContext(mockHandleClick), 'fetchData')
    spanTree.recordStart(
      mockProcessResult as any,
      makeParentContext(mockFetchData),
      'processResult'
    )
    spanTree.recordStart(mockValidate as any, makeParentContext(mockProcessResult), 'validate')

    // Inner spans end first (as they would in real execution)
    spanTree.recordEnd('span-validate', traceId)
    spanTree.recordEnd('span-processResult', traceId)
    spanTree.recordEnd('span-fetchData', traceId)

    // NOW: This is what Effect.ensuring() would do - query BEFORE root span ends
    // This is exactly schickling's use case
    const deepest = spanTree.getDeepestPath(traceId)
    const loggedPath = deepest.join(' → ')
    const loggedDepth = deepest.length

    // Finally end the root span
    spanTree.recordEnd('span-handleClick', traceId)

    // Verify the path was captured correctly - THIS IS THE KEY ASSERTION
    expect(loggedPath).toBe('handleClick → fetchData → processResult → validate')
    expect(loggedDepth).toBe(4)

    // Verify tree stats
    const stats = spanTree.getStats()
    expect(stats.spanCount).toBe(4)
    expect(stats.traceCount).toBe(1)
  })

  it('should provide trace URL in summary', async () => {
    const tracer = trace.getTracer('span-tree-test')

    let traceSummary: ReturnType<typeof SpanTree.getTraceSummary> | null = null

    await tracer.startActiveSpan('operation', async (span) => {
      spanTree.recordStart(span, ROOT_CONTEXT, 'operation')

      const traceId = span.spanContext().traceId
      traceSummary = spanTree.getTraceSummary(traceId, {
        traceUrlBase: 'https://ui.atrim.ai'
      })

      spanTree.recordEnd(span.spanContext().spanId, traceId)
      span.end()
    })

    expect(traceSummary).not.toBeNull()
    expect(traceSummary!.traceUrl).toMatch(/^https:\/\/ui\.atrim\.ai\/trace\//)
    expect(traceSummary!.formattedPath).toBe('operation')
  })

  it('should track multiple independent traces', () => {
    // Create two separate traces manually (not using OTel context)
    // This avoids context propagation complexity

    // Trace 1: root -> child (depth 2)
    const trace1Id = 'trace-1-' + Date.now()
    const mockSpan1Root = {
      spanContext: () => ({ spanId: 'span-1-root', traceId: trace1Id, traceFlags: 1 })
    }
    const mockSpan1Child = {
      spanContext: () => ({ spanId: 'span-1-child', traceId: trace1Id, traceFlags: 1 })
    }

    spanTree.recordStart(mockSpan1Root as any, ROOT_CONTEXT, 'trace1-root')
    // Create parent context for child
    const parent1Context = {
      getValue: () => mockSpan1Root,
      setValue: () => parent1Context,
      deleteValue: () => parent1Context
    } as any
    spanTree.recordStart(mockSpan1Child as any, parent1Context, 'trace1-child')
    spanTree.recordEnd('span-1-child', trace1Id)
    spanTree.recordEnd('span-1-root', trace1Id)

    // Trace 2: root -> child -> grandchild (depth 3)
    const trace2Id = 'trace-2-' + Date.now()
    const mockSpan2Root = {
      spanContext: () => ({ spanId: 'span-2-root', traceId: trace2Id, traceFlags: 1 })
    }
    const mockSpan2Child = {
      spanContext: () => ({ spanId: 'span-2-child', traceId: trace2Id, traceFlags: 1 })
    }
    const mockSpan2Grandchild = {
      spanContext: () => ({ spanId: 'span-2-grandchild', traceId: trace2Id, traceFlags: 1 })
    }

    spanTree.recordStart(mockSpan2Root as any, ROOT_CONTEXT, 'trace2-root')
    const parent2Context = {
      getValue: () => mockSpan2Root,
      setValue: () => parent2Context,
      deleteValue: () => parent2Context
    } as any
    spanTree.recordStart(mockSpan2Child as any, parent2Context, 'trace2-child')
    const parent2ChildContext = {
      getValue: () => mockSpan2Child,
      setValue: () => parent2ChildContext,
      deleteValue: () => parent2ChildContext
    } as any
    spanTree.recordStart(mockSpan2Grandchild as any, parent2ChildContext, 'trace2-grandchild')
    spanTree.recordEnd('span-2-grandchild', trace2Id)
    spanTree.recordEnd('span-2-child', trace2Id)
    spanTree.recordEnd('span-2-root', trace2Id)

    // Each trace should have its own path
    const path1 = spanTree.getDeepestPath(trace1Id)
    const path2 = spanTree.getDeepestPath(trace2Id)

    expect(path1).toEqual(['trace1-root', 'trace1-child'])
    expect(path2).toEqual(['trace2-root', 'trace2-child', 'trace2-grandchild'])
  })

  it('should report memory stats accurately', () => {
    // Create several spans using mock spans (simpler than OTel API)
    const traceId = 'memory-test-' + Date.now()

    for (let i = 0; i < 10; i++) {
      const mockSpan = {
        spanContext: () => ({
          spanId: `span-${i}`,
          traceId: `trace-${i}-${Date.now()}`, // Each gets own trace
          traceFlags: 1
        })
      }
      spanTree.recordStart(mockSpan as any, ROOT_CONTEXT, `span-${i}`)
      spanTree.recordEnd(`span-${i}`, `trace-${i}-${Date.now()}`)
    }

    const stats = spanTree.getStats()

    // Should have 10 spans
    expect(stats.spanCount).toBe(10)

    // Memory estimate should be reasonable
    // 10 spans * ~420 bytes = ~4200 bytes minimum
    expect(stats.estimatedMemoryBytes).toBeGreaterThan(4000)
    expect(stats.estimatedMemoryBytes).toBeLessThan(10000)
  })

  it('should expose global SpanTree for querying', async () => {
    const tracer = trace.getTracer('span-tree-test')

    await tracer.startActiveSpan('test-op', async (span) => {
      spanTree.recordStart(span, ROOT_CONTEXT, 'test-op')

      // The global SpanTree should work
      expect(SpanTree.isEnabled()).toBe(true)

      const traceId = span.spanContext().traceId
      const summary = SpanTree.getTraceSummary(traceId)

      expect(summary.spanCount).toBe(1)
      expect(summary.formattedPath).toBe('test-op')

      spanTree.recordEnd(span.spanContext().spanId, traceId)
      span.end()
    })
  })

  /**
   * Note: A full Effect integration test with real Effect spans requires
   * custom integration with Effect's NodeSdk layer. For a complete demonstration,
   * see the example at examples/effect-span-tree which shows how SpanTree
   * can be used with Effect.ensuring() in a real application.
   *
   * The mock-based tests above verify the core SpanTree functionality,
   * which works correctly when integrated with PatternSpanProcessor.
   */
})
