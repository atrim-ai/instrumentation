/**
 * Minimal Effect-TS Auto-Tracing Example
 *
 * This shows the bare minimum code needed to enable auto-instrumentation.
 * Just import UnifiedTracingLive and provide it to your Effect!
 *
 * UnifiedTracingLive provides:
 * - Automatic fiber tracing
 * - Operation tracing (Effect.all, Effect.forEach, Effect.fork)
 * - Source location capture for meaningful span names
 * - Correct fork span hierarchy
 */

import { Effect, Console } from 'effect'
import { UnifiedTracingLive } from '@atrim/instrument-node/effect/auto'

// Your application code - no tracing boilerplate needed
const fetchUser = (id: number) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${id}...`)
    yield* Effect.sleep('50 millis')
    return { id, name: 'Alice' }
  })

const main = Effect.gen(function* () {
  const user = yield* fetchUser(1)
  yield* Console.log(`Got user: ${user.name}`)
  // Allow spans to export
  yield* Effect.sleep('1 second')
})

// Run with unified tracing - that's it!
Effect.runPromise(main.pipe(Effect.provide(UnifiedTracingLive))).then(() => process.exit(0))
