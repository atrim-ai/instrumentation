/**
 * Effect-TS Example for @atrim/instrumentation
 *
 * This example demonstrates advanced Effect-TS patterns with OpenTelemetry tracing:
 * - Effect.race for concurrent operations
 * - Effect.retry with exponential backoff
 * - Effect.timeout for operation timeouts
 * - Effect.either for error handling
 * - Effect.all for parallel execution
 * - Context propagation from Express to Effect
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    npm start
 *
 * 3. Make requests:
 *    curl http://localhost:3002/users
 *    curl http://localhost:3002/users/1
 *    curl -X POST http://localhost:3002/users -d '{"name":"Alice","email":"alice@example.com"}' -H "Content-Type: application/json"
 */

import express from 'express'
import { Effect, Schedule, Duration, Exit, Layer } from 'effect'
import { EffectInstrumentationLive } from '../../src/integrations/effect/index.js'
import { initializeInstrumentation } from '../../src/index.js'

// ============================================================================
// Domain Types
// ============================================================================

interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

class DatabaseError {
  readonly _tag = 'DatabaseError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

class CacheError {
  readonly _tag = 'CacheError'
  constructor(readonly message: string) {}
}

class ValidationError {
  readonly _tag = 'ValidationError'
  constructor(readonly message: string) {}
}

class TimeoutError {
  readonly _tag = 'TimeoutError'
  constructor(readonly message: string) {}
}

// ============================================================================
// Mock Database & Cache
// ============================================================================

const mockUsers: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com', createdAt: new Date('2024-01-01') },
  { id: '2', name: 'Bob', email: 'bob@example.com', createdAt: new Date('2024-01-02') },
  { id: '3', name: 'Charlie', email: 'charlie@example.com', createdAt: new Date('2024-01-03') }
]

const mockCache = new Map<string, string>()

// ============================================================================
// Effect Operations with Advanced Patterns
// ============================================================================

/**
 * Database query with retry logic and exponential backoff
 * Demonstrates: Effect.retry with Schedule
 */
function queryDatabase(sql: string, params: Record<string, unknown> = {}): Effect.Effect<User[], DatabaseError> {
  return Effect.gen(function* () {
    yield* Effect.log(`Executing query: ${sql}`)
    yield* Effect.annotateCurrentSpan('db.system', 'postgresql')
    yield* Effect.annotateCurrentSpan('db.statement', sql)
    yield* Effect.annotateCurrentSpan('db.params', JSON.stringify(params))

    // Simulate occasional database failures (20% failure rate)
    const shouldFail = Math.random() < 0.2

    if (shouldFail) {
      yield* Effect.logWarning('Database query failed, will retry...')
      return yield* Effect.fail(new DatabaseError('Connection timeout'))
    }

    // Simulate slow database query (cache will win the race!)
    yield* Effect.sleep(Duration.millis(500))

    yield* Effect.log('Query successful')
    return mockUsers
  }).pipe(
    Effect.withSpan('db.query', { attributes: { 'db.operation': 'SELECT' } }),
    // Retry up to 3 times with exponential backoff
    Effect.retry(
      Schedule.exponential(Duration.millis(100), 2).pipe(
        Schedule.intersect(Schedule.recurs(3))
      )
    ),
    Effect.tapErrorCause((cause) =>
      Effect.logError(`Database query failed after retries: ${cause}`)
    )
  )
}

/**
 * Cache operation with timeout
 * Demonstrates: Effect.timeout
 */
function getCached(key: string): Effect.Effect<string | null, CacheError | TimeoutError> {
  return Effect.gen(function* () {
    yield* Effect.log(`Cache GET: ${key}`)
    yield* Effect.annotateCurrentSpan('cache.operation', 'get')
    yield* Effect.annotateCurrentSpan('cache.key', key)

    // Simulate fast cache lookup
    yield* Effect.sleep(Duration.millis(20))

    const value = mockCache.get(key) || null
    yield* Effect.annotateCurrentSpan('cache.hit', value !== null)

    return value
  }).pipe(
    Effect.withSpan('cache.get'),
    // Timeout after 200ms
    Effect.timeout(Duration.millis(200)),
    Effect.catchTag('TimeoutException', () =>
      Effect.fail(new TimeoutError('Cache operation timed out'))
    )
  )
}

/**
 * Set cache value
 */
function setCached(key: string, value: string): Effect.Effect<void, CacheError> {
  return Effect.gen(function* () {
    yield* Effect.log(`Cache SET: ${key}`)
    yield* Effect.annotateCurrentSpan('cache.operation', 'set')
    yield* Effect.annotateCurrentSpan('cache.key', key)

    yield* Effect.sleep(Duration.millis(30))

    mockCache.set(key, value)
  }).pipe(Effect.withSpan('cache.set'))
}

