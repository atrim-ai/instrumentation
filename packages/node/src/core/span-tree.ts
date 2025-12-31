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
import {
  Chunk,
  Context as EffectContext,
  Data,
  Duration,
  Effect,
  Layer,
  Queue,
  Ref,
  Schedule,
  Scope,
  SynchronizedRef
} from 'effect'

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
  /** Event queue capacity for async processing (default: 1024) */
  readonly queueCapacity?: number
  /** Batch size for event processing (default: 100) */
  readonly batchSize?: number
  /** Shutdown timeout in ms (default: 3000) */
  readonly shutdownTimeoutMs?: number
}

// ============================================
// Effect-Based Event Types
// ============================================

/**
 * Event emitted when a span starts
 */
export class SpanStarted extends Data.TaggedClass('SpanStarted')<{
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTimeMs: number
}> {}

/**
 * Event emitted when a span ends
 */
export class SpanEnded extends Data.TaggedClass('SpanEnded')<{
  readonly spanId: string
  readonly traceId: string
  readonly endTimeMs: number
}> {}

/**
 * Union of all span events
 */
export type SpanEvent = SpanStarted | SpanEnded

// ============================================
// Effect-Based State Types
// ============================================

/**
 * Immutable record for a span in the tree
 */
export interface SpanRecord {
  readonly spanId: string
  readonly traceId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly startTimeMs: number
  readonly endTimeMs: number | undefined
  readonly status: 'running' | 'ended'
  readonly children: ReadonlySet<string>
}

/**
 * Immutable state for the span tree
 */
export interface SpanTreeState {
  readonly spans: ReadonlyMap<string, SpanRecord>
  readonly traces: ReadonlyMap<string, ReadonlySet<string>>
  readonly version: number
}

/**
 * Statistics for monitoring SpanTree health
 */
export interface SpanTreeStats {
  readonly queueSize: number
  readonly droppedEvents: number
  readonly spanCount: number
  readonly traceCount: number
  readonly version: number

  // Memory metrics (for Prometheus/observability)
  readonly memory: SpanTreeMemoryStats
}

/**
 * Detailed memory usage statistics for SpanTree
 *
 * These values are estimates based on JS object overhead calculations.
 * Useful for Prometheus metrics and memory pressure monitoring.
 */
export interface SpanTreeMemoryStats {
  /** Total estimated memory usage in bytes */
  readonly totalBytes: number

  /** Memory used by span records in bytes */
  readonly spanRecordsBytes: number

  /** Memory used by trace index in bytes */
  readonly traceIndexBytes: number

  /** Memory used by child reference sets in bytes */
  readonly childRefsBytes: number

  /** Memory used by event queue (pending events) in bytes */
  readonly queueBytes: number

  /** Average bytes per span (for capacity planning) */
  readonly avgBytesPerSpan: number

  /** Estimated maximum capacity before hitting configured limits */
  readonly estimatedCapacityPercent: number
}

/**
 * Options for trace summary queries
 */
export interface TraceSummaryOptions {
  readonly traceUrlBase?: string
}

// ============================================
// SpanTreeService - Effect-Based API
// ============================================

/**
 * SpanTreeService provides an Effect-based API for tracking span hierarchy.
 *
 * Uses event-driven architecture:
 * - Sync push interface via `recordStart`/`recordEnd` (called from SpanProcessor)
 * - Async event processing via background fiber
 * - Effect-based query API for reading span data
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const spanTree = yield* SpanTreeService
 *
 *   // Query the deepest path in a trace
 *   const path = yield* spanTree.getDeepestPath(traceId)
 *
 *   // Ensure all events are processed before querying
 *   yield* spanTree.flush
 *   const summary = yield* spanTree.getTraceSummary(traceId)
 * })
 * ```
 */
