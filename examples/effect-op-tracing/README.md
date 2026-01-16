# Effect Operation Tracing Example

This example demonstrates **automatic span creation** for Effect operations using OpSupervision and OperationTracingSupervisor, configured via `instrumentation.yaml`.

## What This Shows

- **Effect.all** - Creates spans automatically when using Effect.all
- **Effect.forEach** - Creates spans automatically when using Effect.forEach
- **YAML-driven configuration** - Control which operations to trace via `instrumentation.yaml`
- **No manual instrumentation** - No `Effect.withSpan()` calls needed
- **Automatic metadata** - Spans include operation count and source location
- **Flexible exporters** - Switch between console (dev) and Atrim platform (prod)

## How It Works

1. **OpSupervision Runtime Flag** - Enables the Effect runtime to call supervisors for every operation
2. **OperationTracingSupervisor** - Reads metadata from Effect operations and creates OTel spans
3. **OperationMeta in trace field** - Effect.all/forEach capture metadata at creation time
4. **YAML Configuration** - `instrumentation.yaml` controls which operations to trace and where to export

## Configuration

The example is configured via `instrumentation.yaml`:

```yaml
effect:
  operation_tracing:
    enabled: true
    operations:
      - name: all
        include_count: true
        include_stack: true
      - name: forEach
        include_count: true
        include_stack: true

  exporter_config:
    # Local Atrim backend (default)
    type: otlp
    endpoint: "http://localhost:4319"
    processor: simple
    headers:
      x-api-key: "atrim_internal_tenant_000000000002"

    # Console exporter (development - commented out)
    # type: console
    # processor: simple
```

**To switch exporters:**
- For **local Atrim backend**: Use `endpoint: "http://localhost:4319"` (current default)
- For **console output**: Comment out OTLP, uncomment console section
- For **Atrim cloud**: Change endpoint to `https://trace.atrim.ai` and set your API key

## Running the Example

```bash
# Install dependencies
pnpm install

# Run with local Atrim backend (default)
pnpm start

# View traces in Atrim UI
# Check http://localhost:4319 or your Atrim UI for service "effect-service"
```

## Expected Output

You should see:
1. Console logs showing the tests running
2. Operation tracing logs: "Loaded 2 operation configs from instrumentation.yaml"
3. Span creation logs: "Created span effect.all - spanId=..."
4. Test completion message

**In Atrim UI:**
- Service: `effect-service`
- Operations: `effect.all`, `effect.forEach`
- Span attributes:
  - `effect.operation`: "all" or "forEach"
  - `effect.item_count`: 3 (for the test arrays)
  - `code.filepath`: Source file location
  - `code.lineno`: Line number
  - `code.stacktrace`: Full stack trace (if enabled)

## Implementation Details

This example uses:
- `@atrim/instrument-node/effect/auto` - OperationTracingSupervisor
- `enableOpSupervision` - Helper to enable the OpSupervision runtime flag
- `OperationTracingLive` - Layer that provides the operation tracing supervisor

## Requirements

- Effect fork with OperationTracing support (feat/source-capture-poc branch)
- Node.js 18+ or Bun 1.0+
