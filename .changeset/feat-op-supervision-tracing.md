---
"@atrim/instrument-node": minor
"@atrim/instrument-core": minor
---

feat(effect): add OpSupervision for YAML-driven operation tracing

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
    granularity: fiber  # or 'operation'
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
