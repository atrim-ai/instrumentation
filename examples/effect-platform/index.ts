/**
 * Pure Effect-TS Example with @effect/platform HTTP Server
 *
 * This example demonstrates CombinedTracingLive:
 * - Pure Effect-TS without Express/Fastify
 * - @effect/platform/HttpServer for HTTP handling
 * - Automatic HTTP + fiber-level tracing (no manual Effect.withSpan() needed)
 * - Zero-config instrumentation via YAML
 * - Parent-child relationships between HTTP and fiber spans
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    npm start
 *
 * 3. Make requests:
 *    curl http://localhost:3003/users
 *    curl http://localhost:3003/users/1
 *    curl -X POST http://localhost:3003/users -d '{"name":"Alice","email":"alice@example.com"}' -H "Content-Type: application/json"
 */

import { Effect, Layer, Console, Schema, Fiber } from 'effect'
import * as HttpRouter from '@effect/platform/HttpRouter'
import * as HttpServer from '@effect/platform/HttpServer'
import * as HttpServerResponse from '@effect/platform/HttpServerResponse'
import * as NodeHttp from '@effect/platform-node/NodeHttpServer'
import { createServer } from 'node:http'
import { CombinedTracingLive } from '@atrim/instrument-node/effect/auto'

// ============================================================================
// Domain Types
// ============================================================================

interface User {
  readonly id: string
  readonly name: string
  readonly email: string
}

// ============================================================================
// Mock Database
// ============================================================================

const users: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' }
]

// ============================================================================
// Business Logic (Automatically Traced - No Effect.withSpan() needed!)
// ============================================================================

const getAllUsers = Effect.gen(function* () {
  yield* Console.log('Fetching all users')
  yield* Effect.sleep('50 millis') // Simulate DB query
  return users
})

const getUserById = (id: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${id}`)
    yield* Effect.sleep('30 millis') // Simulate DB query

    const user = users.find((u) => u.id === id)
    if (!user) {
      return yield* Effect.fail(new Error(`User not found: ${id}`))
    }

    return user
  })

const createUser = (name: string, email: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Creating user: ${name}`)
    yield* Effect.sleep('100 millis') // Simulate DB insert

    const newUser: User = {
      id: String(users.length + 1),
      name,
      email
    }

    users.push(newUser)
    return newUser
  })

// Background task to demonstrate fiber-level auto-tracing
const updateUserActivity = (userId: string) =>
  Effect.gen(function* () {
    yield* Console.log(`[Background] Updating activity for user ${userId}`)
    yield* Effect.sleep('200 millis')
    yield* Console.log(`[Background] Activity updated for user ${userId}`)
  })

// ============================================================================
// HTTP Routes (Pure Effect)
// ============================================================================

/**
 * Health check handler
 * Returns a simple status response
 */
const healthHandler = Effect.gen(function* () {
  return yield* HttpServerResponse.json({ status: 'ok' })
})

// Build the router using pipe pattern
// CombinedTracingLive automatically traces HTTP requests AND forked fibers!
const router = HttpRouter.empty.pipe(
  // Health check first (simplest route)
  HttpRouter.get('/health', healthHandler),
  HttpRouter.get(
    '/users',
    Effect.gen(function* () {
      const userList = yield* getAllUsers
      return yield* HttpServerResponse.json(userList)
    })
  ),
  HttpRouter.get(
    '/users/:id',
    Effect.gen(function* () {
      const params = yield* HttpRouter.schemaPathParams(
        Schema.Struct({
          id: Schema.String
        })
      )

      // Fork a background task to update activity
      // This fiber will be AUTOMATICALLY traced via Supervisor
      yield* Effect.fork(updateUserActivity(params.id))

      // Get the user - handle errors
      return yield* getUserById(params.id).pipe(
        Effect.andThen((user) => HttpServerResponse.json(user)),
        Effect.catchAll((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return HttpServerResponse.json({ error: errorMessage }, { status: 404 })
        })
      )
    })
  ),
  HttpRouter.post(
    '/users',
    Effect.gen(function* () {
      const body = yield* HttpRouter.schemaJson(
        Schema.Struct({
          name: Schema.String,
          email: Schema.String
        })
      )

      const newUser = yield* createUser(body.name, body.email)

      // Fork background tasks (automatically traced!)
      const notifyFiber = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Console.log(`[Background] Sending welcome email to ${newUser.email}`)
          yield* Effect.sleep('500 millis')
          yield* Console.log(`[Background] Welcome email sent to ${newUser.email}`)
        })
      )

      const analyticsFiber = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Console.log(`[Background] Recording user creation event`)
          yield* Effect.sleep('100 millis')
          yield* Console.log(`[Background] Analytics event recorded`)
        })
      )

      return yield* HttpServerResponse.json(newUser, { status: 201 })
    })
  )
)

// ============================================================================
// HTTP Server
// ============================================================================

const HttpLive = HttpServer.serve(router).pipe(
  HttpServer.withLogAddress,
  Layer.provide(NodeHttp.layer(() => createServer(), { port: Number(process.env.PORT) || 3003 })),
  Layer.provide(CombinedTracingLive) // Automatic HTTP + Fiber tracing!
)

// ============================================================================
// Main Application
// ============================================================================

const program = Effect.gen(function* () {
  const port = Number(process.env.PORT) || 3003
  yield* Console.log('📦 @atrim/instrumentation - Effect-TS Combined Tracing Example\n')
  yield* Console.log('='.repeat(60))
  yield* Console.log('')
  yield* Console.log(`🌐 HTTP server starting on http://localhost:${port}`)
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('📊 Try these requests:')
  yield* Console.log(`   curl http://localhost:${port}/users`)
  yield* Console.log(`   curl http://localhost:${port}/users/1`)
  yield* Console.log(
    `   curl -X POST http://localhost:${port}/users -d '{"name":"Alice","email":"alice@example.com"}' -H "Content-Type: application/json"`
  )
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('💡 CombinedTracingLive provides:')
  yield* Console.log('   ✅ Automatic HTTP request tracing')
  yield* Console.log('   ✅ Automatic fiber-level tracing (forked fibers)')
  yield* Console.log('   ✅ Parent-child span relationships')
  yield* Console.log('   ✅ Zero Effect.withSpan() calls needed!')
  yield* Console.log('')
  yield* Console.log('🔍 Look for these spans in your observability tool:')
  yield* Console.log('   - http.server.request (HTTP requests)')
  yield* Console.log('   - effect.* (forked background tasks)')
  yield* Console.log('')

  // Keep the server running
  yield* Effect.never
}).pipe(Layer.launch(HttpLive))

// Run the Effect program directly
Effect.runPromise(program).catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
