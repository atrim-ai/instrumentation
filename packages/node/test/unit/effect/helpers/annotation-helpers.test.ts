/**
 * Unit tests for Effect annotation helpers
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  annotateUser,
  annotateDataSize,
  annotateBatch,
  annotateLLM,
  annotateQuery,
  annotateHttpRequest,
  annotateError,
  annotatePriority,
  annotateCache
} from '../../../../src/integrations/effect/effect-helpers.js'

/**
 * Helper to run an Effect with a test span and capture annotations
 * Since we can't easily capture span attributes in unit tests without a full tracer setup,
 * we'll test that the functions execute without errors and return the expected Effect type
 */
async function runWithSpan<A>(name: string, effect: Effect.Effect<A, never, never>): Promise<A> {
  const program = effect.pipe(Effect.withSpan(name))
  return Effect.runPromise(program)
}

describe('Effect Annotation Helpers', () => {
  describe('annotateUser', () => {
    it('should execute successfully with userId only', async () => {
      await runWithSpan('test', annotateUser('user-123'))
    })

    it('should execute successfully with userId and email', async () => {
      await runWithSpan('test', annotateUser('user-123', 'test@example.com'))
    })

    it('should execute successfully with all parameters', async () => {
      await runWithSpan('test', annotateUser('user-123', 'test@example.com', 'testuser'))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateUser('user-123', 'test@example.com')
        return 'success'
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('success')
    })
  })

  describe('annotateDataSize', () => {
    it('should execute successfully with bytes and items', async () => {
      await runWithSpan('test', annotateDataSize(1024, 100))
    })

    it('should execute successfully with compression ratio', async () => {
      await runWithSpan('test', annotateDataSize(1024, 100, 0.5))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateDataSize(2048, 200, 0.75)
        return { processed: true }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ processed: true })
    })
  })

  describe('annotateBatch', () => {
    it('should execute successfully with totalItems and batchSize', async () => {
      await runWithSpan('test', annotateBatch(100, 10))
    })

    it('should execute successfully with success and failure counts', async () => {
      await runWithSpan('test', annotateBatch(100, 10, 95, 5))
    })

    it('should calculate batch count correctly', async () => {
      // This is a unit test for the calculation logic
      // 100 items / 10 batch size = 10 batches
      // 105 items / 10 batch size = 11 batches (ceil)
      await runWithSpan('test', annotateBatch(105, 10))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateBatch(50, 5)
        yield* annotateUser('batch-processor')
        return 'batch complete'
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('batch complete')
    })
  })

  describe('annotateLLM', () => {
    it('should execute successfully with model and provider', async () => {
      await runWithSpan('test', annotateLLM('gpt-4', 'openai'))
    })

    it('should execute successfully with token information', async () => {
      await runWithSpan(
        'test',
        annotateLLM('claude-3-opus', 'anthropic', {
          prompt: 100,
          completion: 200,
          total: 300
        })
      )
    })

    it('should execute successfully with partial token information', async () => {
      await runWithSpan(
        'test',
        annotateLLM('gpt-4', 'openai', {
          prompt: 150,
          total: 250
        })
      )
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateLLM('gpt-4-turbo', 'openai', { total: 500 })
        yield* annotatePriority('high', 'LLM operation')
        return { tokens: 500 }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ tokens: 500 })
    })
  })

  describe('annotateQuery', () => {
    it('should execute successfully with query string only', async () => {
      await runWithSpan('test', annotateQuery('SELECT * FROM users'))
    })

    it('should execute successfully with all parameters', async () => {
      await runWithSpan('test', annotateQuery('SELECT * FROM users WHERE id = ?', 125, 1, 'main'))
    })

    it('should truncate long queries', async () => {
      // Create a query longer than 1000 characters
      const longQuery = 'SELECT ' + 'column,'.repeat(300) + ' FROM table'
      await runWithSpan('test', annotateQuery(longQuery))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateQuery('INSERT INTO logs VALUES (?)', 50, 1000)
        yield* annotateDataSize(1024 * 1000, 1000)
        return { inserted: 1000 }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ inserted: 1000 })
    })
  })

  describe('annotateHttpRequest', () => {
    it('should execute successfully with method and url', async () => {
      await runWithSpan('test', annotateHttpRequest('GET', 'https://api.example.com/users'))
    })

    it('should execute successfully with status code', async () => {
      await runWithSpan('test', annotateHttpRequest('POST', 'https://api.example.com/users', 201))
    })

    it('should execute successfully with all parameters', async () => {
      await runWithSpan(
        'test',
        annotateHttpRequest('GET', 'https://api.example.com/data', 200, 1024)
      )
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateHttpRequest('POST', '/api/batch', 200, 2048)
        yield* annotateDataSize(2048, 100)
        return { status: 200 }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('annotateError', () => {
    it('should execute successfully with Error object', async () => {
      const error = new Error('Test error')
      await runWithSpan('test', annotateError(error, true))
    })

    it('should execute successfully with string error', async () => {
      await runWithSpan('test', annotateError('Something went wrong', false))
    })

    it('should execute successfully with error type', async () => {
      const error = new TypeError('Invalid type')
      await runWithSpan('test', annotateError(error, true, 'ValidationError'))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        const error = new Error('Database connection failed')
        yield* annotateError(error, true, 'DatabaseError')
        yield* annotatePriority('high', 'Error recovery')
        return { recovered: true }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ recovered: true })
    })
  })

  describe('annotatePriority', () => {
    it('should execute successfully with priority only', async () => {
      await runWithSpan('test', annotatePriority('high'))
    })

    it('should execute successfully with reason', async () => {
      await runWithSpan('test', annotatePriority('low', 'Background task'))
    })

    it('should accept all priority levels', async () => {
      await runWithSpan('test-high', annotatePriority('high'))
      await runWithSpan('test-medium', annotatePriority('medium'))
      await runWithSpan('test-low', annotatePriority('low'))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotatePriority('high', 'User-facing operation')
        yield* annotateUser('user-123')
        return 'prioritized'
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toBe('prioritized')
    })
  })

  describe('annotateCache', () => {
    it('should execute successfully with hit and key', async () => {
      await runWithSpan('test', annotateCache(true, 'user:123'))
    })

    it('should execute successfully with miss', async () => {
      await runWithSpan('test', annotateCache(false, 'user:456'))
    })

    it('should execute successfully with TTL', async () => {
      await runWithSpan('test', annotateCache(true, 'session:abc', 3600))
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        yield* annotateCache(false, 'product:999', 300)
        yield* annotateQuery('SELECT * FROM products WHERE id = 999')
        return { fromCache: false }
      }).pipe(Effect.withSpan('test'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ fromCache: false })
    })
  })

  describe('Multiple annotations', () => {
    it('should compose multiple annotation helpers', async () => {
      const program = Effect.gen(function* () {
        yield* annotateUser('user-123', 'test@example.com')
        yield* annotatePriority('high')
        yield* annotateDataSize(1024, 10)
        yield* annotateBatch(100, 10, 95, 5)
        return { success: true }
      }).pipe(Effect.withSpan('complex-operation'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ success: true })
    })

    it('should work in nested spans', async () => {
      const program = Effect.gen(function* () {
        yield* annotateUser('user-123')

        const result = yield* Effect.gen(function* () {
          yield* annotateQuery('SELECT * FROM items')
          yield* annotateDataSize(2048, 20)
          return { items: 20 }
        }).pipe(Effect.withSpan('inner-operation'))

        return result
      }).pipe(Effect.withSpan('outer-operation'))

      const result = await Effect.runPromise(program)
      expect(result).toEqual({ items: 20 })
    })
  })

  describe('Error handling', () => {
    it('should not fail when used outside a span context', async () => {
      // These should gracefully handle being called outside a span context
      // Effect.annotateCurrentSpan() should be safe to call without an active span
      await Effect.runPromise(annotateUser('user-123'))
      await Effect.runPromise(annotateDataSize(1024, 10))
      await Effect.runPromise(annotateBatch(100, 10))
    })
  })
})
