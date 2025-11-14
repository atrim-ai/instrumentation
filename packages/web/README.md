# @atrim/instrumentation-web

> OpenTelemetry instrumentation for Web/Browser applications

**Status:** 🚧 Coming Soon

This package will provide Web/Browser-specific OpenTelemetry instrumentation with the same centralized YAML configuration as the Node.js package.

## Planned Features

- WebSDK initialization
- Browser-friendly config loading (HTTP only)
- LocalStorage/SessionStorage caching
- Optional Effect-TS integration
- Automatic instrumentation for fetch, XMLHttpRequest
- Performance API integration

## Installation

```bash
npm install @atrim/instrumentation-web
# or
pnpm add @atrim/instrumentation-web
```

## Usage

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation-web'

// Initialize with remote config
initializeInstrumentation({
  configUrl: 'https://cdn.company.com/instrumentation.yaml'
})
```

## Contributing

This package is part of the [@atrim/instrumentation monorepo](../../README.md).

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT © Atrim AI
