# @atrim/instrumentation

**One-line OpenTelemetry for Node.js**

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrumentation.svg)](https://www.npmjs.com/package/@atrim/instrumentation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

**1. Install**
```bash
npm install @atrim/instrumentation
```

**2. Initialize** (at the top of your app)

### Promise API (Traditional)
```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

await initializeInstrumentation()
```

### Effect API (Recommended)
```typescript
import { Effect } from 'effect'
import { initializeInstrumentationEffect } from '@atrim/instrumentation'

await Effect.runPromise(initializeInstrumentationEffect())
```

**3. Done!** Your app is now sending traces to OpenTelemetry.

By default, traces go to `http://localhost:4318`. To send to a remote collector:

```typescript
await initializeInstrumentation({
  otlp: { endpoint: 'https://otel-collector.company.com:4318' }
})
```

### What just happened?

Auto-detected and configured:
- ✅ Service name from `package.json`
- ✅ OTLP endpoint (local or remote)
- ✅ Auto-instrumentation for Express, HTTP, Fastify, etc.
- ✅ Graceful shutdown on SIGTERM/SIGINT

## Optional: Control What Gets Traced

Create `instrumentation.yaml` in your project root:

```yaml
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^app\\."      # ✅ Trace application operations
  ignore_patterns:
    - pattern: "^health\\."   # ❌ Skip health checks
```

That's it!

## HTTP Request Filtering

Prevent noisy HTTP traces (health checks, OTLP exports, internal endpoints):

### Automatic OTLP Filtering (Default)

By default, the library automatically filters requests to your OTLP collector to prevent trace loops:

```typescript
await initializeInstrumentation({
  otlp: { endpoint: 'http://otel-collector:4318' }
})
// Automatically ignores: POST http://otel-collector:4318/v1/traces
// Also ignores: /health, /healthz, /v1/metrics, /v1/logs
```

### Pattern-Based Filtering (YAML)

Add HTTP filtering patterns to `instrumentation.yaml`:

```yaml
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^app\\."
  ignore_patterns:
    - pattern: "^internal\\."

# HTTP request filtering
http:
  ignore_outgoing_urls:
    - "^http://internal-service"  # Ignore specific services
    - "/metrics$"                 # Ignore metrics endpoints
  ignore_incoming_paths:
    - "^/health$"                 # Ignore health checks
    - "^/api/internal"            # Ignore internal APIs
```

### Programmatic Filtering (TypeScript)

Use RegExp patterns or custom hooks:

```typescript
// Pattern-based filtering
await initializeInstrumentation({
  http: {
    ignoreOutgoingUrls: [/\/health$/, /\/v1\/traces$/],
    ignoreIncomingPaths: [/^\/health$/]
  }
})

// Custom hook for advanced filtering
await initializeInstrumentation({
  http: {
    ignoreOutgoingRequestHook: (req) => {
      const url = `${req.protocol}//${req.host}${req.path}`
      return url.includes('otel-collector') || url.includes('internal')
    },
    ignoreIncomingRequestHook: (req) => {
      const path = req.url || ''
      return path.startsWith('/api/internal')
    }
  }
})
```

### Why Filter HTTP Requests?

Without filtering, you'll see noisy traces for:
- **OTLP exports** - `POST http://otel-collector:4318/v1/traces` creating trace loops
- **Health checks** - `GET /health` every few seconds
- **Metrics** - `GET /metrics` polling
- **Internal endpoints** - Service-to-service health probes

## Examples

See working code in [`/examples`](./examples):
- **[express](./examples/express)** - Express server
- **[vanilla](./examples/vanilla)** - Pure Node.js
- **[effect-ts](./examples/effect-ts)** - Effect + Express
- **[effect-platform](./examples/effect-platform)** - Pure Effect

## Configuration

Need more control? Pass options:

### Promise API
```typescript
await initializeInstrumentation({
  serviceName: 'my-api',
  otlp: { endpoint: 'http://collector:4318' }
})
```

### Effect API (with typed error handling)
```typescript
import { Effect } from 'effect'
import {
  initializeInstrumentationEffect,
  ConfigError,
  InitializationError
} from '@atrim/instrumentation'

const program = initializeInstrumentationEffect({
  serviceName: 'my-api',
  otlp: { endpoint: 'http://collector:4318' }
}).pipe(
  Effect.catchTag('ConfigError', (error) => {
    console.error('Config error:', error.reason)
    return Effect.succeed(null)
  }),
  Effect.catchTag('InitializationError', (error) => {
    console.error('Init error:', error.reason)
    return Effect.succeed(null)
  })
)

await Effect.runPromise(program)
```

See [Configuration Guide](./docs/CONFIGURATION.md) for all options.

## Documentation

- **[Examples](./docs/EXAMPLES.md)** - Sending to Atrim, Express, Effect, etc.
- **[Getting Started](./docs/getting-started.md)** - Detailed setup guide
- **[Configuration](./docs/configuration.md)** - All configuration options
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues & solutions
- **[Effect Integration](./docs/EFFECT_INTEGRATION.md)** - Using with Effect-TS
- **[API Reference](./docs/api-reference.md)** - Complete API docs

## Requirements

- Node.js 18+, Bun 1.0+, or Deno 1.40+
- OpenTelemetry collector (local or remote)

## License

MIT © Atrim AI

---

**Need help?** [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) • [Open an Issue](https://github.com/atrim-ai/instrumentation/issues)
