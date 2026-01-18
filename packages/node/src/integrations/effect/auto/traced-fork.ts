/**
 * Traced Fork - Capture call site for better span names
 *
 * This module provides tracedFork() which captures the call site
 * BEFORE entering Effect's runtime, allowing the supervisor to
 * create spans with meaningful names instead of "effect.anonymous".
 */

import { Effect, FiberRef } from 'effect'
import type { SourceInfo } from './naming.js'

/**
 * FiberRef to store captured source location
 * Set by tracedFork(), read by supervisor
 */
export const CapturedSourceLocation = FiberRef.unsafeMake<SourceInfo | undefined>(undefined)

/**
 * Capture the current call site from stack trace
 * Uses same technique as Effect.withSpan's captureStackTrace
 *
 * @param skipFrames - Number of additional frames to skip (default: 0)
 *                     Useful when calling from wrapper functions
 */
export function captureCallSite(skipFrames: number = 0): SourceInfo | undefined {
  // Limit stack depth for performance
  const originalLimit = Error.stackTraceLimit
  Error.stackTraceLimit = 10

  const error = new Error()
  Error.stackTraceLimit = originalLimit

  if (!error.stack) return undefined

  const lines = error.stack.split('\n')

  // Skip:
  // [0] Error
  // [1] captureCallSite
  // [2] caller (tracedFork or patchedFork wrapper)
  // [3+skipFrames] USER CODE <-- This is what we want!

  const startIndex = 3 + skipFrames
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    // Skip @atrim and effect internals
    if (line.includes('@atrim/instrument') || line.includes('node_modules/effect')) {
      continue
    }

    // Parse: "    at functionName (file:line:col)"
    const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/)
    if (match) {
      const [, funcName, filePath, lineNum, colNum] = match
      return {
        function: funcName?.trim() ?? 'anonymous',
        file: filePath ?? 'unknown',
        line: parseInt(lineNum ?? '0', 10),
        column: parseInt(colNum ?? '0', 10)
      }
    }
  }

  return undefined
}

/**
 * Fork an effect with captured call site for better span naming
 *
 * This is a drop-in replacement for Effect.fork() that captures the
 * call site location. The supervisor reads this via CapturedSourceLocation
 * FiberRef to create better span names.
 *
 * @example
 * ```typescript
 * // Instead of:
 * yield* Effect.fork(myTask)
 *
 * // Use:
 * yield* tracedFork(myTask)
 *
 * // Span name will be "effect.index:42" instead of "effect.anonymous"
 * ```
 */
export const tracedFork = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  // Capture call site NOW while user code is still on stack
  const callSite = captureCallSite()

  if (!callSite) {
    // No call site captured, use regular fork
    return Effect.fork(effect)
  }

  // Set the FiberRef BEFORE forking so it's available in the child fiber's FiberRefs
  // This makes it available to the supervisor's onStart hook
  return FiberRef.set(CapturedSourceLocation, callSite).pipe(Effect.zipRight(Effect.fork(effect)))
}

/**
 * Fork an effect in daemon mode with captured call site
 *
 * Same as tracedFork() but creates a daemon fiber.
 */
export const tracedForkDaemon = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const callSite = captureCallSite()

  if (!callSite) {
    return Effect.forkDaemon(effect)
  }

  return FiberRef.set(CapturedSourceLocation, callSite).pipe(
    Effect.zipRight(Effect.forkDaemon(effect))
  )
}
