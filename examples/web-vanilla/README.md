# Vanilla JavaScript Example - @atrim/instrument-web

This example demonstrates how to use `@atrim/instrument-web` in a vanilla TypeScript/JavaScript browser application.

## Features Demonstrated

- ✅ Zero-config OpenTelemetry initialization
- ✅ Auto-instrumentation (fetch, XHR, document load, user interactions)
- ✅ Manual span creation with custom attributes
- ✅ Error tracking and exception recording
- ✅ OTLP export to OpenTelemetry collector

## Prerequisites

1. **OpenTelemetry Collector** running locally:
   ```bash
   docker run -p 4318:4318 otel/opentelemetry-collector
   ```

2. **Dependencies installed** (from repository root):
   ```bash
   pnpm install
   ```

## Running the Example

1. **Start the development server:**
   ```bash
   cd examples/web-vanilla
   pnpm dev
   ```

2. **Open your browser** to http://localhost:3000

3. **Interact with the UI:**
   - Click "Fetch Data" to make an HTTP request (auto-instrumented)
   - Click "Trigger Error" to create a span with an error
   - Click "Custom Span" to create a manual span with attributes
   - Check the browser console and the output panel

4. **View traces** in your OpenTelemetry collector/backend

## What's Happening

### Auto-Instrumentation

The following are automatically instrumented:

- **Document Load:** Page load timing metrics
- **Fetch API:** All `fetch()` calls are traced
- **XMLHttpRequest:** All XHR requests are traced
- **User Interactions:** Clicks and form submissions

### Manual Instrumentation

You can also create custom spans:

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-app')

tracer.startActiveSpan('my-operation', (span) => {
  try {
    // Your code here
    span.setAttribute('custom.attribute', 'value')
    span.setStatus({ code: 1 }) // OK
  } catch (error) {
    span.recordException(error)
    span.setStatus({ code: 2 }) // ERROR
  } finally {
    span.end()
  }
})
```

## Configuration

The example uses the default configuration:

```typescript
await initializeInstrumentation({
  serviceName: 'web-vanilla-example',
  serviceVersion: '1.0.0',
  otlpEndpoint: 'http://localhost:4318/v1/traces'
})
```

You can customize:
- OTLP endpoint
- Enable/disable specific instrumentations
- Add custom headers
- Load configuration from remote URL

## Files

- `index.html` - HTML page with UI
- `main.ts` - TypeScript code with instrumentation
- `vite.config.ts` - Vite bundler configuration
- `package.json` - Dependencies and scripts

## Next Steps

- Explore pattern-based filtering with `instrumentation.yaml`
- Try the React example for component-level tracing
- Check out the Effect-TS integration for advanced patterns
