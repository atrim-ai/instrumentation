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

import { Effect, Layer, Console } from 'effect'
import * as Http from '@effect/platform/HttpServer'
import * as NodeHttp from '@effect/platform-node/NodeHttpServer'
import { EffectInstrumentationLive } from '../../src/integrations/effect/index.js'
import { initializeInstrumentation } from '../../src/index.js'

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
  yield* Console.log('Fetching all users')
  yield* Effect.sleep('50 millis') // Simulate DB query
  return users
}).pipe(Effect.withSpan('app.users.list'))

const getUserById = (id: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${id}`)
    yield* Effect.sleep('30 millis') // Simulate DB query

    const user = users.find((u) => u.id === id)

    if (!user) {
      return yield* Effect.fail(new Error(`User not found: ${id}`))
    }

    return user
  }).pipe(Effect.withSpan('app.users.get', { attributes: { 'user.id': id } }))

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
  }).pipe(
    Effect.withSpan('app.users.create', {
      attributes: { 'user.name': name, 'user.email': email }
    })
  )

// ============================================================================
// HTTP Routes (Pure Effect)
// ============================================================================

const getUsersRoute = Http.router.get('/users', () =>
  Effect.gen(function* () {
    const userList = yield* getAllUsers
    return Http.response.json(userList)
  }).pipe(Effect.withSpan('http.users.list'))
)

const getUserRoute = Http.router.get('/users/:id', () =>
  Effect.gen(function* () {
    const params = yield* Http.request.schemaParams({
      id: Http.schemaString
    })

    const user = yield* getUserById(params.id).pipe(
      Effect.catchAll((error) =>
        Effect.succeed(Http.response.json({ error: error.message }, { status: 404 }))
      )
    )

    if (typeof user !== 'object' || !('id' in user)) {
      return user as Http.response.HttpResponse
    }

    return Http.response.json(user)
  }).pipe(Effect.withSpan('http.users.get'))
)

const createUserRoute = Http.router.post('/users', () =>
  Effect.gen(function* () {
    const body = yield* Http.request.schemaBodyJson({
      name: Http.schemaString,
      email: Http.schemaString
    })

    const newUser = yield* createUser(body.name, body.email)

    return Http.response.json(newUser, { status: 201 })
  }).pipe(Effect.withSpan('http.users.create'))
)

const healthRoute = Http.router.get('/health', () =>
  Effect.succeed(Http.response.json({ status: 'ok' }))
)

// ============================================================================
// HTTP Server
// ============================================================================

const HttpLive = Http.router.empty.pipe(
  Http.router.mount('/users', getUsersRoute),
  Http.router.mount('/users/:id', getUserRoute),
  Http.router.mount('/users', createUserRoute),
  Http.router.mount('/health', healthRoute),
  Http.server.serve(Http.middleware.logger),
  Http.server.withLogAddress,
  Layer.provide(NodeHttp.layer({ port: 3003 }))
)

// ============================================================================
// OpenTelemetry Setup
// ============================================================================

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry for pure Effect-TS...\n')

  // Zero-config initialization!
  // Since we're NOT using Express/Fastify, auto-instrumentation
  // will be automatically DISABLED (smart detection)
  // Only Effect.withSpan() will create spans
  await initializeInstrumentation({
    serviceName: 'effect-platform-example'
  })

  console.log('✅ Ready to trace pure Effect!\n')
}

// ============================================================================
// Main Application
// ============================================================================

const program = Effect.gen(function* () {
  yield* Console.log('📦 @atrim/instrumentation - Pure Effect-TS Example\n')
  yield* Console.log('='.repeat(60))
  yield* Console.log('')
  yield* Console.log('🌐 HTTP server starting on http://localhost:3003')
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('📊 Try these requests:')
  yield* Console.log('   curl http://localhost:3003/users')
  yield* Console.log('   curl http://localhost:3003/users/1')
  yield* Console.log(`   curl -X POST http://localhost:3003/users -d '{"name":"Alice","email":"alice@example.com"}' -H "Content-Type: application/json"`)
  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('💡 All spans created via Effect.withSpan()')
  yield* Console.log('   - No Express/Fastify auto-instrumentation')
  yield* Console.log('   - Pure Effect-TS tracing')
  yield* Console.log('   - Pattern filtering from instrumentation.yaml')
  yield* Console.log('')

  // Keep the server running
  yield* Effect.never
}).pipe(
  Effect.provide(HttpLive),
  Effect.provide(EffectInstrumentationLive)
)

// Initialize OpenTelemetry, then run the Effect program
setupInstrumentation()
  .then(() => {
    Effect.runPromise(program).catch((error) => {
      console.error('❌ Fatal error:', error)
      process.exit(1)
    })
  })
  .catch((error) => {
    console.error('❌ Failed to initialize instrumentation:', error)
    process.exit(1)
  })
