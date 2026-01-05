# @atrim/instrument-node

## 0.6.0

### Minor Changes

- f0ec254: Bundle SDK Deps and WebSocket Exporter

## 0.5.1

### Patch Changes

- c0d5e19: Align effect dependencies

## 0.5.0

### Minor Changes

- 8cc6b6a: Set all to the same 0.5.0 version to align with node and web packages functional

## 0.4.0

### Minor Changes

- 2aa7afc: Phase 0: Monorepo setup
  - Convert to pnpm workspaces monorepo
  - Extract @atrim/instrument-core (bundled)
  - Add Turborepo for build caching
  - Add Changesets for version management
  - Rename package from @atrim/instrumentation to @atrim/instrument-node

  BREAKING CHANGE: Package name changed from @atrim/instrumentation to @atrim/instrument-node
