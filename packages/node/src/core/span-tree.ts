/**
 * SpanTree - In-memory span tree with query API
 *
 * Exposes OpenTelemetry's span hierarchy to application code,
 * enabling queries like "what's the deepest span path in this trace?"
 *
 * This solves the architectural gap where OTel's span tree exists
 * but isn't queryable at runtime by application code.
 *
 * @packageDocumentation
 */

import { trace } from '@opentelemetry/api'
import type { Span as ApiSpan, Context } from '@opentelemetry/api'
import type { Span as SdkSpan } from '@opentelemetry/sdk-trace-base'

// Union type for spans - SDK spans have .name, API spans don't always
type SpanLike = ApiSpan | SdkSpan

// ============================================
// Types
// ============================================

/**
 * Information about a single span in the tree
 */
export interface SpanInfo {
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTime: number
  readonly endTime: number | undefined
  readonly status: 'running' | 'ended'
}

/**
 * Summary of a trace including its deepest path
 */
export interface TraceSummary {
  readonly traceId: string
  readonly path: ReadonlyArray<string>
  readonly formattedPath: string
  readonly depth: number
  readonly spanCount: number
  readonly traceUrl: string | null
}

/**
 * Configuration options for SpanTree
 */
export interface SpanTreeConfig {
  /** Keep span data for this long after trace ends (default: 30000ms) */
  readonly ttlMs?: number
  /** Maximum spans to track (default: 10000) */
  readonly maxSpans?: number
  /** Maximum traces to track (default: 1000) */
  readonly maxTraces?: number
  /** Whether SpanTree is enabled (default: true) */
  readonly enabled?: boolean
}

/**
 * Query API for the span tree
 */
export interface SpanTree {
  // === Path Queries ===

  /** Get path from root to span as array of names */
  getPath(spanId: string): ReadonlyArray<string>

  /** Get path formatted as "a → b → c" */
  getFormattedPath(spanId: string): string

  /** Get current span's path (from OTel context) */
  getCurrentPath(): ReadonlyArray<string>

  /** Get current path formatted */
  getCurrentFormattedPath(): string

  // === Trace Queries ===

  /** Get deepest path that occurred in trace */
  getDeepestPath(traceId: string): ReadonlyArray<string>

  /** Get max depth reached in trace */
  getMaxDepth(traceId: string): number

  /** Get all spans in a trace */
  getTraceSpans(traceId: string): ReadonlyArray<SpanInfo>

  /** Get leaf spans (no children) in trace */
  getLeafSpans(traceId: string): ReadonlyArray<SpanInfo>

  /** Get full trace summary */
  getTraceSummary(traceId: string, options?: { readonly traceUrlBase?: string }): TraceSummary

  // === Span Queries ===

  /** Get span info by ID */
  getSpan(spanId: string): SpanInfo | undefined

  /** Get children of a span */
  getChildren(spanId: string): ReadonlyArray<SpanInfo>

  /** Check if span exists and is running */
  isRunning(spanId: string): boolean

  // === Utilities ===

  /** Build trace URL */
  getTraceUrl(traceId: string, baseUrl: string): string

  /** Get current trace ID from OTel context */
  getCurrentTraceId(): string | null

  /** Get current span ID from OTel context */
  getCurrentSpanId(): string | null

  /** Manually clear a trace (normally TTL handles this) */
  clear(traceId: string): void

  /** Check if SpanTree is enabled */
  isEnabled(): boolean
}

// ============================================
// Internal Types
// ============================================

interface SpanRecord {
  info: SpanInfo
  children: Set<string>
}

interface ResolvedConfig {
  readonly ttlMs: number
  readonly maxSpans: number
  readonly maxTraces: number
  readonly enabled: boolean
}

// ============================================
// Implementation
// ============================================

/**
 * SpanTree implementation that maintains an in-memory span tree
 */
export class SpanTreeImpl implements SpanTree {
  private spans = new Map<string, SpanRecord>()
  private traces = new Map<string, Set<string>>()
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private config: ResolvedConfig

