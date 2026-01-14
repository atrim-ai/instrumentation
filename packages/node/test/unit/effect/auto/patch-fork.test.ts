/**
 * Tests for patchEffectFork - documents the ESM limitation and proper usage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Effect, Fiber, FiberRef } from 'effect'
import {
  patchEffectFork,
  unpatchEffectFork,
  isEffectForkPatched,
  CapturedSourceLocation,
  tracedFork
} from '../../../../src/integrations/effect/auto/index.js'

describe('patchEffectFork', () => {
  beforeEach(() => {
    unpatchEffectFork()
  })

  afterEach(() => {
    unpatchEffectFork()
  })

  it('should return false for isEffectForkPatched due to ESM limitations', () => {
    patchEffectFork()
    // ESM modules cannot be patched at runtime
    expect(isEffectForkPatched()).toBe(false)
  })

  it('should not throw when called', () => {
    expect(() => patchEffectFork()).not.toThrow()
  })

  it('should be idempotent (can be called multiple times)', () => {
    patchEffectFork()
    patchEffectFork()
    patchEffectFork()
    expect(isEffectForkPatched()).toBe(false)
  })

  describe('workaround: tracedFork', () => {
    it('should capture call site when using tracedFork instead of Effect.fork', async () => {
      // This demonstrates the recommended approach
      const program = Effect.gen(function* () {
        // Use tracedFork to capture call site
        const child = yield* tracedFork(
          Effect.gen(function* () {
            const location = yield* FiberRef.get(CapturedSourceLocation)
            return location
          })
        )

        return yield* Fiber.join(child)
      })

      const result = await Effect.runPromise(program)

      // tracedFork correctly captures the call site
      expect(result).toBeDefined()
      expect(result?.file).toContain('patch-fork.test.ts')
      expect(result?.line).toBeGreaterThan(0)
    })

    it('should NOT capture call site when using plain Effect.fork', async () => {
      // This demonstrates why tracedFork is needed
      const program = Effect.gen(function* () {
        // Plain Effect.fork does NOT capture call site
        const child = yield* Effect.fork(
          Effect.gen(function* () {
            const location = yield* FiberRef.get(CapturedSourceLocation)
            return location
          })
        )

        return yield* Fiber.join(child)
      })

      const result = await Effect.runPromise(program)

      // Effect.fork does not capture call site - it will be undefined
      expect(result).toBeUndefined()
    })
  })
})
