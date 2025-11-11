# Multi-Service Example (3-Tier Architecture)

This example demonstrates distributed tracing with `@atrim/instrumentation` across a 3-tier application with context propagation between services.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Single Trace ID                          │
│                     (abc123-def456-ghi789)                       │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────┐   HTTP    ┌──────────────┐   HTTP    ┌──────────────┐
│   UI Service │  ──────►  │   Backend    │  ──────►  │  DB Service  │
│  (Frontend)  │           │   Service    │           │  (Database)  │
│   Port 3100  │           │   Port 3101  │           │   Port 3102  │
└──────────────┘           └──────────────┘           └──────────────┘
       │                          │                          │
       │ GET /users               │ GET /api/users           │ GET /query
       │                          │                          │
       │ Span: http.client.get    │ Span: http.server.get    │ Span: http.server.get
       │ Parent: none             │ Parent: http.client.get  │ Parent: http.server.get
       │                          │                          │
       │                          │ Span: app.users.list     │ Span: db.query
       │                          │ Parent: http.server.get  │ Parent: http.server.get
                                  │                          │
                                  │                          ▼
                                  │                    Returns data
                                  │
                                  ▼
                            Returns JSON
```

## What This Example Shows

- ✅ **Distributed tracing** across 3 services
- ✅ **W3C Trace Context propagation** via HTTP headers
- ✅ **Single trace ID** spanning all services
- ✅ **Parent-child span relationships** across service boundaries
- ✅ **NodeSDK auto-instrumentation** for HTTP calls
- ✅ **Pattern-based filtering** per service
- ✅ **Service-specific configuration** via YAML
- ✅ **Docker Compose** for easy setup

## Services

### 1. UI Service (Port 3100)
- Simple web frontend
- Makes HTTP requests to backend
- Auto-instrumented HTTP client spans
- Pattern: `^ui\.`

### 2. Backend Service (Port 3101)
- Express.js API
- Receives requests from UI
- Makes requests to DB service
- Pattern: `^app\.`, `^http\.server\.`

### 3. DB Service (Port 3102)
- Mock database service
- Simulates database queries
- Returns mock data
- Pattern: `^db\.`

## Prerequisites

1. Docker and Docker Compose installed
2. Or Node.js 18+ for manual setup

## Quick Start with Docker Compose

```bash
# Start all services + OpenTelemetry collector
cd examples/multi-service
docker-compose up

# Services will be available at:
# - UI:         http://localhost:3100
# - Backend:    http://localhost:3101
# - DB:         http://localhost:3102
# - Collector:  http://localhost:4318
```

## Manual Setup (Without Docker)

### Terminal 1: Start OpenTelemetry Collector

```bash
docker run -p 4318:4318 -p 4317:4317 otel/opentelemetry-collector
```

### Terminal 2: Start DB Service

```bash
cd examples/multi-service/db-service
pnpm install
pnpm start
# Listening on http://localhost:3102
```

### Terminal 3: Start Backend Service

```bash
cd examples/multi-service/backend-service
pnpm install
pnpm start
# Listening on http://localhost:3101
```

### Terminal 4: Start UI Service

```bash
cd examples/multi-service/ui-service
pnpm install
pnpm start
# Listening on http://localhost:3100
```

### Terminal 5: Make a Request

```bash
# This will create a trace spanning all 3 services
curl http://localhost:3100/users
```

## Testing Context Propagation

### 1. Make a Request Through UI

```bash
curl http://localhost:3100/users
```

This creates a trace with the following structure:

```
Trace ID: abc123-def456-ghi789
│
├─ Span: http.client.get [UI → Backend]
│  Service: ui-service
│  Parent: none (root span)
│  │
│  └─ Span: http.server.get [Backend receives]
│     Service: backend-service
│     Parent: http.client.get
│     │
│     ├─ Span: app.users.list [Backend business logic]
│     │  Service: backend-service
│     │  Parent: http.server.get
│     │
│     └─ Span: http.client.get [Backend → DB]
│        Service: backend-service
│        Parent: http.server.get
│        │
│        └─ Span: http.server.get [DB receives]
│           Service: db-service
│           Parent: http.client.get (from backend)
│           │
│           └─ Span: db.query [DB operation]
│              Service: db-service
│              Parent: http.server.get
```

### 2. Verify in OpenTelemetry Collector

Check the collector logs or use a trace visualization tool:

```bash
docker logs <collector-container-id> | grep trace
```

You should see:
- **Single trace ID** across all services
- **Proper parent-child relationships**
- **Service tags** identifying each service
- **W3C traceparent headers** in HTTP calls

### 3. Verify Context Propagation Headers

Check that W3C Trace Context headers are propagated:

```bash
# From UI to Backend
traceparent: 00-<trace-id>-<span-id>-01

