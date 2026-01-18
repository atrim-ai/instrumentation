/**
 * Minimal Effect-TS Auto-Tracing Example
 *
 * This shows the bare minimum code needed to enable auto-instrumentation.
 * Just import FullAutoTracingLive and provide it to your Effect!
 */

import { Effect, Console } from 'effect'
import { FullAutoTracingLive } from '@atrim/instrument-node/effect/auto'

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

// Run with auto-instrumentation - that's it!
Effect.runPromise(main.pipe(Effect.provide(FullAutoTracingLive))).then(() => process.exit(0))
