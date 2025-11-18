# @atrim/instrument-node

**One-line OpenTelemetry for Node.js**

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrument-node.svg)](https://www.npmjs.com/package/@atrim/instrument-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OpenTelemetry instrumentation for Node.js with centralized YAML configuration. Works with any Node.js framework (Express, Fastify, Koa, Hono) and runtime (Node.js, Bun, Deno).

## Quick Start

**1. Install**

```bash
npm install @atrim/instrument-node
```

**2. Initialize** (at the top of your app)

### Promise API (Traditional)

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation()
```

### Effect API (Recommended)

```typescript
import { Effect } from 'effect'
import { initializeInstrumentationEffect } from '@atrim/instrument-node'

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

## Features

- **Zero-config** - Works out of the box with sensible defaults
- **Universal** - Node.js 20+, Bun 1.0+, Deno 1.40+
- **Framework-agnostic** - Express, Fastify, Koa, Hono, vanilla HTTP
- **Effect-TS first** - Typed error handling with Effect (optional)
- **Pattern-based filtering** - Control which spans are created via YAML
- **HTTP filtering** - Prevent noisy health checks and metrics endpoints
- **Centralized config** - YAML file, URL, or environment variable
- **Production-ready** - Graceful shutdown, error handling, performance optimized

## Documentation

Full documentation is available in the [main repository](https://github.com/atrim-ai/instrumentation):

### Core Docs

- 📖 [Getting Started](../../docs/getting-started.md) - 5-minute setup guide
- ⚙️ [Configuration](../../docs/configuration.md) - YAML configuration reference
- 📋 [Examples](../../docs/EXAMPLES.md) - 8+ working examples
- 🔧 [Troubleshooting](../../docs/TROUBLESHOOTING.md) - Common issues and solutions
- 📚 [API Reference](../../docs/api-reference.md) - Complete API documentation

### Specialized Guides

- 🌐 [HTTP Filtering](../../docs/HTTP_FILTERING_INVESTIGATION.md) - Prevent noisy traces
- 🔄 [Effect Integration](../../examples/effect-ts/README.md) - Effect-TS patterns
- 🧪 [Testing Guide](../../docs/TESTING.md) - How to test instrumented apps

## Installation

### npm

```bash
npm install @atrim/instrument-node
```

### yarn

```bash
yarn add @atrim/instrument-node
```

### pnpm

```bash
pnpm add @atrim/instrument-node
```

### Bun

```bash
bun add @atrim/instrument-node
```

## Usage Examples

### Express Application

```typescript
import express from 'express'
import { initializeInstrumentation } from '@atrim/instrument-node'

// Initialize at startup
await initializeInstrumentation()

const app = express()

app.get('/users', async (req, res) => {
  // Automatically traced!
  const users = await fetchUsers()
  res.json(users)
})

app.listen(3000)
```

### Effect-TS Application

```typescript
import { Effect, Layer } from 'effect'
import { EffectInstrumentationLive } from '@atrim/instrument-node/effect'

const program = Effect.gen(function* () {
  // Automatically traced with Effect.withSpan()
  yield* myOperation.pipe(Effect.withSpan('app.operation'))
}).pipe(
  Effect.provide(EffectInstrumentationLive)
)

await Effect.runPromise(program)
```

### Bun Runtime

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

// Works exactly the same as Node.js
await initializeInstrumentation()

Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('Hello from Bun!')
  }
})
```

### Remote Configuration

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000 // 5 minutes
})
```

## Configuration

### Priority Order (Highest to Lowest)

1. **Explicit Config Object** - Passed programmatically
2. **Environment Variable** - `ATRIM_INSTRUMENTATION_CONFIG`
3. **Project Root File** - `./instrumentation.yaml`
4. **Default Config** - Built-in defaults

### instrumentation.yaml Example

```yaml
version: "1.0"

instrumentation:
  enabled: true
  logging: "on"

  # Pattern-based span filtering
  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
      description: "Application operations"
    - pattern: "^storage\\."
      enabled: true
      description: "Storage layer"

  ignore_patterns:
    - pattern: "^health\\."
      description: "Health checks"
    - pattern: "^metrics\\."
      description: "Metrics endpoints"

# Effect-TS specific (optional)
effect:
  auto_extract_metadata: true
```

See [Configuration Guide](../../docs/configuration.md) for complete reference.

