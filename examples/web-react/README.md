# React Example - @atrim/instrument-web

Production-ready React example with OpenTelemetry instrumentation. Use this as a template for instrumenting the **Atrim Platform UI**.

## Features Demonstrated

- ✅ React 18 with TypeScript
- ✅ React Router v6 with navigation tracking
- ✅ Custom hooks for tracing (`useTraceSpan`, `useRenderPerformance`)
- ✅ Error boundary with telemetry integration
- ✅ Component lifecycle tracking
- ✅ User interaction tracking
- ✅ Data fetching instrumentation
- ✅ Auto-instrumentation (fetch, XHR, document load)

## Quick Start

### 1. Install Dependencies

```bash
cd examples/web-react
pnpm install
```

### 2. Start OpenTelemetry Collector

```bash
docker run -p 4318:4318 otel/opentelemetry-collector
```

### 3. Run the Example

```bash
pnpm dev
```

Open http://localhost:3000 and explore the instrumented application.

---

## Instrumenting the Atrim Platform UI

Follow these steps to add OpenTelemetry to your Atrim platform:

### Step 1: Install the Package

```bash
npm install @atrim/instrument-web
```

### Step 2: Create Instrumentation Setup

Create `src/instrumentation/init.ts`:

```typescript
import { initializeInstrumentation } from '@atrim/instrument-web'

export async function initInstrumentation() {
  await initializeInstrumentation({
    serviceName: 'atrim-platform-ui',
    serviceVersion: process.env.VITE_APP_VERSION || '1.0.0',
    otlpEndpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',

    // Enable auto-instrumentations
    enableDocumentLoad: true,
    enableUserInteraction: true,
    enableFetch: true,
    enableXhr: true,

    // Optional: Load pattern-based filtering from remote
    configUrl: import.meta.env.VITE_OTEL_CONFIG_URL
  })
}
```

### Step 3: Initialize Before React

Update your `main.tsx`:

```typescript
import { initInstrumentation } from './instrumentation/init'

// Initialize OpenTelemetry BEFORE React
initInstrumentation()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((error) => {
    console.error('Failed to initialize telemetry:', error)
    // Continue rendering even if telemetry fails
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
```

### Step 4: Add Custom Hooks (Optional)

Copy the hooks from this example:

- `src/hooks/useTraceSpan.ts` - Trace async operations
- `src/hooks/usePerformance.ts` - Track render performance

### Step 5: Add Error Boundary (Recommended)

Copy `src/components/ErrorBoundary.tsx` and wrap your app:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  )
}
```

### Step 6: Configure Environment Variables

Add to your `.env.local`:

```bash
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
VITE_OTEL_SERVICE_NAME=atrim-platform-ui
VITE_APP_VERSION=1.0.0
```

For production:

```bash
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.atrim.ai/v1/traces
VITE_OTEL_SERVICE_NAME=atrim-platform-ui
VITE_APP_VERSION=${CI_COMMIT_TAG}
```

### Step 7: Add Pattern-Based Filtering (Optional)

Pattern-based filtering lets you control which spans are created without changing your code. This is useful for reducing noise and focusing on high-value operations.

#### Browser Configuration (Static Assets)

For browser applications, place `instrumentation.yaml` in your `public/` directory. Vite automatically serves files from `public/` at the root URL.

**Create `public/instrumentation.yaml`:**

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Pattern-based filtering for browser spans"

  # Only instrument important operations
  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
      description: "Application operations"
    - pattern: "^ui\\."
      enabled: true
      description: "UI interactions"
    - pattern: "^api\\."
      enabled: true
      description: "API requests"

  # Ignore noise
  ignore_patterns:
    - pattern: "^internal\\."
      description: "Internal operations"
    - pattern: "^debug\\."
      description: "Debug utilities"
```

**Load the config in your initialization:**

```typescript
await initializeInstrumentation({
  serviceName: 'atrim-platform-ui',
  otlpEndpoint: '...',
  configUrl: '/instrumentation.yaml' // Served by Vite from public/
})
```

**How it works:**
- **Development:** `http://localhost:5173/instrumentation.yaml`
- **Production:** `/instrumentation.yaml` (deployed with your app)
- Config is loaded once at initialization
- Pattern matching happens on every span creation

#### Remote Configuration (Enterprise)

