/**
 * Unit tests for Effect metadata extraction
 */

import { describe, it, expect } from 'vitest'
import { Effect, Fiber } from 'effect'
import { extractEffectMetadata } from '../../../src/integrations/effect/metadata-extractor.js'

describe('Effect Metadata Extraction', () => {
  describe('extractEffectMetadata', () => {
    it('should extract fiber ID from current fiber', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // Should have fiber ID when running in Effect context
        expect(metadata['effect.fiber.id']).toBeDefined()
        expect(typeof metadata['effect.fiber.id']).toBe('string')

        return metadata
      })

      const result = await Effect.runPromise(program)
      expect(result).toBeDefined()
    })

    it('should detect root operation when no parent span', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // When not inside a span, should be marked as root
        expect(metadata['effect.operation.root']).toBe(true)
        expect(metadata['effect.operation.nested']).toBe(false)

        // Should not have parent span info
        expect(metadata['effect.parent.span.id']).toBeUndefined()
        expect(metadata['effect.parent.span.name']).toBeUndefined()

        return metadata
      })

      await Effect.runPromise(program)
    })

    it('should detect nested operation when inside a span', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // When inside a span, should be marked as nested
        expect(metadata['effect.operation.nested']).toBe(true)
        expect(metadata['effect.operation.root']).toBe(false)

        // Should have parent span info
        expect(metadata['effect.parent.span.name']).toBe('parent.span')
        expect(metadata['effect.parent.span.id']).toBeDefined()
        expect(metadata['effect.parent.trace.id']).toBeDefined()

        return metadata
      }).pipe(Effect.withSpan('parent.span'))

      await Effect.runPromise(program)
    })

    it('should extract fiber status', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // Should have fiber status
        expect(metadata['effect.fiber.status']).toBeDefined()
        expect(typeof metadata['effect.fiber.status']).toBe('string')

        return metadata
      })

      await Effect.runPromise(program)
    })

    it('should work in deeply nested spans', async () => {
      const program = Effect.gen(function* () {
        const outerMetadata = yield* extractEffectMetadata()

        const innerMetadata = yield* Effect.gen(function* () {
          const metadata = yield* extractEffectMetadata()

          // Should detect inner span as nested
          expect(metadata['effect.operation.nested']).toBe(true)
          expect(metadata['effect.parent.span.name']).toBe('inner.span')

          return metadata
        }).pipe(Effect.withSpan('inner.span'))

        // Both should have metadata
        expect(outerMetadata['effect.fiber.id']).toBeDefined()
        expect(innerMetadata['effect.fiber.id']).toBeDefined()

        return { outerMetadata, innerMetadata }
      }).pipe(Effect.withSpan('outer.span'))

      const result = await Effect.runPromise(program)

      expect(result.outerMetadata['effect.parent.span.name']).toBe('outer.span')
      expect(result.innerMetadata['effect.parent.span.name']).toBe('inner.span')
    })

    it('should be composable with other Effect operations', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // Can use metadata in subsequent operations
        const hasParent = metadata['effect.operation.nested']

        yield* Effect.succeed(hasParent)

        return { metadata, hasParent }
      }).pipe(Effect.withSpan('test.span'))

      const result = await Effect.runPromise(program)

      expect(result.metadata).toBeDefined()
      expect(result.hasParent).toBe(true)
    })

    it('should extract metadata multiple times in same span', async () => {
      const program = Effect.gen(function* () {
        const metadata1 = yield* extractEffectMetadata()
        const metadata2 = yield* extractEffectMetadata()

        // Both should have same fiber ID
        expect(metadata1['effect.fiber.id']).toBe(metadata2['effect.fiber.id'])

        // Both should detect same nesting
        expect(metadata1['effect.operation.nested']).toBe(metadata2['effect.operation.nested'])

        return { metadata1, metadata2 }
      }).pipe(Effect.withSpan('test.span'))

      await Effect.runPromise(program)
    })

    it('should handle concurrent fiber execution', async () => {
      const program = Effect.gen(function* () {
        // Fork multiple fibers and extract metadata from each
        const fiber1 = yield* Effect.fork(
          Effect.gen(function* () {
            const metadata = yield* extractEffectMetadata()
            return metadata
          }).pipe(Effect.withSpan('fiber1.span'))
        )

        const fiber2 = yield* Effect.fork(
          Effect.gen(function* () {
            const metadata = yield* extractEffectMetadata()
            return metadata
          }).pipe(Effect.withSpan('fiber2.span'))
        )

        const metadata1 = yield* Fiber.join(fiber1)
        const metadata2 = yield* Fiber.join(fiber2)

        // Each fiber should have its own fiber ID
        expect(metadata1['effect.fiber.id']).toBeDefined()
        expect(metadata2['effect.fiber.id']).toBeDefined()

        // Each should detect parent span correctly
        expect(metadata1['effect.parent.span.name']).toBe('fiber1.span')
        expect(metadata2['effect.parent.span.name']).toBe('fiber2.span')

        return { metadata1, metadata2 }
      })

      await Effect.runPromise(program)
    })
  })

  describe('EffectMetadata interface', () => {
    it('should have all expected metadata fields', async () => {
      const program = Effect.gen(function* () {
        const metadata = yield* extractEffectMetadata()

        // Check that metadata object has expected shape
        expect(metadata).toBeDefined()
        expect(typeof metadata).toBe('object')

        // Fiber fields should exist when in Effect context
        if ('effect.fiber.id' in metadata) {
          expect(typeof metadata['effect.fiber.id']).toBe('string')
        }

        if ('effect.fiber.status' in metadata) {
          expect(typeof metadata['effect.fiber.status']).toBe('string')
        }

        // Operation fields should be boolean
        expect(typeof metadata['effect.operation.root']).toBe('boolean')
        expect(typeof metadata['effect.operation.nested']).toBe('boolean')

        return metadata
      })

      await Effect.runPromise(program)
    })
  })
})
