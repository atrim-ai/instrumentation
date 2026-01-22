# Effect Source Trace Example

This example demonstrates the `@clayroach/unplugin` source trace functionality for Effect-TS, which automatically injects source location metadata into your Effect code at build time.

## What It Does

The `@clayroach/unplugin` provides two build-time transformers:

### 1. `sourceTrace` - For Logging
Injects source location into `yield* _()` calls, making it available via `FiberRef.currentSourceTrace` for loggers.

### 2. `spanTrace` - For Tracing
Injects source location attributes directly into `Effect.withSpan()` calls for OpenTelemetry spans.

## Example Transformation

**Before transformation:**
```typescript
const fetchUser = (id: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`Fetching user ${id}...`))
    yield* _(Effect.sleep('50 millis'))
    return { id, name: 'Alice' }
  }).pipe(Effect.withSpan('fetchUser', { attributes: { 'user.id': id } }))
```

**After transformation:**
```typescript
const fetchUser = (id: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`Fetching user ${id}...`), _trace0)  // ← sourceTrace
    yield* _(Effect.sleep('50 millis'), _trace1)              // ← sourceTrace
    return { id, name: 'Alice' }
  }).pipe(Effect.withSpan('fetchUser', {
    attributes: {
      ...{ 'user.id': id },
      'code.filepath': 'src/index.ts',  // ← spanTrace
      'code.lineno': 18,                 // ← spanTrace
      'code.column': 8                   // ← spanTrace
    }
  }))
```

## Result

Your exported OpenTelemetry spans will include:
- ✅ **code.filepath** - Full path to source file
- ✅ **code.lineno** - Line number where span was created
- ✅ **code.column** - Column number where span was created
- ✅ **Parent-child relationships** - All spans properly linked in a single trace
- ✅ **Custom attributes** - Your original attributes are preserved and merged

## Running the Example

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build with Vite (applies the transformations):
   ```bash
   pnpm build
   ```

3. Run the built output:
   ```bash
   pnpm start
   ```

Or in one step:
```bash
pnpm dev
```

## Example Output

```json
{
  "name": "fetchUser",
  "traceId": "37890e1e8a880e6302c77b7f7d91b7eb",
  "parentSpanContext": {
    "traceId": "37890e1e8a880e6302c77b7f7d91b7eb",
    "spanId": "b43e1c228ca45f02"
  },
  "attributes": {
    "user.id": 42,
    "code.filepath": ".../src/index.ts",
    "code.lineno": 18,
    "code.column": 8
  }
}
```

## Configuration

```typescript
// vite.config.ts
import effectPlugin from '@clayroach/unplugin/vite'

export default {
  plugins: [
    effectPlugin({
      sourceTrace: true,  // For logging (default: true)
      spanTrace: true     // For tracing (default: true)
    })
  ]
}
```

## Dependencies

- `@clayroach/effect@3.19.14-source-trace.3` - Effect fork with source trace support
- `@clayroach/unplugin@0.1.0-source-trace.3` - Build-time transformer
- `@effect/opentelemetry` - OpenTelemetry integration for Effect

## How It Works

1. **Build Time**: Vite plugin transforms your TypeScript code
   - `sourceTrace` adds trace metadata to `yield* _()`
   - `spanTrace` merges code attributes into `Effect.withSpan()`

2. **Runtime**: OpenTelemetry exports spans with code attributes
   - No runtime overhead for source location tracking
   - All metadata is embedded at build time

3. **Observability**: View spans in your collector (Jaeger, Tempo, etc.)
   - Jump directly to source code from traces
   - Understand exactly where spans originated