# From Backend to DB (same trace-id, different span-id)
traceparent: 00-<trace-id>-<span-id>-01
```

## Configuration

Each service has its own `instrumentation.yaml`:

### UI Service
```yaml
instrument_patterns:
  - pattern: "^ui\\."
  - pattern: "^GET "
  - pattern: "^POST "
```

### Backend Service
```yaml
instrument_patterns:
  - pattern: "^app\\."
  - pattern: "^http\\.server\\."
ignore_patterns:
  - pattern: "^GET /health"
```

### DB Service
```yaml
instrument_patterns:
  - pattern: "^db\\."
  - pattern: "^http\\.server\\."
```

## Trace Visualization

To visualize traces, use:

1. **Jaeger** (recommended for development)
```bash
docker run -d -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
# Visit http://localhost:16686
```

2. **Zipkin**
```bash
docker run -d -p 9411:9411 openzipkin/zipkin
# Visit http://localhost:9411
```

3. **Grafana Tempo** (for production)

## Expected Trace Output

When you make a request to `http://localhost:3100/users`, you should see:

```json
{
  "traceId": "abc123def456ghi789",
  "spans": [
    {
      "spanId": "span-001",
      "name": "GET",
      "service": "ui-service",
      "parentSpanId": null,
      "attributes": {
        "http.method": "GET",
        "http.url": "http://localhost:3101/api/users"
      }
    },
    {
      "spanId": "span-002",
      "name": "GET /api/users",
      "service": "backend-service",
      "parentSpanId": "span-001",
      "attributes": {
        "http.method": "GET",
        "http.route": "/api/users"
      }
    },
    {
      "spanId": "span-003",
      "name": "app.users.list",
      "service": "backend-service",
      "parentSpanId": "span-002",
      "attributes": {
        "operation.type": "list"
      }
    },
    {
      "spanId": "span-004",
      "name": "GET",
      "service": "backend-service",
      "parentSpanId": "span-002",
      "attributes": {
        "http.method": "GET",
        "http.url": "http://localhost:3102/query"
      }
    },
    {
      "spanId": "span-005",
      "name": "GET /query",
      "service": "db-service",
      "parentSpanId": "span-004",
      "attributes": {
        "http.method": "GET"
      }
    },
    {
      "spanId": "span-006",
      "name": "db.query",
      "service": "db-service",
      "parentSpanId": "span-005",
      "attributes": {
        "db.table": "users",
        "db.operation": "SELECT"
      }
    }
  ]
}
```

## Key Observations

### ✅ Context Propagation Works
- Trace ID is the same across all services
- Parent-child relationships preserved
- W3C Trace Context headers propagated automatically

### ✅ No Manual Configuration Needed
- NodeSDK auto-instrumentation handles propagation
- OpenTelemetry Context API manages thread-local context
- Works seamlessly with `@atrim/instrumentation`

### ✅ Pattern Filtering Per Service
- Each service can have different patterns
- Filtering happens independently
- Global trace ID maintained

## Troubleshooting

### Spans not showing parent-child relationships

Check that:
1. NodeSDK is initialized before making HTTP requests
2. OpenTelemetry Context propagation is enabled (default)
3. HTTP headers include `traceparent`

```bash
# Debug: Check headers
curl -v http://localhost:3100/users
# Should see traceparent in request headers
```

### Trace ID different across services

This means context propagation failed. Check:
1. W3C Trace Context headers are being sent
2. NodeSDK auto-instrumentation is enabled
3. No manual span creation breaking context

### Services can't communicate

Check:
1. All services are running
2. Ports are not blocked (3100, 3101, 3102)
3. Docker network is configured correctly (if using Docker)

## Customization

### Add More Services

Create a new service directory:

```bash
mkdir payment-service
cd payment-service
# Copy structure from backend-service
# Update instrumentation.yaml patterns
# Update port number
```

### Change Patterns

Edit `instrumentation.yaml` in each service to customize filtering:

```yaml
instrument_patterns:
  - pattern: "^payment\\."  # Payment service operations
```

### Add Effect-TS Integration

Replace standard initialization with Effect layer:

```typescript
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

const program = Effect.gen(function* () {
  // Effect operations will continue the existing trace!
  yield* Effect.log("Processing")
}).pipe(
  Effect.withSpan("app.process"),
  Effect.provide(EffectInstrumentationLive)
)
```

## Performance

This setup demonstrates production-ready patterns:
- ✅ Async processing (no blocking)
- ✅ Efficient batching (BatchSpanProcessor)
- ✅ Pattern-based filtering (reduces noise)
- ✅ Context propagation (minimal overhead)

Expected overhead: **< 5%** with default configuration

## Next Steps

- Try the [Effect-TS example](../effect-ts/) for Effect integration
- See [documentation](../../docs/getting-started.md) for advanced features
- Read about [context propagation](../../docs/context-propagation.md)

## Related

- [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/instrumentation/js/context/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Distributed Tracing Best Practices](https://opentelemetry.io/docs/concepts/signals/traces/)
