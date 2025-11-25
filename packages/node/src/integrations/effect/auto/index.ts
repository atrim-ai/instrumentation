/**
 * Auto-Traced Effect Module
 *
 * Drop-in replacement for Effect with automatic tracing.
 * Import this instead of 'effect' to get automatic span creation.
 *
 * @example
 * ```typescript
 * // Instead of: import { Effect } from 'effect'
 * import { Effect } from '@atrim/instrument-node/effect/auto'
 *
 * // All operations are automatically traced
 * const program = Effect.gen(function* () {
 *   yield* Effect.sleep('100 millis')
 *   return 'done'
 * })
 * ```
 */

import { Effect as EffectOriginal, FiberRef, Layer, Context } from 'effect'
import { createSpanNameResolver, parseCallStack, type SpanNamingConfig } from './naming.js'

// Don't re-export everything - let users import what they need from 'effect'
// This avoids conflicts and bundle bloat

/**
 * Auto-tracing configuration service
 */
export class AutoTracingConfig extends Context.Tag('AutoTracingConfig')<
  AutoTracingConfig,
  {
    readonly enabled: boolean
    readonly namingConfig: SpanNamingConfig
    readonly filterPatterns: {
      include: string[]
      exclude: string[]
    }
    readonly sampling: {
      rate: number
      minDuration: string
    }
  }
>() {}

/**
 * FiberRef to disable auto-tracing for specific effects
 */
export const autoTracingDisabled = FiberRef.unsafeMake(false)

/**
 * FiberRef for custom span name override
 */
export const spanNameOverride = FiberRef.unsafeMake<string | undefined>(undefined)

/**
 * Default auto-tracing configuration
 */
const defaultConfig: SpanNamingConfig = {
  default: 'effect.{operator}',
  rules: []
}

/**
 * Disable auto-tracing for the wrapped effect
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* internalWork()
 * }).pipe(withoutAutoTracing())
 * ```
 */
export const withoutAutoTracing = <A, E, R>(
  self: EffectOriginal.Effect<A, E, R>
): EffectOriginal.Effect<A, E, R> => {
  return EffectOriginal.locally(autoTracingDisabled, true)(self)
}

/**
 * Set a custom span name for the wrapped effect
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * }).pipe(setSpanName('custom.name'))
 * ```
 */
export const setSpanName =
  (name: string) =>
  <A, E, R>(self: EffectOriginal.Effect<A, E, R>): EffectOriginal.Effect<A, E, R> => {
    return EffectOriginal.locally(spanNameOverride, name)(self)
  }

/**
 * Helper to wrap an effect with auto-tracing
 */
function autoTrace<A, E, R>(
  effect: EffectOriginal.Effect<A, E, R>,
  operator: string
): EffectOriginal.Effect<A, E, R> {
  const context = parseCallStack()
  const resolver = createSpanNameResolver(defaultConfig)
  const spanName = resolver(operator, context)

  return effect.pipe(EffectOriginal.withSpan(spanName))
}

/**
 * Create auto-traced version of Effect.gen
 */
function createAutoTracedGen(): typeof EffectOriginal.gen {
  return ((...args: Parameters<typeof EffectOriginal.gen>) => {
    const effect = EffectOriginal.gen(...args)
    return autoTrace(effect, 'gen')
  }) as typeof EffectOriginal.gen
}

/**
 * Create auto-traced version of Effect.all
 */
function createAutoTracedAll(): typeof EffectOriginal.all {
  return ((...args: Parameters<typeof EffectOriginal.all>) => {
    const effect = EffectOriginal.all(...args)
    return autoTrace(effect, 'all')
  }) as typeof EffectOriginal.all
}

/**
 * Create auto-traced version of Effect.forEach
 */
function createAutoTracedForEach(): typeof EffectOriginal.forEach {
  return ((...args: Parameters<typeof EffectOriginal.forEach>) => {
    const effect = EffectOriginal.forEach(...args)
    return autoTrace(effect, 'forEach')
  }) as typeof EffectOriginal.forEach
}

/**
 * Create auto-traced version of Effect.tryPromise
 */
function createAutoTracedTryPromise(): typeof EffectOriginal.tryPromise {
  return ((...args: Parameters<typeof EffectOriginal.tryPromise>) => {
    const effect = EffectOriginal.tryPromise(...args)
    return autoTrace(effect, 'tryPromise')
  }) as typeof EffectOriginal.tryPromise
}

/**
 * Create auto-traced version of Effect.promise
 */
function createAutoTracedPromise(): typeof EffectOriginal.promise {
  return ((...args: Parameters<typeof EffectOriginal.promise>) => {
    const effect = EffectOriginal.promise(...args)
    return autoTrace(effect, 'promise')
  }) as typeof EffectOriginal.promise
}

/**
 * Auto-traced Effect namespace
 *
 * Drop-in replacement for Effect with automatic tracing
 */
export const Effect = {
  ...EffectOriginal,

  // Auto-traced operators
  gen: createAutoTracedGen(),
  all: createAutoTracedAll(),
  forEach: createAutoTracedForEach(),
  tryPromise: createAutoTracedTryPromise(),
  promise: createAutoTracedPromise()

  // TODO: Add more auto-traced operators as needed
  // - race
  // - raceAll
  // - timeout
  // - retry
  // - etc.
}

/**
 * Create the AutoTracingLive layer
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* doWork()
 * })
 *
 * await Effect.runPromise(
 *   program.pipe(Effect.provide(AutoTracingLive))
 * )
 * ```
 */
export const AutoTracingLive = Layer.succeed(AutoTracingConfig, {
  enabled: true,
  namingConfig: defaultConfig,
  filterPatterns: {
    include: [],
    exclude: []
  },
  sampling: {
    rate: 1.0,
    minDuration: '0 millis'
  }
})

/**
 * Create custom auto-tracing layer with configuration
 *
 * @example
 * ```typescript
 * const CustomAutoTracing = createAutoTracingLayer({
 *   namingConfig: {
 *     default: '{module}.{function}',
 *     rules: [
 *       {
 *         match: { file: 'src/api/.*' },
 *         name: 'api.{function}'
 *       }
 *     ]
 *   },
 *   filterPatterns: {
 *     include: ['^app\\.', '^api\\.'],
 *     exclude: ['^internal\\.']
 *   },
 *   sampling: {
 *     rate: 0.1,
 *     minDuration: '50 millis'
 *   }
 * })
 * ```
 */
export function createAutoTracingLayer(config: {
  namingConfig?: SpanNamingConfig
  filterPatterns?: {
    include?: string[]
    exclude?: string[]
  }
  sampling?: {
    rate?: number
    minDuration?: string
  }
}) {
  return Layer.succeed(AutoTracingConfig, {
    enabled: true,
    namingConfig: config.namingConfig || defaultConfig,
    filterPatterns: {
      include: config.filterPatterns?.include || [],
      exclude: config.filterPatterns?.exclude || []
    },
    sampling: {
      rate: config.sampling?.rate ?? 1.0,
      minDuration: config.sampling?.minDuration || '0 millis'
    }
  })
}

// Export naming utilities
export { parseCallStack, resolveSpanName, createSpanNameResolver } from './naming.js'
export type { SpanNamingContext, SpanNamingConfig } from './naming.js'