/**
 * Fetch user from multiple sources using race
 * Demonstrates: Effect.race - first successful result wins
 */
function fetchUserWithRace(userId: string): Effect.Effect<User, DatabaseError | CacheError | TimeoutError | ValidationError> {
  // Try cache first
  const fromCache = Effect.gen(function* () {
    const cached = yield* getCached(`user:${userId}`)
    if (!cached) {
      return yield* Effect.fail(new CacheError('Cache miss'))
    }
    yield* Effect.log('Cache hit!')
    return JSON.parse(cached) as User
  }).pipe(Effect.withSpan('user.fetch.cache'))

  // Fetch from database
  const fromDatabase = Effect.gen(function* () {
    const users = yield* queryDatabase('SELECT * FROM users WHERE id = $1', { id: userId })
    const user = users.find((u) => u.id === userId)

    if (!user) {
      return yield* Effect.fail(new ValidationError(`User not found: ${userId}`))
    }

    // Cache the result
    yield* setCached(`user:${userId}`, JSON.stringify(user))

    return user
  }).pipe(Effect.withSpan('user.fetch.database'))

  // Race both approaches - first one to succeed wins!
  return Effect.race(fromCache, fromDatabase).pipe(
    Effect.withSpan('user.fetch.race', {
      attributes: { 'user.id': userId }
    })
  )
}

/**
 * Fetch all users with parallel execution
 * Demonstrates: Effect.all with concurrency
 */
function fetchAllUsers(): Effect.Effect<User[], DatabaseError> {
  return Effect.gen(function* () {
    yield* Effect.log('Fetching all users from database')

    const users = yield* queryDatabase('SELECT * FROM users')

    // Update cache for all users in parallel (max 5 concurrent operations)
    yield* Effect.all(
      users.map((user) =>
        setCached(`user:${user.id}`, JSON.stringify(user))
      ),
      { concurrency: 5 }
    )

    yield* Effect.log(`Fetched ${users.length} users`)
    return users
  }).pipe(
    Effect.withSpan('user.fetchAll', {
      attributes: { 'operation.type': 'bulk_fetch' }
    })
  )
}

/**
 * Create a new user with validation
 * Demonstrates: Effect.either for error handling
 */
function createUser(data: { name: string; email: string }): Effect.Effect<User, ValidationError | DatabaseError> {
  return Effect.gen(function* () {
    yield* Effect.log(`Creating user: ${data.name}`)
    yield* Effect.annotateCurrentSpan('user.name', data.name)
    yield* Effect.annotateCurrentSpan('user.email', data.email)

    // Validation
    if (!data.name || data.name.length < 2) {
      return yield* Effect.fail(new ValidationError('Name must be at least 2 characters'))
    }

    if (!data.email || !data.email.includes('@')) {
      return yield* Effect.fail(new ValidationError('Invalid email format'))
    }

    // Simulate database insert
    yield* Effect.sleep(Duration.millis(150))

    const newUser: User = {
      id: String(mockUsers.length + 1),
      name: data.name,
      email: data.email,
      createdAt: new Date()
    }

    mockUsers.push(newUser)

    // Cache the new user
    yield* setCached(`user:${newUser.id}`, JSON.stringify(newUser))

    yield* Effect.log(`User created: ${newUser.id}`)
    return newUser
  }).pipe(
    Effect.withSpan('user.create', {
      attributes: { 'operation.type': 'insert' }
    })
  )
}

/**
 * Complex workflow demonstrating multiple Effect patterns
 * Demonstrates: Combining race, retry, timeout, and parallel execution
 */
function complexUserWorkflow(userId: string): Effect.Effect<
  { user: User; relatedUsers: User[]; cacheUpdated: boolean },
  DatabaseError | CacheError | TimeoutError | ValidationError
> {
  return Effect.gen(function* () {
    yield* Effect.log(`Starting complex workflow for user: ${userId}`)

    // 1. Fetch target user using race (cache vs database)
    const user = yield* fetchUserWithRace(userId)

    // 2. Fetch all users in parallel
    const allUsers = yield* fetchAllUsers()

    // 3. Find related users (same domain)
    const domain = user.email.split('@')[1]
    const relatedUsers = allUsers.filter((u) => u.email.includes(domain) && u.id !== userId)

    // 4. Update cache for related users (with timeout)
    const cacheUpdateResult = yield* Effect.all(
      relatedUsers.map((u) =>
        setCached(`related:${u.id}`, JSON.stringify(u)).pipe(
          Effect.timeout(Duration.millis(100)),
          Effect.either // Convert failures to Exit values
        )
      )
    )

    const cacheUpdated = cacheUpdateResult.every(Exit.isSuccess)

    yield* Effect.log(`Workflow complete. Related users: ${relatedUsers.length}`)

    return { user, relatedUsers, cacheUpdated }
  }).pipe(
    Effect.withSpan('user.workflow.complex', {
      attributes: {
        'workflow.type': 'user_analysis',
        'user.id': userId
      }
    })
  )
}

