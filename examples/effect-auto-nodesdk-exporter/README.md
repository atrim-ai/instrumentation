# Effect-TS Auto-Tracing Example (NodeSdk Exporter)

This example demonstrates **automatic tracing** of all Effect fibers using the Supervisor-based auto-instrumentation with the `NodeSdk` from `@effect/opentelemetry`. No manual `Effect.withSpan()` calls required!

> **Note**: This example uses `NodeSdk.layer()` from `@effect/opentelemetry` to configure OpenTelemetry export to an OTLP collector.
> For an alternative approach using Effect's native development tracer, see the `effect-auto-effect-exporter` example.

## Features Demonstrated

- **Zero-code instrumentation** - Just provide `AutoTracingLive` layer
- **YAML-driven configuration** - All tracing behavior in `instrumentation.yaml`
- **Intelligent span naming** - Template variables and pattern-based rules
- **Opt-out mechanism** - `withoutAutoTracing()` for excluding specific operations
- **Span name override** - `setSpanName()` for custom names

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start an OpenTelemetry Collector

You can use any OTLP-compatible collector. For local development:

```bash
# Using Docker
docker run -p 4318:4318 otel/opentelemetry-collector-contrib:latest

# Or use Jaeger with OTLP support
docker run -p 4318:4318 -p 16686:16686 jaegertracing/all-in-one:latest
```

### 3. Run the Example

```bash
pnpm start
```

### 4. View Traces

Open your collector's UI (e.g., Jaeger at http://localhost:16686) to see the traces.

## Configuration

See `instrumentation.yaml` for the complete configuration:

```yaml
effect:
  auto_instrumentation:
    enabled: true
    granularity: fiber

    span_naming:
      default: "effect.{function}"
      infer_from_source: true
      rules:
        - match:
            file: "services/.*"
          name: "service.{module}.{function}"
        - match:
            function: "fetch.*"
          name: "http.{function}"

    filter:
      exclude:
        - "^internal\\."

    performance:
      sampling_rate: 1.0
      min_duration: "0ms"
```

## Code Walkthrough

### Automatic Tracing

All Effect operations are automatically traced:

```typescript
// These are automatically traced - no withSpan() needed!
const users = yield* UserService.listUsers()
const user = yield* UserService.getUser(1)
const profile = yield* fetchUserProfile(1)
```

### Opt-Out Mechanism

Disable tracing for specific operations:

```typescript
import { withoutAutoTracing } from '@atrim/instrument-node/effect/auto'

// This operation will NOT be traced
const health = yield* withoutAutoTracing(internalHealthCheck())
```

### Custom Span Names

Override the auto-generated span name:

```typescript
import { setSpanName } from '@atrim/instrument-node/effect/auto'

// This will have span name "custom.user-registration"
const newUser = yield* pipe(
  UserService.createUser('Dave'),
  setSpanName('custom.user-registration')
)
```

### Layer Setup

Provide `AutoTracingLive` once at app entry:

```typescript
import { AutoTracingLive } from '@atrim/instrument-node/effect/auto'

const AppLive = Layer.mergeAll(OtelLive, AutoTracingLive)

Effect.runPromise(main.pipe(Effect.provide(AppLive)))
```

## Expected Traces

When you run this example, you should see traces like:

```
effect.auto-example (service: effect-auto-example)
├── service.UserService.listUsers
├── service.UserService.getUser
├── http.fetchUserProfile
├── http.fetchUserSettings
├── custom.user-registration
└── (concurrent operations)
    ├── service.UserService.getUser
    ├── http.fetchUserProfile
    └── http.fetchUserSettings
```

Note: Internal operations wrapped with `withoutAutoTracing()` will not appear.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | `effect-auto-example` | Service name for traces |

## Related Documentation

- [Effect Auto-Tracing Guide](../../docs/EFFECT_AUTO_TRACING.md) - Comprehensive documentation
- [Effect Integration Guide](../../docs/EFFECT_INTEGRATION.md) - Manual instrumentation
- [Configuration Reference](../../docs/configuration.md) - Full YAML schema