export class SpanTreeService extends EffectContext.Tag('@atrim/SpanTreeService')<
  SpanTreeService,
  {
    // === Sync Push Interface (called from SpanProcessor via unsafeOffer) ===

    /**
     * Record a span start event. Returns true if accepted, false if queue full.
     * This is synchronous and non-blocking - uses Queue.unsafeOffer internally.
     */
    readonly recordStart: (event: SpanStarted) => boolean

    /**
     * Record a span end event. Returns true if accepted, false if queue full.
     * This is synchronous and non-blocking - uses Queue.unsafeOffer internally.
     */
    readonly recordEnd: (event: SpanEnded) => boolean

    // === Effect-Based Query API ===

    /** Get path from root to span as array of names */
    readonly getPath: (spanId: string) => Effect.Effect<ReadonlyArray<string>>

    /** Get deepest path that occurred in trace */
    readonly getDeepestPath: (traceId: string) => Effect.Effect<ReadonlyArray<string>>

    /** Get full trace summary */
    readonly getTraceSummary: (
      traceId: string,
      opts?: TraceSummaryOptions
    ) => Effect.Effect<TraceSummary>

    /** Get current span's path (from OTel context) */
    readonly getCurrentPath: () => Effect.Effect<ReadonlyArray<string>>

    /** Get current trace ID from OTel context */
    readonly getCurrentTraceId: () => Effect.Effect<string | null>

    /** Get leaf spans (no children) in trace */
    readonly getLeafSpans: (traceId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>

    /** Get all spans in a trace */
    readonly getTraceSpans: (traceId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>

    /** Get span info by ID */
    readonly getSpan: (spanId: string) => Effect.Effect<SpanInfo | undefined>

    /** Get children of a span */
    readonly getChildren: (spanId: string) => Effect.Effect<ReadonlyArray<SpanInfo>>

    /** Check if span exists and is running */
    readonly isRunning: (spanId: string) => Effect.Effect<boolean>

    /** Get max depth reached in trace */
    readonly getMaxDepth: (traceId: string) => Effect.Effect<number>

    // === Consistency Control ===

    /**
     * Drain the event queue and wait for all events to be processed.
     * Use before queries when you need strong consistency guarantees.
     */
    readonly flush: Effect.Effect<void>

    // === Monitoring & Management ===

    /** Get statistics for monitoring queue health */
    readonly stats: Effect.Effect<SpanTreeStats>

    /** Manually clear a trace (normally TTL handles this) */
    readonly clear: (traceId: string) => Effect.Effect<void>

    /** Check if SpanTree is enabled */
    readonly isEnabled: () => Effect.Effect<boolean>

    /** Build trace URL */
    readonly getTraceUrl: (traceId: string, baseUrl: string) => Effect.Effect<string>

    // === Internal (for wiring) ===

    /**
     * Get the underlying event queue for wiring to SpanProcessor.
     * @internal
     */
    readonly getEventQueue: () => Queue.Queue<SpanEvent>
  }
>() {}

// ============================================
// SpanTreeService Implementation
// ============================================

/**
 * Default configuration values
 */
const defaultConfig = {
  ttlMs: 30000,
  maxSpans: 10000,
  maxTraces: 1000,
  enabled: true,
  queueCapacity: 1024,
  batchSize: 100,
  shutdownTimeoutMs: 3000
} as const

/**
 * Initial empty state
 */
const emptyState: SpanTreeState = {
  spans: new Map(),
  traces: new Map(),
  version: 0
}

/**
 * Convert SpanRecord to SpanInfo for query results
 */
const recordToInfo = (record: SpanRecord): SpanInfo => ({
  spanId: record.spanId,
  traceId: record.traceId,
  parentSpanId: record.parentSpanId,
  name: record.name,
  startTime: record.startTimeMs,
  endTime: record.endTimeMs,
  status: record.status
})

/**
 * Handle a SpanStarted event - immutably update state
 */
const handleSpanStarted = (state: SpanTreeState, event: SpanStarted): SpanTreeState => {
  const record: SpanRecord = {
    spanId: event.spanId,
    traceId: event.traceId,
    parentSpanId: event.parentSpanId,
    name: event.name,
    startTimeMs: event.startTimeMs,
    endTimeMs: undefined,
    status: 'running',
    children: new Set()
  }

  // Create new spans map with the new record
  const newSpans = new Map(state.spans)
  newSpans.set(event.spanId, record)

  // Update parent's children if parent exists
  if (event.parentSpanId) {
    const parent = newSpans.get(event.parentSpanId)
    if (parent) {
      newSpans.set(event.parentSpanId, {
        ...parent,
        children: new Set([...parent.children, event.spanId])
      })
    }
  }

  // Update trace index
  const traceSpans = state.traces.get(event.traceId) ?? new Set<string>()
  const newTraces = new Map(state.traces)
  newTraces.set(event.traceId, new Set([...traceSpans, event.spanId]))

  return {
    spans: newSpans,
    traces: newTraces,
    version: state.version + 1
  }
}

/**
 * Handle a SpanEnded event - immutably update state
 */
const handleSpanEnded = (state: SpanTreeState, event: SpanEnded): SpanTreeState => {
  const record = state.spans.get(event.spanId)
  if (!record) return state

  const updatedRecord: SpanRecord = {
    ...record,
    endTimeMs: event.endTimeMs,
    status: 'ended'
  }

  const newSpans = new Map(state.spans)
  newSpans.set(event.spanId, updatedRecord)

  return {
    spans: newSpans,
    traces: state.traces,
    version: state.version + 1
  }
}

/**
 * Process a batch of events - used by the background fiber
 */
const processEventBatch = (state: SpanTreeState, events: Chunk.Chunk<SpanEvent>): SpanTreeState =>
  Chunk.reduce(events, state, (acc, event) => {
    switch (event._tag) {
      case 'SpanStarted':
        return handleSpanStarted(acc, event)
      case 'SpanEnded':
        return handleSpanEnded(acc, event)
    }
  })

/**
 * Background event processor - takes batches from queue and updates state
 */
const processEvents = (
  queue: Queue.Queue<SpanEvent>,
  state: SynchronizedRef.SynchronizedRef<SpanTreeState>,
  batchSize: number
): Effect.Effect<void> =>
  Effect.gen(function* () {
    // Take between 1 and batchSize events (blocks until at least 1)
    const batch = yield* Queue.takeBetween(queue, 1, batchSize)

    // Process batch atomically
    yield* SynchronizedRef.update(state, (currentState) => processEventBatch(currentState, batch))
  })

/**
 * Drain remaining events from queue (used during shutdown and flush)
 */
const drainQueue = (
  queue: Queue.Queue<SpanEvent>,
  state: SynchronizedRef.SynchronizedRef<SpanTreeState>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    // Take all available events without blocking
    const remaining = yield* Queue.takeAll(queue)
    if (!Chunk.isEmpty(remaining)) {
      yield* SynchronizedRef.update(state, (currentState) =>
        processEventBatch(currentState, remaining)
      )
    }
  })

/**
 * Cleanup expired traces based on TTL
 */
const cleanupExpiredTraces = (
  state: SynchronizedRef.SynchronizedRef<SpanTreeState>,
  ttlMs: number
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const now = Date.now()
    yield* SynchronizedRef.update(state, (currentState) => {
      // Find traces where all spans have ended and TTL has passed
      const tracesToRemove: string[] = []

      for (const [traceId, spanIds] of currentState.traces) {
        let allEnded = true
        let latestEndTime = 0

        for (const spanId of spanIds) {
          const span = currentState.spans.get(spanId)
          if (!span) continue
          if (span.status !== 'ended') {
            allEnded = false
            break
          }
          if (span.endTimeMs && span.endTimeMs > latestEndTime) {
            latestEndTime = span.endTimeMs
          }
        }

        if (allEnded && latestEndTime > 0 && now - latestEndTime > ttlMs) {
          tracesToRemove.push(traceId)
        }
      }

      if (tracesToRemove.length === 0) return currentState

      // Remove expired traces and their spans
      const newSpans = new Map(currentState.spans)
      const newTraces = new Map(currentState.traces)

      for (const traceId of tracesToRemove) {
        const spanIds = newTraces.get(traceId)
        if (spanIds) {
          for (const spanId of spanIds) {
            newSpans.delete(spanId)
          }
          newTraces.delete(traceId)
        }
      }

      return {
        spans: newSpans,
        traces: newTraces,
        version: currentState.version + 1
      }
    })
  })

