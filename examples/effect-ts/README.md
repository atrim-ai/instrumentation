# Effect-TS Advanced Patterns Example

This example demonstrates advanced Effect-TS patterns with OpenTelemetry tracing using `@atrim/instrumentation`.

## Features Demonstrated

### 🏁 Effect.race
Race between cache lookup and database query - first successful result wins!
- **Trace View**: See two parallel spans competing
- **Pattern**: Concurrent fallback strategies

### 🔄 Effect.retry
Automatic retry with exponential backoff for database queries.
- **Trace View**: Multiple retry attempt spans with increasing delays
- **Pattern**: Resilient error handling

### ⏱️ Effect.timeout
Operations with configurable timeouts.
- **Trace View**: Timeout annotations on spans
- **Pattern**: Preventing hung operations

### ⚡ Effect.all
Parallel execution of multiple operations with concurrency control.
- **Trace View**: Multiple child spans executing in parallel
- **Pattern**: Bulk operations optimization

### 🎯 Complex Workflow
All patterns combined in a realistic user workflow:
1. Race to fetch user (cache vs database)
2. Retry failed database queries
3. Parallel fetch of related users
4. Timeout-protected cache updates

### ➕ Validation & Error Handling
Demonstrates Effect.either for graceful error handling with validation.

## Getting Started

### Prerequisites

1. **OpenTelemetry Collector** (for viewing traces):
```bash
docker run -p 4318:4318 -p 16686:16686 jaegertracing/all-in-one:latest
```

2. **Install Dependencies**:
```bash
npm install
```

### Run the Example

```bash
npm start
```

Then open http://localhost:3002 in your browser.

## Architecture

### OpenTelemetry Setup

```typescript
// 1. Pattern-based instrumentation (filters spans)
await initializeInstrumentation()

// 2. NodeSDK with OTLP exporter
const sdk = new NodeSDK({
  spanProcessor: new PatternSpanProcessor(config, batchProcessor),
  serviceName: 'effect-ts-example'
})

// 3. Effect instrumentation layer
const program = myOperation().pipe(
  Effect.provide(EffectInstrumentationLive)
)
```

### Context Propagation

Express HTTP spans → Effect spans (automatic!)

```
GET /users/1 (Express auto-instrumentation)
  └─ user.fetch.race (Effect)
      ├─ user.fetch.cache (Effect)
      │   └─ cache.get (Effect)
      └─ user.fetch.database (Effect)
          └─ db.query (Effect with retry)
              ├─ attempt 1 (failed)
              ├─ attempt 2 (failed)
              └─ attempt 3 (success!)
```

## API Endpoints

### GET /users
Fetch all users with automatic retry logic.

**Example**:
```bash
curl http://localhost:3002/users
```

**Trace Pattern**: Shows retry spans if database fails initially.

### GET /users/:id
Fetch user by ID using race condition (cache vs database).

**Example**:
```bash
curl http://localhost:3002/users/1
```

**Trace Pattern**: Two parallel spans (cache + database), first success wins.

### POST /users
Create a new user with validation.

**Example**:
```bash
curl -X POST http://localhost:3002/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Diana","email":"diana@example.com"}'
```

**Trace Pattern**: Validation → Database Insert → Cache Update.

### GET /workflow/:id
Complex workflow demonstrating all patterns together.

**Example**:
```bash
curl http://localhost:3002/workflow/1
```

**Trace Pattern**: Race → Retry → Parallel → Timeout (full demo!).

### POST /cache/clear
Clear the cache (useful for testing race conditions).

**Example**:
```bash
curl -X POST http://localhost:3002/cache/clear
```

## Configuration

See `instrumentation.yaml` for pattern-based span filtering configuration.

### Key Patterns

**Instrumented** (✅ Creates spans):
- `^app\.` - Application operations
- `^user\.` - User management
- `^db\.` - Database queries
- `^cache\.` - Cache operations

**Ignored** (❌ Dropped):
- `^GET /health` - Health checks
- `^GET /favicon.ico` - Static assets
- `^internal\.` - Internal utilities

## Effect-Specific Features

### Automatic Metadata Extraction

Effect fiber information is automatically added to spans:
- `effect.fiber.id` - Unique fiber identifier
- `effect.fiber.status` - Fiber execution status
- `effect.operation.root` - Root operation name

### Custom Annotations

```typescript
yield* Effect.annotateCurrentSpan('db.system', 'postgresql')
yield* Effect.annotateCurrentSpan('db.statement', sql)
yield* Effect.annotateCurrentSpan('cache.hit', true)
```

## Observing Traces

### Jaeger UI

Open http://localhost:16686 and:
1. Select service: `effect-ts-example`
2. Click "Find Traces"
3. Look for:
   - **Race conditions**: Parallel cache + database spans
   - **Retry attempts**: Multiple `db.query` spans with delays
   - **Timeouts**: Spans with timeout annotations
   - **Parallel execution**: Multiple concurrent child spans

### Key Metrics to Watch

- **Success rate**: How often retries succeed
- **Cache hit rate**: Cache span annotations
- **Race winner**: Which span completes first
- **Retry count**: Number of attempts before success

## Advanced Usage

### Custom Retry Schedule

```typescript
Effect.retry(
  Schedule.exponential(Duration.millis(100), 2)  // 100ms, 200ms, 400ms...
    .pipe(Schedule.intersect(Schedule.recurs(3)))  // Max 3 retries
)
```

### Race with Fallback

```typescript
Effect.race(primarySource, fallbackSource)
  .pipe(Effect.catchAll(() => defaultValue))
```

### Parallel with Concurrency Limit

```typescript
Effect.all(operations, { concurrency: 5 })
```

## Troubleshooting

### No traces appearing?

1. Check OpenTelemetry collector is running on port 4318
2. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
3. Check console output for instrumentation setup messages

### Spans being filtered?

Check `instrumentation.yaml` patterns - your span names must match an `instrument_patterns` entry.

### Effect errors not handled?

Make sure to use `Effect.runPromiseExit()` and handle both success and failure cases:

```typescript
const exit = await Effect.runPromiseExit(program)

if (Exit.isSuccess(exit)) {
  // Handle success
} else {
  // Handle failure
}
```

## Learn More

- [Effect-TS Documentation](https://effect.website)
- [OpenTelemetry Tracing](https://opentelemetry.io/docs/instrumentation/js/instrumentation/)
- [@atrim/instrumentation](../../README.md)
