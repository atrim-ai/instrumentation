/**
 * FiberSet helpers with automatic span isolation and virtual parent tracking
 *
 * Provides wrappers around Effect's FiberSet.run that automatically:
 * 1. Isolate span context (prevent leakage via { root: true })
 * 2. Track logical parent via OpenTelemetry span links
 * 3. Add custom attributes as universal fallback
 *
 * @module
 */

import { Effect, FiberSet as EffectFiberSet, Tracer, Option, Context } from 'effect'
import type { Fiber, RuntimeFiber } from 'effect/Fiber'

/**
 * Options for span isolation when running effects in FiberSet
 */
export interface IsolationOptions {
  /**
   * Whether to create a root span (breaks parent chain)
   * @default true (from config or this default)
   */
  readonly createRoot?: boolean

  /**
   * Capture logical parent relationship via span links and attributes
   * @default true
   */
  readonly captureLogicalParent?: boolean

  /**
   * Use OpenTelemetry span links to track logical parent
   * Works in: Honeycomb, Datadog, Lightstep, SigNoz, Splunk
   * @default true
   */
  readonly useSpanLinks?: boolean

  /**
   * Add custom attributes for logical parent tracking
   * Works in: ALL observability tools (universal fallback)
   * @default true
   */
  readonly useAttributes?: boolean

  /**
   * Propagate interruption from parent
   * @default undefined (FiberSet.run default behavior)
   */
  readonly propagateInterruption?: boolean

  /**
   * Custom span attributes to add
   */
  readonly attributes?: Record<string, unknown>

  /**
   * Span category for Atrim grouping
   * @default "background_task"
   */
  readonly category?: string
}

/**
 * Create a span link to the logical parent span
 *
 * This maintains observability while using root spans to prevent context leakage.
 */
const createLogicalParentLink = (
  parentSpan: Tracer.AnySpan,
  useSpanLinks: boolean
): Tracer.SpanLink[] => {
  if (!useSpanLinks) {
    return []
  }

  return [
    {
      _tag: 'SpanLink' as const,
      span: parentSpan,
      attributes: {
        'link.type': 'logical_parent',
        'atrim.relationship': 'spawned_by',
        description: 'Logical parent (isolated to prevent context leakage)'
      }
    }
  ]
}

/**
 * Create attributes for logical parent tracking
 *
 * These serve as universal fallback for tools that don't support span links well.
 */
const createLogicalParentAttributes = (
  parentSpan: Tracer.AnySpan,
  useAttributes: boolean,
  category: string,
  useSpanLinks: boolean,
  customAttributes: Record<string, unknown>
): Record<string, unknown> => {
  if (!useAttributes) {
    return customAttributes
  }

  return {
    // Logical parent tracking (works in ALL tools)
    'atrim.logical_parent.span_id': parentSpan.spanId,
    'atrim.logical_parent.trace_id': parentSpan.traceId,
    'atrim.logical_parent.name': parentSpan._tag === 'Span' ? parentSpan.name : 'external',

    // Categorization and metadata
    'atrim.fiberset.isolated': true,
    'atrim.span.category': category,
    'atrim.has_logical_parent': true,
    'atrim.isolation.method': useSpanLinks ? 'hybrid' : 'attributes_only',

    // User-provided attributes
    ...customAttributes
  }
}

/**
 * Run an effect in a FiberSet with automatic span isolation and virtual parent tracking.
 *
 * This function prevents span context leakage (fibers inheriting parent spans incorrectly)
 * while maintaining logical parent relationships for observability.
 *
 * **Technical:** Uses `{ root: true }` to create independent root span
 * **Observability:** Uses span links + attributes to track logical parent
 *
 * @example
 * ```typescript
 * import { runIsolated } from "@atrim/instrumentation/effect/fiberset"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const set = yield* FiberSet.make()
 *
 *     yield* Effect.gen(function* () {
 *       // Spawn background tasks with automatic isolation
 *       yield* runIsolated(set, backgroundTask1(), "background-task-1")
 *       yield* runIsolated(set, backgroundTask2(), "background-task-2")
 *     }).pipe(
 *       Effect.withSpan("parent-operation")
 *     )
 *
 *     yield* Effect.sleep("100 millis")
 *   })
 * )
 *
 * // In Honeycomb/Datadog/SigNoz:
 * // - background tasks are ROOT spans (no context leakage)
 * // - span links show they were spawned by parent-operation
 * // - can reconstruct virtual hierarchy
 * ```
 *
 * @param set - The FiberSet to run the effect in
 * @param effect - The effect to run (will be isolated)
 * @param name - Span name for the isolated effect
 * @param options - Configuration options
 * @returns Effect that returns the forked fiber
 *
 * @see https://github.com/atrim-ai/instrumentation/issues/5
 */
