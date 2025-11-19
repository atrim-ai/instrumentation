# @atrim/instrument-web

OpenTelemetry instrumentation for browsers with centralized YAML configuration.

[![npm version](https://img.shields.io/npm/v/@atrim/instrument-web.svg)](https://www.npmjs.com/package/@atrim/instrument-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ **Zero-config OpenTelemetry setup** for browser applications
- ✅ **Auto-instrumentation** (fetch, XHR, document load, user interactions)
- ✅ **Pattern-based span filtering** via `instrumentation.yaml`
- ✅ **OTLP export over HTTP** (browser-compatible)
- ✅ **TypeScript support** with full type definitions
- ✅ **<50KB bundle size** (gzipped) - optimized for web
- ✅ **Modern browsers** (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

## Installation

```bash
npm install @atrim/instrument-web
```

## Quick Start

```typescript
import { initializeInstrumentation } from '@atrim/instrument-web'

// Initialize once at application startup
await initializeInstrumentation({
  serviceName: 'my-app',
  otlpEndpoint: 'http://localhost:4318/v1/traces'
})

// That's it! Auto-instrumentation is now active.
```

## Auto-Instrumentations

The following are automatically instrumented when you initialize:

### 1. Document Load
Captures page load timing metrics (LCP, FCP, TTFB).

### 2. Fetch API
All `fetch()` calls are automatically traced with:
- HTTP method, URL, status code
- Request/response headers (configurable)
- Request/response timing

### 3. XMLHttpRequest (XHR)
Legacy AJAX requests are traced automatically.

### 4. User Interactions
Click events and form submissions are captured.

## Manual Instrumentation

You can also create custom spans:

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-app')

tracer.startActiveSpan('my-operation', (span) => {
  try {
    // Your code here
    span.setAttribute('user.id', '123')
    span.setAttribute('operation.type', 'checkout')

    // ... do work ...

    span.setStatus({ code: 1 }) // OK
  } catch (error) {
    span.recordException(error)
    span.setStatus({ code: 2 }) // ERROR
    throw error
  } finally {
    span.end()
  }
})
```

## Span Helpers

We provide convenient helpers for common annotations:

```typescript
import {
  annotateHttpRequest,
  annotateCacheOperation,
  annotateUserInteraction,
  annotateNavigation
} from '@atrim/instrument-web'

// HTTP request
annotateHttpRequest(span, {
  method: 'GET',
  url: 'https://api.example.com/users',
  statusCode: 200,
  responseTime: 150
})

// Cache operation
annotateCacheOperation(span, {
  operation: 'get',
  key: 'user:123',
  hit: true
})

// User interaction
annotateUserInteraction(span, {
  type: 'click',
  target: 'button#submit',
  page: '/checkout'
})

// Navigation
annotateNavigation(span, {
  from: '/home',
  to: '/profile',
  type: 'client-side'
})
```

## Configuration

### Basic Configuration

```typescript
await initializeInstrumentation({
  serviceName: 'my-app',          // Required
  serviceVersion: '1.0.0',         // Optional
  otlpEndpoint: 'http://localhost:4318/v1/traces', // Optional
  otlpHeaders: {                   // Optional
    'Authorization': 'Bearer token'
  }
})
```

### Pattern-Based Filtering

Create an `instrumentation.yaml` file:

```yaml
version: "1.0"

instrumentation:
  enabled: true

  # Only instrument these patterns
  instrument_patterns:
    - pattern: "^documentLoad"
      description: "Page load metrics"
    - pattern: "^HTTP (GET|POST)"
      description: "API requests"
    - pattern: "^click"
      description: "User clicks"

  # Ignore these patterns
  ignore_patterns:
    - pattern: "^HTTP GET /health"
      description: "Health check endpoints"
    - pattern: "^HTTP.*analytics"
      description: "Analytics requests"
```

Then load it:

```typescript
await initializeInstrumentation({
  serviceName: 'my-app',
  configPath: '/instrumentation.yaml'  // Path relative to your app
})
```

### Remote Configuration

Load configuration from a remote URL:

```typescript
await initializeInstrumentation({
  serviceName: 'my-app',
  configUrl: 'https://config.company.com/instrumentation.yaml'
})
```

### Disable Specific Instrumentations

```typescript
await initializeInstrumentation({
  serviceName: 'my-app',
  enableDocumentLoad: true,      // Page load metrics
  enableUserInteraction: false,  // Disable click tracking
  enableFetch: true,             // HTTP requests via fetch()
  enableXhr: false               // Disable XMLHttpRequest
})
```

## Environment Variables

Configure via Vite/Webpack environment variables:

```bash
# .env
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

Or set at runtime via window object:

```typescript
window.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://custom:4318/v1/traces'
```

## Browser Considerations

### CORS

Your OpenTelemetry collector must have CORS enabled:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins:
            - "http://localhost:3000"
            - "https://your-app.com"
          allowed_headers:
            - "*"
```

### Content Security Policy (CSP)

Add your OTLP endpoint to CSP:

```html
<meta http-equiv="Content-Security-Policy"
      content="connect-src 'self' http://localhost:4318">
```

### Bundle Size

The package is optimized for web with:
- ESM-only (no CJS overhead)
- Tree-shakeable exports
- Code splitting support
- Minification-friendly

**Estimated sizes:**
- Core SDK: ~15KB (gzipped)
- Auto-instrumentations: ~20KB (gzipped)
- OTLP exporter: ~10KB (gzipped)
- **Total: ~45KB (gzipped)**

## Examples

See the [examples/web-vanilla](../../examples/web-vanilla) directory for a complete working example.

## API Reference

### `initializeInstrumentation(options)`

Initialize OpenTelemetry for the browser.

**Options:**
- `serviceName` (string, required) - Service name for telemetry
- `serviceVersion` (string, optional) - Service version
- `otlpEndpoint` (string, optional) - OTLP HTTP endpoint (default: `http://localhost:4318/v1/traces`)
- `otlpHeaders` (object, optional) - Custom HTTP headers for OTLP export
- `configPath` (string, optional) - Path to `instrumentation.yaml` file
- `configUrl` (string, optional) - URL to remote `instrumentation.yaml`
- `config` (object, optional) - Inline configuration object
- `enableDocumentLoad` (boolean, optional) - Enable document load instrumentation (default: true)
- `enableUserInteraction` (boolean, optional) - Enable user interaction instrumentation (default: true)
- `enableFetch` (boolean, optional) - Enable fetch instrumentation (default: true)
- `enableXhr` (boolean, optional) - Enable XMLHttpRequest instrumentation (default: true)

**Returns:** `Promise<WebTracerProvider>`

### `getSdkInstance()`

Get the current SDK instance.

**Returns:** `WebTracerProvider | null`

### `shutdownSdk()`

Shutdown the SDK gracefully.

**Returns:** `Promise<void>`

## Comparison with Node.js Package

| Feature | @atrim/instrument-web | @atrim/instrument-node |
|---------|----------------------|------------------------|
| Platform | Browser | Node.js, Bun, Deno |
| Export Protocol | HTTP only | HTTP + gRPC |
| Auto-instrumentations | Fetch, XHR, DOM events | HTTP, gRPC, DB, etc. |
| Effect-TS | ❌ No | ✅ Yes |
| Bundle Size | <50KB | N/A |
| Service Detection | Manual | Automatic |

## Requirements

- **Modern browsers:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Build tool:** Vite, Webpack, or similar (for bundling)
- **OpenTelemetry Collector:** Running with HTTP endpoint

## Troubleshooting

### Traces not appearing

1. **Check collector is running:**
   ```bash
   docker run -p 4318:4318 otel/opentelemetry-collector
   ```

2. **Check CORS configuration** on your collector

3. **Check browser console** for errors

4. **Verify endpoint:**
   ```typescript
   import { getOtlpEndpoint } from '@atrim/instrument-web'
   console.log('OTLP endpoint:', getOtlpEndpoint())
   ```

### Performance issues

1. **Disable unused instrumentations:**
   ```typescript
   await initializeInstrumentation({
     serviceName: 'my-app',
     enableUserInteraction: false,  // Reduce overhead
     enableDocumentLoad: false
   })
   ```

2. **Use pattern filtering** to reduce span volume

3. **Sample traces** at the collector level

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/atrim-ai/instrumentation)
- [Issue Tracker](https://github.com/atrim-ai/instrumentation/issues)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [Atrim Platform](https://atrim.ai)
