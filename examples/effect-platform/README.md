# Pure Effect-TS Example with CombinedTracingLive

This example demonstrates `CombinedTracingLive` - the **most comprehensive** tracing option for Effect-TS HTTP applications.

## Key Features

✅ **Pure Effect-TS HTTP server** using `@effect/platform/HttpServer`
✅ **Automatic HTTP request tracing** - Every HTTP request traced automatically
✅ **Automatic fiber tracing** - Every forked fiber traced automatically
✅ **Parent-child span relationships** - Fiber spans linked to HTTP parent
✅ **Zero Effect.withSpan() calls** - No manual tracing code needed
✅ **YAML-driven configuration** - All settings in `instrumentation.yaml`

## What is CombinedTracingLive?

`CombinedTracingLive` provides both:

1. **HTTP request tracing** - @effect/platform's built-in HTTP middleware creates spans
2. **Fiber-level tracing** - Our Supervisor creates spans for all forked fibers

**No manual tracing code required!**

## Architecture

```
HTTP Request
  └─ http.server.request (automatic)
      ├─ effect.updateUserActivity (forked fiber - automatic)
      ├─ effect.sendWelcomeEmail (forked fiber - automatic)
      └─ effect.recordAnalytics (forked fiber - automatic)
```

All spans go to the **same exporter** via a single global TracerProvider.

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

   # Get specific user (triggers background fiber)
   curl http://localhost:3003/users/1

   # Create user (triggers 2 background fibers)
   curl -X POST http://localhost:3003/users \
     -d '{"name":"Alice","email":"alice@example.com"}' \
     -H "Content-Type: application/json"
   ```

## What You'll See in Your Observability Tool

**HTTP Request Spans:**
- `http.server.request` - Automatic HTTP request span
- Method, path, status code all captured automatically

**Fiber Spans:**
- `effect.updateUserActivity` - Background activity update (forked fiber)
- `effect.sendWelcomeEmail` - Background email notification (forked fiber)
- `effect.recordAnalytics` - Background analytics (forked fiber)
- Fiber ID, source location, parent fiber ID all captured

**Parent-Child Relationships:**
- Fiber spans are children of the HTTP request span
- All spans share the same trace ID
- Easy to see the full request flow

## Configuration

From `instrumentation.yaml`:

```yaml
effect:
  auto_instrumentation:
    enabled: true
    span_relationships:
      type: parent-child  # 'parent-child' | 'span-links' | 'both'

  exporter_config:
    type: otlp
    endpoint: http://localhost:4318
    processor: batch
```

## Comparison with Other Layers

| Layer | HTTP Tracing | Fiber Tracing | Use Case |
|-------|-------------|---------------|----------|
| `EffectTracingLive` | ✅ Automatic | ❌ No | HTTP-only apps |
| `CombinedTracingLive` | ✅ Automatic | ✅ Automatic | HTTP apps with background tasks |
| `FullAutoTracingLive` | ❌ No | ✅ Automatic | Non-HTTP Effect apps |

## When to Use CombinedTracingLive

✅ **Use CombinedTracingLive when:**
- Building Effect HTTP servers (`@effect/platform`)
- Using `Effect.fork()` for background tasks
- Want automatic tracing without manual spans
- Need to see full request flow including background work

⚠️ **Use EffectTracingLive when:**
- Don't need fiber-level tracing (HTTP-only)
- Want minimal overhead
- No forked fibers in your application

## Learn More

- [Effect-TS Documentation](https://effect.website)
- [@effect/platform HTTP Server](https://effect.website/docs/platform/http-server)
- [OpenTelemetry with Effect](https://effect.website/docs/observability/tracing/)
