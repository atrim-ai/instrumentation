# @atrim/instrument-node

## 0.10.0

### Minor Changes

- c5c4115: Bump OpenTelemetry dependencies to their latest coherent, patched set to clear
  downstream security alerts:
  - `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation`,
    `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-logs`:
    `^0.208.0` → `^0.220.0`
  - `@opentelemetry/auto-instrumentations-node`: `^0.67.3` → `^0.78.0`
  - `@opentelemetry/resources`, `@opentelemetry/sdk-trace-base`,
    `@opentelemetry/sdk-trace-node`, `@opentelemetry/sdk-trace-web`,
    `@opentelemetry/sdk-metrics`: `^2.2.0` → `^2.9.0`

  This raises the transitive `@opentelemetry/core` to `2.9.0` (≥ 2.8.0) and pulls
  `@opentelemetry/exporter-prometheus` to `0.220.0`, resolving the high/medium
  Dependabot advisories that consumers pinned through this package.

  `@opentelemetry/auto-instrumentations-node` dropped Fastify from its bundled
  instrumentations in 0.75+, so Fastify is now registered explicitly via the
  standalone `@opentelemetry/instrumentation-fastify` package to preserve
  out-of-the-box Fastify auto-instrumentation.

## 0.9.0

### Minor Changes

- 0f16e25: feat(effect): consolidate to UnifiedTracingLive as the single recommended API

  ## Summary

  This release consolidates multiple Effect tracing layers into a single recommended API: `UnifiedTracingLive` and `withUnifiedTracing`. This simplifies the API surface while providing all the tracing features in one layer.

  ## New Recommended API

  ```typescript
  import { UnifiedTracingLive, withUnifiedTracing } from '@atrim/instrument-node/effect/auto'

  // Option 1: Using the layer
  const program = myEffect.pipe(Effect.provide(UnifiedTracingLive))

  // Option 2: Using the wrapper (simpler)
  const program = myEffect.pipe(withUnifiedTracing)
  ```

  ## Features
  - **Fiber tracing** - Automatic spans for all forked fibers
  - **Operation tracing** - Automatic spans for Effect.all, Effect.forEach, Effect.fork
  - **Correct fork hierarchy** - Fork spans are parents of their resulting fiber spans
  - **Source location capture** - Meaningful span names like "effect.fiber (index.ts:42)"
  - **Auto OTel context bridging** - Automatically bridges OTel context to Effect spans
  - **Span control FiberRefs** - Use `withoutAutoTracing()` and `setSpanName()` for fine-grained control

  ## Backward Compatibility

  The following aliases are provided for gradual migration:

  | Old API                    | New API                     | Status     |
  | -------------------------- | --------------------------- | ---------- |
  | `AutoTracingLive`          | `UnifiedTracingLive`        | Deprecated |
  | `FullAutoTracingLive`      | `UnifiedTracingLive`        | Deprecated |
  | `CombinedTracingLive`      | `UnifiedTracingLive`        | Deprecated |
  | `SourceCaptureTracingLive` | `UnifiedTracingLive`        | Deprecated |
  | `OperationTracingLive`     | `UnifiedTracingLive`        | Deprecated |
  | `createAutoTracingLayer`   | `createUnifiedTracingLayer` | Deprecated |
  | `withAutoTracing`          | `withUnifiedTracing`        | Deprecated |
  | `withOperationTracing`     | `withUnifiedTracing`        | Deprecated |

  ## Breaking Changes

  The following internal files have been removed:
  - `supervisor.ts`
  - `effect-tracing.ts`
  - `source-capture-supervisor.ts`
  - `operation-tracing-supervisor.ts`

  If you were importing directly from these internal files, please update to use the public exports from `@atrim/instrument-node/effect/auto`.

## 0.8.0

### Minor Changes

- a950b59: feat(effect): add OpSupervision for YAML-driven operation tracing

  This release adds OpSupervision, a new supervisor-based approach for automatic Effect operation tracing:

  **New Features:**
  - `OpSupervision` layer for YAML-driven operation tracing
  - `UnifiedTracingSupervisor` with correct fork span hierarchy
  - Support for tracing `Effect.all`, `Effect.forEach`, and `Effect.fork` operations
  - Configurable operation tracing via `instrumentation.yaml`
  - Automatic span creation for concurrent operations
  - Proper parent-child span relationships for forked fibers

  **Configuration:**

  ```yaml
  effect:
    op_supervision:
      enabled: true
      granularity: fiber # or 'operation'
      sampling_rate: 1.0
      operations:
        all: true
        forEach: true
        fork: true
  ```

  **Usage:**

  ```typescript
  import { OpSupervisionLive } from '@atrim/instrument-node/effect/auto'

  Effect.gen(function* () {
    // Operations automatically traced
    yield* Effect.all([task1, task2])
    yield* Effect.forEach(items, processItem)
  }).pipe(Effect.provide(OpSupervisionLive))
  ```

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
