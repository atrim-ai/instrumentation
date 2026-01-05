# Developer Guide

Development setup and contribution guide for `@atrim/instrument-node`.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for integration tests)

```bash
# Enable corepack (recommended)
corepack enable
```

## Getting Started

```bash
# Clone the monorepo
git clone https://github.com/atrim-ai/instrumentation.git
cd instrumentation

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development Workflow

### Working on this package

```bash
# Build
pnpm --filter @atrim/instrument-node build

# Watch mode
pnpm --filter @atrim/instrument-node dev

# Type check
pnpm --filter @atrim/instrument-node typecheck
```

### Testing

```bash
# Unit tests
pnpm --filter @atrim/instrument-node test

# Unit tests (watch mode)
pnpm --filter @atrim/instrument-node test:watch

# Integration tests (requires Docker)
pnpm --filter @atrim/instrument-node test:integration

# All tests
pnpm --filter @atrim/instrument-node test:all

# Coverage
pnpm --filter @atrim/instrument-node test:coverage
```

**Integration test environment:**

Integration tests use `OTEL_BSP_SCHEDULE_DELAY=500` to speed up span exports (configured in `package.json`).

### Linting & Formatting

```bash
# Lint
pnpm --filter @atrim/instrument-node lint
pnpm --filter @atrim/instrument-node lint:fix

# Format (from repo root)
pnpm format
pnpm format:check
```

## Project Structure

```
packages/node/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── core/
│   │   ├── sdk-initializer.ts      # SDK initialization
│   │   ├── config-loader.ts        # YAML config loading
│   │   ├── pattern-matcher.ts      # Span pattern matching
│   │   └── service-detector.ts     # Service name detection
│   └── integrations/
│       └── effect/
│           ├── index.ts            # Effect integration entry
│           └── effect-helpers.ts   # Span annotation helpers
├── test/
│   ├── unit/                       # Unit tests
│   └── integration/                # Integration tests
├── target/
│   └── dist/                       # Build output
├── tsup.config.ts                  # Build config
├── vitest.config.ts                # Unit test config
└── vitest.integration.config.ts    # Integration test config
```

## Build System

Uses [tsup](https://tsup.egoist.dev/) for building ESM and CJS outputs.

```bash
# Build outputs
target/dist/
├── index.js           # ESM
├── index.cjs          # CJS
├── index.d.ts         # Types
└── integrations/
    └── effect/
        ├── index.js
        ├── index.cjs
        └── index.d.ts
```

### Package Exports

```json
{
  "exports": {
    ".": {
      "types": "./target/dist/index.d.ts",
      "import": "./target/dist/index.js",
      "require": "./target/dist/index.cjs"
    },
    "./effect": {
      "types": "./target/dist/integrations/effect/index.d.ts",
      "import": "./target/dist/integrations/effect/index.js",
      "require": "./target/dist/integrations/effect/index.cjs"
    }
  }
}
```

## Dependencies

### Architecture

This package uses a **hybrid bundling** strategy:

| Package | Strategy | Reason |
|---------|----------|--------|
| `@opentelemetry/api` | Peer dep (required) | Global singleton |
| `@opentelemetry/sdk-*` | Bundled | Implementation detail |
| `effect` | Peer dep (optional) | User provides |
| `@effect/opentelemetry` | Peer dep (optional) | User provides |

See [Issue #75](https://github.com/atrim-ai/instrumentation/issues/75) for details.

### Adding Dependencies

- **Runtime deps** that should be bundled: Add to `dependencies`
- **Peer deps** users must install: Add to `peerDependencies` + `peerDependenciesMeta`
- **Dev-only deps**: Add to `devDependencies`

## Publishing

### Dev Versions (Testing)

```bash
# Publishes with tag: {version}-{commit}-{timestamp}
pnpm --filter @atrim/instrument-node publish:dev

# Or from repo root
pnpm publish:node
```

Install dev version:
```bash
npm install @atrim/instrument-node@dev
```

### Production Releases

Use Changesets from the repo root:

```bash
# 1. Create changeset
pnpm changeset

# 2. Commit
git add .changeset && git commit -m "chore: add changeset"

# 3. Create PR, merge to main
# 4. Changesets creates version PR automatically
# 5. Merge version PR to publish
```

## Effect-TS Development

This package is **Effect-first** internally. Core library code should use Effect-TS patterns.

### Guidelines

- Use `Effect.gen` for async operations
- Use `Data.TaggedError` for typed errors
- Use `Layer` for dependency injection
- Use `Effect.acquireRelease` for resource management

### MCP Server

Before implementing Effect features, use the Effect MCP server:

```
mcp__effect-docs__effect_docs_search: "layer composition"
mcp__effect-docs__get_effect_doc: { documentId: 123 }
```

See [CLAUDE.md](../../CLAUDE.md) for detailed Effect-TS guidelines.

## Common Tasks

### Adding a new annotation helper

1. Add function in `src/integrations/effect/effect-helpers.ts`
2. Export from `src/integrations/effect/index.ts`
3. Add unit test
4. Update README.md

### Adding a new configuration option

1. Update schema in `src/core/instrumentation-schema.ts`
2. Handle in `src/core/config-loader.ts`
3. Add unit test
4. Update `docs/configuration.md`

### Running examples

```bash
# From repo root
cd examples/express
pnpm install
pnpm dev

# Start collector first
docker run -p 4318:4318 otel/opentelemetry-collector
```

## Troubleshooting

### Build errors

```bash
# Clean and rebuild
pnpm --filter @atrim/instrument-node clean
pnpm --filter @atrim/instrument-node build
```

### Integration tests timing out

Integration tests wait for spans to be exported. If timing out:
- Ensure Docker is running
- Check `OTEL_BSP_SCHEDULE_DELAY` is set (should be in package.json scripts)
- Increase test timeout if needed

### Type errors after dependency updates

```bash
# Rebuild core first
pnpm --filter @atrim/instrument-core build
pnpm --filter @atrim/instrument-node build
```

## Known Limitations

### `auto_extract_metadata` config option not implemented

The `effect.auto_extract_metadata` configuration option in `instrumentation.yaml` is **defined but not implemented**. The config flag is parsed but never consulted at runtime.

**Current behavior:** Metadata extraction is entirely manual. Users must explicitly call:
- `autoEnrichSpan()` inside a span
- `withAutoEnrichedSpan('span.name')(effect)` as a wrapper

**Why it exists:** The config option is reserved for future automatic extraction support, where setting `auto_extract_metadata: true` would automatically enrich all Effect spans with fiber metadata without explicit calls.

**Files involved:**
- Schema definition: `packages/core/src/instrumentation-schema.ts` (line ~103)
- Unused option: `packages/node/src/integrations/effect/effect-tracer.ts` (line ~63)
- Manual extraction: `packages/node/src/integrations/effect/auto-enrichment.ts`

## Resources

- [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js)
- [Effect-TS Docs](https://effect.website)
- [tsup](https://tsup.egoist.dev/)
- [Vitest](https://vitest.dev/)
