# Express Example

This example demonstrates using `@atrim/instrumentation` with Express.js, including NodeSDK auto-instrumentation for HTTP requests.

## What This Example Shows

- ✅ Express.js integration
- ✅ NodeSDK auto-instrumentation (HTTP and Express)
- ✅ Pattern-based span filtering for HTTP endpoints
- ✅ Custom application spans within request handlers
- ✅ Context propagation (auto-instrumentation → custom spans)
- ✅ Using span helpers in HTTP handlers
- ✅ Ignoring health check and metrics endpoints

## Prerequisites

1. Node.js 18+ installed
2. OpenTelemetry collector running

## Running the Collector

```bash
docker run -p 4318:4318 -p 4317:4317 otel/opentelemetry-collector
```

## Running the Example

```bash
# Install dependencies (from repository root)
pnpm install

# Run the example
cd examples/express
pnpm start
```

The server will start on `http://localhost:3000`

**Open the UI:** Visit http://localhost:3000 in your browser for an interactive demo!

## Testing the Endpoints

### Using the Web UI

Open http://localhost:3000 in your browser to:
- View the list of users (generates traces)
- Add new users (generates traces)
- Test filtered endpoints (/health, /metrics)
- See real-time trace information

### Using curl

```bash
# Users list (instrumented)
curl http://localhost:3000/users

# Get user by ID (instrumented)
curl http://localhost:3000/users/1

# Create user (instrumented)
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"David","email":"david@example.com"}'

# Health check (DROPPED by ignore pattern)
curl http://localhost:3000/health

# Metrics (DROPPED by ignore pattern)
curl http://localhost:3000/metrics
```

## Trace Structure

For a request to `GET /users`:

```
GET /users (auto-instrumented by NodeSDK)
└── app.users.list (custom application span)
    └── app.db.query (database operation)
```

**Key Points:**
- NodeSDK creates the root HTTP span automatically
- Custom `app.*` spans are created within handlers
- Context is automatically propagated from HTTP span to custom spans
- Database operations create child spans with proper parent-child relationships

## Spans Created

### Instrumented (exported):
- `GET /users` - Auto-instrumented HTTP request
- `GET /users/:id` - Auto-instrumented HTTP request
- `POST /users` - Auto-instrumented HTTP request
- `app.users.list` - Custom application span
- `app.users.get` - Custom application span
- `app.users.create` - Custom application span
- `app.db.query` - Database query spans

### Dropped (not exported):
- `GET /health` - Matches ignore pattern
- `GET /metrics` - Matches ignore pattern
- `GET /favicon.ico` - Matches ignore pattern

## Configuration

See `instrumentation.yaml`:

```yaml
instrument_patterns:
  - pattern: "^app\\."      # Custom application spans
  - pattern: "^GET /"       # HTTP GET requests
  - pattern: "^POST /"      # HTTP POST requests

ignore_patterns:
  - pattern: "^GET /health"     # Health checks
  - pattern: "^GET /metrics"    # Metrics endpoint
  - pattern: "^GET /favicon.ico" # Browser requests
```

## Auto-Instrumentation

This example uses NodeSDK auto-instrumentation which automatically creates spans for:

- **HTTP requests** - Incoming requests to Express server
- **Express middleware** - Express routing and middleware
- **HTTP client requests** - Outgoing HTTP calls (if any)

These auto-instrumented spans work seamlessly with `@atrim/instrumentation` pattern filtering.

## Context Propagation

The example demonstrates context propagation:

1. **NodeSDK creates root HTTP span** (e.g., `GET /users`)
2. **Custom spans become children** (e.g., `app.users.list`)
3. **Database spans become grandchildren** (e.g., `app.db.query`)

This creates a proper trace hierarchy:

```
Trace: abc123-def456
│
├─ Span: GET /users [root]
│  ├─ Span: app.users.list
│  │  └─ Span: app.db.query
```

## Customization

### Add More Routes

```typescript
app.get('/api/products', async (req, res) => {
  await tracer.startActiveSpan('app.products.list', async (span) => {
    // Your logic...
    span.end()
  })
})
```

Update `instrumentation.yaml`:

```yaml
instrument_patterns:
  - pattern: "^GET /api/"  # Match all /api/ routes
```

### Custom Attributes

```typescript
const activeSpan = trace.getActiveSpan()
if (activeSpan) {
  setSpanAttributes(activeSpan, {
    'custom.tenant.id': tenantId,
    'custom.api.version': 'v1'
  })
}
```

### Disable Auto-Instrumentation

If you don't want auto-instrumentation, remove it from NodeSDK:

```typescript
const sdk = new NodeSDK({
  spanProcessor: patternProcessor,
  serviceName: 'express-example'
  // No instrumentations array
})
```

Then create spans manually in each handler.

## Next Steps

- Try the [Vanilla example](../vanilla/) for non-framework usage
- See [Effect-TS example](../effect-ts/) for Effect integration
- Check [documentation](../../docs/getting-started.md) for more features
