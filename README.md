# @atrim/instrumentation

**Universal OpenTelemetry instrumentation packages**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Packages

This is a monorepo containing multiple OpenTelemetry instrumentation packages:

### [@atrim/instrument-node](./packages/node)

[![npm version](https://badge.fury.io/js/%40atrim%2Finstrument-node.svg)](https://www.npmjs.com/package/@atrim/instrument-node)

OpenTelemetry instrumentation for Node.js applications with centralized YAML configuration.

```bash
npm install @atrim/instrument-node
```

**Supports:** Node.js 20+, Bun 1.0+, Deno 1.40+

### @atrim/instrument-web _(Coming Soon - Phase 1)_

OpenTelemetry instrumentation for browser/web applications.

```bash
npm install @atrim/instrument-web
```

**Supports:** Modern browsers, React, Next.js, Web Vitals

## Quick Start

### Node.js Applications

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation()
```

See the [@atrim/instrument-node README](./packages/node/README.md) for full documentation.

### Web Applications (Phase 1)

_Coming soon_

## Development

This repository uses pnpm workspaces with Turborepo for build orchestration.

### Prerequisites

- Node.js 20+
- pnpm 10+

```bash
# Enable corepack (recommended)
corepack enable
```

### Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test              # Unit tests
pnpm test:integration  # Integration tests (requires Docker)
pnpm test:all          # Both

# Lint and format
pnpm lint
pnpm format
```

### Working with Packages

```bash
# Build specific package
pnpm --filter @atrim/instrument-node build
pnpm --filter @atrim/instrument-core build

# Test specific package
pnpm --filter @atrim/instrument-node test
pnpm --filter @atrim/instrument-node test:integration

# Develop with watch mode
pnpm --filter @atrim/instrument-node dev
```

### Publishing

#### Dev Versions (Testing)

Publish dev versions for testing before releasing:

```bash
# Publish Node.js package
pnpm publish:node

# Publish Web package (when available)
pnpm publish:web

# Publish all packages
pnpm publish:all
```

Dev versions are published with format: `{tag}-{commit}-{timestamp}` (e.g., `0.1.3-abc1234-20251118005419`)

#### Production Releases

Use Changesets for production releases:

```bash
# 1. Create a changeset
pnpm changeset

# 2. Commit the changeset
git add .changeset && git commit -m "chore: add changeset"

# 3. After PR merge, Changesets creates version PR automatically
# 4. Merge version PR to publish to npm
```

## Monorepo Structure

```
atrim-instrumentation/
├── packages/
│   ├── core/              # @atrim/instrument-core (private, shared logic)
│   ├── node/              # @atrim/instrument-node (Node.js platform)
│   └── web/               # @atrim/instrument-web (Phase 1)
├── examples/              # Example applications
│   ├── express/
│   ├── effect-ts/
│   ├── vanilla/
│   └── ...
├── docs/                  # Documentation
├── turbo.json            # Turborepo configuration
├── pnpm-workspace.yaml   # pnpm workspaces
└── .changeset/           # Changesets configuration
```

## Documentation

- 📖 [Getting Started](./docs/getting-started.md)
- ⚙️ [Configuration](./docs/configuration.md)
- 📋 [Examples](./docs/EXAMPLES.md)
- 🔧 [Troubleshooting](./docs/TROUBLESHOOTING.md)
- 📚 [API Reference](./docs/api-reference.md)
- 🏗️ [Architecture](./CLAUDE.md)

## Architecture

### Core Package (Private)

`@atrim/instrument-core` contains platform-agnostic logic shared across all platform packages:

- Configuration loading (YAML/URL)
- Pattern matching and compilation
- Schema validation (Zod)
- Error types (Effect)
- Logging utilities

This package is **not published** to npm - it's bundled into platform packages.

### Platform Packages (Public)

Platform-specific implementations:

- **@atrim/instrument-node** - Node.js SDK, auto-instrumentation, OTLP exporters
- **@atrim/instrument-web** _(Phase 1)_ - Browser SDK, React hooks, Web Vitals

Each platform package bundles the core logic and adds platform-specific features.

## Contributing

1. Create feature branch from `main`
2. Make changes
3. Run tests: `pnpm test:all`
4. Create PR
5. Add changeset if changing public API

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for detailed guidelines.

## License

MIT © Atrim AI