  constructor(config?: SpanTreeConfig) {
    this.config = {
      ttlMs: config?.ttlMs ?? 30000,
      maxSpans: config?.maxSpans ?? 10000,
      maxTraces: config?.maxTraces ?? 1000,
      enabled: config?.enabled ?? true
    }
  }

  /**
   * Record a span starting (called by SpanProcessor.onStart)
   *
   * @param span - The span being started
   * @param parentContext - The parent context
   * @param name - Optional explicit name (useful when span.name isn't accessible)
   */
  recordStart(span: SpanLike, parentContext: Context, name?: string): void {
    if (!this.config.enabled) return

    const ctx = span.spanContext()
    const parentSpan = trace.getSpan(parentContext)
    const parentSpanId = parentSpan?.spanContext().spanId

    // Try to get name from span, fall back to explicit name, then 'unknown'
    const spanName = (span as SdkSpan).name ?? name ?? 'unknown'

    const info: SpanInfo = {
      spanId: ctx.spanId,
      traceId: ctx.traceId,
      parentSpanId,
      name: spanName,
      startTime: Date.now(),
      endTime: undefined,
      status: 'running'
    }

    // Store span
    this.spans.set(ctx.spanId, { info, children: new Set() })

    // Index by trace
    if (!this.traces.has(ctx.traceId)) {
      this.traces.set(ctx.traceId, new Set())
    }
    this.traces.get(ctx.traceId)!.add(ctx.spanId)

    // Link to parent
    if (parentSpanId) {
      const parent = this.spans.get(parentSpanId)
      if (parent) {
        parent.children.add(ctx.spanId)
      }
    }

    this.enforceMaxLimits()
  }

  /**
   * Record a span ending (called by SpanProcessor.onEnd)
   */
  recordEnd(spanId: string, traceId: string): void {
    if (!this.config.enabled) return

    const record = this.spans.get(spanId)
    if (record) {
      // Update with end time
      record.info = {
        ...record.info,
        endTime: Date.now(),
        status: 'ended'
      }
    }

    // Check if all spans in trace are ended
    const traceSpans = this.traces.get(traceId)
    if (traceSpans) {
      const allEnded = Array.from(traceSpans).every((id) => {
        const r = this.spans.get(id)
        return r?.info.status === 'ended'
      })

      if (allEnded) {
        this.scheduleCleanup(traceId)
      }
    }
  }

  // === Path Queries ===

  getPath(spanId: string): ReadonlyArray<string> {
    if (!this.config.enabled) return []

    const path: string[] = []
    let current: string | undefined = spanId

    while (current) {
      const record = this.spans.get(current)
      if (!record) break
      path.unshift(record.info.name)
      current = record.info.parentSpanId
    }

    return path
  }

  getFormattedPath(spanId: string): string {
    return this.getPath(spanId).join(' → ')
  }

  getCurrentPath(): ReadonlyArray<string> {
    if (!this.config.enabled) return []

    const activeSpan = trace.getActiveSpan()
    if (!activeSpan) return []
    return this.getPath(activeSpan.spanContext().spanId)
  }

  getCurrentFormattedPath(): string {
    return this.getCurrentPath().join(' → ')
  }

  // === Trace Queries ===

  getDeepestPath(traceId: string): ReadonlyArray<string> {
    if (!this.config.enabled) return []

    const traceSpans = this.traces.get(traceId)
    if (!traceSpans) return []

    let deepest: ReadonlyArray<string> = []

    for (const spanId of traceSpans) {
      const path = this.getPath(spanId)
      if (path.length > deepest.length) {
        deepest = path
      }
    }

    return deepest
  }

  getMaxDepth(traceId: string): number {
    return this.getDeepestPath(traceId).length
  }

  getTraceSpans(traceId: string): ReadonlyArray<SpanInfo> {
    if (!this.config.enabled) return []

    const traceSpans = this.traces.get(traceId)
    if (!traceSpans) return []

    return Array.from(traceSpans)
      .map((id) => this.spans.get(id)?.info)
      .filter((info): info is SpanInfo => info !== undefined)
  }

