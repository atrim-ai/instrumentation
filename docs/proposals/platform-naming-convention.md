# Platform Naming Convention - Summary

## New Package Names

- **`@atrim/instrument-web`** - Browser/web platform
- **`@atrim/instrument-node`** - Node.js platform
- **`@atrim/instrument-python`** - Python platform (future)
- **`@atrim/instrument-go`** - Go platform (future)
- **`@atrim/instrument-core`** - Shared core logic (private)

## Current State

- Package: `@atrim/instrumentation`
- Will be renamed to: `@atrim/instrument-node`
- Migration: Maintain `@atrim/instrumentation` as alias

## Usage Examples

### Web (Browser/React)

```typescript
import { initializeInstrumentation } from '@atrim/instrument-web'
import { useTraceSpan } from '@atrim/instrument-web/react'
```

### Node.js (Backend)

```typescript
import { initializeInstrumentation } from '@atrim/instrument-node'
import { EffectInstrumentationLive } from '@atrim/instrument-node/effect'
```

### Next.js (Full-Stack)

```typescript
// app/instrumentation.ts
export async function register() {
  if (typeof window === 'undefined') {
    const { initializeInstrumentation } = await import('@atrim/instrument-node')
    await initializeInstrumentation()
  } else {
    const { initializeInstrumentation } = await import('@atrim/instrument-web')
    await initializeInstrumentation()
  }
}
```

## Benefits

1. ✅ Clear platform separation
2. ✅ Shorter, cleaner names
3. ✅ Scalable to other languages
4. ✅ Smaller bundle sizes (no cross-platform code)
5. ✅ Easier to understand (`instrument-web` vs `instrumentation/browser`)