## HTTP Request Filtering

**IMPORTANT:** HTTP filtering requires explicit configuration to prevent noisy traces.

### Add HTTP Filtering Patterns

```yaml
# instrumentation.yaml
instrumentation:
  http_filtering:
    enabled: true
    ignore_routes:
      - pattern: "^/health$"
      - pattern: "^/metrics$"
      - pattern: "^/api/internal/"
      - pattern: "http://.*:4318/v1/traces"  # Prevent OTLP trace loops!
```

See [HTTP Filtering Guide](../../docs/HTTP_FILTERING_INVESTIGATION.md) for details.

## API Reference

### Standard API (Promise-based)

```typescript
// Main initialization
initializeInstrumentation(options?: SdkInitializationOptions): Promise<NodeSDK | null>

// Pattern matching only (skip SDK)
initializePatternMatchingOnly(options?: ConfigLoaderOptions): Promise<void>

// Configuration
loadConfig(options?: ConfigLoaderOptions): Promise<InstrumentationConfig>

// Service detection
detectServiceInfo(): Promise<ServiceInfo>
getServiceName(): Promise<string>
getServiceVersion(): Promise<string>
```

### Effect API

```typescript
// Main initialization (Effect)
initializeInstrumentationEffect(options?: SdkInitializationOptions): Effect.Effect<NodeSDK | null, InitializationError | ConfigError>

// Effect-TS Layer
EffectInstrumentationLive: Layer.Layer<Tracer.Tracer, ConfigError, never>

// Service detection (Effect)
detectServiceInfoEffect: Effect.Effect<ServiceInfo, ServiceDetectionError>
getServiceNameEffect: Effect.Effect<string, ServiceDetectionError>
getServiceVersionEffect: Effect.Effect<string, never>
```

See [API Reference](../../docs/api-reference.md) for complete documentation.

## Runtimes Supported

- ✅ **Node.js** 20.0.0+
- ✅ **Bun** 1.0.0+
- ✅ **Deno** 1.40.0+ (via npm compatibility)

## Frameworks Supported

- ✅ **Express** - Auto-instrumentation included
- ✅ **Fastify** - Auto-instrumentation included
- ✅ **Koa** - Auto-instrumentation included
- ✅ **Hono** - Works with manual spans
- ✅ **Vanilla HTTP** - Works with any Node.js HTTP server
- ✅ **Effect-TS** - First-class integration with Effect.withSpan()

## Examples

See the [examples directory](../../examples/) for complete working examples:

- [Express](../../examples/express/) - Basic Express app
- [Effect-TS](../../examples/effect-ts/) - Advanced Effect patterns
- [Effect Platform](../../examples/effect-platform/) - Pure Effect HTTP server
- [Vanilla TypeScript](../../examples/vanilla/) - Standard Node.js
- [Bun Runtime](../../examples/bun/) - Bun-specific example
- [Remote Config](../../examples/remote-config/) - Load config from URL
- [Multi-Service](../../examples/multi-service/) - Distributed tracing

## Troubleshooting

See [Troubleshooting Guide](../../docs/TROUBLESHOOTING.md) for common issues and solutions.

### Quick Fixes

**No traces appearing?**
- Check collector is running: `docker run -p 4318:4318 otel/opentelemetry-collector`
- Check endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

**Too many traces?**
- Add HTTP filtering patterns (health checks, metrics, OTLP exports)
- See [HTTP Filtering Guide](../../docs/HTTP_FILTERING_INVESTIGATION.md)

**Effect-TS spans not appearing?**
- Make sure you're using `Effect.withSpan()`
- Provide `EffectInstrumentationLive` layer

## Contributing

Contributions welcome! See [main repository](https://github.com/atrim-ai/instrumentation) for guidelines.

## License

MIT © Atrim AI

## Related Packages

- [@atrim/instrument-core](../core) - Internal shared logic (private)
- @atrim/instrument-web - Browser/web support _(Phase 1)_

## Links

- 📦 [npm package](https://www.npmjs.com/package/@atrim/instrument-node)
- 🐙 [GitHub repository](https://github.com/atrim-ai/instrumentation)
- 🐛 [Issue tracker](https://github.com/atrim-ai/instrumentation/issues)
- 📖 [Documentation](https://github.com/atrim-ai/instrumentation#readme)
