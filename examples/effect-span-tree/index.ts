/**
 * Effect-TS SpanTree Example
 *
 * This example demonstrates how SpanTree solves the use case from Effect-TS/effect#5926:
 * "Accessing the deepest span path from Effect.ensuring()"
 *
 * The Problem:
 * When using Effect.ensuring() to log span information, inner spans have already
 * closed by the time the finalizer runs. This makes it impossible to query the
 * "deepest path" through the span hierarchy.
 *
 * The Solution:
 * SpanTree maintains an in-memory span tree with TTL-based cleanup, allowing
 * queries like getDeepestPath() even after inner spans have ended.
 *
 * To run this example:
 * 1. Start an OpenTelemetry collector:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run this example:
 *    pnpm start
 *
 * 3. Make requests:
 *    curl http://localhost:3003/api/users/1
 */

import express from 'express'
import { Effect, Duration, Layer, Ref, Tracer } from 'effect'
import * as OtelTracer from '@effect/opentelemetry/Tracer'
import * as OtelResource from '@effect/opentelemetry/Resource'
import { initializeInstrumentation, SpanTree } from '@atrim/instrument-node'

// ============================================================================
// Domain Types
// ============================================================================

interface User {
  id: string
  name: string
  email: string
}

interface AuditLog {
  traceId: string
  deepestPath: string
  depth: number
  spanCount: number
  timestamp: Date
  traceUrl: string | null
}

// Mock data
const mockUsers: Record<string, User> = {
  '1': { id: '1', name: 'Alice', email: 'alice@example.com' },
  '2': { id: '2', name: 'Bob', email: 'bob@example.com' }
}

// ============================================================================
// Effect Tracer Layer - Uses NodeSDK's Global TracerProvider
// ============================================================================
// This layer uses the global TracerProvider set up by initializeInstrumentation().
// This ensures Effect spans go through PatternSpanProcessor which records to SpanTree.
const EffectTracerLive = Layer.effect(Tracer.Tracer, OtelTracer.make).pipe(
  Layer.provide(OtelTracer.layerGlobal),
  Layer.provide(
    OtelResource.layer({
      serviceName: process.env.OTEL_SERVICE_NAME || 'effect-span-tree-example',
      serviceVersion: '1.0.0'
    })
  )
)

// ============================================================================
// Effect Operations with Nested Spans
// ============================================================================

/**
 * Validate user ID format
 */
const validateUserId = (userId: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`Validating user ID: ${userId}`)
    yield* Effect.sleep(Duration.millis(10))

    if (!userId.match(/^\d+$/)) {
      return yield* Effect.fail(new Error('Invalid user ID format'))
    }

    return userId
  }).pipe(Effect.withSpan('validate'))

/**
 * Check user permissions
 */
const checkPermissions = (userId: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`Checking permissions for user: ${userId}`)
    yield* Effect.sleep(Duration.millis(15))
    return true
  }).pipe(Effect.withSpan('checkPermissions'))

/**
 * Query database for user
 */
const queryDatabase = (userId: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`Querying database for user: ${userId}`)
    yield* Effect.annotateCurrentSpan('db.system', 'postgresql')
    yield* Effect.annotateCurrentSpan('db.statement', `SELECT * FROM users WHERE id = $1`)
    yield* Effect.sleep(Duration.millis(50))

    const user = mockUsers[userId]
    if (!user) {
      return yield* Effect.fail(new Error(`User not found: ${userId}`))
    }

    return user
  }).pipe(Effect.withSpan('db.query'))

/**
 * Transform user data for response
 */
const transformUser = (user: User) =>
  Effect.gen(function* () {
    yield* Effect.log(`Transforming user data`)
    yield* Effect.sleep(Duration.millis(5))
    return {
      ...user,
      displayName: `${user.name} <${user.email}>`
    }
  }).pipe(Effect.withSpan('transform'))

/**
 * Fetch user with nested operations
 * Creates hierarchy: fetchUser -> validate -> checkPermissions -> db.query -> transform
 */
const fetchUser = (userId: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`Starting user fetch for: ${userId}`)

    // Nested operations create deep span hierarchy
    const validatedId = yield* validateUserId(userId)
    yield* checkPermissions(validatedId)
    const user = yield* queryDatabase(validatedId)
    const transformed = yield* transformUser(user)

    return transformed
  }).pipe(Effect.withSpan('fetchUser'))

// ============================================================================
// The Key Feature: Effect.ensuring() with SpanTree
// ============================================================================

// Store for audit logs (in real app, this would be a database)
const auditLogs: AuditLog[] = []

/**
 * Wrap an Effect with span path logging using Effect.ensuring()
 *
 * This demonstrates the exact use case from Effect-TS/effect#5926:
 * - The finalizer runs after ALL inner spans have ended
 * - Without SpanTree, we'd have no way to know the deepest path
 * - With SpanTree, we can query the full hierarchy even after spans end
 */