/**
 * Compute path from root to a span
 */
const computePath = (state: SpanTreeState, spanId: string): ReadonlyArray<string> => {
  const path: string[] = []
  let current: string | undefined = spanId

  while (current) {
    const record = state.spans.get(current)
    if (!record) break
    path.unshift(record.name)
    current = record.parentSpanId
  }

  return path
}

/**
 * Compute deepest path in a trace
 */
const computeDeepestPath = (state: SpanTreeState, traceId: string): ReadonlyArray<string> => {
  const traceSpans = state.traces.get(traceId)
  if (!traceSpans) return []

  let deepest: ReadonlyArray<string> = []

  for (const spanId of traceSpans) {
    const path = computePath(state, spanId)
    if (path.length > deepest.length) {
      deepest = path
    }
  }

  return deepest
}

/**
 * Build trace URL
 */
const buildTraceUrl = (traceId: string, baseUrl: string): string => {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/trace/${traceId}`
}

// Memory estimation constants (based on V8 object overhead)
const MEMORY_CONSTANTS = {
  // Per span record estimate:
  // - spanId: 32 chars × 2 bytes = 64 bytes
  // - traceId: 32 chars × 2 bytes = 64 bytes
  // - parentSpanId: 32 chars × 2 bytes = 64 bytes (or null = 8 bytes, avg ~50)
  // - name: ~50 chars average × 2 bytes = 100 bytes
  // - startTimeMs/endTimeMs: 16 bytes each = 32 bytes
  // - status: ~10 bytes
  // - children Set overhead: ~50 bytes
  // - Object overhead: ~50 bytes
  // - Map entry overhead: ~50 bytes
  BYTES_PER_SPAN: 470,

  // Per trace index entry:
  // - traceId: 64 bytes
  // - Set overhead: ~50 bytes
  // - Map entry overhead: ~50 bytes
  BYTES_PER_TRACE_ENTRY: 164,

  // Per child reference in Set:
  // - String reference: ~70 bytes (spanId + Set entry overhead)
  BYTES_PER_CHILD_REF: 70,

  // Per event in queue:
  // - SpanStarted/SpanEnded object: ~200 bytes
  BYTES_PER_QUEUE_EVENT: 200
} as const

/**
 * Estimate memory usage for a SpanTree state
 */
const estimateMemoryUsage = (
  state: SpanTreeState,
  queueSize: number,
  maxSpans: number
): SpanTreeMemoryStats => {
  // Count total child references
  let totalChildRefs = 0
  for (const record of state.spans.values()) {
    totalChildRefs += record.children.size
  }

  const spanRecordsBytes = state.spans.size * MEMORY_CONSTANTS.BYTES_PER_SPAN
  const traceIndexBytes = state.traces.size * MEMORY_CONSTANTS.BYTES_PER_TRACE_ENTRY
  const childRefsBytes = totalChildRefs * MEMORY_CONSTANTS.BYTES_PER_CHILD_REF
  const queueBytes = queueSize * MEMORY_CONSTANTS.BYTES_PER_QUEUE_EVENT

  const totalBytes = spanRecordsBytes + traceIndexBytes + childRefsBytes + queueBytes

  const avgBytesPerSpan = state.spans.size > 0 ? Math.round(totalBytes / state.spans.size) : 0

  const estimatedCapacityPercent =
    maxSpans > 0 ? Math.round((state.spans.size / maxSpans) * 100 * 100) / 100 : 0

  return {
    totalBytes,
    spanRecordsBytes,
    traceIndexBytes,
    childRefsBytes,
    queueBytes,
    avgBytesPerSpan,
    estimatedCapacityPercent
  }
}

/**
 * Create a new SpanTreeService instance.
 *
 * Uses event-driven architecture:
 * - Sync push via `recordStart`/`recordEnd` using `Queue.unsafeOffer`
 * - Background fiber processes events in batches
 * - TTL cleanup fiber removes expired traces
 * - Scope-based lifecycle management
 *
 * @param config - Optional configuration
 * @returns Effect that creates the service (requires Scope)
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const spanTree = yield* makeSpanTreeService()
 *
 *   // Service is ready to use
 *   spanTree.recordStart(new SpanStarted({ ... }))
 * }).pipe(Effect.scoped)
 * ```
 */
export const makeSpanTreeService = (
  config?: SpanTreeConfig
): Effect.Effect<EffectContext.Tag.Service<typeof SpanTreeService>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const resolvedConfig = {
      ttlMs: config?.ttlMs ?? defaultConfig.ttlMs,
      maxSpans: config?.maxSpans ?? defaultConfig.maxSpans,
      maxTraces: config?.maxTraces ?? defaultConfig.maxTraces,
      enabled: config?.enabled ?? defaultConfig.enabled,
      queueCapacity: config?.queueCapacity ?? defaultConfig.queueCapacity,
      batchSize: config?.batchSize ?? defaultConfig.batchSize,
      shutdownTimeoutMs: config?.shutdownTimeoutMs ?? defaultConfig.shutdownTimeoutMs
    }

    // If disabled, return a no-op service
    if (!resolvedConfig.enabled) {
      return makeDisabledService()
    }

    const scope = yield* Effect.scope

    // Create event queue with sliding strategy (drops oldest when full)
    const eventQueue = yield* Queue.sliding<SpanEvent>(resolvedConfig.queueCapacity)

    // Create synchronized state reference
    const state = yield* SynchronizedRef.make<SpanTreeState>(emptyState)

    // Track dropped events
    const droppedEvents = yield* Ref.make(0)

    // Background processor fiber - runs forever until scope closes
    yield* processEvents(eventQueue, state, resolvedConfig.batchSize).pipe(
      Effect.forever,
      Effect.forkIn(scope),
      Effect.interruptible
    )

    // TTL cleanup fiber - runs every 10 seconds
    yield* cleanupExpiredTraces(state, resolvedConfig.ttlMs).pipe(
      Effect.repeat(Schedule.fixed(Duration.seconds(10))),
      Effect.forkIn(scope),
      Effect.interruptible
    )

    // Shutdown finalizer - drain remaining events before exit
    yield* Scope.addFinalizer(
      scope,
      drainQueue(eventQueue, state).pipe(
        Effect.timeout(Duration.millis(resolvedConfig.shutdownTimeoutMs)),
        Effect.ignore
      )
    )

    // Return service implementation
    return {
      recordStart: (event: SpanStarted): boolean => {
        const accepted = Queue.unsafeOffer(eventQueue, event)
        if (!accepted) {
          // Track dropped event (fire-and-forget)
          Effect.runSync(Ref.update(droppedEvents, (n) => n + 1))
        }
        return accepted
      },

      recordEnd: (event: SpanEnded): boolean => {
        const accepted = Queue.unsafeOffer(eventQueue, event)
        if (!accepted) {
          Effect.runSync(Ref.update(droppedEvents, (n) => n + 1))
        }
        return accepted
      },

      getPath: (spanId: string) =>
        SynchronizedRef.get(state).pipe(Effect.map((s) => computePath(s, spanId))),

      getDeepestPath: (traceId: string) =>
        SynchronizedRef.get(state).pipe(Effect.map((s) => computeDeepestPath(s, traceId))),

      getTraceSummary: (traceId: string, opts?: TraceSummaryOptions) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const deepest = computeDeepestPath(s, traceId)
            const spans = s.traces.get(traceId)
            return {
              traceId,
              path: deepest,
              formattedPath: deepest.join(' → '),
              depth: deepest.length,
              spanCount: spans?.size ?? 0,
              traceUrl: opts?.traceUrlBase ? buildTraceUrl(traceId, opts.traceUrlBase) : null
            }
          })
        ),

      getCurrentPath: () =>
        Effect.sync(() => {
          const activeSpan = trace.getActiveSpan()
          if (!activeSpan) return []
          return activeSpan.spanContext().spanId
        }).pipe(
          Effect.flatMap((spanId) =>
            typeof spanId === 'string'
              ? SynchronizedRef.get(state).pipe(Effect.map((s) => computePath(s, spanId)))
              : Effect.succeed([])
          )
        ),

      getCurrentTraceId: () =>
        Effect.sync(() => trace.getActiveSpan()?.spanContext().traceId ?? null),

      getLeafSpans: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const traceSpans = s.traces.get(traceId)
            if (!traceSpans) return []
            return Array.from(traceSpans)
              .map((id) => s.spans.get(id))
              .filter(
                (record): record is SpanRecord => record !== undefined && record.children.size === 0
              )
              .map(recordToInfo)
          })
        ),

      getTraceSpans: (traceId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const traceSpans = s.traces.get(traceId)
            if (!traceSpans) return []
            return Array.from(traceSpans)
              .map((id) => s.spans.get(id))
              .filter((record): record is SpanRecord => record !== undefined)
              .map(recordToInfo)
          })
        ),

      getSpan: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const record = s.spans.get(spanId)
            return record ? recordToInfo(record) : undefined
          })
        ),

      getChildren: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => {
            const record = s.spans.get(spanId)
            if (!record) return []
            return Array.from(record.children)
              .map((id) => s.spans.get(id))
              .filter((r): r is SpanRecord => r !== undefined)
              .map(recordToInfo)
          })
        ),

      isRunning: (spanId: string) =>
        SynchronizedRef.get(state).pipe(
          Effect.map((s) => s.spans.get(spanId)?.status === 'running')
        ),

      getMaxDepth: (traceId: string) =>
        SynchronizedRef.get(state).pipe(Effect.map((s) => computeDeepestPath(s, traceId).length)),

      flush: drainQueue(eventQueue, state),

      stats: Effect.gen(function* () {
        const queueSize = yield* Queue.size(eventQueue)
        const dropped = yield* Ref.get(droppedEvents)
        const currentState = yield* SynchronizedRef.get(state)

        return {
          queueSize,
          droppedEvents: dropped,
          spanCount: currentState.spans.size,
          traceCount: currentState.traces.size,
          version: currentState.version,
          memory: estimateMemoryUsage(currentState, queueSize, resolvedConfig.maxSpans)
        }
      }),

      clear: (traceId: string) =>
        SynchronizedRef.update(state, (s) => {
          const traceSpans = s.traces.get(traceId)
          if (!traceSpans) return s

          const newSpans = new Map(s.spans)
          for (const spanId of traceSpans) {
            newSpans.delete(spanId)
          }

          const newTraces = new Map(s.traces)
          newTraces.delete(traceId)

          return {
            spans: newSpans,
            traces: newTraces,
            version: s.version + 1
          }
        }),

      isEnabled: () => Effect.succeed(true),

      getTraceUrl: (traceId: string, baseUrl: string) =>
        Effect.succeed(buildTraceUrl(traceId, baseUrl)),

      getEventQueue: () => eventQueue
    }
  })

