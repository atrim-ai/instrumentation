/**
 * Unit tests for Effect auto-enrichment utilities
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  autoEnrichSpan,
  withAutoEnrichedSpan
} from '../../../src/integrations/effect/auto-enrichment.js'
import { annotateBatch, annotateUser } from '../../../src/integrations/effect/effect-helpers.js'

describe('Effect Auto-Enrichment', () => {
  describe('autoEnrichSpan', () => {
    it('should execute successfully within a span context', async () => {
      const program = Effect.gen(function* () {
        yield* autoEnrichSpan()
        return 'success'
      }).pipe(Effect.withSpan('test.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('success')
    })

    it('should be composable with annotation helpers', async () => {
      const program = Effect.gen(function* () {
        yield* autoEnrichSpan()
        yield* annotateUser('user-123', 'test@example.com')
        yield* annotateBatch(100, 10)
        return { enriched: true }
      }).pipe(Effect.withSpan('enriched.span'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ enriched: true })
    })

    it('should work with nested spans', async () => {
      const program = Effect.gen(function* () {
        yield* autoEnrichSpan()

        const innerResult = yield* Effect.gen(function* () {
          yield* autoEnrichSpan()
          return 'inner'
        }).pipe(Effect.withSpan('inner.span'))

        return { outer: 'outer', inner: innerResult }
      }).pipe(Effect.withSpan('outer.span'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ outer: 'outer', inner: 'inner' })
    })

    it('should not fail when called outside span context', async () => {
      // Should gracefully handle being called without an active span
      const program = autoEnrichSpan()
      await Effect.runPromise(program)
    })

    it('should be usable multiple times in same span', async () => {
      const program = Effect.gen(function* () {
        yield* autoEnrichSpan()
        yield* annotateUser('user-1')

        // Enrich again after some work
        yield* Effect.succeed('work')

        yield* autoEnrichSpan()
        yield* annotateBatch(10, 5)

        return 'done'
      }).pipe(Effect.withSpan('multi-enrich.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('done')
    })
  })

  describe('withAutoEnrichedSpan', () => {
    it('should create a span and auto-enrich it', async () => {
      const program = withAutoEnrichedSpan('auto.span')(Effect.succeed('result'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('result')
    })

    it('should work with Effect.gen programs', async () => {
      const program = withAutoEnrichedSpan('gen.span')(
        Effect.gen(function* () {
          yield* annotateUser('user-123')
          return { processed: true }
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ processed: true })
    })

    it('should accept span options', async () => {
      const program = withAutoEnrichedSpan('configured.span', {
        kind: 'client',
        attributes: { custom: 'value' }
      })(Effect.succeed('configured'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('configured')
    })

    it('should work with nested withAutoEnrichedSpan calls', async () => {
      const program = withAutoEnrichedSpan('outer')(
        Effect.gen(function* () {
          const innerResult = yield* withAutoEnrichedSpan('inner')(Effect.succeed('inner-value'))

          return { outer: 'outer-value', inner: innerResult }
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ outer: 'outer-value', inner: 'inner-value' })
    })

    it('should be composable with manual annotations', async () => {
      const program = withAutoEnrichedSpan('composite.span')(
        Effect.gen(function* () {
          yield* annotateUser('user-456', 'composite@example.com')
          yield* annotateBatch(50, 10, 48, 2)
          return { items: 50, success: 48, failed: 2 }
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ items: 50, success: 48, failed: 2 })
    })

    it('should preserve Effect error handling', async () => {
      class TestError extends Error {
        readonly _tag = 'TestError'
      }

      const program = withAutoEnrichedSpan('error.span')(
        Effect.gen(function* () {
          yield* autoEnrichSpan()
          yield* Effect.fail(new TestError('test error'))
        })
      )

      await expect(Effect.runPromise(program)).rejects.toThrow('test error')
    })

    it('should work with Effect.all for concurrent operations', async () => {
      const programs = [
        withAutoEnrichedSpan('span1')(Effect.succeed(1)),
        withAutoEnrichedSpan('span2')(Effect.succeed(2)),
        withAutoEnrichedSpan('span3')(Effect.succeed(3))
      ]

      const result = await Effect.runPromise(Effect.all(programs))
      expect(result).toEqual([1, 2, 3])
    })

    it('should integrate with complex Effect workflows', async () => {
      const fetchData = withAutoEnrichedSpan('fetch.data')(
        Effect.gen(function* () {
          yield* annotateUser('fetcher')
          return [1, 2, 3, 4, 5]
        })
      )

      const processData = (items: number[]) =>
        withAutoEnrichedSpan('process.data')(
          Effect.gen(function* () {
            yield* annotateBatch(items.length, 2)
            const sum = items.reduce((a, b) => a + b, 0)
            return sum
          })
        )

      const program = Effect.gen(function* () {
        const data = yield* fetchData
        const result = yield* processData(data)
        return result
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe(15) // 1+2+3+4+5
    })
  })

  describe('Integration with both utilities', () => {
    it('should work when mixing autoEnrichSpan and withAutoEnrichedSpan', async () => {
      const program = Effect.gen(function* () {
        yield* autoEnrichSpan()
        yield* annotateUser('outer-user')

        const innerResult = yield* withAutoEnrichedSpan('inner')(
          Effect.gen(function* () {
            yield* annotateBatch(20, 5)
            return 'inner-done'
          })
        )

        return { outer: 'outer-done', inner: innerResult }
      }).pipe(Effect.withSpan('outer'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ outer: 'outer-done', inner: 'inner-done' })
    })
  })
})
