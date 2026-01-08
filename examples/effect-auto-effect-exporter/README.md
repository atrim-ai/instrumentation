# Effect-TS Auto-Tracing Example (Console / Development Mode)

This example demonstrates **automatic tracing** of all Effect fibers using a **console-based span exporter** for development. No external OTLP collector required!

> **Note**: This example uses `NodeSdk.layer()` with `ConsoleSpanExporter` for development/debugging.
> For production use with an OTLP collector, see the `effect-auto-nodesdk-exporter` example.

## Features Demonstrated

- **Zero-code instrumentation** - Just provide `AutoTracingLive` layer
- **Console span output** - Spans logged to stdout for easy debugging
- **No external dependencies** - No OTLP collector needed
- **Development-friendly** - Quick iteration without infrastructure

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Run the Example

```bash
pnpm start
```

That's it! Spans will be printed directly to the console.

## When to Use This Approach

**Use Console Exporter when:**
- Developing and debugging locally
- Running tests that need span verification
- Learning/experimenting with auto-tracing
- Quick demos without infrastructure setup

**Use OTLP Exporter (other example) when:**
- Running in production
- Need persistent trace storage
- Want to use Jaeger, Zipkin, or cloud providers
- Need distributed tracing across services

## Code Walkthrough

### Development Setup

The key difference from the production example is the exporter configuration:

```typescript
import { NodeSdk } from '@effect/opentelemetry'
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

// For development: console output, no external collector needed
const OtelLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: 'my-service',
    serviceVersion: '1.0.0'
  },
  // SimpleSpanProcessor + ConsoleSpanExporter for immediate output
  spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter())
}))

// Combine with AutoTracingLive
const AppLive = Layer.mergeAll(OtelLive, AutoTracingLive)
Effect.runPromise(main.pipe(Effect.provide(AppLive)))
```

### Console Output

You'll see spans logged like this:

```json
{
  "traceId": "abc123...",
  "name": "effect.fiber.42",
  "duration": [0, 100000000],
  "attributes": {
    "effect.fiber_id": "#42",
    "effect.source_location": "index.ts:75"
  },
  "status": { "code": 1 }
}
```

## Configuration

See `instrumentation.yaml` for the complete configuration:

```yaml
effect:
  auto_instrumentation:
    enabled: true
    span_naming:
      default: "effect.{function}"
      infer_from_source: true
```

## Comparison with Production Example

| Feature | Console Exporter | OTLP Exporter |
|---------|-----------------|---------------|
| External collector | Not required | Required |
| Setup complexity | Simple | Moderate |
| Use case | Development | Production |
| Span persistence | None (stdout only) | Full (collector) |
| Distributed tracing | No | Yes |
| Processor | SimpleSpanProcessor | BatchSpanProcessor |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_SERVICE_NAME` | `effect-auto-dev-example` | Service name for traces |

## Related Documentation

- [Effect Auto-Tracing Guide](../../docs/EFFECT_AUTO_TRACING.md) - Comprehensive documentation
- [Effect Integration Guide](../../docs/EFFECT_INTEGRATION.md) - Manual instrumentation
- [Production Example](../effect-auto-nodesdk-exporter/) - OTLP export setup
