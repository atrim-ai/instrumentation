# Pure Effect-TS Example with @effect/platform HTTP Server

This example demonstrates using `@atrim/instrumentation` with **pure Effect-TS** - no Express, no Fastify, just Effect all the way down!

## Key Features

✅ **Pure Effect-TS HTTP server** using `@effect/platform/HttpServer`
✅ **Smart auto-detection** - Auto-instrumentation automatically disabled
✅ **Effect.withSpan()** for all tracing
✅ **Pattern-based filtering** from `instrumentation.yaml`
✅ **Zero manual configuration** needed

## What Makes This Different?

### This Example (Pure Effect)
```typescript
// No Express/Fastify - just Effect!
await initializeInstrumentation({
  serviceName: 'effect-platform-example'
})

// Output:
// @atrim/instrumentation: Detected Effect-TS without web framework
//   - Auto-instrumentation disabled by default
//   - Effect.withSpan() will create spans
```

**Auto-instrumentation: DISABLED (auto-detected)**
Because there's no traditional web framework, the library knows you don't need Express/HTTP auto-instrumentation.

### Effect-TS + Express Example
```typescript
// Using Express with Effect
await initializeInstrumentation({
  serviceName: 'effect-ts-example'
})

// Output:
// @atrim/instrumentation: SDK initialized successfully
//   - Auto-instrumentation: enabled (auto-detected)
```

**Auto-instrumentation: ENABLED (auto-detected)**
When using Express alongside Effect, auto-instrumentation is helpful for HTTP layer tracing.

## Running the Example

1. **Start OpenTelemetry Collector:**
   ```bash
   docker run -p 4318:4318 otel/opentelemetry-collector
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Run the server:**
   ```bash
   npm start
   ```

4. **Make requests:**
   ```bash
   # Get all users
   curl http://localhost:3003/users

   # Get specific user
   curl http://localhost:3003/users/1

   # Create user
   curl -X POST http://localhost:3003/users \
     -d '{"name":"Alice","email":"alice@example.com"}' \
     -H "Content-Type: application/json"
   ```

## Tracing Architecture

```
┌─────────────────────────────────────────────┐
│  @effect/platform HTTP Server               │
│  (Pure Effect - no Express)                 │
└──────────────┬──────────────────────────────┘
               │
               │ All spans via Effect.withSpan()
               ▼
┌─────────────────────────────────────────────┐
│  EffectInstrumentationLive                  │
│  (Effect's tracing layer)                   │
└──────────────┬──────────────────────────────┘
               │
               │ Automatic metadata extraction
               ▼
┌─────────────────────────────────────────────┐
│  PatternSpanProcessor                       │
│  (Filters based on instrumentation.yaml)   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  OTLP Exporter                              │
│  (Sends to collector)                       │
└─────────────────────────────────────────────┘
```

## Span Hierarchy

```
http.users.list               (HTTP handler)
  └─ app.users.list          (Business logic)
      └─ db.query            (Database operation)

http.users.get               (HTTP handler)
  └─ app.users.get          (Business logic)
      └─ db.query            (Database operation)

http.users.create            (HTTP handler)
  └─ app.users.create       (Business logic)
      └─ db.insert           (Database operation)
```

## Pattern Filtering

From `instrumentation.yaml`:

```yaml
instrument_patterns:
  - pattern: "^app\\."      # ✅ Business logic spans
  - pattern: "^http\\."     # ✅ HTTP handler spans
  - pattern: "^db\\."       # ✅ Database spans

ignore_patterns:
  - pattern: "^internal\\." # ❌ Internal utilities
  - pattern: "^test\\."     # ❌ Test operations
```

## Benefits of Pure Effect Approach

1. **No Framework Overhead** - Just Effect, nothing else
2. **Type-Safe Everything** - Effect's type safety all the way
3. **Smart Detection** - Auto-instrumentation disabled automatically
4. **Cleaner Traces** - Only relevant spans, no HTTP auto-instrumentation noise
5. **Full Effect Integration** - Seamless with Effect ecosystem

## Comparison with Other Approaches

| Feature | Pure Effect | Effect + Express | Vanilla Express |
|---------|-------------|------------------|-----------------|
| Auto-instrumentation | ❌ (disabled) | ✅ (enabled) | ✅ (enabled) |
| Manual config needed | ❌ No | ❌ No | ❌ No |
| HTTP layer tracing | Effect.withSpan | Auto-instrumented | Auto-instrumented |
| Business logic | Effect.withSpan | Effect.withSpan | Manual spans |
| Type safety | 100% | High | Manual |

## When to Use This Approach

✅ **Use Pure Effect when:**
- Building Effect-first applications
- Want full control over tracing
- Prefer Effect's programming model
- Don't need framework-specific features

⚠️ **Use Effect + Express when:**
- Integrating with existing Express apps
- Need Express middleware ecosystem
- Want automatic HTTP tracing
- Gradual migration to Effect

## Learn More

- [Effect-TS Documentation](https://effect.website)
- [@effect/platform HTTP Server](https://effect.website/docs/platform/http-server)
- [OpenTelemetry with Effect](https://effect.website/docs/observability/tracing/)
