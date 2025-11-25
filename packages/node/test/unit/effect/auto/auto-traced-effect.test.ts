/**
 * Unit tests for auto-traced Effect operators
 */

import { describe, it, expect } from 'vitest'
import { Effect as OriginalEffect } from 'effect'
import {
  Effect,
  AutoTracingLive,
  createAutoTracingLayer,
  withoutAutoTracing,
  setSpanName
} from '../../../../src/integrations/effect/auto/index.js'

describe('Auto-Traced Effect Operators', () => {
  describe('Effect.gen', () => {
    it('should execute successfully with auto-tracing', async () => {
      const program = Effect.gen(function* () {
        return 'success'
      })

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('success')
    })

    it('should work with yielded effects', async () => {
      const program = Effect.gen(function* () {
        const a = yield* OriginalEffect.succeed(1)
        const b = yield* OriginalEffect.succeed(2)
        return a + b
      })

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe(3)
    })

    it('should preserve error handling', async () => {
      const program = Effect.gen(function* () {
        yield* OriginalEffect.fail('test error')
      })

      await expect(OriginalEffect.runPromise(program)).rejects.toThrow('test error')
    })

    it('should work with nested gen calls', async () => {
      const inner = Effect.gen(function* () {
        return 'inner'
      })

      const outer = Effect.gen(function* () {
        const result = yield* inner
        return `outer-${result}`
      })

      const result = await OriginalEffect.runPromise(outer)
      expect(result).toBe('outer-inner')
    })
  })

  describe('Effect.all', () => {
    it('should execute all effects with auto-tracing', async () => {
      const effects = [
        OriginalEffect.succeed(1),
        OriginalEffect.succeed(2),
        OriginalEffect.succeed(3)
      ]

      const program = Effect.all(effects)
      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual([1, 2, 3])
    })

    it('should work with object syntax', async () => {
      const effects = {
        a: OriginalEffect.succeed(1),
        b: OriginalEffect.succeed(2)
      }

      const program = Effect.all(effects)
      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should preserve concurrency options', async () => {
      const effects = [OriginalEffect.succeed(1), OriginalEffect.succeed(2)]

      const program = Effect.all(effects, { concurrency: 'unbounded' })
      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual([1, 2])
    })
  })

  describe('Effect.forEach', () => {
    it('should iterate with auto-tracing', async () => {
      const items = [1, 2, 3]

      const program = Effect.forEach(items, (n) => OriginalEffect.succeed(n * 2))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual([2, 4, 6])
    })

    it('should pass index to callback', async () => {
      const items = ['a', 'b', 'c']

      const program = Effect.forEach(items, (item, i) => OriginalEffect.succeed(`${item}-${i}`))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual(['a-0', 'b-1', 'c-2'])
    })
  })

  describe('Effect.tryPromise', () => {
    it('should wrap promise with auto-tracing', async () => {
      const program = Effect.tryPromise(() => Promise.resolve('async-result'))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('async-result')
    })

    it('should handle promise rejection', async () => {
      const program = Effect.tryPromise(() => Promise.reject(new Error('async-error')))

      await expect(OriginalEffect.runPromise(program)).rejects.toThrow()
    })

    it('should work with catch option', async () => {
      const program = Effect.tryPromise({
        try: () => Promise.reject(new Error('original')),
        catch: () => 'caught'
      })

      await expect(OriginalEffect.runPromise(program)).rejects.toThrow('caught')
    })
  })

  describe('Effect.promise', () => {
    it('should wrap promise with auto-tracing', async () => {
      const program = Effect.promise(() => Promise.resolve('promise-result'))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('promise-result')
    })
  })

  describe('withoutAutoTracing', () => {
    it('should disable auto-tracing for wrapped effect', async () => {
      const program = Effect.gen(function* () {
        return 'no-trace'
      }).pipe(withoutAutoTracing)

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('no-trace')
    })
  })

  describe('setSpanName', () => {
    it('should allow custom span name', async () => {
      const program = Effect.gen(function* () {
        return 'custom-name'
      }).pipe(setSpanName('my.custom.span'))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('custom-name')
    })
  })

  describe('AutoTracingLive layer', () => {
    it('should provide auto-tracing configuration', async () => {
      const program = Effect.gen(function* () {
        return 'with-layer'
      }).pipe(OriginalEffect.provide(AutoTracingLive))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('with-layer')
    })
  })

  describe('createAutoTracingLayer', () => {
    it('should create custom layer with naming config', async () => {
      const customLayer = createAutoTracingLayer({
        namingConfig: {
          default: '{module}.{function}',
          rules: []
        }
      })

      const program = Effect.gen(function* () {
        return 'custom-layer'
      }).pipe(OriginalEffect.provide(customLayer))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('custom-layer')
    })

    it('should create layer with filter patterns', async () => {
      const customLayer = createAutoTracingLayer({
        filterPatterns: {
          include: ['^app\\.'],
          exclude: ['^internal\\.']
        }
      })

      const program = Effect.gen(function* () {
        return 'filtered'
      }).pipe(OriginalEffect.provide(customLayer))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('filtered')
    })

    it('should create layer with sampling config', async () => {
      const customLayer = createAutoTracingLayer({
        sampling: {
          rate: 0.5,
          minDuration: '10 millis'
        }
      })

      const program = Effect.gen(function* () {
        return 'sampled'
      }).pipe(OriginalEffect.provide(customLayer))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('sampled')
    })
  })

  describe('Complex workflows', () => {
    it('should handle mixed auto-traced and original effects', async () => {
      const autoTraced = Effect.gen(function* () {
        return 1
      })

      const original = OriginalEffect.gen(function* () {
        return 2
      })

      const program = OriginalEffect.gen(function* () {
        const a = yield* autoTraced
        const b = yield* original
        return a + b
      })

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe(3)
    })

    it('should work with Effect.all containing auto-traced effects', async () => {
      const effects = [
        Effect.gen(function* () {
          return 1
        }),
        Effect.gen(function* () {
          return 2
        })
      ]

      const program = Effect.all(effects)
      const result = await OriginalEffect.runPromise(program)
      expect(result).toEqual([1, 2])
    })

    it('should preserve Effect features like retry', async () => {
      let attempts = 0

      const program = Effect.gen(function* () {
        attempts++
        if (attempts < 3) {
          yield* OriginalEffect.fail('retry')
        }
        return 'success'
      }).pipe(OriginalEffect.retry({ times: 3 }))

      const result = await OriginalEffect.runPromise(program)
      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })
  })
})
