# @atrim/instrumentation

Universal OpenTelemetry instrumentation packages for Node.js and the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [@atrim/instrument-node](./packages/node) | Node.js, Bun, Deno | [![npm](https://badge.fury.io/js/%40atrim%2Finstrument-node.svg)](https://www.npmjs.com/package/@atrim/instrument-node) |
| @atrim/instrument-web | Browser/React | Coming soon |

## Quick Start

```bash
npm install @atrim/instrument-node @opentelemetry/api
```

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation()
```

See [@atrim/instrument-node README](./packages/node/README.md) for full documentation.

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Configuration](./docs/configuration.md)
- [Examples](./examples/)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)

## Contributing

See [DEVELOPERS.md](./DEVELOPERS.md) for development setup and contribution guidelines.

## License

MIT
