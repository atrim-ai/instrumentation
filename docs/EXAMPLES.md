# Usage Examples

Practical examples for `@atrim/instrumentation` in different scenarios.

## Send to Atrim Demo Instance

The simplest way to get started with Atrim:

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

await initializeInstrumentation({
  serviceName: 'my-app',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
```

Or via environment variables:

```bash
export OTEL_SERVICE_NAME=my-app
export OTEL_EXPORTER_OTLP_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai

node index.js
```

## Express Application

```typescript
import express from 'express'
import { initializeInstrumentation } from '@atrim/instrumentation'

// Initialize at app startup
await initializeInstrumentation({
  serviceName: 'express-api',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})

const app = express()

app.get('/users', async (req, res) => {
  // Automatically traced by Express instrumentation
  const users = await db.users.findAll()
  res.json(users)
})

app.listen(3000)
```

All HTTP requests are automatically traced!

## Pure Effect Application

```typescript
import { Effect, Console } from 'effect'
import * as HttpServer from '@effect/platform/HttpServer'
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

// Set endpoint via environment
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://demo1.us-central1.gcp.atrim.ai'
process.env.OTEL_SERVICE_NAME = 'effect-service'

const program = Effect.gen(function* () {
  yield* Console.log('Starting server')
  yield* Effect.sleep('100 millis')
}).pipe(
  Effect.withSpan('app.startup'),
  Effect.provide(EffectInstrumentationLive)
)

Effect.runPromise(program)
```

## Vanilla Node.js

```typescript
import http from 'http'
import { initializeInstrumentation } from '@atrim/instrumentation'
import { trace } from '@opentelemetry/api'

await initializeInstrumentation({
  serviceName: 'vanilla-server',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})

const tracer = trace.getTracer('my-service')

http.createServer(async (req, res) => {
  const span = tracer.startSpan('app.handle.request')
  
  // Your logic
  await processRequest(req)
  
  span.end()
  res.end('OK')
}).listen(3000)
```

## With Pattern Filtering

Create `instrumentation.yaml`:

```yaml
version: "1.0"

instrumentation:
  enabled: true
  logging: 'on'
  
  instrument_patterns:
    - pattern: "^app\\."
      description: "Application operations"
    - pattern: "^db\\."
      description: "Database queries"
    - pattern: "^http\\.server\\."
      description: "HTTP server requests"
      
  ignore_patterns:
    - pattern: "^health\\."
      description: "Health check endpoints"
    - pattern: "^metrics\\."
      description: "Metrics endpoints"
```

Then just initialize:

```typescript
await initializeInstrumentation({
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
// Patterns loaded automatically from ./instrumentation.yaml
```

## With Authentication Headers

```typescript
await initializeInstrumentation({
  serviceName: 'secure-service',
  otlp: {
    endpoint: 'http://demo1.us-central1.gcp.atrim.ai',
    headers: {
      'x-api-key': process.env.ATRIM_API_KEY,
      'x-tenant-id': 'my-org'
    }
  }
})
```

## Multi-Service Setup

**Service A (API Gateway):**
```typescript
await initializeInstrumentation({
  serviceName: 'api-gateway',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
```

**Service B (User Service):**
```typescript
await initializeInstrumentation({
  serviceName: 'user-service',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
```

**Service C (Order Service):**
```typescript
await initializeInstrumentation({
  serviceName: 'order-service',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
```

All services send to the same Atrim instance - traces are correlated automatically!

## Environment-Based Configuration

For different environments (dev, staging, prod):

**Development:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-app-dev
```

**Staging:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai
export OTEL_SERVICE_NAME=my-app-staging
```

**Production:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://prod.atrim.ai
export OTEL_SERVICE_NAME=my-app-prod
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=${ATRIM_API_KEY}"
```

Then in your code:
```typescript
await initializeInstrumentation()  // Uses environment variables
```

## Centralized Configuration

Load patterns from a remote URL:

```typescript
await initializeInstrumentation({
  serviceName: 'my-service',
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' },
  configUrl: 'https://config.atrim.ai/instrumentation.yaml',
  cacheTimeout: 300_000  // Cache for 5 minutes
})
```

## See Also

- [Getting Started Guide](./GETTING_STARTED.md)
- [Configuration Reference](./CONFIGURATION.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Working Examples](../examples)
