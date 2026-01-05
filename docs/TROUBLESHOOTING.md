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
  otlp: { endpoint: 'http://localhost:4318' }
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

## Effect Fiber Metadata Not Appearing

If your Effect spans are missing fiber metadata (like `effect.fiber.id`, `effect.fiber.status`), this is expected behavior.

### Root Cause

The `auto_extract_metadata` configuration option is **not implemented**. The config flag in `instrumentation.yaml` is parsed but never actually used at runtime.

### Solution: Explicit Metadata Extraction

You must explicitly call the enrichment functions to add fiber metadata:

```typescript
import { autoEnrichSpan, withAutoEnrichedSpan } from '@atrim/instrument-node/effect'

// Option 1: Call autoEnrichSpan() inside a span
const operation = Effect.gen(function* () {
  yield* autoEnrichSpan()  // Adds fiber metadata to current span
  // ... your logic
}).pipe(Effect.withSpan('app.operation'))

// Option 2: Use the convenience wrapper
const operation = withAutoEnrichedSpan('app.operation')(
  Effect.gen(function* () {
    // ... your logic (fiber metadata added automatically)
  })
)
```

### What Metadata Gets Added

When you call `autoEnrichSpan()` or use `withAutoEnrichedSpan()`:
- `effect.fiber.id` - Unique fiber thread name
- `effect.fiber.status` - Current fiber status
- `effect.operation.root` - `true` if this is a root operation
- `effect.operation.nested` - `true` if this is nested under another span
- `effect.parent.span.id` - Parent span ID (if nested)
- `effect.parent.span.name` - Parent span name (if nested)
- `effect.parent.trace.id` - Parent trace ID (if nested)

### Why Isn't It Automatic?

The `auto_extract_metadata: true` config option was designed for future automatic extraction but hasn't been implemented yet. Currently, metadata extraction is opt-in on a per-span basis.

---

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
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
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

## Trace Context Propagation CORS Errors

### Symptom

When using the web package (`@atrim/instrument-web`), you see CORS errors in the browser console:

```
Access to XMLHttpRequest at 'https://api.example.com' has been blocked by CORS policy:
Request header field traceparent is not allowed by Access-Control-Allow-Headers in preflight response.
```

or

```
Access to fetch at 'https://api.example.com' has been blocked by CORS policy:
Request header field traceparent is not allowed by Access-Control-Allow-Headers in preflight response.
```

### Root Cause

The W3C Trace Context headers (`traceparent`, `tracestate`) are added to cross-origin requests by the instrumentation. When these headers are present, the browser triggers a CORS preflight request (OPTIONS), and the backend server must explicitly allow these headers.

### Solution 1: Configure Backend CORS

Update your backend to allow trace context headers in CORS configuration:

**Express (Node.js):**
```typescript
import cors from 'cors'

app.use(cors({
  origin: 'https://your-frontend.com',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'traceparent',    // W3C Trace Context (required)
    'tracestate'      // W3C Trace State (optional)
  ]
}))
```

**Fastify (Node.js):**
```typescript
import fastifyCors from '@fastify/cors'

await fastify.register(fastifyCors, {
  origin: 'https://your-frontend.com',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'traceparent',
    'tracestate'
  ]
})
```

**Effect HTTP (Effect-TS):**
```typescript
import { HttpMiddleware } from '@effect/platform'

const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ['https://your-frontend.com'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'traceparent',
    'tracestate'
  ],
  exposedHeaders: ['Content-Length', 'Date']
})
```

**Cloudflare Workers:**
```typescript
// In your response headers
return new Response(body, {
  headers: {
    'Access-Control-Allow-Origin': 'https://your-frontend.com',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, tracestate',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  }
})
```

### Solution 2: Disable Trace Propagation

If you **cannot** modify the backend CORS configuration (e.g., third-party APIs), disable trace propagation:

**Disable all cross-origin propagation:**
```typescript
import { initializeInstrumentation } from '@atrim/instrument-web'

await initializeInstrumentation({
  serviceName: 'my-app',
  propagateTraceContext: 'none'  // Only same-origin gets trace headers
})
```

**Selectively propagate to specific domains:**
```typescript
await initializeInstrumentation({
  serviceName: 'my-app',
  propagateTraceContext: [
    '^https://api\\.myapp\\.com',      // Your own API
    '^http://localhost:300[0-9]'      // Local dev servers
  ]
  // Third-party APIs (e.g., Stripe, Auth0) won't receive trace headers
})
```

**Using YAML configuration:**
```yaml
# instrumentation.yaml
http:
  propagate_trace_context:
    strategy: "patterns"
    include_urls:
      - "^https://api\\.myapp\\.com"
      - "^http://localhost:300[0-9]"
```

### Understanding Trace Propagation

**Default behavior (v0.4.0+):** Same-origin only
- Same-origin requests (e.g., `/api/users`) → ✅ Always get trace headers
- Cross-origin requests (e.g., `https://api.other.com`) → ❌ No trace headers (unless configured)

**Available strategies:**
- `'none'` - No cross-origin propagation (safest, same-origin only)
- `'same-origin'` - Same as 'none' (default)
- `'all'` - Propagate to all cross-origin requests (may cause CORS errors)
- `string[]` - Propagate only to matching URL patterns

### Verifying Headers Are Sent

To verify trace headers are being sent to your API:

**Browser DevTools:**
1. Open DevTools → Network tab
2. Make a request to your API
3. Click the request → Headers tab
4. Look for `traceparent` and `tracestate` in "Request Headers"

**Expected header format:**
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
tracestate: (vendor-specific data, may be empty)
```

If you see these headers but get CORS errors, your backend needs to allow them (Solution 1).

### Breaking Change Notice

**v0.3.x and earlier:** Propagated to ALL cross-origin requests by default
**v0.4.0+:** Only propagates to same-origin requests by default

If you were relying on cross-origin propagation, explicitly configure it:
```typescript
propagateTraceContext: 'all'  // Restore old behavior (not recommended)
```

Or better, configure specific domains:
```typescript
propagateTraceContext: ['^https://api\\.myapp\\.com']  // Recommended
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
  configUrl: 'https://config.example.com/instrumentation.yaml'
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
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Alternative: traces-specific endpoint
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces

# Authentication (if needed)
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=your-key-here"
```

These environment variables are used automatically if you don't provide explicit options.
