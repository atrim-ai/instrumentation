---
"@atrim/instrument-node": minor
---

feat(effect): consolidate to UnifiedTracingLive as the single recommended API

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

| Old API | New API | Status |
|---------|---------|--------|
| `AutoTracingLive` | `UnifiedTracingLive` | Deprecated |
| `FullAutoTracingLive` | `UnifiedTracingLive` | Deprecated |
| `CombinedTracingLive` | `UnifiedTracingLive` | Deprecated |
| `SourceCaptureTracingLive` | `UnifiedTracingLive` | Deprecated |
| `OperationTracingLive` | `UnifiedTracingLive` | Deprecated |
| `createAutoTracingLayer` | `createUnifiedTracingLayer` | Deprecated |
| `withAutoTracing` | `withUnifiedTracing` | Deprecated |
| `withOperationTracing` | `withUnifiedTracing` | Deprecated |

## Breaking Changes

The following internal files have been removed:
- `supervisor.ts`
- `effect-tracing.ts`
- `source-capture-supervisor.ts`
- `operation-tracing-supervisor.ts`

If you were importing directly from these internal files, please update to use the public exports from `@atrim/instrument-node/effect/auto`.
