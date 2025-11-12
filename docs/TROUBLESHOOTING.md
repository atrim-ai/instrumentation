# Troubleshooting Guide

Common issues and solutions for `@atrim/instrumentation`.

## No Traces Appearing in Collector

### Check OTLP Endpoint

Verify your collector endpoint is correct:

```typescript
// Local collector
await initializeInstrumentation({
  otlp: { endpoint: 'http://localhost:4318' }
})

// Atrim demo instance
await initializeInstrumentation({
  otlp: { endpoint: 'http://demo1.us-central1.gcp.atrim.ai' }
})
```

### Verify Collector is Running

**Local collector:**
```bash
docker run -p 4318:4318 otel/opentelemetry-collector
```

**Test connectivity:**
```bash
curl http://localhost:4318/v1/traces -d '{}'
# Should return 200 OK or error about invalid data
```

### Enable Debug Logging

```typescript
await initializeInstrumentation({
  configPath: './instrumentation.yaml'  // Set logging: 'on' in YAML
})
```

In your `instrumentation.yaml`:
```yaml
instrumentation:
  enabled: true
  logging: 'on'  # Enable detailed logs
```

## Pattern Matching Not Working

### Check Pattern Syntax

YAML requires **double backslashes** for regex escapes:

```yaml
# ✅ Correct
instrument_patterns:
  - pattern: "^app\\."

# ❌ Wrong (will not match)
instrument_patterns:
  - pattern: "^app."
```

### Test Your Patterns

```typescript
import { shouldInstrumentSpan } from '@atrim/instrumentation'

await initializeInstrumentation()

console.log(shouldInstrumentSpan('app.users.list'))    // true
console.log(shouldInstrumentSpan('health.check'))      // false
```

## Effect.withSpan() Spans Not Appearing

For pure Effect applications (no Express/Fastify):

```typescript
// DON'T call initializeInstrumentation() for pure Effect apps
// Just use EffectInstrumentationLive directly

import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

const program = Effect.gen(function* () {
  // Your Effect code
}).pipe(
  Effect.withSpan('app.operation'),
  Effect.provide(EffectInstrumentationLive)
)
```

Set the endpoint via environment:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai
```

## Duplicate Initialization Warnings

If you see "SDK already initialized", you have two options:

### Option 1: Remove Duplicate Call
```typescript
// Remove this if you already have NodeSDK
await initializeInstrumentation()
```

### Option 2: Let Library Detect It
The library will automatically detect existing NodeSDK and skip initialization:
```typescript
const sdk = new NodeSDK({...})
sdk.start()

await initializeInstrumentation()  // Automatically skips SDK, adds patterns only
```

## Auto-Instrumentation Not Working

### Verify Framework is Installed

```bash
npm list express fastify koa
```

### Check Detection

The library auto-detects frameworks. To force enable:
```typescript
await initializeInstrumentation({
  autoInstrument: true  // Force enable
})
```

## Performance Issues

### Too Many Spans

Use pattern filtering to reduce noise:

```yaml
ignore_patterns:
  - pattern: "^health\\."
  - pattern: "^metrics\\."
  - pattern: "^internal\\."
  - pattern: "^fs\\."
  - pattern: "^dns\\."
```

### High CPU Usage

Check if you're sending too frequently. The default batch processor exports every 5 seconds. Increase if needed:

```typescript
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

// Custom batch processor settings (advanced)
await initializeInstrumentation({
  sdk: {
    spanProcessor: new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: 10000  // Export every 10s instead of 5s
    })
  }
})
```

## Remote Configuration Not Loading

### Check URL

```typescript
await initializeInstrumentation({
  configUrl: 'https://config.atrim.ai/instrumentation.yaml'
})
```

### Verify HTTPS

Remote configs must use HTTPS (not HTTP) for security:
```typescript
// ✅ Correct
configUrl: 'https://config.company.com/instrumentation.yaml'

// ❌ Wrong (will be rejected)
configUrl: 'http://config.company.com/instrumentation.yaml'
```

## Getting Help

1. Check [Getting Started Guide](./GETTING_STARTED.md)
2. Review [Configuration Reference](./CONFIGURATION.md)
3. Look at [examples](../examples)
4. [Open an issue](https://github.com/atrim-ai/instrumentation/issues)

## Common Environment Variables

```bash
# Service identification
export OTEL_SERVICE_NAME=my-api
export OTEL_SERVICE_VERSION=1.0.0

# OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai

# Alternative: traces-specific endpoint
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://demo1.us-central1.gcp.atrim.ai/v1/traces

# Authentication (if needed)
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=your-key-here"
```

These environment variables are used automatically if you don't provide explicit options.