For centralized management across environments, use a remote config server:

```typescript
const environment = import.meta.env.VITE_APP_ENV || 'production'
const configUrl = import.meta.env.VITE_CONFIG_URL || '/instrumentation.yaml'

await initializeInstrumentation({
  serviceName: 'atrim-platform-ui',
  otlpEndpoint: '...',
  configUrl // Can be static or remote URL
})
```

**Environment-specific configuration:**

```bash
# .env.development
VITE_CONFIG_URL=/instrumentation.yaml

# .env.staging
VITE_CONFIG_URL=https://config-staging.atrim.ai/instrumentation.yaml

# .env.production
VITE_CONFIG_URL=https://config.atrim.ai/instrumentation.yaml
```

**Benefits:**
- ✅ Update filtering rules without redeploying
- ✅ Centralized config management
- ✅ Different rules per environment
- ✅ Audit trail for config changes

**For a complete remote config server example, see:**
- `examples/remote-config/` - Config server implementation
- Includes Express server serving YAML files
- Environment-based routing
- Proper headers and caching

---

## Architecture

### Directory Structure

```
src/
├── instrumentation/
│   └── init.ts                  # OTel initialization
├── hooks/
│   ├── useTraceSpan.ts          # Tracing hooks
│   └── usePerformance.ts        # Performance hooks
├── components/
│   ├── ErrorBoundary.tsx        # Error tracking
│   └── TracedButton.tsx         # Traced interactions
├── pages/
│   ├── HomePage.tsx
│   ├── DashboardPage.tsx
│   └── SettingsPage.tsx
├── App.tsx                      # Router + nav tracking
└── main.tsx                     # Entry point
```

### Tracing Patterns

#### 1. Component Lifecycle Tracking

```tsx
import { useComponentTrace } from '../hooks/useTraceSpan'

function MyComponent() {
  const { startSpan, endSpan } = useComponentTrace('MyComponent')

  useEffect(() => {
    const span = startSpan('mount')
    span.setAttribute('view', 'overview')

    return () => endSpan(span)
  }, [])

  return <div>...</div>
}
```

#### 2. Data Fetching

```tsx
import { useTraceSpan } from '../hooks/useTraceSpan'

function UserList() {
  const traceOperation = useTraceSpan('UserList.loadUsers')

  const loadUsers = async () => {
    return traceOperation(async (span) => {
      span.setAttribute('page', currentPage)

      const users = await fetchUsers()
      span.setAttribute('users.count', users.length)

      return users
    })
  }

  useEffect(() => {
    loadUsers()
  }, [])
}
```

#### 3. User Interactions

```tsx
import { TracedButton } from '../components/TracedButton'

function Checkout() {
  const handleCheckout = async () => {
    // This click will be automatically traced
    await processCheckout()
  }

  return (
    <TracedButton onClick={handleCheckout} actionName="checkout">
      Complete Purchase
    </TracedButton>
  )
}
```

#### 4. React Router Navigation

```tsx
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { trace } from '@opentelemetry/api'
import { annotateNavigation } from '@atrim/instrument-web'

function NavigationTracker() {
  const location = useLocation()
  const tracer = trace.getTracer('atrim-platform-ui')

  useEffect(() => {
    const span = tracer.startSpan('navigation.route-change')
    annotateNavigation(span, {
      to: location.pathname,
      type: 'client-side'
    })
    span.setStatus({ code: 1 })
    span.end()
  }, [location])

  return null
}
```

---

## Integration with Atrim Platform

### Recommended Implementation Order

1. **Start Simple** - Add basic initialization only
   ```typescript
   await initializeInstrumentation({
     serviceName: 'atrim-platform-ui'
   })
   ```

2. **Add Error Boundary** - Catch and trace errors
   ```tsx
   <ErrorBoundary>
     <App />
   </ErrorBoundary>
   ```

3. **Trace Critical Paths** - Add spans to important operations
   - User authentication
   - Data loading (traces, metrics, incidents)
   - Search operations
   - Report generation

4. **Add Pattern Filtering** - Reduce noise
   - Filter out health checks
   - Filter out static assets
   - Focus on user actions

5. **Monitor Performance** - Add render tracking
   - Use `useRenderPerformance()` on heavy components
   - Track data fetching with `useTraceSpan()`