/**
 * Create a disabled service that does nothing
 */
const makeDisabledService = (): EffectContext.Tag.Service<typeof SpanTreeService> => {
  // Create a dummy queue that's immediately shutdown
  const dummyQueue = Effect.runSync(Queue.sliding<SpanEvent>(1))

  return {
    recordStart: () => false,
    recordEnd: () => false,
    getPath: () => Effect.succeed([]),
    getDeepestPath: () => Effect.succeed([]),
    getTraceSummary: (traceId) =>
      Effect.succeed({
        traceId,
        path: [],
        formattedPath: '',
        depth: 0,
        spanCount: 0,
        traceUrl: null
      }),
    getCurrentPath: () => Effect.succeed([]),
    getCurrentTraceId: () =>
      Effect.sync(() => trace.getActiveSpan()?.spanContext().traceId ?? null),
    getLeafSpans: () => Effect.succeed([]),
    getTraceSpans: () => Effect.succeed([]),
    getSpan: () => Effect.succeed(undefined),
    getChildren: () => Effect.succeed([]),
    isRunning: () => Effect.succeed(false),
    getMaxDepth: () => Effect.succeed(0),
    flush: Effect.void,
    stats: Effect.succeed({
      queueSize: 0,
      droppedEvents: 0,
      spanCount: 0,
      traceCount: 0,
      version: 0,
      memory: {
        totalBytes: 0,
        spanRecordsBytes: 0,
        traceIndexBytes: 0,
        childRefsBytes: 0,
        queueBytes: 0,
        avgBytesPerSpan: 0,
        estimatedCapacityPercent: 0
      }
    }),
    clear: () => Effect.void,
    isEnabled: () => Effect.succeed(false),
    getTraceUrl: (traceId, baseUrl) => Effect.succeed(buildTraceUrl(traceId, baseUrl)),
    getEventQueue: () => dummyQueue
  }
}

/**
 * Layer that provides the SpanTreeService
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const spanTree = yield* SpanTreeService
 *   // Use spanTree...
 * }).pipe(Effect.provide(SpanTreeServiceLive()))
 * ```
 */
export const SpanTreeServiceLive = (config?: SpanTreeConfig) =>
  Layer.scoped(SpanTreeService, makeSpanTreeService(config))

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
// Internal Types (Legacy Implementation)
// ============================================

interface LegacySpanRecord {
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
  private spans = new Map<string, LegacySpanRecord>()
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
      .filter(
        (record): record is LegacySpanRecord => record !== undefined && record.children.size === 0
      )
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
