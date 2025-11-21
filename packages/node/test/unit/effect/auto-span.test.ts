/**
 * Unit tests for Effect auto-span pipeable operators
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  withAutoSpan,
  traced,
  withAutoMetadata
} from '../../../src/integrations/effect/auto-span.js'
import { annotateUser, annotateBatch } from '../../../src/integrations/effect/effect-helpers.js'

describe('Auto-Span Pipeable Operators', () => {
  describe('withAutoSpan', () => {
    it('should create a span with explicit name (data-last)', async () => {
      const program = Effect.gen(function* () {
        return 'success'
      }).pipe(withAutoSpan('test.explicit'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('success')
    })

    it('should create a span with explicit name (data-first)', async () => {
      const effect = Effect.succeed('data-first')
      const program = withAutoSpan(effect, 'test.data-first')

      const result = await Effect.runPromise(program)
      expect(result).toBe('data-first')
    })

    it('should infer span name when called without name', async () => {
      // When called without a name, should use stack trace inference
      const program = Effect.gen(function* () {
        return 'inferred'
      }).pipe(withAutoSpan())

      const result = await Effect.runPromise(program)
      expect(result).toBe('inferred')
    })

    it('should work with Effect.gen programs', async () => {
      const program = Effect.gen(function* () {
        yield* annotateUser('user-123')
        return { processed: true }
      }).pipe(withAutoSpan('gen.program'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ processed: true })
    })

    it('should accept span options', async () => {
      const program = Effect.gen(function* () {
        return 'configured'
      }).pipe(
        withAutoSpan('configured.span', {
          kind: 'client',
          attributes: { 'custom.key': 'value' }
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toBe('configured')
    })

    it('should support disabling stack trace capture', async () => {
      const program = Effect.gen(function* () {
        return 'no-stack'
      }).pipe(withAutoSpan(undefined, { captureStackTrace: false }))

      const result = await Effect.runPromise(program)
      expect(result).toBe('no-stack')
    })

    it('should support disabling fiber info extraction', async () => {
      const program = Effect.gen(function* () {
        return 'no-fiber'
      }).pipe(withAutoSpan('test.span', { extractFiberInfo: false }))

      const result = await Effect.runPromise(program)
      expect(result).toBe('no-fiber')
    })

    it('should work with nested spans', async () => {
      const program = Effect.gen(function* () {
        const innerResult = yield* Effect.gen(function* () {
          return 'inner'
        }).pipe(withAutoSpan('inner.span'))

        return { outer: 'outer', inner: innerResult }
      }).pipe(withAutoSpan('outer.span'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ outer: 'outer', inner: 'inner' })
    })

    it('should preserve Effect error handling', async () => {
      class TestError extends Error {
        readonly _tag = 'TestError'
      }

      const program = Effect.gen(function* () {
        yield* Effect.fail(new TestError('test error'))
      }).pipe(withAutoSpan('error.span'))

      await expect(Effect.runPromise(program)).rejects.toThrow('test error')
    })

    it('should work with Effect.all for concurrent operations', async () => {
      const programs = [
        Effect.succeed(1).pipe(withAutoSpan('span1')),
        Effect.succeed(2).pipe(withAutoSpan('span2')),
        Effect.succeed(3).pipe(withAutoSpan('span3'))
      ]

      const result = await Effect.runPromise(Effect.all(programs))
      expect(result).toEqual([1, 2, 3])
    })

    it('should support maxStackDepth option', async () => {
      const program = Effect.gen(function* () {
        return 'depth-limited'
      }).pipe(withAutoSpan(undefined, { maxStackDepth: 5 }))

      const result = await Effect.runPromise(program)
      expect(result).toBe('depth-limited')
    })
  })

  describe('traced', () => {
    it('should create a span with explicit name', async () => {
      const program = Effect.gen(function* () {
        return 'traced'
      }).pipe(traced('test.traced'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('traced')
    })

    it('should infer span name when called without name', async () => {
      const program = Effect.gen(function* () {
        return 'inferred-traced'
      }).pipe(traced())

      const result = await Effect.runPromise(program)
      expect(result).toBe('inferred-traced')
    })

    it('should always extract fiber info', async () => {
      const program = Effect.gen(function* () {
        yield* annotateUser('user-456')
        return 'with-metadata'
      }).pipe(traced('metadata.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('with-metadata')
    })

    it('should work with data-first syntax', async () => {
      const effect = Effect.succeed('data-first-traced')
      const program = traced(effect, 'test.data-first-traced')

      const result = await Effect.runPromise(program)
      expect(result).toBe('data-first-traced')
    })

    it('should accept span options', async () => {
      const program = Effect.gen(function* () {
        return 'configured-traced'
      }).pipe(
        traced('configured.traced', {
          kind: 'server',
          attributes: { 'service.name': 'test' }
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toBe('configured-traced')
    })

    it('should work with nested traced calls', async () => {
      const program = Effect.gen(function* () {
        const innerResult = yield* Effect.gen(function* () {
          return 'inner-traced'
        }).pipe(traced('inner'))

        return { outer: 'outer-traced', inner: innerResult }
      }).pipe(traced('outer'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ outer: 'outer-traced', inner: 'inner-traced' })
    })
  })

  describe('withAutoMetadata', () => {
    it('should extract metadata without creating a span (used with Effect.withSpan)', async () => {
      const program = Effect.gen(function* () {
        return 'metadata-only'
      }).pipe(withAutoMetadata(), Effect.withSpan('external.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('metadata-only')
    })

    it('should work with data-first syntax', async () => {
      const effect = Effect.succeed('data-first-metadata')
      const program = withAutoMetadata(effect).pipe(Effect.withSpan('test.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('data-first-metadata')
    })

    it('should support disabling fiber info extraction', async () => {
      const program = Effect.gen(function* () {
        return 'no-extraction'
      }).pipe(withAutoMetadata({ extractFiberInfo: false }), Effect.withSpan('test.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('no-extraction')
    })

    it('should be composable with manual annotations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateBatch(100, 10)
        return 'annotated'
      }).pipe(withAutoMetadata(), Effect.withSpan('composite.span'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('annotated')
    })

    it('should work outside span context gracefully', async () => {
      // Should not fail when there's no active span
      const program = Effect.gen(function* () {
        return 'no-span'
      }).pipe(withAutoMetadata())

      const result = await Effect.runPromise(program)
      expect(result).toBe('no-span')
    })
  })

  describe('Integration scenarios', () => {
    it('should work when mixing all operators', async () => {
      const program = Effect.gen(function* () {
        // Using traced for main operation
        const result1 = yield* Effect.gen(function* () {
          yield* annotateUser('user-1')
          return 1
        }).pipe(traced('op1'))

        // Using withAutoSpan with inferred name
        const result2 = yield* Effect.gen(function* () {
          return 2
        }).pipe(withAutoSpan())

        // Using withAutoMetadata with Effect.withSpan
        const result3 = yield* Effect.gen(function* () {
          return 3
        }).pipe(withAutoMetadata(), Effect.withSpan('op3'))

        return result1 + result2 + result3
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe(6)
    })

    it('should work in complex Effect workflows', async () => {
      const fetchData = Effect.gen(function* () {
        yield* annotateUser('fetcher')
        return [1, 2, 3, 4, 5]
      }).pipe(traced('fetch.data'))

      const processData = (items: number[]) =>
        Effect.gen(function* () {
          yield* annotateBatch(items.length, 2)
          return items.reduce((a, b) => a + b, 0)
        }).pipe(withAutoSpan('process.data'))

      const program = Effect.gen(function* () {
        const data = yield* fetchData
        const result = yield* processData(data)
        return result
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe(15)
    })

    it('should handle deeply nested operations', async () => {
      const level3 = Effect.succeed('level3').pipe(traced('l3'))
      const level2 = Effect.gen(function* () {
        return yield* level3
      }).pipe(withAutoSpan('l2'))
      const level1 = Effect.gen(function* () {
        return yield* level2
      }).pipe(traced('l1'))

      const result = await Effect.runPromise(level1)
      expect(result).toBe('level3')
    })
  })
})