### Example: Atrim Trace Viewer Component

```tsx
import { useTraceSpan } from '../hooks/useTraceSpan'
import { useRenderPerformance } from '../hooks/usePerformance'

function TraceViewer({ traceId }: { traceId: string }) {
  useRenderPerformance('TraceViewer')

  const traceLoadTrace = useTraceSpan('TraceViewer.loadTrace')
  const [trace, setTrace] = useState(null)

  const loadTrace = async () => {
    return traceLoadTrace(async (span) => {
      span.setAttribute('trace.id', traceId)

      const response = await fetch(`/api/traces/${traceId}`)
      const data = await response.json()

      span.setAttribute('trace.span_count', data.spans.length)
      span.setAttribute('trace.duration_ms', data.duration)

      setTrace(data)
      return data
    })
  }

  useEffect(() => {
    loadTrace()
  }, [traceId])

  return <div>...</div>
}
```

### Example: Atrim Search Component

```tsx
import { useTraceSpan } from '../hooks/useTraceSpan'
import { useInteractionTracking } from '../hooks/usePerformance'

function TraceSearch() {
  const traceSearch = useTraceSpan('TraceSearch.search')
  const trackInteraction = useInteractionTracking('TraceSearch')

  const handleSearch = async (query: string) => {
    trackInteraction('search-initiated', {
      'search.query': query,
      'search.type': 'trace'
    })

    return traceSearch(async (span) => {
      span.setAttribute('search.query', query)

      const results = await searchTraces(query)
      span.setAttribute('search.results_count', results.length)

      return results
    })
  }

  return <SearchBar onSearch={handleSearch} />
}
```

---

## CORS Configuration for Atrim Collector

Add CORS configuration to your OpenTelemetry collector:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "http://localhost:3000"     # Development
            - "https://app.atrim.ai"      # Production
          allowed_headers:
            - "*"
          max_age: 7200
```

---

## Environment Variables

### Development (`.env.local`)

```bash
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
VITE_OTEL_SERVICE_NAME=atrim-platform-ui
VITE_APP_VERSION=dev
```

### Production (CI/CD)

```bash
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.atrim.ai/v1/traces
VITE_OTEL_SERVICE_NAME=atrim-platform-ui
VITE_APP_VERSION=$CI_COMMIT_TAG
```

---

## Files to Copy to Atrim Platform

### Essential (Required)

1. **`src/instrumentation/init.ts`** - Initialization logic
2. **`src/main.tsx`** - Updated entry point (initialize before React)

### Recommended

3. **`src/hooks/useTraceSpan.ts`** - Tracing hooks
4. **`src/hooks/usePerformance.ts`** - Performance hooks
5. **`src/components/ErrorBoundary.tsx`** - Error tracking

### Optional

6. **`src/components/TracedButton.tsx`** - Example traced component
7. **`public/instrumentation.yaml`** - Pattern filtering config

---

## Best Practices for Atrim Platform

### 1. Trace High-Value Operations

Focus on user-critical paths:
- ✅ Trace search operations
- ✅ Trace data loading (traces, metrics, incidents)
- ✅ Trace user authentication
- ✅ Trace report generation
- ❌ Don't trace every render
- ❌ Don't trace static content loads

### 2. Use Meaningful Span Names

```typescript
// Good
'TraceViewer.loadTrace'
'IncidentList.searchIncidents'
'Dashboard.refreshMetrics'

// Bad
'load'
'fetch'
'click'
```

### 3. Add Contextual Attributes

```typescript
span.setAttribute('user.id', userId)
span.setAttribute('trace.id', traceId)
span.setAttribute('search.query', query)
span.setAttribute('results.count', results.length)
```

### 4. Handle Errors Gracefully

```typescript
try {
  await operation()
  span.setStatus({ code: 1 }) // OK
} catch (error) {
  span.recordException(error)
  span.setStatus({ code: 2 }) // ERROR
  // Still throw to preserve app behavior
  throw error
}
```

### 5. Use Pattern Filtering

Reduce noise with `instrumentation.yaml`:

```yaml
instrument_patterns:
  - pattern: "^TraceViewer\\."
  - pattern: "^IncidentList\\."
  - pattern: "^Dashboard\\."
  - pattern: "^HTTP (GET|POST) /api/"

