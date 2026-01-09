# Minimal Effect Auto-Tracing Example

The simplest possible setup for Effect-TS auto-instrumentation.

## Prerequisites

A local OpenTelemetry collector running on `http://localhost:4318`.

## Run

```bash
pnpm install
pnpm start
```

## What You Get

Every Effect fiber is automatically traced and exported to your collector - no `Effect.withSpan()` needed.