// ============================================================================
// OpenTelemetry Setup
// ============================================================================

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry with @atrim/instrumentation...\n')

  // One line initialization for Effect-TS with Express!
  // Auto-instrumentation is enabled by default since we're using Express
  // - Express HTTP auto-instrumentation will trace incoming requests
  // - Effect.withSpan() will trace business logic inside those requests
  // - They work together perfectly!
  await initializeInstrumentation({
    serviceName: 'effect-ts-example'
  })

  console.log('✅ Ready to trace with Effect!\n')
}

// ============================================================================
// Express Server with Effect Integration
// ============================================================================

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(express.static('public'))

  // Health check (will be filtered out)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // List all users
  app.get('/users', async (_req, res) => {
    const program = fetchAllUsers().pipe(
      Effect.provide(EffectInstrumentationLive)
    )

    const exit = await Effect.runPromiseExit(program)

    if (Exit.isSuccess(exit)) {
      res.json(exit.value)
    } else {
      console.error('Error fetching users:', exit.cause)
      res.status(500).json({ error: 'Failed to fetch users' })
    }
  })

  // Get user by ID (with race condition demo)
  app.get('/users/:id', async (req, res) => {
    const program = fetchUserWithRace(req.params.id).pipe(
      Effect.provide(EffectInstrumentationLive)
    )

    const exit = await Effect.runPromiseExit(program)

    if (Exit.isSuccess(exit)) {
      res.json(exit.value)
    } else {
      console.error('Error fetching user:', exit.cause)
      res.status(404).json({ error: 'User not found' })
    }
  })

  // Create user
  app.post('/users', async (req, res) => {
    const program = createUser(req.body).pipe(
      Effect.provide(EffectInstrumentationLive)
    )

    const exit = await Effect.runPromiseExit(program)

    if (Exit.isSuccess(exit)) {
      res.status(201).json(exit.value)
    } else {
      console.error('Error creating user:', exit.cause)
      res.status(400).json({ error: 'Failed to create user' })
    }
  })

  // Complex workflow demo
  app.get('/workflow/:id', async (req, res) => {
    const program = complexUserWorkflow(req.params.id).pipe(
      Effect.provide(EffectInstrumentationLive)
    )

    const exit = await Effect.runPromiseExit(program)

    if (Exit.isSuccess(exit)) {
      res.json(exit.value)
    } else {
      console.error('Error in workflow:', exit.cause)
      res.status(500).json({ error: 'Workflow failed' })
    }
  })

  // Clear cache (utility)
  app.post('/cache/clear', (_req, res) => {
    mockCache.clear()
    res.json({ success: true, message: 'Cache cleared' })
  })

  return app
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('📦 @atrim/instrumentation - Effect-TS Advanced Example\n')
  console.log('='.repeat(60) + '\n')

  try {
    // Setup instrumentation
    await setupInstrumentation()

    // Create and start Express app
    const app = createApp()
    const PORT = process.env.PORT || 3002

    app.listen(PORT, () => {
      console.log(`🌐 Server listening on http://localhost:${PORT}`)
      console.log('\n' + '='.repeat(60))
      console.log('🎨 Interactive UI:')
      console.log(`   👉 Open http://localhost:${PORT} in your browser`)
      console.log('\n📊 Advanced Effect Patterns Demonstrated:')
      console.log('   1. Effect.race - Concurrent cache vs database lookup')
      console.log('   2. Effect.retry - Exponential backoff for failed queries')
      console.log('   3. Effect.timeout - Cache operation timeouts')
      console.log('   4. Effect.all - Parallel bulk operations')
      console.log('   5. Effect.either - Graceful error handling')
      console.log('\n💡 Try these endpoints:')
      console.log(`   curl http://localhost:${PORT}/users`)
      console.log(`   curl http://localhost:${PORT}/users/1`)
      console.log(`   curl http://localhost:${PORT}/workflow/1`)
      console.log(`   curl -X POST http://localhost:${PORT}/users -d '{"name":"Alice","email":"alice@example.com"}' -H "Content-Type: application/json"`)
      console.log('\n' + '='.repeat(60))
      console.log('🔍 Check your OpenTelemetry collector for:')
      console.log('   - Automatic retry spans')
      console.log('   - Race condition spans (cache vs database)')
      console.log('   - Timeout annotations')
      console.log('   - Parallel execution traces\n')
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
