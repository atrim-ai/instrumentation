# Minimal Effect Auto-Tracing Example

The simplest possible setup for Effect-TS auto-instrumentation.

## Files

- `index.ts` - 20 lines of code
- `instrumentation.yaml` - 10 lines of config

## Run

```bash
pnpm install
pnpm start
```

## What You Get

Every Effect fiber is automatically traced - no `Effect.withSpan()` needed.
