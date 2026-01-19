/**
 * Effect-TS Auto-Tracing Example (Production / OTLP Export)
 *
 * This example demonstrates automatic tracing of all Effect fibers
 * using FULLY YAML-DRIVEN configuration. No code configuration needed!
 *
 * Key features:
 * - UnifiedTracingLive reads ALL config from instrumentation.yaml
 * - Exporter type, endpoint, processor - all from YAML
 * - Automatic operation tracing (Effect.all, Effect.forEach, Effect.fork)
 * - Correct fork span hierarchy
 * - Just provide the layer and run!
 *
 * Run with: pnpm start
 */

import { Effect, Console, pipe } from 'effect'
import {
  UnifiedTracingLive,
  withoutAutoTracing,
  setSpanName
} from '@atrim/instrument-node/effect/auto'

// ============================================================================
// Configuration - ALL from instrumentation.yaml!
// ============================================================================

console.log('============================================================')
console.log('Effect-TS Auto-Tracing Example (YAML-Driven)')
console.log('============================================================')
console.log('All configuration from instrumentation.yaml:')
console.log('  - Exporter: effect.exporter_config.type')
console.log('  - Endpoint: effect.exporter_config.endpoint')
console.log('  - Naming rules: effect.auto_instrumentation.span_naming')
console.log('  - Filters: effect.auto_instrumentation.filter')
console.log('============================================================\n')

// ============================================================================
// Simulated Service Layer
// ============================================================================

const UserService = {
  getUser: (id: number) =>
    Effect.gen(function* () {
      yield* Console.log(`  [UserService.getUser] Fetching user ${id}...`)
      yield* Effect.sleep('50 millis')
      return { id, name: 'Alice', email: 'alice@example.com' }
    }),

  listUsers: () =>
    Effect.gen(function* () {
      yield* Console.log('  [UserService.listUsers] Listing all users...')
      yield* Effect.sleep('100 millis')
      return [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ]
    }),

  createUser: (name: string) =>
    Effect.gen(function* () {
      yield* Console.log(`  [UserService.createUser] Creating user: ${name}...`)
      yield* Effect.sleep('75 millis')
      return {
        id: Math.floor(Math.random() * 1000),
        name,
        email: `${name.toLowerCase()}@example.com`
      }
    })
}

const fetchUserProfile = (userId: number) =>
  Effect.gen(function* () {
    yield* Console.log(`  [fetchUserProfile] Fetching profile for user ${userId}...`)
    yield* Effect.sleep('30 millis')
    return { userId, avatar: 'https://example.com/avatar.png', bio: 'Hello!' }
  })

const fetchUserSettings = (userId: number) =>
  Effect.gen(function* () {
    yield* Console.log(`  [fetchUserSettings] Fetching settings for user ${userId}...`)
    yield* Effect.sleep('25 millis')
    return { userId, theme: 'dark', notifications: true }
  })

// Internal operation - excluded via YAML config:
//   span_naming.rules: [{ match: { function: "internal.*" }, name: "internal.{function}" }]
//   filter.exclude: ["^internal\\."]
const internalHealthCheck = () =>
  Effect.gen(function* () {
    yield* Console.log('  [internalHealthCheck] Running health check...')
    yield* Effect.sleep('10 millis')
    return { status: 'healthy' }
  })

// ============================================================================
// Main Application
// ============================================================================

const main = Effect.gen(function* () {
  console.log('Starting application...\n')

  // -------------------------------------------------------------------------
  // Example 1: Automatic tracing of service methods
  // -------------------------------------------------------------------------
  console.log('Example 1: Service methods (automatically traced)')
  console.log('------------------------------------------------')

  const users = yield* UserService.listUsers()
  console.log(`  Found ${users.length} users\n`)

  const user = yield* UserService.getUser(1)
  console.log(`  Got user: ${user.name}\n`)

  // -------------------------------------------------------------------------
  // Example 2: HTTP-style operations (naming rule applied via YAML)
  // -------------------------------------------------------------------------
  console.log('Example 2: HTTP operations (naming rule from YAML)')
  console.log('-------------------------------------------------')
  console.log('  YAML rule: match { function: "fetch.*" } -> "http.{function}"')

  const profile = yield* fetchUserProfile(1)
  console.log(`  Got profile: ${profile.bio}\n`)

  const settings = yield* fetchUserSettings(1)
  console.log(`  Got settings: theme=${settings.theme}\n`)

  // -------------------------------------------------------------------------
  // Example 3: YAML-driven exclusion (filter.exclude patterns)
  // -------------------------------------------------------------------------
  console.log('Example 3: YAML-driven exclusion')
  console.log('--------------------------------')
  console.log('  YAML rule: match { function: "internal.*" } -> "internal.{function}"')
  console.log('  YAML filter: exclude ["^internal\\\\."]')

  // This function is excluded via YAML - no withoutAutoTracing() needed!
  const health = yield* internalHealthCheck()
  console.log(`  Health: ${health.status} (automatically excluded by YAML config)\n`)

  // -------------------------------------------------------------------------
  // Example 4: Programmatic opt-out (for runtime control)
  // -------------------------------------------------------------------------
  console.log('Example 4: Programmatic opt-out (advanced)')
  console.log('------------------------------------------')
  console.log('  Using withoutAutoTracing() for runtime control...')

  const tempResult = yield* withoutAutoTracing(
    Effect.gen(function* () {
      yield* Console.log('    [temp operation] This is not traced')
      yield* Effect.sleep('5 millis')
      return 'temp-result'
    })
  )
  console.log(`  Temp result: ${tempResult} (explicitly opted out)\n`)

  // -------------------------------------------------------------------------
  // Example 5: Custom span name override
  // -------------------------------------------------------------------------
  console.log('Example 5: Custom span name override')
  console.log('------------------------------------')
  console.log('  Running operation with custom span name...')

  const newUser = yield* pipe(
    UserService.createUser('Dave'),
    setSpanName('custom.user-registration')
  )
  console.log(`  Created user: ${newUser.name} (span: custom.user-registration)\n`)

  // -------------------------------------------------------------------------
  // Example 6: Concurrent operations
  // -------------------------------------------------------------------------
  console.log('Example 6: Concurrent operations')
  console.log('--------------------------------')
  console.log('  Running multiple operations concurrently...')

  const [userResult, profileResult, settingsResult] = yield* Effect.all([
    UserService.getUser(2),
    fetchUserProfile(2),
    fetchUserSettings(2)
  ])

  console.log(`  Got user: ${userResult.name}`)
  console.log(`  Got profile: ${profileResult.bio}`)
  console.log(`  Got settings: theme=${settingsResult.theme}\n`)

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log('============================================================')
  console.log('All examples completed!')
  console.log('Check your OpenTelemetry collector for traces.')
  console.log('============================================================')

  // Wait for spans to be exported
  yield* Effect.sleep('2 seconds')
})

// ============================================================================
// Run Application
// ============================================================================

// Just provide UnifiedTracingLive - everything else from YAML!
// No NodeSdk.layer(), no exporter setup, no manual configuration
Effect.runPromise(main.pipe(Effect.provide(UnifiedTracingLive)))
  .then(() => {
    console.log('\nApplication finished successfully.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nApplication failed:', error)
    process.exit(1)
  })
