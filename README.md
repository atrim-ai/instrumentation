# @atrim/instrumentation

**One-line OpenTelemetry for Node.js**

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrumentation.svg)](https://www.npmjs.com/package/@atrim/instrumentation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

**1. Configure npm** (one-time setup)
```bash
# Configure @atrim scope to use Google Artifact Registry
npm config set @atrim:registry https://us-central1-npm.pkg.dev/endless-ability-477320-d9/atrim-npm/

# Authenticate (requires Google Cloud credentials)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/key.json
npx google-artifactregistry-auth
```

**2. Install**
```bash
npm install @atrim/instrumentation
```

**3. Initialize** (at the top of your app)
```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

await initializeInstrumentation()
```

**4. Done!** Your app is now sending traces to OpenTelemetry.

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

## Examples

See working code in [`/examples`](./examples):
- **[express](./examples/express)** - Express server
- **[vanilla](./examples/vanilla)** - Pure Node.js
- **[effect-ts](./examples/effect-ts)** - Effect + Express
- **[effect-platform](./examples/effect-platform)** - Pure Effect

## Configuration

Need more control? Pass options:

```typescript
await initializeInstrumentation({
  serviceName: 'my-api',
  otlp: { endpoint: 'http://collector:4318' }
})
```

See [Configuration Guide](./docs/CONFIGURATION.md) for all options.

## Packages

This is a monorepo containing multiple packages:

- **[@atrim/instrumentation](./packages/node)** - Main package for Node.js applications (this package)
- **[@atrim/instrumentation-core](./packages/core)** - Shared schemas and utilities (internal)
- **[@atrim/instrumentation-web](./packages/web)** - Web/browser implementation (coming soon)

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