ignore_patterns:
  - pattern: "^HTTP GET /health"
  - pattern: "^HTTP.*\\.js$"
  - pattern: "^HTTP.*\\.css$"
```

---

## Advanced Patterns

### Tracing React Query / SWR

If using React Query:

```typescript
import { useQuery } from '@tanstack/react-query'
import { useTraceSpan } from '../hooks/useTraceSpan'

function useTracedQuery(queryKey: string[], queryFn: () => Promise<any>) {
  const traceOperation = useTraceSpan(`Query.${queryKey.join('.')}`)

  return useQuery({
    queryKey,
    queryFn: () => traceOperation(async (span) => {
      span.setAttribute('query.key', queryKey.join('.'))

      const result = await queryFn()
      span.setAttribute('query.cached', false)

      return result
    })
  })
}
```

### Tracing Form Submissions

```typescript
import { useTraceSpan } from '../hooks/useTraceSpan'

function CreateIncidentForm() {
  const traceOperation = useTraceSpan('IncidentForm.submit')

  const handleSubmit = async (formData: FormData) => {
    return traceOperation(async (span) => {
      span.setAttribute('incident.title', formData.title)
      span.setAttribute('incident.severity', formData.severity)

      const incident = await createIncident(formData)
      span.setAttribute('incident.id', incident.id)

      return incident
    })
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### Tracing WebSocket Connections

```typescript
import { trace } from '@opentelemetry/api'

function useTracedWebSocket(url: string) {
  const tracer = trace.getTracer('atrim-platform-ui')

  useEffect(() => {
    const span = tracer.startSpan('WebSocket.connect')
    span.setAttribute('websocket.url', url)

    const ws = new WebSocket(url)

    ws.onopen = () => {
      span.setAttribute('websocket.connected', true)
      span.setStatus({ code: 1 })
      span.end()
    }

    ws.onerror = (error) => {
      span.recordException(new Error('WebSocket error'))
      span.setStatus({ code: 2 })
      span.end()
    }

    return () => {
      ws.close()
    }
  }, [url])
}
```

---

## Production Deployment

### 1. Configure Collector Endpoint

Set the OTLP endpoint in your deployment environment:

```bash
# Vercel/Netlify/etc.
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.atrim.ai/v1/traces
```

### 2. Enable CORS on Collector

Ensure your collector accepts requests from your domain:

```yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins:
            - "https://app.atrim.ai"
```

### 3. Add CSP Headers

Update Content-Security-Policy:

```html
<meta http-equiv="Content-Security-Policy"
      content="connect-src 'self' https://otel.atrim.ai">
```

### 4. Monitor Bundle Size

Check that instrumentation doesn't bloat your bundle:

```bash
npm run build -- --analyze
```

Target: <50KB additional size

---

## Troubleshooting

### Issue: Traces not appearing

**Solution:**
1. Check collector is running and accessible
2. Verify CORS is configured
3. Check browser console for errors
4. Verify endpoint: `console.log(import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT)`

### Issue: Too many spans

**Solution:**
Use pattern filtering in `instrumentation.yaml` to reduce noise

### Issue: Performance impact

**Solution:**
1. Disable user interaction tracking if not needed
2. Use pattern filtering to reduce span volume
3. Sample traces at collector level

### Issue: CSP violations

**Solution:**
Add OTLP endpoint to `connect-src` directive

---

## Example Traces

After instrumenting, you'll see traces like:

```
documentLoad (500ms)
  └─ DOMContentLoaded (200ms)
  └─ loadEventEnd (50ms)

navigation.route-change (1ms)
  ├─ route.pathname: /dashboard
  └─ route.type: client-side

Dashboard.loadMetrics (523ms)
  └─ HTTP GET /api/metrics (502ms)
      ├─ http.status_code: 200
      ├─ metrics.count: 42
      └─ response.size: 15KB

UserProfile.loadUser (234ms)
  └─ HTTP GET /api/users/123 (210ms)
      ├─ http.status_code: 200
      ├─ user.id: 123
      └─ user.role: admin
```

---

## Support

- [GitHub Issues](https://github.com/atrim-ai/instrumentation/issues)
- [Full Documentation](../../packages/web/README.md)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/languages/js/)

---

## License

MIT License - see [LICENSE](../../LICENSE)
