# @atrim/instrument-node

OpenTelemetry instrumentation for Node.js with centralized YAML configuration.

**Note:** This package was previously named `@atrim/instrumentation`. If you're upgrading, update your imports.

## Quick Start

```bash
npm install @atrim/instrument-node
```

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

// Zero-config initialization
await initializeInstrumentation()
```

## Documentation

Full documentation is available in the [main repository](https://github.com/atrim-ai/instrumentation):

- 📖 [Getting Started](../../docs/getting-started.md)
- ⚙️ [Configuration](../../docs/configuration.md)
- 📋 [Examples](../../docs/EXAMPLES.md)
- 🔧 [Troubleshooting](../../docs/TROUBLESHOOTING.md)
- 📚 [API Reference](../../docs/api-reference.md)

## License

MIT © Atrim AI
