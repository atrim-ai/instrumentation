# @atrim/instrument-node

One-line OpenTelemetry for Node.js

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrument-node.svg)](https://www.npmjs.com/package/@atrim/instrument-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Zero-config OpenTelemetry instrumentation for Node.js, Bun, and Deno. Works with Express, Fastify, Koa, Hono, and Effect-TS.

## Installation

```bash
# Required
npm install @atrim/instrument-node @opentelemetry/api

# Optional: Effect-TS integration
npm install effect @effect/opentelemetry @effect/platform
```

## Quick Start

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation()
// Done! Traces go to http://localhost:4318
```

**Remote collector:**

```typescript
await initializeInstrumentation({
  otlp: { endpoint: 'https://otel-collector.company.com:4318' }
})
```

**What gets auto-configured:**

- Service name from `package.json`
- OTLP endpoint
- Auto-instrumentation (HTTP, Express, Fastify, etc.)
- Graceful shutdown

## Effect-TS Integration

```typescript
import { Effect, Layer } from 'effect'
import { EffectInstrumentationLive } from '@atrim/instrument-node/effect'

const program = Effect.gen(function* () {
  yield* myOperation.pipe(Effect.withSpan('app.operation'))
}).pipe(Effect.provide(EffectInstrumentationLive))

await Effect.runPromise(program)
```

**Span annotation helpers:**

```typescript
import { annotateUser, annotateBatch, annotateCache } from '@atrim/instrument-node/effect'

const process = Effect.gen(function* () {
  yield* annotateUser('user-123', 'user@example.com')
  yield* annotateBatch(100, 10)
  yield* annotateCache(true, 'user:123')
  // ...
}).pipe(Effect.withSpan('batch.process'))
```

Available: `annotateUser`, `annotateBatch`, `annotateDataSize`, `annotateLLM`, `annotateQuery`, `annotateHttpRequest`, `annotateError`, `annotatePriority`, `annotateCache`

## Configuration (Optional)

Create `instrumentation.yaml` in your project root:

```yaml
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^app\\."      # Trace app operations
  ignore_patterns:
    - pattern: "^health\\."   # Skip health checks
  http_filtering:
    enabled: true
    ignore_routes:
      - pattern: "^/health$"
      - pattern: "^/metrics$"
```

**Priority order:** Explicit config > `ATRIM_INSTRUMENTATION_CONFIG` env var > `./instrumentation.yaml` > defaults

## Runtimes & Frameworks

| Runtime | Version |
|---------|---------|
| Node.js | 20+ |
| Bun | 1.0+ |
| Deno | 1.40+ |

| Framework | Support |
|-----------|---------|
| Express | Auto-instrumented |
| Fastify | Auto-instrumented |
| Koa | Auto-instrumented |
| Hono | Manual spans |
| Effect-TS | First-class |

## Troubleshooting

**No traces?** Check collector: `docker run -p 4318:4318 otel/opentelemetry-collector`

**Too many traces?** Add HTTP filtering patterns for health checks, metrics, OTLP exports.

**Effect spans missing?** Ensure you're using `Effect.withSpan()` and providing `EffectInstrumentationLive`.

## Documentation

- [Getting Started](../../docs/getting-started.md)
- [Configuration Reference](../../docs/configuration.md)
- [API Reference](../../docs/api-reference.md)
- [Examples](../../examples/)
- [Troubleshooting](../../docs/TROUBLESHOOTING.md)

## License

MIT
