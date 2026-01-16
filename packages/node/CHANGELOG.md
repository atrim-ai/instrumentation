# @atrim/instrument-node

## 0.8.0

### Minor Changes

- e12da4b: Add YAML-driven operation tracing for Effect.all, Effect.forEach, etc.

  New Features:
  - Automatic tracing of Effect.all and Effect.forEach operations using OpSupervision
  - YAML configuration via `effect.operation_tracing` section in instrumentation.yaml
  - Zero-config defaults (traces all/forEach with count and source location)
  - Source location metadata (file, line, column) captured at operation call site
  - Proper parent span context for unified traces

  Configuration Example:

  ```yaml
  effect:
    operation_tracing:
      enabled: true
      operations:
        - name: all
          include_count: true
          include_stack: true
        - name: forEach
          include_count: true
  ```

  Usage:

  ```typescript
  import { OperationTracingLive } from '@atrim/instrument-node/effect/auto'

  const program = Effect.gen(function* () {
    yield* Effect.all([doA(), doB()]) // Automatically traced
  }).pipe(Effect.provide(OperationTracingLive))
  ```

  Requires: @clayroach/effect@3.19.14-source-capture.3 or later

## 0.7.0

### Minor Changes

- 60e56c4: Remove unused Effect package overrides and resolve version mismatches
  - Removed pnpm overrides for unused `@effect/cluster`, `@effect/rpc`, and `@effect/sql` packages
  - Added `peerDependencyRules.ignoreMissing` to suppress peer dependency warnings
  - Allow pnpm to auto-resolve compatible versions for transitive Effect dependencies

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
