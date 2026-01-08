# Effect-TS Auto-Tracing Guide

Automatically trace all Effect fibers without manual `Effect.withSpan()` calls using the Supervisor-based auto-instrumentation.

## Overview

The auto-tracing feature uses Effect's Supervisor API to intercept fiber creation and automatically create OpenTelemetry spans. This means:

- **Zero code changes** - Just provide `AutoTracingLive` layer once at app entry
- **Comprehensive coverage** - Traces your code AND library code
- **YAML-driven configuration** - All tracing behavior controlled via `instrumentation.yaml`
- **Works everywhere** - Bundled apps, all runtimes (Node.js, Bun, Deno)

## Quick Start

### 1. Install Dependencies

```bash
pnpm add @atrim/instrument-node @opentelemetry/api effect
```

### 2. Configure `instrumentation.yaml`

```yaml
version: "1.0"

effect:
  auto_instrumentation:
    enabled: true
    granularity: fiber

    span_naming:
      default: "effect.{function}"
      infer_from_source: true
      rules:
        - match: { file: "src/services/.*" }
          name: "service.{function}"
        - match: { function: "fetch.*" }
          name: "http.{function}"

    filter:
      exclude:
        - "^internal\\."
        - "^test\\."

    performance:
      sampling_rate: 1.0
      min_duration: "0ms"
```

### 3. Provide the Layer

```typescript
import { Effect } from 'effect'
import { AutoTracingLive } from '@atrim/instrument-node/effect/auto'

const program = Effect.gen(function* () {
  yield* doWork()      // Automatically traced!
  yield* fetchData()   // Automatically traced!
  yield* saveResult()  // Automatically traced!
})

// Provide the layer once at app entry
Effect.runPromise(program.pipe(Effect.provide(AutoTracingLive)))
```

That's it! All Effect fibers are now automatically traced.

## How It Works

### Supervisor Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    instrumentation.yaml                          │
│         (Single source of truth for all tracing config)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              AutoTracingSupervisor                               │
│                                                                  │
│  onStart(fiber) ──► Create OTel span                            │
│  onEnd(fiber)   ──► End span with status                        │
│                                                                  │
│  WeakMap<Fiber, Span> for fiber-to-span association             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenTelemetry Spans                           │
│                                                                  │
│  Exported to your collector via standard OTLP                    │
└─────────────────────────────────────────────────────────────────┘
```

The `AutoTracingSupervisor` intercepts Effect's fiber lifecycle:

1. **`onStart`** - Called when a new fiber is created
   - Infers span name from source code or config rules
   - Checks filter patterns (include/exclude)
   - Creates OpenTelemetry span
   - Associates span with fiber via WeakMap

2. **`onEnd`** - Called when fiber completes
   - Retrieves associated span
   - Sets span status (OK or ERROR based on Exit)
   - Ends the span

## Configuration Reference

### `effect.auto_instrumentation`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable auto-tracing |
| `granularity` | `"fiber"` | `"fiber"` | Tracing granularity |

### `span_naming`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default` | string | `"effect.fiber.{fiber_id}"` | Default span name template |
| `infer_from_source` | boolean | `true` | Parse stack traces for function names |
| `rules` | array | `[]` | Pattern-based naming rules |

#### Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{fiber_id}` | Fiber's numeric ID | `123` |
| `{function}` | Function name from stack trace | `getUserById` |
| `{module}` | Module name (filename without extension/suffix) | `User` (from `UserService.ts`) |
| `{file}` | Full file path | `/app/src/services/UserService.ts` |
| `{line}` | Line number | `42` |
| `{match:field:N}` | Regex capture group from match | See examples below |

#### Naming Rules

Rules are evaluated in order; first match wins:

