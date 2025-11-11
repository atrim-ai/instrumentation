# @atrim/instrumentation

Universal OpenTelemetry instrumentation library for Node.js applications with zero-config auto-instrumentation and centralized configuration management.

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrumentation.svg)](https://www.npmjs.com/package/@atrim/instrumentation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Status: 🚧 Under Development

This library is currently in active development. See [Issue #365](https://github.com/atrim-ai/atrim/issues/365) for implementation progress.

## Features

- **Universal Compatibility** - Works with any Node.js application (Express, Fastify, vanilla TypeScript, etc.)
- **Runtime Support** - Node.js 18+, Bun 1.0+, Deno 1.40+
- **Zero-Config** - Automatically looks for `instrumentation.yaml` in your project root
- **Pattern-Based Filtering** - Control which operations are instrumented via centralized configuration
- **Optional Effect-TS Integration** - Automatic metadata extraction for Effect-TS applications
- **Flexible Configuration** - Local file, remote URL, environment variable, or programmatic
- **Lightweight** - Minimal dependencies, <5% performance overhead

## Installation

```bash
npm install @atrim/instrumentation

# or
pnpm add @atrim/instrumentation

# or
yarn add @atrim/instrumentation

# or (for Bun)
bun add @atrim/instrumentation
```

### Optional: Effect-TS Integration

If you want to use Effect-TS features:

```bash
npm install effect @effect/opentelemetry
```

## Quick Start

### Basic Usage (Any Node.js Application)

```typescript
// 1. Initialize at application startup
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation()

// 2. Your existing OpenTelemetry code works as-is
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')
const span = tracer.startSpan('app.operation')
// Pattern filtering applied automatically based on instrumentation.yaml
span.end()
```

### Effect-TS Integration

```typescript
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'
import { Effect } from 'effect'

const app = Effect.gen(function* () {
  // Your Effect code
  yield* myOperation()
}).pipe(
  Effect.withSpan('app.operation'),
  Effect.provide(EffectInstrumentationLive) // Auto-extracts fiber metadata
)
```

### Configuration File

Create `instrumentation.yaml` in your project root:

```yaml
version: "1.0"

instrumentation:
  enabled: true

  # Patterns to instrument
  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
      description: "Application operations"
    - pattern: "^storage\\."
      enabled: true
      description: "Storage layer"

  # Patterns to ignore (takes precedence)
  ignore_patterns:
    - pattern: "^test\\."
      description: "Test utilities"
    - pattern: "^internal\\."
      description: "Internal operations"

# Optional: Effect-TS specific features
effect:
  auto_extract_metadata: true
```

That's it! No code changes needed - the library automatically filters spans based on your configuration.

## Configuration Options

### Zero-Config (Default)

Automatically looks for `./instrumentation.yaml` in your project root:

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation()
```

### Local File Path

```typescript
initializeInstrumentation({
  configPath: './config/custom-instrumentation.yaml'
})
```

### Remote URL (Centralized Management)

```typescript
initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000 // 5 minutes (default)
})
```

### Environment Variable

```bash
# Via file path
export ATRIM_INSTRUMENTATION_CONFIG=./my-config.yaml

# Via URL
export ATRIM_INSTRUMENTATION_CONFIG=https://config.company.com/instrumentation.yaml
```

```typescript
// Automatically loads from env var
initializeInstrumentation()
```

### Programmatic Configuration

```typescript
initializeInstrumentation({
  config: {
    version: "1.0",
    instrumentation: {
      enabled: true,
      instrument_patterns: [
        { pattern: '^app\\.', enabled: true }
      ],
      ignore_patterns: [
        { pattern: '^test\\.', enabled: false }
      ]
    }
  }
})
```

## OpenTelemetry Export Setup

**Important:** This library handles span filtering and metadata extraction. You configure OTLP export separately using standard OpenTelemetry:

```bash
# Standard OpenTelemetry environment variables
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_SERVICE_NAME=my-service
```

Or programmatically:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces'
  }),
  // ... other SDK configuration
})

sdk.start()

// Then initialize instrumentation
import { initializeInstrumentation } from '@atrim/instrumentation'
initializeInstrumentation()
```

## Examples

### Express Application

```typescript
import express from 'express'
import { initializeInstrumentation } from '@atrim/instrumentation'

// Initialize once at startup
initializeInstrumentation()

const app = express()

app.get('/api/users', (req, res) => {
  // Your existing OpenTelemetry instrumentation works
  res.json({ users: [] })
})

app.listen(3000)
```

**Configuration:**
```yaml
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^http\\.server\\..*"  # Express routes
    - pattern: "^database\\..*"       # DB queries
  ignore_patterns:
    - pattern: "^health\\..*"
```