const withSpanLogging = <A, E, R>(effect: Effect.Effect<A, E, R>, operationName: string) =>
  Effect.gen(function* () {
    // Get trace ID at the start (before inner spans exist)
    const traceId = SpanTree.getCurrentTraceId()

    if (!traceId) {
      console.log(`[${operationName}] No trace ID - SpanTree may not be initialized`)
      return yield* effect
    }

    // Use Ref to capture the deepest path during execution
    const pathRef = yield* Ref.make<string[]>([])

    // Run the effect with periodic path capture
    const result = yield* effect.pipe(
      // Use ensuring to log after ALL inner spans complete
      Effect.ensuring(
        Effect.gen(function* () {
          // THIS IS THE KEY: Even though inner spans have ended,
          // SpanTree still has their data and we can query it!
          const summary = SpanTree.getTraceSummary(traceId, {
            traceUrlBase: process.env.TRACE_URL_BASE || 'https://ui.honeycomb.io'
          })

          // Add span attributes so depth/path are visible in trace UI (Atrim, Honeycomb, etc.)
          yield* Effect.annotateCurrentSpan('span_tree.depth', summary.depth)
          yield* Effect.annotateCurrentSpan('span_tree.deepest_path', summary.formattedPath)
          yield* Effect.annotateCurrentSpan('span_tree.span_count', summary.spanCount)
          if (summary.traceUrl) {
            yield* Effect.annotateCurrentSpan('span_tree.trace_url', summary.traceUrl)
          }

          // Log the deepest path achieved
          console.log(`\n${'='.repeat(60)}`)
          console.log(`[${operationName}] Trace completed!`)
          console.log(`  Deepest path: ${summary.formattedPath}`)
          console.log(`  Depth: ${summary.depth} spans`)
          console.log(`  Total spans: ${summary.spanCount}`)
          if (summary.traceUrl) {
            console.log(`  Trace URL: ${summary.traceUrl}`)
          }
          console.log('='.repeat(60) + '\n')

          // Store audit log
          auditLogs.push({
            traceId,
            deepestPath: summary.formattedPath,
            depth: summary.depth,
            spanCount: summary.spanCount,
            timestamp: new Date(),
            traceUrl: summary.traceUrl
          })
        })
      )
    )

    return result
  }).pipe(Effect.withSpan(operationName))

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Main user fetch endpoint - demonstrates SpanTree in action
 */
const handleGetUser = (userId: string) =>
  withSpanLogging(fetchUser(userId), 'api.getUser').pipe(Effect.provide(EffectTracerLive))

// ============================================================================
// Express Server
// ============================================================================

function createApp() {
  const app = express()
  app.use(express.json())

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Get user - demonstrates SpanTree
  app.get('/api/users/:id', async (req, res) => {
    const program = handleGetUser(req.params.id)

    const result = await Effect.runPromise(program.pipe(Effect.either))

    if (result._tag === 'Right') {
      res.json(result.right)
    } else {
      res.status(404).json({ error: String(result.left) })
    }
  })

  // Get audit logs - shows captured span paths
  app.get('/api/audit-logs', (_req, res) => {
    res.json(auditLogs)
  })

  // Demo endpoint that creates even deeper hierarchy
  app.get('/api/complex/:id', async (req, res) => {
    const complexOperation = Effect.gen(function* () {
      // Create a deep nested hierarchy
      const user = yield* fetchUser(req.params.id)

      // Additional nested operations
      yield* Effect.gen(function* () {
        yield* Effect.log('Enriching user data')
        yield* Effect.sleep(Duration.millis(10))

        yield* Effect.gen(function* () {
          yield* Effect.log('Fetching preferences')
          yield* Effect.sleep(Duration.millis(10))
        }).pipe(Effect.withSpan('fetchPreferences'))
      }).pipe(Effect.withSpan('enrichUser'))

      return user
    })

    const program = withSpanLogging(complexOperation, 'api.complexOperation').pipe(
      Effect.provide(EffectTracerLive)
    )

    const result = await Effect.runPromise(program.pipe(Effect.either))

    if (result._tag === 'Right') {
      res.json(result.right)
    } else {
      res.status(500).json({ error: String(result.left) })
    }
  })

  // SpanTree stats endpoint
  app.get('/api/span-tree/stats', (_req, res) => {
    // Access SpanTree stats if available (need implementation access)
    res.json({
      enabled: SpanTree.isEnabled(),
      currentTraceId: SpanTree.getCurrentTraceId(),
      currentPath: SpanTree.getCurrentPath()
    })
  })

  return app
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('@atrim/instrumentation - SpanTree Example')
  console.log('Demonstrates Effect-TS/effect#5926 solution')
  console.log('='.repeat(60) + '\n')

  try {
    // Initialize instrumentation with SpanTree
    await initializeInstrumentation({
      serviceName: 'effect-span-tree-example'
    })

    console.log('SpanTree enabled:', SpanTree.isEnabled())

    // Create and start Express app
    const app = createApp()
    const PORT = process.env.PORT || 3003

    app.listen(PORT, () => {
      console.log(`\nServer listening on http://localhost:${PORT}`)
      console.log('\nEndpoints:')
      console.log(`  GET /api/users/:id      - Fetch user (demonstrates SpanTree)`)
      console.log(`  GET /api/complex/:id    - Complex operation (deeper hierarchy)`)
      console.log(`  GET /api/audit-logs     - View captured span paths`)
      console.log(`  GET /api/span-tree/stats - SpanTree status`)
      console.log('\nTry these commands:')
      console.log(`  curl http://localhost:${PORT}/api/users/1`)
      console.log(`  curl http://localhost:${PORT}/api/complex/1`)
      console.log(`  curl http://localhost:${PORT}/api/audit-logs`)
      console.log('\n' + '='.repeat(60))
      console.log('Watch the console for span path logging from Effect.ensuring()!')
      console.log('='.repeat(60) + '\n')
    })
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()
