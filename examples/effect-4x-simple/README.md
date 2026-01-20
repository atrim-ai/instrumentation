# Effect 4.x Simple Example

**Status:** Blocked by upstream bugs (see `UPSTREAM_ISSUES.md`)

Demonstrates the Effect 4.x integration architecture for `@atrim/instrument-node`.

## Current State

### Working
- ✅ Effect 4.x basic operations (`Effect.gen`, `Effect.all`, `Effect.forEach`, `Effect.forkChild`)
- ✅ Program runs and completes successfully

### Blocked by Upstream Bugs
- ❌ `Effect.withSpan()` - Crashes with `mapUnsafe` undefined
- ❌ `@clayroach/effect-unplugin` - `traverse is not a function`
- ❌ ConfigLoader service - Multiple API changes

See `UPSTREAM_ISSUES.md` for detailed bug reports.

## Architecture

### Effect 3.x (Old)
```
Runtime: UnifiedTracingSupervisor
         ├─ Hooks into Supervisor.onEffect (OpSupervision flag)
         ├─ Detects OperationMeta in trace field
         └─ Creates spans at runtime

Build: No transformation
```

### Effect 4.x (New)
```
Build:   @clayroach/effect-unplugin
         ├─ Wraps Effect.gen/all/forEach/forkChild with withSpan()
         ├─ Injects source location via CurrentStackFrame
         └─ Output: AST-transformed code

Runtime: Effect4TracingLive layer
         ├─ OtlpTracer (effect/unstable/observability)
         ├─ FetchHttpClient (effect/unstable/http)
         └─ Exports spans to OTLP collector
```

## Running (When Fixed)

```bash
# Install dependencies
pnpm install

# Run example
pnpm dev

# With OTLP export to localhost
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev

# With OTLP export to Atrim
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-atrim-endpoint.com pnpm dev
```

## Expected Output (When Fixed)

The unplugin should transform the code to add spans:

```typescript
// Source code
const users = yield* Effect.all([
  fetchUser('alice'),
  fetchUser('bob')
])

// Transformed by unplugin
const users = yield* Effect.all([
  fetchUser('alice'),
  fetchUser('bob')
]).pipe(Effect.withSpan('effect.all (index.ts:47)'))
```

Expected trace hierarchy:
```
effect.gen (index.ts:42)
├── effect.all (index.ts:47)
│   ├── effect.gen (index.ts:21) - fetchUser alice
│   ├── effect.gen (index.ts:21) - fetchUser bob
│   └── effect.gen (index.ts:21) - fetchUser charlie
├── effect.forEach (index.ts:57)
│   ├── effect.gen (index.ts:28) - fetchOrders alice
│   ├── effect.gen (index.ts:28) - fetchOrders bob
│   └── effect.gen (index.ts:28) - fetchOrders charlie
├── effect.forkChild (index.ts:69)
│   └── effect.gen (index.ts:64) - backgroundTask
└── effect.forEach (index.ts:72)
    ├── effect.gen (index.ts:35) - processOrder 1
    ├── effect.gen (index.ts:35) - processOrder 2
    └── effect.gen (index.ts:35) - processOrder 3
```

## Dependencies

```json
{
  "dependencies": {
    "effect": "npm:@clayroach/effect@4.0.0-source-tracing.3",
    "@atrim/instrument-node": "workspace:*"
  },
  "devDependencies": {
    "@clayroach/effect-unplugin": "4.0.0-source-tracing.3"
  }
}
```

## Files

- `src/index.ts` - Main example program
- `UPSTREAM_ISSUES.md` - Detailed bug reports
- `package.json` - Dependencies and scripts

