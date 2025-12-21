/**
 * Pure Effect-TS Example with @effect/platform HTTP Server
 *
 * This example demonstrates:
 * - Pure Effect-TS without Express/Fastify
 * - @effect/platform/HttpServer for HTTP handling
 * - Auto-detection disabling NodeSDK auto-instrumentation
 * - Effect.withSpan() for all tracing
 * - Pattern-based span filtering from instrumentation.yaml
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

import { Effect, Layer, Console, Schema } from 'effect'
import * as HttpRouter from '@effect/platform/HttpRouter'
import * as HttpServer from '@effect/platform/HttpServer'
import * as HttpServerResponse from '@effect/platform/HttpServerResponse'
import * as NodeHttp from '@effect/platform-node/NodeHttpServer'
import { createServer } from 'node:http'
import {
  createEffectInstrumentation,
  autoEnrichSpan,
  annotateUser,
  annotateDataSize,
  annotateQuery,
  annotateHttpRequest
} from '@atrim/instrument-node/effect'

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
// Business Logic (Traced with Effect.withSpan)
// ============================================================================

const getAllUsers = Effect.gen(function* () {
  // Auto-enrich with Effect metadata (fiber ID, status, parent span info)
  yield* autoEnrichSpan()

  yield* Console.log('Fetching all users')

  // Annotate with query metadata
  const startTime = Date.now()
  yield* Effect.sleep('50 millis') // Simulate DB query
  const duration = Date.now() - startTime

  yield* annotateQuery('SELECT * FROM users', duration, users.length, 'postgres')

  // Annotate with data size
  const dataSize = JSON.stringify(users).length
  yield* annotateDataSize(dataSize, users.length)

  return users
}).pipe(Effect.withSpan('app.users.list'))

const getUserById = (id: string) =>
  Effect.gen(function* () {
    // Auto-enrich with Effect metadata
    yield* autoEnrichSpan()

    yield* Console.log(`Fetching user ${id}`)

    // Annotate with query metadata
    const startTime = Date.now()
    yield* Effect.sleep('30 millis') // Simulate DB query
    const duration = Date.now() - startTime

    const user = users.find((u) => u.id === id)

    if (!user) {
      yield* annotateQuery(`SELECT * FROM users WHERE id = '${id}'`, duration, 0, 'postgres')
      return yield* Effect.fail(new Error(`User not found: ${id}`))
    }

    yield* annotateQuery(`SELECT * FROM users WHERE id = '${id}'`, duration, 1, 'postgres')

    // Annotate with user context
    yield* annotateUser(user.id, user.email, user.name)

    // Annotate with data size
    const dataSize = JSON.stringify(user).length
    yield* annotateDataSize(dataSize, 1)

    return user
  }).pipe(Effect.withSpan('app.users.get', { attributes: { 'user.id': id } }))

const createUser = (name: string, email: string) =>
  Effect.gen(function* () {
    // Auto-enrich with Effect metadata
    yield* autoEnrichSpan()

    yield* Console.log(`Creating user: ${name}`)

    // Annotate with user context
    yield* annotateUser('new-user', email, name)

    // Simulate DB insert with query annotation
    const startTime = Date.now()
    yield* Effect.sleep('100 millis')
    const duration = Date.now() - startTime

    const newUser: User = {
      id: String(users.length + 1),
      name,
      email
    }

    users.push(newUser)

    yield* annotateQuery(
      `INSERT INTO users (name, email) VALUES ('${name}', '${email}')`,
      duration,
      1,
      'postgres'
    )

    // Annotate with data size
    const dataSize = JSON.stringify(newUser).length
    yield* annotateDataSize(dataSize, 1)

    return newUser
  }).pipe(
    Effect.withSpan('app.users.create', {
      attributes: { 'user.name': name, 'user.email': email }
    })
  )

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
const router = HttpRouter.empty.pipe(
  // Health check first (simplest route)
  HttpRouter.get('/health', healthHandler),
  HttpRouter.get(
    '/users',
    Effect.gen(function* () {
      // Auto-enrich HTTP span
      yield* autoEnrichSpan()

      const userList = yield* getAllUsers

      // Annotate HTTP request
      const response = yield* HttpServerResponse.json(userList)
      const contentLength = JSON.stringify(userList).length
      yield* annotateHttpRequest('GET', '/users', 200, contentLength)

      return response
    }).pipe(Effect.withSpan('http.users.list'))
  ),
  HttpRouter.get(
    '/users/:id',
    Effect.gen(function* () {
      // Auto-enrich HTTP span
      yield* autoEnrichSpan()

      const params = yield* HttpRouter.schemaPathParams(
        Schema.Struct({
          id: Schema.String
        })
      )

      // Try to get the user - handle error with proper 404 response
      return yield* getUserById(params.id).pipe(
        Effect.andThen((user) => {
          const contentLength = JSON.stringify(user).length
          return Effect.gen(function* () {
            yield* annotateHttpRequest('GET', `/users/${params.id}`, 200, contentLength)
            return yield* HttpServerResponse.json(user)
          })
        }),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* annotateHttpRequest('GET', `/users/${params.id}`, 404)
            const errorMessage = error instanceof Error ? error.message : String(error)
            return yield* HttpServerResponse.json({ error: errorMessage }, { status: 404 })
          })
        ),
        Effect.withSpan('http.users.get')
      )
    })
  ),
  HttpRouter.post(
    '/users',
    Effect.gen(function* () {
      // Auto-enrich HTTP span
      yield* autoEnrichSpan()

      const body = yield* HttpRouter.schemaJson(
        Schema.Struct({
          name: Schema.String,
          email: Schema.String
        })
      )

      const newUser = yield* createUser(body.name, body.email)

      // Annotate HTTP request
      const contentLength = JSON.stringify(newUser).length
      yield* annotateHttpRequest('POST', '/users', 201, contentLength)

      return yield* HttpServerResponse.json(newUser, { status: 201 })
    }).pipe(Effect.withSpan('http.users.create'))
  )
)

// ============================================================================
// HTTP Server
// ============================================================================

const HttpLive = HttpServer.serve(router).pipe(
  HttpServer.withLogAddress,
  Layer.provide(NodeHttp.layer(() => createServer(), { port: Number(process.env.PORT) || 3003 }))
)

// ============================================================================
// Main Application
// ============================================================================

// ============================================================================
// Effect Instrumentation Layer (Standalone Mode)
// ============================================================================

// For pure Effect apps without NodeSDK, use 'standalone' mode which exports
// traces directly via @effect/opentelemetry's OTLP exporter
const EffectInstrumentationLayer = createEffectInstrumentation({
  serviceName: 'effect-platform-example',
  exporterMode: 'standalone'
})

// ============================================================================
// Main Program
// ============================================================================

const program = Effect.gen(function* () {
  const port = Number(process.env.PORT) || 3003
  yield* Console.log('📦 @atrim/instrumentation - Pure Effect-TS Example\n')
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
  yield* Console.log('💡 All spans created via Effect.withSpan()')
  yield* Console.log('   - Pure Effect-TS tracing via standalone OTLP exporter')
  yield* Console.log('   - Direct OTLP export from @effect/opentelemetry')
  yield* Console.log('')

  // Keep the server running
  yield* Effect.never
}).pipe(Effect.provide(HttpLive), Effect.provide(EffectInstrumentationLayer))

// Run the Effect program directly
Effect.runPromise(program).catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
