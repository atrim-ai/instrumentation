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

## Custom Span Helpers

Use Effect-specific span annotation helpers:

```typescript
import {
  annotateUser,
  annotateDataSize,
  annotateLLM,
  annotateQuery
} from '@atrim/instrumentation/effect'

const program = Effect.gen(function* () {
  yield* annotateUser('user-123', 'alice@example.com')
  yield* annotateDataSize(1024, 'KB')
  
  const result = yield* queryDatabase()
  return result
}).pipe(Effect.withSpan('app.database.query'))
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