```yaml
span_naming:
  rules:
    # Match by file pattern
    - match:
        file: "src/services/.*"
      name: "service.{function}"

    # Match by function pattern
    - match:
        function: "fetch.*"
      name: "http.{function}"

    # Match multiple criteria (AND)
    - match:
        file: "src/api/.*"
        function: "handle.*"
      name: "api.handler.{function}"

    # Use regex capture groups
    - match:
        file: "src/services/(.*)/.*"
      name: "service.{match:file:0}.{function}"
```

### `filter`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `include` | string[] | `[]` | Only trace spans matching these patterns (empty = all) |
| `exclude` | string[] | `[]` | Never trace spans matching these patterns |

Exclude patterns take precedence over include patterns.

```yaml
filter:
  include:
    - "^service\\."
    - "^api\\."
  exclude:
    - "^internal\\."
    - "^healthcheck\\."
```

### `performance`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sampling_rate` | number | `1.0` | Sample rate (0.0 - 1.0) |
| `min_duration` | string | `"0ms"` | Skip fibers shorter than this |
| `max_concurrent` | number | `0` | Max concurrent traced fibers (0 = unlimited) |

```yaml
performance:
  sampling_rate: 0.1      # Sample 10% of fibers
  min_duration: "5ms"     # Skip fibers < 5ms
  max_concurrent: 1000    # Limit concurrent traces
```

### `metadata`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fiber_info` | boolean | `true` | Add `effect.fiber.id` attribute |
| `source_location` | boolean | `true` | Add source file/line attributes |
| `parent_fiber` | boolean | `true` | Add parent fiber information |

## Opt-Out Mechanisms

### YAML-Driven Exclusion (Recommended)

The primary way to exclude operations from auto-tracing is via `instrumentation.yaml`:

**Step 1: Add naming rule to give internal operations a recognizable prefix**
```yaml
effect:
  auto_instrumentation:
    span_naming:
      rules:
        # Map internal functions to internal.* namespace
        - match:
            function: "internal.*"
          name: "internal.{function}"
```

**Step 2: Exclude the namespace in filter patterns**
```yaml
effect:
  auto_instrumentation:
    filter:
      exclude:
        - "^internal\\."
        - "^debug\\."
```

Now any function starting with `internal` (like `internalHealthCheck`) will:
1. Get span name `internal.healthCheck` via the naming rule
2. Be excluded by the `^internal\\.` filter pattern

**No code changes needed!**

### Programmatic Opt-Out (Advanced)

For runtime control or cases where you can't modify the YAML config (e.g., third-party code):

```typescript
import { withoutAutoTracing } from '@atrim/instrument-node/effect/auto'

const program = Effect.gen(function* () {
  yield* publicWork()  // Traced

  // Disable auto-tracing for specific operations at runtime
  yield* withoutAutoTracing(
    Effect.gen(function* () {
      yield* internalWork1()  // NOT traced
      yield* internalWork2()  // NOT traced
    })
  )

  yield* morePublicWork()  // Traced
})
```

### Override Span Name

```typescript
import { setSpanName } from '@atrim/instrument-node/effect/auto'

const program = Effect.gen(function* () {
  // Override the auto-generated name
  yield* setSpanName('custom.operation.name')(
    Effect.gen(function* () {
      yield* complexOperation()
    })
  )
})
```

## Custom Configuration

### Programmatic Configuration

```typescript
import { createAutoTracingLayer } from '@atrim/instrument-node/effect/auto'

const CustomAutoTracing = createAutoTracingLayer({
  config: {
    enabled: true,
    granularity: 'fiber',
    span_naming: {
      default: 'myapp.{function}',
      infer_from_source: true,
      rules: [
        { match: { file: 'src/api/.*' }, name: 'api.{function}' }
      ]
    },
    filter: { include: [], exclude: ['^test\\.'] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }
})

const program = myApp.pipe(Effect.provide(CustomAutoTracing))
```

## Integration with Manual Spans

Auto-tracing works alongside manual `Effect.withSpan()` calls:

