# Getting Started with @atrim/instrumentation

Get up and running with pattern-based OpenTelemetry instrumentation in 5 minutes.

## Prerequisites

- Node.js 18+ (or Bun 1.0+, or Deno 1.40+)
- Existing OpenTelemetry setup (optional - we'll show you how to set it up)

## Installation

```bash
npm install @atrim/instrumentation @opentelemetry/api
```

Or with your preferred package manager:

```bash
pnpm add @atrim/instrumentation @opentelemetry/api
# or
yarn add @atrim/instrumentation @opentelemetry/api
# or
bun add @atrim/instrumentation @opentelemetry/api
```

## Quick Start (Zero Config)

### Step 1: Create Configuration File

Create `instrumentation.yaml` in your project root:

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "My application instrumentation"

  # Patterns for spans to create
  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
      description: "Application operations"
    - pattern: "^http\\.server\\."
      enabled: true
      description: "HTTP server requests"

  # Patterns to ignore (takes precedence)
  ignore_patterns:
    - pattern: "^health\\."
      description: "Health checks"
    - pattern: "^internal\\."
      description: "Internal operations"
```

### Step 2: Initialize in Your Application

```typescript
// index.ts
import { initializeInstrumentation } from '@atrim/instrumentation'

// Initialize once at startup (looks for ./instrumentation.yaml automatically)
await initializeInstrumentation()

// Your application code...
```

### Step 3: Use Pattern-Based Span Filtering

The library automatically filters spans based on your patterns:

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')

// ✅ This span will be created (matches ^app\.)
await tracer.startActiveSpan('app.user.login', async (span1) => {
  span1.end()
})

// ❌ This span will be dropped (matches ^health\.)
await tracer.startActiveSpan('health.check', async (span2) => {
  span2.end()
})

// ✅ This span will be created (fail-open: no pattern matches)
await tracer.startActiveSpan('database.query', async (span3) => {
  span3.end()
})
```

That's it! You now have centralized, pattern-based span filtering.

## Complete Example with OpenTelemetry Setup

If you don't have OpenTelemetry set up yet, here's a complete example:

```typescript
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { initializeInstrumentation, PatternSpanProcessor } from '@atrim/instrumentation'
import { loadConfig } from '@atrim/instrumentation/config-loader'

async function setupInstrumentation() {
  // 1. Initialize pattern matching
  await initializeInstrumentation()

  // 2. Create OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces'
  })

  // 3. Create batch processor
  const batchProcessor = new BatchSpanProcessor(exporter)

  // 4. Optional: Wrap with pattern processor for filtering
  // (If you want to filter at export time instead of creation time)
  const config = await loadConfig()
  const patternProcessor = new PatternSpanProcessor(config, batchProcessor)

  // 5. Create and start SDK
  const sdk = new NodeSDK({
    spanProcessor: patternProcessor,
    serviceName: 'my-service'
  })

  sdk.start()

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await sdk.shutdown()
  })
}

setupInstrumentation()
```

```typescript
// app.ts
import { trace } from '@opentelemetry/api'
import { annotateHttpRequest, markSpanSuccess } from '@atrim/instrumentation'

const tracer = trace.getTracer('my-service')

async function handleRequest(req, res) {
  await tracer.startActiveSpan('app.http.request', async (span) => {
    try {
      // Add HTTP attributes
      annotateHttpRequest(span, req.method, req.url, 200)

      // Your business logic...
      await processRequest(req)

      markSpanSuccess(span)
      res.json({ success: true })
    } catch (error) {
      span.recordException(error)
      res.status(500).json({ error: 'Internal error' })
    } finally {
      span.end()
    }
  })
}
```

## Configuration Options

### 1. Zero Config (Default)

```typescript
await initializeInstrumentation()
// Looks for ./instrumentation.yaml
```

### 2. Custom File Path

```typescript
await initializeInstrumentation({
  configPath: './config/custom-instrumentation.yaml'
})
```

### 3. Remote URL

```typescript
await initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000 // 5 minutes
})
```

### 4. Programmatic

```typescript
await initializeInstrumentation({
  config: {
    version: '1.0',
    instrumentation: {
      enabled: true,
      instrument_patterns: [
        { pattern: '^app\\.', enabled: true }
      ],
      ignore_patterns: [
        { pattern: '^test\\.', description: 'Test utilities' }
      ]
    }
  }
})
```

### 5. Environment Variable

```bash
# Set config path or URL via environment
export ATRIM_INSTRUMENTATION_CONFIG=./my-config.yaml
# or
export ATRIM_INSTRUMENTATION_CONFIG=https://config.company.com/config.yaml
```

```typescript
await initializeInstrumentation()
// Automatically loads from ATRIM_INSTRUMENTATION_CONFIG
```

## Span Helpers

The library provides convenient helpers for common patterns:

```typescript
import {
  setSpanAttributes,
  recordException,
  markSpanSuccess,
  markSpanError,
  annotateHttpRequest,
  annotateDbQuery,
  annotateCacheOperation
} from '@atrim/instrumentation'

await tracer.startActiveSpan('app.operation', async (span) => {
  // Set multiple attributes at once
  setSpanAttributes(span, {
    'user.id': '123',
    'operation.type': 'create',
    'request.size': 1024
  })

  // HTTP requests
  annotateHttpRequest(span, 'GET', '/api/users', 200)

  // Database queries
  annotateDbQuery(span, 'postgresql', 'SELECT * FROM users WHERE id = $1', 'users')

  // Cache operations
  annotateCacheOperation(span, 'get', 'user:123', true) // hit=true
})


// Error handling
try {
  await riskyOperation()
  markSpanSuccess(span)
} catch (error) {
  recordException(span, error, {
    'error.context': 'user_operation',
    'error.recoverable': false
  })
  markSpanError(span, 'Operation failed')
}

span.end()
```

## Next Steps

- [Configuration Reference](./configuration.md) - Complete YAML schema
- [API Reference](./api-reference.md) - Full TypeScript API docs
- [Examples](../examples/) - Real-world examples
- [Migration Guide](./migration-guide.md) - Migrate from manual instrumentation

## Troubleshooting

### Patterns not matching?

Remember to escape regex special characters in YAML:

```yaml
# ✅ Correct (double backslash)
- pattern: "^app\\."

# ❌ Incorrect (single backslash)
- pattern: "^app\."
```

### Spans still being created?

Check the fail-open behavior: spans that don't match any pattern are still created by default. Add explicit ignore patterns if needed.

### Remote config not loading?

- Ensure the URL uses HTTPS (HTTP is blocked for security)
- Check that the config size is under 1MB
- Verify the URL is accessible and returns valid YAML

### Need help?

- [GitHub Issues](https://github.com/atrim-ai/instrumentation/issues)
- [API Reference](./api-reference.md)
- [Examples](../examples/)
