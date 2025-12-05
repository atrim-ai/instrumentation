# Developer Guide

Development setup for the `@atrim/instrumentation` monorepo.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for integration tests)

```bash
corepack enable
```

## Getting Started

```bash
git clone https://github.com/atrim-ai/instrumentation.git
cd instrumentation
pnpm install
pnpm build
```

## Commands

```bash
# Build
pnpm build                    # All packages
pnpm --filter @atrim/instrument-node build

# Test
pnpm test                     # Unit tests
pnpm test:integration         # Integration tests (requires Docker)
pnpm test:all                 # Both

# Lint & Format
pnpm lint
pnpm format
```

## Monorepo Structure

```
atrim-instrumentation/
├── packages/
│   ├── core/         # Shared logic (private, not published)
│   ├── node/         # @atrim/instrument-node
│   └── web/          # @atrim/instrument-web (coming soon)
├── examples/         # Example applications
├── docs/             # Documentation
└── turbo.json        # Turborepo config
```

## Publishing

### Dev Versions

```bash
pnpm publish:node     # @atrim/instrument-node@dev
pnpm publish:web      # @atrim/instrument-web@dev
pnpm publish:all      # All packages
```

### Production Releases

```bash
pnpm changeset        # Create changeset
git add .changeset && git commit -m "chore: add changeset"
# Merge PR → Changesets creates version PR → Merge to publish
```

## Package-Specific Guides

- [@atrim/instrument-node](./packages/node/DEVELOPERS.md)

## Architecture

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.
