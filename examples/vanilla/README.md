# Vanilla TypeScript Example

This example demonstrates using `@atrim/instrumentation` in a plain Node.js/TypeScript application without any web framework.

## What This Example Shows

- ✅ Zero-config initialization with `instrumentation.yaml`
- ✅ Pattern-based span filtering
- ✅ OpenTelemetry SDK setup with pattern processor
- ✅ Using span helpers (`annotateDbQuery`, `annotateCacheOperation`)
- ✅ Success/error marking
- ✅ Ignore patterns (drops `internal.*` spans)

## Prerequisites

1. Node.js 18+ installed
2. OpenTelemetry collector running (or any OTLP endpoint)

## Running the Collector

```bash
# Option 1: Docker
docker run -p 4318:4318 -p 4317:4317 otel/opentelemetry-collector

# Option 2: Local collector (if installed)
otelcol --config config.yaml
```

## Running the Example

```bash
# Install dependencies (from repository root)
pnpm install

# Run the example
cd examples/vanilla
pnpm start
```

## Expected Output

```
📦 @atrim/instrumentation - Vanilla TypeScript Example

============================================================

🚀 Setting up OpenTelemetry with @atrim/instrumentation...

@atrim/instrumentation: Initialized successfully
  - Enabled: true
  - Instrument patterns: 2
  - Ignore patterns: 1
  - Description: Vanilla TypeScript example configuration

✅ OpenTelemetry SDK initialized

🔄 Starting demo workflow...

  📊 Fetching user data...
  ✅ Fetched user: John Doe

  💾 Caching user data...
  ✅ Cached successfully

  🔧 Running internal operation...
  📌 Internal operation (span will be dropped)
  ✅ Internal operation complete

✅ Demo workflow completed!

⏳ Waiting for spans to be exported...
👋 Shutting down gracefully...

============================================================
📊 Check your OpenTelemetry collector for traces!
   - Service: vanilla-example
   - Spans created: app.*, demo.* (matching patterns)
   - Spans dropped: internal.* (ignore pattern)
```

## Spans Created

The following spans will be exported:

1. `demo.workflow` - Root span for the workflow
2. `app.user.fetch` - User data fetching operation
3. `app.db.query` - Database query (child of user fetch)
4. `app.cache.set` - Cache operation

**Note:** The `internal.utility.operation` span is **dropped** by the ignore pattern and won't appear in traces.

## Configuration

See `instrumentation.yaml` for the pattern configuration:

```yaml
instrument_patterns:
  - pattern: "^app\\."    # Matches app.*
  - pattern: "^demo\\."   # Matches demo.*

ignore_patterns:
  - pattern: "^internal\\."  # Drops internal.*
```

## Customization

### Change the OTLP Endpoint

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318/v1/traces
pnpm start
```

### Modify Patterns

Edit `instrumentation.yaml` to change which spans are created/dropped.

### Add More Operations

Add more functions that create spans - they'll be automatically filtered based on your patterns!

## Next Steps

- Try the [Express example](../express/) for web framework integration
- See [documentation](../../docs/getting-started.md) for more features
- Check [API reference](../../docs/api-reference.md) for all available helpers
