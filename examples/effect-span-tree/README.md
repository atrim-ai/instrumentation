# Effect-TS SpanTree Example

This example demonstrates how **SpanTree** solves the use case from [Effect-TS/effect#5926](https://github.com/Effect-TS/effect/issues/5926):

> "We wrap effects with span metadata and want to log the 'deepest' span path when the effect completes"

## The Problem

When using `Effect.ensuring()` to log span information at the end of an operation, **inner spans have already closed** by the time the finalizer runs. This makes it impossible to query the "deepest path" through the span hierarchy using standard OpenTelemetry APIs.

```typescript
// Without SpanTree - inner spans are gone!
const operation = myEffect.pipe(
  Effect.withSpan("root"),
  Effect.ensuring(
    Effect.sync(() => {
      // By the time this runs, inner spans like "validate", "db.query"
      // have already ended and their hierarchy is lost
      console.log("What was the deepest path?") // Can't answer this!
    })
  )
)
```

## The Solution

SpanTree maintains an in-memory span tree with TTL-based cleanup, allowing queries like `getDeepestPath()` even after inner spans have ended:

```typescript
import { SpanTree } from "@atrim/instrument-node"

const operation = myEffect.pipe(
  Effect.withSpan("root"),
  Effect.ensuring(
    Effect.sync(() => {
      const traceId = SpanTree.getCurrentTraceId()
      if (traceId) {
        // SpanTree still has the full hierarchy!
        const summary = SpanTree.getTraceSummary(traceId)
        console.log(`Deepest path: ${summary.formattedPath}`)
        // Output: "root → fetchUser → validate → db.query → transform"
      }
    })
  )
)
```

## Running the Example

1. **Start an OpenTelemetry collector:**
   ```bash
   docker run -p 4318:4318 otel/opentelemetry-collector
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Run the example:**
   ```bash
   pnpm start
   ```

4. **Make requests:**
   ```bash
   # Simple user fetch
   curl http://localhost:3003/api/users/1

   # Complex operation (deeper hierarchy)
   curl http://localhost:3003/api/complex/1

   # View captured audit logs
   curl http://localhost:3003/api/audit-logs
   ```

## What You'll See

When you make a request, watch the console output. You'll see something like:

```
============================================================
[api.getUser] Trace completed!
  Deepest path: api.getUser → fetchUser → validate → checkPermissions → db.query → transform
  Depth: 6 spans
  Total spans: 6
  Trace URL: https://ui.honeycomb.io/trace/abc123...
============================================================
```

This demonstrates that even though all the inner spans (validate, checkPermissions, etc.) have already ended by the time `Effect.ensuring()` runs, SpanTree still has their hierarchy data and can answer queries about the trace structure.

## Key API Methods

```typescript
import { SpanTree } from "@atrim/instrument-node"

// Get current trace context
const traceId = SpanTree.getCurrentTraceId()
const spanId = SpanTree.getCurrentSpanId()

// Query span paths
const deepestPath = SpanTree.getDeepestPath(traceId)
const currentPath = SpanTree.getCurrentPath()

// Get full trace summary
const summary = SpanTree.getTraceSummary(traceId, {
  traceUrlBase: "https://ui.honeycomb.io"
})
// Returns: { traceId, path, formattedPath, depth, spanCount, traceUrl }

// Query span details
const spanInfo = SpanTree.getSpan(spanId)
const children = SpanTree.getChildren(spanId)
const leafSpans = SpanTree.getLeafSpans(traceId)
```

## Memory Management

SpanTree includes built-in memory management:

- **TTL cleanup**: Span data is automatically cleared after traces complete (default: 30 seconds)
- **Max limits**: Configurable limits on spans (10,000) and traces (1,000)
- **LRU eviction**: When limits are exceeded, oldest traces are evicted first

These defaults are suitable for most applications. For high-throughput systems, you can tune these values when initializing the SDK.
