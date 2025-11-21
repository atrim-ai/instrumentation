# Effect-TS Integration Guide

Using `@atrim/instrumentation` with Effect-TS applications.

## Pure Effect Applications

For **pure Effect apps** (using `@effect/platform`, no Express/Fastify):

```typescript
import { Effect } from 'effect'
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

// Set OTLP endpoint
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://demo1.us-central1.gcp.atrim.ai'
process.env.OTEL_SERVICE_NAME = 'my-effect-service'

const program = Effect.gen(function* () {
  yield* Effect.log('Processing request')
  // Your business logic
}).pipe(
  Effect.withSpan('app.process'),
  Effect.provide(EffectInstrumentationLive)
)

Effect.runPromise(program)
```

**Key points:**
- Use `EffectInstrumentationLive` directly
- Set OTLP endpoint via environment variables
- All tracing happens via `Effect.withSpan()`

## Hybrid Effect + Express

For **hybrid apps** (Effect business logic + Express HTTP layer):

```typescript
import express from 'express'
import { Effect } from 'effect'
import { initializeInstrumentation } from '@atrim/instrumentation'
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

// Initialize for both Express and Effect
await initializeInstrumentation({
  serviceName: 'hybrid-service',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})

const app = express()

app.get('/users', (req, res) => {
  // Effect business logic
  const program = Effect.gen(function* () {
    const users = yield* fetchUsers()
    return users
  }).pipe(
    Effect.withSpan('app.users.fetch'),
    Effect.provide(EffectInstrumentationLive)
  )

  Effect.runPromise(program).then(users => res.json(users))
})

app.listen(3000)
```

**Key points:**
- Call `initializeInstrumentation()` for Express auto-instrumentation
- Use `EffectInstrumentationLive` for Effect spans
- Both Express HTTP spans and Effect business logic spans will be traced

## Pattern Filtering with Effect

Create `instrumentation.yaml` to filter Effect spans:

```yaml
version: "1.0"

instrumentation:
  enabled: true
  
  instrument_patterns:
    - pattern: "^app\\."           # ✅ Business logic
    - pattern: "^http\\."          # ✅ HTTP operations
    
  ignore_patterns:
    - pattern: "^effect\\.internal\\."  # ❌ Skip internal Effect operations
    - pattern: "^health\\."             # ❌ Skip health checks
```

## Span Annotation Helpers

The library provides **9 production-tested annotation helpers** for enriching spans with semantic attributes. All helpers return `Effect.Effect<void>` and are fully composable.

### Available Helpers

#### User Context
```typescript
import { annotateUser } from '@atrim/instrumentation/effect'

yield* annotateUser('user-123', 'alice@example.com', 'alice')
// Adds: user.id, user.email, user.name
```

#### Data Size Metrics
```typescript
import { annotateDataSize } from '@atrim/instrumentation/effect'

yield* annotateDataSize(1024 * 1000, 500, 0.75) // bytes, items, compression ratio
// Adds: data.size.bytes, data.size.items, data.compression.ratio
```

#### Batch Operations
```typescript
import { annotateBatch } from '@atrim/instrumentation/effect'

yield* annotateBatch(100, 10) // totalItems, batchSize
yield* annotateBatch(100, 10, 95, 5) // add success/failure counts
// Adds: batch.size, batch.total_items, batch.count, batch.success_count, batch.failure_count
```

#### LLM Operations
```typescript
import { annotateLLM } from '@atrim/instrumentation/effect'

yield* annotateLLM('gpt-4', 'openai', {
  prompt: 100,
  completion: 200,
  total: 300
})
// Adds: llm.model, llm.provider, llm.tokens.prompt, llm.tokens.completion, llm.tokens.total
```

#### Database Queries
```typescript
import { annotateQuery } from '@atrim/instrumentation/effect'

yield* annotateQuery('SELECT * FROM users WHERE id = ?', 125, 1, 'main')
// query, duration (ms), rowCount, database
// Adds: db.statement, db.duration.ms, db.row_count, db.name
```