  getLeafSpans(traceId: string): ReadonlyArray<SpanInfo> {
    if (!this.config.enabled) return []

    const traceSpans = this.traces.get(traceId)
    if (!traceSpans) return []

    return Array.from(traceSpans)
      .map((id) => this.spans.get(id))
      .filter((record): record is SpanRecord => record !== undefined && record.children.size === 0)
      .map((record) => record.info)
  }

  getTraceSummary(traceId: string, options?: { readonly traceUrlBase?: string }): TraceSummary {
    const deepest = this.getDeepestPath(traceId)
    const spans = this.traces.get(traceId)

    return {
      traceId,
      path: deepest,
      formattedPath: deepest.join(' → '),
      depth: deepest.length,
      spanCount: spans?.size ?? 0,
      traceUrl: options?.traceUrlBase ? this.getTraceUrl(traceId, options.traceUrlBase) : null
    }
  }

  // === Span Queries ===

  getSpan(spanId: string): SpanInfo | undefined {
    if (!this.config.enabled) return undefined
    return this.spans.get(spanId)?.info
  }

  getChildren(spanId: string): ReadonlyArray<SpanInfo> {
    if (!this.config.enabled) return []

    const record = this.spans.get(spanId)
    if (!record) return []

    return Array.from(record.children)
      .map((id) => this.spans.get(id)?.info)
      .filter((info): info is SpanInfo => info !== undefined)
  }

  isRunning(spanId: string): boolean {
    if (!this.config.enabled) return false
    return this.spans.get(spanId)?.info.status === 'running'
  }

  // === Utilities ===

  getTraceUrl(traceId: string, baseUrl: string): string {
    const base = baseUrl.replace(/\/$/, '')
    return `${base}/trace/${traceId}`
  }

  getCurrentTraceId(): string | null {
    return trace.getActiveSpan()?.spanContext().traceId ?? null
  }

  getCurrentSpanId(): string | null {
    return trace.getActiveSpan()?.spanContext().spanId ?? null
  }

  clear(traceId: string): void {
    const traceSpans = this.traces.get(traceId)
    if (traceSpans) {
      for (const spanId of traceSpans) {
        this.spans.delete(spanId)
      }
      this.traces.delete(traceId)
    }

    const timer = this.cleanupTimers.get(traceId)
    if (timer) {
      clearTimeout(timer)
      this.cleanupTimers.delete(traceId)
    }
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  // === Internal Methods ===

  private scheduleCleanup(traceId: string): void {
    // Cancel existing timer
    const existing = this.cleanupTimers.get(traceId)
    if (existing) clearTimeout(existing)

    // Schedule new cleanup
    const timer = setTimeout(() => {
      this.clear(traceId)
    }, this.config.ttlMs)

    this.cleanupTimers.set(traceId, timer)
  }

  private enforceMaxLimits(): void {
    // Enforce max traces (LRU eviction - oldest first)
    while (this.traces.size > this.config.maxTraces) {
      const oldest = this.traces.keys().next().value
      if (oldest) this.clear(oldest)
      else break
    }

    // Enforce max spans
    while (this.spans.size > this.config.maxSpans) {
      // Find trace with oldest spans and clear it
      let oldestTrace: string | undefined
      let oldestTime = Infinity

      for (const [traceId, spanIds] of this.traces) {
        const firstSpanId = spanIds.values().next().value
        if (firstSpanId) {
          const span = this.spans.get(firstSpanId)
          if (span && span.info.startTime < oldestTime) {
            oldestTime = span.info.startTime
            oldestTrace = traceId
          }
        }
      }

      if (oldestTrace) this.clear(oldestTrace)
      else break
    }
  }

  /**
   * Get stats for debugging/monitoring
   */
  getStats(): {
    spanCount: number
    traceCount: number
    timerCount: number
    estimatedMemoryBytes: number
  } {
    return {
      spanCount: this.spans.size,
      traceCount: this.traces.size,
      timerCount: this.cleanupTimers.size,
      estimatedMemoryBytes: this.estimateMemoryUsage()
    }
  }

  /**
   * Estimate current memory usage in bytes
   *
   * Per span estimate:
   * - spanId: 32 chars × 2 bytes = 64 bytes
   * - traceId: 32 chars × 2 bytes = 64 bytes
   * - parentSpanId: 32 chars × 2 bytes = 64 bytes
   * - name: ~50 chars average × 2 bytes = 100 bytes
   * - startTime/endTime: 16 bytes
   * - status: ~10 bytes
   * - Set overhead: ~50 bytes
   * - Map entry overhead: ~50 bytes
   * Total: ~420 bytes per span
   */
  estimateMemoryUsage(): number {
    const BYTES_PER_SPAN = 420
    const BYTES_PER_TRACE_ENTRY = 100 // Map entry + Set overhead
    const BYTES_PER_CHILD_REF = 70 // Set entry with string reference

    let totalChildRefs = 0
    for (const record of this.spans.values()) {
      totalChildRefs += record.children.size
    }

    return (
      this.spans.size * BYTES_PER_SPAN +
      this.traces.size * BYTES_PER_TRACE_ENTRY +
      totalChildRefs * BYTES_PER_CHILD_REF
    )
  }

  /**
   * Check if memory usage exceeds a threshold
   */
  isMemoryWarning(thresholdBytes: number = 5 * 1024 * 1024): boolean {
    return this.estimateMemoryUsage() > thresholdBytes
  }

  /**
   * Clear all data and timers (for testing)
   */
  reset(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }
    this.spans.clear()
    this.traces.clear()
    this.cleanupTimers.clear()
  }
}

