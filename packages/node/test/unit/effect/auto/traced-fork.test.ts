/**
 * Tests for tracedFork - call site capture
 */

import { describe, it, expect } from 'vitest'
import { Effect, Fiber, FiberRef } from 'effect'
import {
  tracedFork,
  tracedForkDaemon,
  CapturedSourceLocation
} from '../../../../src/integrations/effect/auto/traced-fork.js'

describe('tracedFork', () => {
  it('should capture call site and propagate to forked fiber', async () => {
    const program = Effect.gen(function* () {
      // Use tracedFork to capture call site
      const child = yield* tracedFork(
        Effect.gen(function* () {
          // Read the captured source location
          const location = yield* FiberRef.get(CapturedSourceLocation)
          return location
        })
      )

      const location = yield* Fiber.join(child)
      return location
    })

    const result = await Effect.runPromise(program)

    // Should have captured source location
    expect(result).toBeDefined()
    expect(result?.file).toContain('traced-fork.test.ts')
    expect(result?.line).toBeGreaterThan(0)
  })

  it('should use captured location for span naming', async () => {
    const program = Effect.gen(function* () {
      const child = yield* tracedFork(
        Effect.gen(function* () {
          const location = yield* FiberRef.get(CapturedSourceLocation)
          return location
        })
      )

      return yield* Fiber.join(child)
    })

    const result = await Effect.runPromise(program)

    expect(result).toBeDefined()
    expect(result?.function).toBeDefined()
    expect(result?.file).toBeDefined()
    expect(result?.line).toBeGreaterThan(0)
    expect(result?.column).toBeGreaterThan(0)
  })

  it('should work with tracedForkDaemon', async () => {
    const program = Effect.gen(function* () {
      const child = yield* tracedForkDaemon(
        Effect.gen(function* () {
          const location = yield* FiberRef.get(CapturedSourceLocation)
          return location
        })
      )

      return yield* Fiber.join(child)
    })

    const result = await Effect.runPromise(program)

    expect(result).toBeDefined()
    expect(result?.file).toContain('traced-fork.test.ts')
  })

  it('should handle cases where stack capture fails gracefully', async () => {
    const program = Effect.gen(function* () {
      // Even if capture fails, fork should still work
      const child = yield* tracedFork(Effect.succeed('test'))
      return yield* Fiber.join(child)
    })

    const result = await Effect.runPromise(program)
    expect(result).toBe('test')
  })
})
