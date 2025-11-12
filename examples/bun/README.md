# Bun Runtime Example

This example demonstrates that `@atrim/instrumentation` works seamlessly with **Bun** - the fast all-in-one JavaScript runtime. It showcases Bun's built-in HTTP server (`Bun.serve`) and native APIs while maintaining full OpenTelemetry instrumentation support.

## What This Example Shows

- ✅ Works with **Bun runtime** (1.0+)
- ✅ Uses Bun's native `Bun.serve` HTTP server
- ✅ Uses Bun-specific APIs (`Bun.sleep`, `Response.json`)
- ✅ Zero-config initialization with `instrumentation.yaml`
- ✅ Pattern-based span filtering
- ✅ Same API as Node.js (universal design)

## Prerequisites

1. **Bun installed** (1.0+)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **OpenTelemetry collector running**
   ```bash
   docker run -p 4318:4318 -p 4317:4317 otel/opentelemetry-collector
   ```

## Running the Example

```bash
# Install dependencies (from repository root)
pnpm install

# Navigate to this example
cd examples/bun

# Install dependencies with Bun
bun install

# Run the example
bun run index.ts
```

The server will start on `http://localhost:3003`

**Open the UI:** Visit http://localhost:3003 in your browser for an interactive demo!

## Using the Web UI

Open http://localhost:3003 in your browser to:
- Run the complete demo workflow (generates multiple traces)
- Test individual operations (user fetch, cache, etc.)
- Run filtered operations that don't generate traces (internal.*, test.*)
- See real-time activity logs with trace information

## Why Bun?

**Bun is fast** - This example demonstrates that you get:
- ⚡ Bun's fast startup time
- ⚡ Bun's fast HTTP server
- ⚡ Native TypeScript support (no transpilation needed)
- ⚡ Full OpenTelemetry instrumentation (no performance compromise)

**Universal library design** - The exact same code works in Node.js, Bun, and Deno!

## Expected Output

```
📦 @atrim/instrumentation - Bun Runtime Example

============================================================

🚀 Setting up OpenTelemetry with @atrim/instrumentation on Bun...

@atrim/instrumentation: Initialized successfully
  - Enabled: true
  - Instrument patterns: 2
  - Ignore patterns: 2
  - Description: Bun runtime example configuration

✅ Ready to trace with Bun!

🌐 Bun HTTP server listening on http://localhost:3003

============================================================
🎨 Interactive UI:
   👉 Open http://localhost:3003 in your browser

📊 Or try these curl requests:
   curl -X POST http://localhost:3003/api/workflow
   curl http://localhost:3003/api/user/user-456
   curl http://localhost:3003/api/internal  # Filtered

============================================================
💡 Check your OpenTelemetry collector for traces!
   - Service: bun-example
   - Runtime: Bun
   - Spans created: app.*, demo.* (matching patterns)
   - Spans dropped: internal.*, test.* (ignore patterns)
```

## Spans Created

The following spans will be exported:

1. `demo.workflow` - Root span for the workflow
2. `app.user.fetch` - User data fetching operation
3. `app.db.query` - Database query (child of user fetch)
4. `app.cache.set` - Cache operation

**Note:** The `internal.*` and `test.*` spans are **dropped** by ignore patterns and won't appear in traces.

## Bun-Specific Features Used

This example showcases Bun's native APIs:

```typescript
// Bun's HTTP server
Bun.serve({
  port: 3003,
  async fetch(req) {
    return Response.json({ message: 'Hello from Bun!' })
  }
})

// Bun's sleep (faster than setTimeout)
await Bun.sleep(100)

// Bun's file reading
const file = Bun.file('./public/index.html')
return new Response(file)
```

## Configuration

See `instrumentation.yaml` for the pattern configuration:

```yaml
instrument_patterns:
  - pattern: "^app\\."    # Matches app.*
  - pattern: "^demo\\."   # Matches demo.*

ignore_patterns:
  - pattern: "^internal\\."  # Drops internal.*
  - pattern: "^test\\."      # Drops test.*
```

## Performance Comparison

Bun's performance advantages are preserved:
- ✅ Fast cold start (Bun's native TypeScript)
- ✅ Fast HTTP server (Bun's optimized networking)
- ✅ Low memory overhead
- ✅ Instrumentation overhead: <5% (same as Node.js)

## Customization

### Change the OTLP Endpoint

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318/v1/traces
bun run index.ts
```

### Modify Patterns

Edit `instrumentation.yaml` to change which spans are created/dropped.

### Use Bun's Watch Mode

```bash
bun run --watch index.ts
```

## Cross-Runtime Compatibility

The library is **universal** - the same code works across runtimes:

| Runtime | Version | Status |
|---------|---------|--------|
| Node.js | 18+     | ✅ Supported |
| Bun     | 1.0+    | ✅ Supported |
| Deno    | 1.40+   | ✅ Supported |

**Key insight:** This example could run on Node.js with minimal changes (just replace Bun-specific APIs).

## Next Steps

- Try the [vanilla example](../vanilla/) for Node.js comparison
- See [Effect-TS example](../effect-ts/) for Effect integration
- Check [documentation](../../docs/getting-started.md) for more features
- Read [API reference](../../docs/api-reference.md) for all available helpers

## Troubleshooting

### Bun not found

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### Dependencies not installing

```bash
# Clear cache and reinstall
rm -rf node_modules
bun install
```

### Traces not showing up

1. Check collector is running: `curl http://localhost:4318/v1/traces`
2. Check `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
3. Verify patterns in `instrumentation.yaml` match your span names