// ============================================
// Empty Implementation (when disabled/not initialized)
// ============================================

const emptySpanTree: SpanTree = {
  getPath: () => [],
  getFormattedPath: () => '',
  getCurrentPath: () => [],
  getCurrentFormattedPath: () => '',
  getDeepestPath: () => [],
  getMaxDepth: () => 0,
  getTraceSpans: () => [],
  getLeafSpans: () => [],
  getTraceSummary: (traceId) => ({
    traceId,
    path: [],
    formattedPath: '',
    depth: 0,
    spanCount: 0,
    traceUrl: null
  }),
  getSpan: () => undefined,
  getChildren: () => [],
  isRunning: () => false,
  getTraceUrl: (traceId, base) => `${base.replace(/\/$/, '')}/trace/${traceId}`,
  getCurrentTraceId: () => trace.getActiveSpan()?.spanContext().traceId ?? null,
  getCurrentSpanId: () => trace.getActiveSpan()?.spanContext().spanId ?? null,
  clear: () => {},
  isEnabled: () => false
}

// ============================================
// Global Instance
// ============================================

let globalSpanTree: SpanTreeImpl | null = null

/**
 * Set the global SpanTree instance (called during SDK initialization)
 */
export const setGlobalSpanTree = (tree: SpanTreeImpl): void => {
  globalSpanTree = tree
}

/**
 * Get the global SpanTree implementation (for internal use)
 */
export const getGlobalSpanTreeImpl = (): SpanTreeImpl | null => {
  return globalSpanTree
}

/**
 * Reset the global SpanTree (for testing)
 */
export const resetGlobalSpanTree = (): void => {
  if (globalSpanTree) {
    globalSpanTree.reset()
  }
  globalSpanTree = null
}

/**
 * Global SpanTree instance for querying span hierarchy
 *
 * @example
 * ```typescript
 * import { SpanTree } from "@atrim/instrumentation"
 *
 * // Get current span path
 * const path = SpanTree.getCurrentPath()
 * console.log(path.join(" → "))
 *
 * // Get deepest path in a trace
 * const traceId = SpanTree.getCurrentTraceId()
 * if (traceId) {
 *   const deepest = SpanTree.getDeepestPath(traceId)
 *   console.log(`Deepest: ${deepest.join(" → ")}`)
 * }
 * ```
 */
export const SpanTree: SpanTree = new Proxy(emptySpanTree, {
  get(target, prop: keyof SpanTree) {
    const tree = globalSpanTree ?? target
    const value = tree[prop]
    return typeof value === 'function' ? value.bind(tree) : value
  }
})