```typescript
const program = Effect.gen(function* () {
  // Auto-traced fiber
  yield* autoTracedWork()

  // Manual span (takes precedence, no duplicate)
  yield* Effect.gen(function* () {
    yield* manualWork()
  }).pipe(Effect.withSpan('manual.operation'))

  // Auto-traced fiber
  yield* moreAutoTracedWork()
})
```

## Performance Considerations

| Operation | Typical Overhead | Notes |
|-----------|------------------|-------|
| Supervisor hook | < 50 microseconds | Per fiber |
| Span name inference | < 100 microseconds | With stack trace parsing |
| Pattern matching | < 10 microseconds | Compiled regex, cached |
| Total overhead | < 5% | For typical Effect apps |

### Optimization Tips

1. **Use `min_duration`** - Skip short-lived fibers
   ```yaml
   performance:
     min_duration: "1ms"
   ```

2. **Use sampling** - For high-throughput services
   ```yaml
   performance:
     sampling_rate: 0.1  # 10% sampling
   ```

3. **Use exclude patterns** - Skip known noisy operations
   ```yaml
   filter:
     exclude:
       - "^internal\\."
       - "^scheduler\\."
   ```

4. **Limit concurrency** - Prevent memory pressure
   ```yaml
   performance:
     max_concurrent: 5000
   ```

## Troubleshooting

### Spans not appearing?

1. **Check `enabled: true`** in config
2. **Verify OTLP endpoint** is configured:
   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```
3. **Check filter patterns** - Your spans might be excluded
4. **Check sampling rate** - Might be sampling out

### Wrong span names?

1. **Check `infer_from_source`** - Set to `true` for function names
2. **Add naming rules** for specific patterns
3. **Use `setSpanName()`** for explicit control

### High overhead?

1. **Increase `min_duration`** to skip short fibers
2. **Reduce `sampling_rate`** for high-throughput services
3. **Add exclude patterns** for noisy operations

## Example Projects

Two example projects demonstrate different exporter configurations:

| Example | Use Case | Requires Collector? |
|---------|----------|---------------------|
| [effect-auto-nodesdk-exporter](../examples/effect-auto-nodesdk-exporter) | Production with OTLP export | Yes |
| [effect-auto-effect-exporter](../examples/effect-auto-effect-exporter) | Development with console output | No |

Both use `NodeSdk.layer()` from `@effect/opentelemetry` which sets up the global TracerProvider needed for AutoTracingSupervisor.

### Production Setup (OTLP Export)

```bash
cd examples/effect-auto-nodesdk-exporter
pnpm install
# Start an OTLP collector first (e.g., Jaeger)
docker run -p 4318:4318 -p 16686:16686 jaegertracing/all-in-one:latest
pnpm start
```

### Development Setup (Console Output)

```bash
cd examples/effect-auto-effect-exporter
pnpm install
pnpm start  # Spans logged to console - no collector needed!
```

## API Reference

### Exports from `@atrim/instrument-node/effect/auto`

| Export | Type | Description |
|--------|------|-------------|
| `AutoTracingLive` | `Layer<never>` | Zero-config auto-tracing layer |
| `createAutoTracingLayer` | `(options?) => Layer<never>` | Factory with custom config |
| `AutoTracingSupervisor` | `class` | The underlying supervisor |
| `withoutAutoTracing` | `<A,E,R>(effect) => Effect<A,E,R>` | Disable tracing for an effect |
| `setSpanName` | `(name) => <A,E,R>(effect) => Effect<A,E,R>` | Override span name |
| `AutoTracingEnabled` | `FiberRef<boolean>` | FiberRef for enable/disable |
| `AutoTracingSpanName` | `FiberRef<Option<string>>` | FiberRef for name override |

## Related Documentation

- [Effect-TS Integration Guide](./EFFECT_INTEGRATION.md) - Manual instrumentation
- [Configuration Reference](./configuration.md) - Full YAML schema
- [Getting Started](./getting-started.md) - Quick start guide
