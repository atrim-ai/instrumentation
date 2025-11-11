# @atrim/instrumentation

**Single-line OpenTelemetry setup for Node.js** - Auto-detects your architecture and configures itself.

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrumentation.svg)](https://www.npmjs.com/package/@atrim/instrumentation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
npm install @atrim/instrumentation
```

**That's it - one line to initialize:**

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

await initializeInstrumentation()
```

Auto-detects and configures:
- ✅ OTLP endpoint (from `OTEL_EXPORTER_OTLP_ENDPOINT` or default)
- ✅ Service name (from `OTEL_SERVICE_NAME` or `package.json`)
- ✅ Auto-instrumentation (Express, HTTP, Fastify, etc.)
- ✅ Pattern-based filtering (from `instrumentation.yaml`)
- ✅ Graceful shutdown handling

## What You Get

```typescript
// Before: 50+ lines of boilerplate
const exporter = new OTLPTraceExporter({...})
const processor = new BatchSpanProcessor(exporter)
const sdk = new NodeSDK({...})
sdk.start()
// + shutdown handlers, pattern filtering, etc.

// After: 1 line
await initializeInstrumentation()
```

## Pattern-Based Filtering

Create `instrumentation.yaml` to control which operations are traced:

```yaml
version: "1.0"

instrumentation:
  enabled: true

  instrument_patterns:
    - pattern: "^app\\."      # ✅ Trace
    - pattern: "^db\\."       # ✅ Trace

  ignore_patterns:
    - pattern: "^health\\."   # ❌ Skip
    - pattern: "^internal\\." # ❌ Skip
```

## Works With Everything

- **Frameworks**: Express, Fastify, Koa, Hono, vanilla Node.js
- **Runtimes**: Node.js 18+, Bun 1.0+, Deno 1.40+
- **Effect-TS**: Optional integration with auto-metadata extraction
- **Existing setups**: Detects and works alongside your OpenTelemetry code

## Examples

| Example | What It Shows |
|---------|---------------|
| [express](./examples/express) | Express + auto-instrumentation |
| [vanilla](./examples/vanilla) | Pure Node.js HTTP server |
| [effect-ts](./examples/effect-ts) | Effect + Express hybrid |
| [effect-platform](./examples/effect-platform) | Pure Effect (@effect/platform) |

## Configuration Options

```typescript
await initializeInstrumentation({
  // Service identification
  serviceName: 'my-api',      // Default: from OTEL_SERVICE_NAME or package.json
  serviceVersion: '1.0.0',    // Default: from package.json

  // OTLP configuration
  otlp: {
    endpoint: 'http://custom:4318',  // Default: OTEL_EXPORTER_OTLP_ENDPOINT
    headers: { 'x-api-key': 'secret' }
  },

  // Auto-instrumentation
  autoInstrument: true,       // Default: auto-detected

  // Pattern config
  configPath: './config.yaml', // Default: ./instrumentation.yaml
  configUrl: 'https://...',   // For centralized config
})
```

## Documentation

- 📚 [Getting Started Guide](./docs/GETTING_STARTED.md) - Detailed setup instructions
- 🔧 [Configuration Reference](./docs/CONFIGURATION.md) - All options explained
- 🐛 [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- ⚡ [Effect-TS Integration](./docs/EFFECT_INTEGRATION.md) - Using with Effect
- 🧪 [Testing](./test/integration/README.md) - Integration test suite

## Smart Auto-Detection

The library automatically detects your architecture:

**Pure Effect** (no web framework)
```typescript
await initializeInstrumentation()
// → Auto-instrumentation: disabled (auto-detected)
// → Effect.withSpan() creates all spans
```

**Express/Fastify + Effect**
```typescript
await initializeInstrumentation()
// → Auto-instrumentation: enabled (auto-detected)
// → HTTP layer auto-instrumented + Effect spans
```

**Existing NodeSDK**
```typescript
// Your existing code
const sdk = new NodeSDK({...})
sdk.start()

// Add pattern filtering
await initializeInstrumentation()
// → Detected existing setup
// → Skips NodeSDK initialization
// → Only adds pattern filtering
```

## Quick Links

- [Examples](./examples) - Working code samples
- [Integration Tests](./test/integration) - Verification suite
- [API Reference](./docs/API.md) - Complete API documentation
- [Migration Guide](./docs/MIGRATION.md) - From manual setup
- [Contributing](./CONTRIBUTING.md) - How to contribute

## License

MIT © Atrim AI

---

**Need help?** Check [Troubleshooting](./docs/TROUBLESHOOTING.md) or [open an issue](https://github.com/atrim-ai/instrumentation/issues).