### Fastify Application

```typescript
import Fastify from 'fastify'
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation()

const fastify = Fastify()

fastify.get('/api/data', async (request, reply) => {
  return { data: [] }
})

await fastify.listen({ port: 3000 })
```

### Bun Runtime

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation()

Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('Hello World')
  }
})
```

### Effect-TS with Custom Helpers

```typescript
import { EffectInstrumentationLive, annotateHttpRequest } from '@atrim/instrumentation/effect'
import { Effect } from 'effect'

const fetchData = Effect.gen(function* () {
  yield* annotateHttpRequest('GET', '/api/data', 200)
  const response = yield* Effect.tryPromise(() => fetch('/api/data'))
  return yield* Effect.tryPromise(() => response.json())
}).pipe(
  Effect.withSpan('api.fetchData'),
  Effect.provide(EffectInstrumentationLive)
)
```

## API Reference

### Core API

#### `initializeInstrumentation(options?)`

Initializes the instrumentation library. Call once at application startup.

**Options:**
- `configPath?: string` - Path to local configuration file
- `configUrl?: string` - URL to remote configuration file
- `config?: InstrumentationConfig` - Inline configuration object
- `cacheTimeout?: number` - Cache timeout for remote configs (default: 300000ms / 5 minutes)

**Example:**
```typescript
initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 600_000 // 10 minutes
})
```

#### `PatternSpanProcessor`

OpenTelemetry SpanProcessor that filters spans based on configured patterns.

```typescript
import { PatternSpanProcessor } from '@atrim/instrumentation'
import { trace } from '@opentelemetry/api'

const processor = new PatternSpanProcessor(config)
trace.getTracerProvider().addSpanProcessor(processor)
```

#### Span Helpers

```typescript
import { setSpanAttributes, recordException } from '@atrim/instrumentation'

// Set multiple attributes at once
setSpanAttributes(span, {
  'user.id': '123',
  'request.size': 1024,
  'cache.hit': true
})

// Record exceptions with context
recordException(span, error, {
  component: 'database',
  query: 'SELECT * FROM users'
})
```

### Effect-TS API

#### `EffectInstrumentationLive`

Zero-config Layer for Effect-TS applications with automatic metadata extraction.

```typescript
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

const app = myProgram.pipe(
  Effect.provide(EffectInstrumentationLive)
)
```

#### `createEffectInstrumentation(options?)`

Factory function for creating a custom Effect instrumentation Layer.

```typescript
import { createEffectInstrumentation } from '@atrim/instrumentation/effect'

const CustomInstrumentationLayer = createEffectInstrumentation({
  configPath: './custom-config.yaml'
})
```

#### Effect Span Helpers

```typescript
import {
  annotateUser,
  annotateDataSize,
  annotateLLM,
  annotateHttpRequest
} from '@atrim/instrumentation/effect'

// Annotate with user information
yield* annotateUser('user-123', 'john@example.com')

// Annotate data size
yield* annotateDataSize(1024, 'bytes')

// Annotate LLM operations
yield* annotateLLM('gpt-4', 'chat', 150, 50)

// Annotate HTTP requests
yield* annotateHttpRequest('POST', '/api/data', 201)
```

## Pattern Matching Rules

Patterns are evaluated in the following order:

1. **Ignore patterns** are checked first (take precedence)
2. **Instrument patterns** are checked second
3. If no patterns match, the span is created by default (fail-open)

### Pattern Syntax

Uses standard JavaScript RegExp syntax:

```yaml
# Match operations starting with "app."
pattern: "^app\\."

# Match any database operations
pattern: "^database\\..*"

# Match specific operation types
pattern: "^(storage|cache)\\..*"