export const runIsolated = <A, E, R>(
  set: EffectFiberSet.FiberSet<A, E>,
  effect: Effect.Effect<A, E, R>,
  name: string,
  options?: IsolationOptions
): Effect.Effect<RuntimeFiber<A, E>, never, R> => {
  const {
    createRoot = true,
    captureLogicalParent = true,
    useSpanLinks = true,
    useAttributes = true,
    propagateInterruption,
    attributes = {},
    category = 'background_task'
  } = options ?? {}

  // If not creating root and not capturing parent, just use standard FiberSet.run
  if (!createRoot && !captureLogicalParent) {
    return EffectFiberSet.run(set, effect, { propagateInterruption })
  }

  return Effect.gen(function* () {
    // Get current parent span (if any)
    const maybeParent = yield* Effect.serviceOption(Tracer.ParentSpan)

    // If no parent, just create root span
    if (maybeParent._tag === 'None' || !captureLogicalParent) {
      const isolated = effect.pipe(
        Effect.withSpan(name, {
          root: createRoot,
          attributes: {
            'atrim.fiberset.isolated': createRoot,
            'atrim.span.category': category,
            'atrim.has_logical_parent': false,
            ...attributes
          }
        })
      )

      return yield* EffectFiberSet.run(set, isolated, { propagateInterruption })
    }

    const parent = maybeParent.value

    // Create span links for logical parent tracking
    const links = createLogicalParentLink(parent, useSpanLinks)

    // Create attributes for universal fallback
    const spanAttributes = createLogicalParentAttributes(
      parent,
      useAttributes,
      category,
      useSpanLinks,
      attributes
    )

    // Create isolated effect with root span + logical parent tracking
    const isolated = effect.pipe(
      Effect.withSpan(name, {
        root: createRoot,
        links: links.length > 0 ? links : undefined,
        attributes: spanAttributes
      })
    )

    return yield* EffectFiberSet.run(set, isolated, { propagateInterruption })
  })
}

/**
 * Convenience function to run an effect in a FiberSet with automatic span isolation.
 *
 * This is a simpler version of `runIsolated` with sensible defaults.
 *
 * @example
 * ```typescript
 * yield* runWithSpan(set, "background-task", backgroundTask(), {
 *   attributes: { "task.priority": "high" }
 * })
 * ```
 */
export const runWithSpan = <A, E, R>(
  set: EffectFiberSet.FiberSet<A, E>,
  name: string,
  effect: Effect.Effect<A, E, R>,
  options?: {
    readonly propagateInterruption?: boolean
    readonly attributes?: Record<string, unknown>
    readonly category?: string
  }
): Effect.Effect<RuntimeFiber<A, E>, never, R> => {
  return runIsolated(set, effect, name, {
    createRoot: true,
    captureLogicalParent: true,
    useSpanLinks: true,
    useAttributes: true,
    ...options
  })
}

/**
 * Annotate the current span with metadata about spawned FiberSet tasks.
 *
 * Call this in the parent operation before spawning tasks to add metadata
 * that helps reconstruct the virtual hierarchy.
 *
 * @example
 * ```typescript
 * yield* Effect.gen(function* () {
 *   yield* annotateSpawnedTasks([
 *     { name: "background-task-1" },
 *     { name: "background-task-2" },
 *     { name: "background-task-3" }
 *   ])
 *
 *   yield* runIsolated(set, task1(), "background-task-1")
 *   yield* runIsolated(set, task2(), "background-task-2")
 *   yield* runIsolated(set, task3(), "background-task-3")
 * }).pipe(
 *   Effect.withSpan("parent-operation")
 * )
 * ```
 */
export const annotateSpawnedTasks = (
  tasks: Array<{ name: string; spanId?: string; category?: string }>
): Effect.Effect<void> => {
  return Effect.annotateCurrentSpan({
    'atrim.fiberset.spawned_count': tasks.length,
    'atrim.fiberset.task_names': tasks.map((t) => t.name).join(','),
    'atrim.has_background_tasks': true,
    'atrim.spawned_tasks': JSON.stringify(
      tasks.map((t) => ({
        name: t.name,
        ...(t.spanId && { span_id: t.spanId }),
        ...(t.category && { category: t.category })
      }))
    )
  })
}

/**
 * Re-export FiberSet namespace with isolation helpers
 *
 * This provides a convenient way to import all FiberSet functions:
 * ```typescript
 * import { FiberSet } from "@atrim/instrumentation/effect/fiberset"
 * ```
 */
export const FiberSet = {
  // Re-export all original FiberSet functions
  make: EffectFiberSet.make,
  add: EffectFiberSet.add,
  unsafeAdd: EffectFiberSet.unsafeAdd,
  run: EffectFiberSet.run,
  clear: EffectFiberSet.clear,
  join: EffectFiberSet.join,
  awaitEmpty: EffectFiberSet.awaitEmpty,
  size: EffectFiberSet.size,
  runtime: EffectFiberSet.runtime,
  runtimePromise: EffectFiberSet.runtimePromise,
  makeRuntime: EffectFiberSet.makeRuntime,
  makeRuntimePromise: EffectFiberSet.makeRuntimePromise,
  isFiberSet: EffectFiberSet.isFiberSet,

  // Add our isolation helpers
  runIsolated,
  runWithSpan
}
