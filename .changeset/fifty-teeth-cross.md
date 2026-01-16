---
"@atrim/instrument-core": minor
"@atrim/instrument-node": minor
---

Add YAML-driven operation tracing for Effect.all, Effect.forEach, etc.

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
  yield* Effect.all([doA(), doB()])  // Automatically traced
}).pipe(Effect.provide(OperationTracingLive))
```

Requires: @clayroach/effect@3.19.14-source-capture.3 or later