# Match with word boundaries
pattern: "\\buser\\b"
```

**Important:** YAML requires double backslashes (`\\`) for regex escape sequences.

## Configuration Priority

Configuration sources are checked in the following order (highest to lowest):

1. **Explicit config object** passed to `initializeInstrumentation()`
2. **Environment variable** `ATRIM_INSTRUMENTATION_CONFIG`
3. **Project root file** `./instrumentation.yaml`
4. **Default configuration** (built-in)

## Performance

- **Overhead:** <5% (target)
- **Pattern matching:** <1ms per span
- **Config loading:** <100ms (cached)
- **Remote config:** Cached for 5 minutes (configurable)

## Security

### Remote Configuration Security

When using remote URLs:

- ✅ HTTPS required for remote URLs
- ✅ Schema validation on all configs
- ✅ 1MB max config file size
- ✅ 5 second timeout for remote requests
- ✅ Automatic caching to reduce requests
- ✅ Fallback to default config on errors

## Compatibility

### Runtime Support

- ✅ Node.js 18+ (LTS)
- ✅ Node.js 20+ (LTS)
- ✅ Node.js 22+ (Latest)
- ✅ Bun 1.0+
- ✅ Deno 1.40+ (via npm specifiers)

### Framework Support

- ✅ Express
- ✅ Fastify
- ✅ Koa
- ✅ Hono
- ✅ Effect-TS (optional)
- ✅ Vanilla TypeScript/JavaScript
- ✅ Any OpenTelemetry-instrumented application

## Integration with OpenTelemetry Onboarding CLI

This library works seamlessly with the [OpenTelemetry Onboarding CLI](https://github.com/atrim-ai/atrim/issues/301):

```bash
# 1. Analyze your codebase
npx @effect/otel-onboard analyze .

# 2. CLI recommends installing @atrim/instrumentation and generates config
# ✅ Created instrumentation.yaml with recommended patterns

# 3. Install library
npm install @atrim/instrumentation

# 4. Initialize in your code (CLI provides exact code)
import { initializeInstrumentation } from '@atrim/instrumentation'
initializeInstrumentation()

# 5. Verify it's working
npx @effect/otel-onboard verify
```

## Migration Guide

### From Manual Instrumentation

**Before:**
```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')

// Manual span creation everywhere
function myOperation() {
  const span = tracer.startSpan('app.operation')
  try {
    // ... operation code
    span.end()
  } catch (error) {
    span.recordException(error)
    span.end()
    throw error
  }
}
```

**After:**
```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation() // Once at startup

// Same code works, but now filtered by patterns
function myOperation() {
  const span = tracer.startSpan('app.operation')
  // ... operation code
  span.end()
}
```

Create `instrumentation.yaml`:
```yaml
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^app\\."
```

### From platform-introspection (Effect-TS)

**Before:**
```typescript
import { EffectAutoTracerLive } from '../platform-introspection/effect-auto-tracer.js'

const app = myOperation().pipe(
  Effect.withSpan('app.operation'),
  Effect.provide(EffectAutoTracerLive)
)
```

**After:**
```typescript
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

const app = myOperation().pipe(
  Effect.withSpan('app.operation'),
  Effect.provide(EffectInstrumentationLive)
)
```

Move `config/instrumentation.yaml` to project root.

## Troubleshooting

### Patterns Not Matching

Check YAML escaping - regex escape sequences need double backslashes:

```yaml
# Correct
pattern: "^app\\."

# Incorrect
pattern: "^app."
```

### Effect Integration Not Working

Ensure peer dependencies are installed:

```bash
npm install effect @effect/opentelemetry
```

### Remote Config Not Loading

Check the URL is HTTPS and accessible:

```bash
curl -v https://config.company.com/instrumentation.yaml
```

Enable debug logging:

```bash
export DEBUG=@atrim/instrumentation:*
```

### Spans Still Being Created

The library fails-open by default. If no patterns match, spans are created. To block all spans by default:

```yaml
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^app\\."  # Only allow app.* patterns
  # Don't use ignore_patterns - use specific instrument_patterns instead
```

## Examples Repository

See the [examples/](./examples) directory for complete working examples:

- [vanilla/](./examples/vanilla) - Plain TypeScript
- [express/](./examples/express) - Express application
- [fastify/](./examples/fastify) - Fastify application
- [bun/](./examples/bun) - Bun runtime
- [effect-ts/](./examples/effect-ts) - Effect-TS integration
- [remote-config/](./examples/remote-config) - Remote configuration
- [multi-repo/](./examples/multi-repo) - Multi-repository setup

## Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [Configuration Reference](./docs/configuration.md)
- [Effect-TS Integration](./docs/effect-integration.md)
- [Runtime Compatibility](./docs/runtime-compatibility.md)
- [API Reference](./docs/api-reference.md)
- [Migration Guide](./docs/migration-guide.md)

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

- [atrim](https://github.com/atrim-ai/atrim) - OpenTelemetry-native observability platform
- [OpenTelemetry Onboarding CLI](https://github.com/atrim-ai/atrim/issues/301) - Companion CLI tool
- [OpenTelemetry JavaScript](https://github.com/open-telemetry/opentelemetry-js) - OpenTelemetry SDK
- [Effect-TS](https://effect.website/) - Type-safe functional programming library

## Support

- [GitHub Issues](https://github.com/atrim-ai/instrumentation/issues)
- [Documentation](https://docs.atrim.ai/instrumentation)
- [Discord Community](https://discord.gg/atrim)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.