#### HTTP Requests
```typescript
import { annotateHttpRequest } from '@atrim/instrumentation/effect'

yield* annotateHttpRequest('POST', '/api/users', 201, 1024)
// method, url, statusCode, contentLength
// Adds: http.method, http.url, http.status_code, http.response.content_length
```

#### Error Context
```typescript
import { annotateError } from '@atrim/instrumentation/effect'

yield* annotateError(new Error('Connection failed'), true, 'DatabaseError')
// error, recoverable, errorType
// Adds: error.message, error.recoverable, error.type, error.stack
```

#### Operation Priority
```typescript
import { annotatePriority } from '@atrim/instrumentation/effect'

yield* annotatePriority('high', 'User-facing operation')
// Adds: operation.priority, operation.priority.reason
```

#### Cache Operations
```typescript
import { annotateCache } from '@atrim/instrumentation/effect'

yield* annotateCache(true, 'user:123', 3600)
// hit, key, ttl (seconds)
// Adds: cache.hit, cache.key, cache.ttl.seconds
```

### Auto-Enrichment

**Automatically extract Effect metadata** (fiber ID, status, parent span info) and add it to spans:

```typescript
import { autoEnrichSpan, withAutoEnrichedSpan } from '@atrim/instrumentation/effect'

// Option 1: Manual enrichment
const program = Effect.gen(function* () {
  yield* autoEnrichSpan() // Auto-add Effect metadata
  yield* annotateUser('user-123')
  yield* annotateBatch(100, 10)

  const result = yield* processItems()
  return result
}).pipe(Effect.withSpan('batch.process'))

// Option 2: Convenience wrapper
const program = withAutoEnrichedSpan('batch.process')(
  Effect.gen(function* () {
    yield* annotateUser('user-123')
    yield* annotateBatch(100, 10)
    return yield* processItems()
  })
)
```

**Metadata added by `autoEnrichSpan()`:**
- `effect.fiber.id` - Unique fiber identifier
- `effect.fiber.status` - Fiber status (Running, Done, Suspended)
- `effect.operation.root` - Whether this is a root operation
- `effect.operation.nested` - Whether this is nested under another span
- `effect.parent.span.id` - Parent span ID (if nested)
- `effect.parent.span.name` - Parent span name (if nested)
- `effect.parent.trace.id` - Parent trace ID (if nested)

### Complete Example

```typescript
import { Effect } from 'effect'
import {
  autoEnrichSpan,
  annotateUser,
  annotateBatch,
  annotateQuery,
  annotateError
} from '@atrim/instrumentation/effect'

const processBatch = Effect.gen(function* () {
  // Auto-enrich with Effect metadata
  yield* autoEnrichSpan()

  // Add user context
  yield* annotateUser('user-123', 'alice@example.com')

  // Add batch metadata
  yield* annotateBatch(100, 10)

  try {
    // Execute database query
    const startTime = Date.now()
    const results = yield* queryDatabase('SELECT * FROM items')
    const duration = Date.now() - startTime

    yield* annotateQuery('SELECT * FROM items', duration, results.length, 'main')

    // Update batch with results
    yield* annotateBatch(100, 10, results.success, results.failures)

    return results
  } catch (error) {
    yield* annotateError(error as Error, true, 'DatabaseError')
    throw error
  }
}).pipe(Effect.withSpan('batch.process'))
```

## Sending to Atrim

### Via Code

```typescript
await initializeInstrumentation({
  serviceName: 'my-service',
  otlp: { 
    endpoint: 'http://demo1.us-central1.gcp.atrim.ai'
  }
})
```

### Via Environment

```bash
export OTEL_SERVICE_NAME=my-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai

# Then in your code:
await initializeInstrumentation()
```

## Complete Example

See the working [effect-platform example](../examples/effect-platform) for a complete pure Effect application with tracing.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for Effect-specific issues.
