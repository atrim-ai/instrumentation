# @atrim/otel-ws-exporter

WebSocket-based OpenTelemetry trace exporter for browser and Node.js environments.

## Overview

`@atrim/otel-ws-exporter` provides a WebSocket transport for OpenTelemetry traces, enabling real-time trace streaming to backend services. This is particularly useful for:

- **WebContainer environments** where traditional HTTP export may not work
- **Browser applications** requiring real-time trace delivery
- **Low-latency tracing** scenarios where immediate delivery is important

The exporter includes automatic reconnection with exponential backoff, tenant isolation support, and configurable handshake protocols.

## Features

- ✅ **WebSocket transport** - Real-time trace streaming
- ✅ **Automatic reconnection** - Exponential backoff on disconnect
- ✅ **Tenant isolation** - Multi-tenant support with tenant ID
- ✅ **Standard compliance** - Implements OpenTelemetry `SpanExporter` interface
- ✅ **Browser & Node.js** - Works in both environments
- ✅ **TypeScript** - Full TypeScript support with type definitions

## Installation

```bash
pnpm add @atrim/otel-ws-exporter
# or
npm install @atrim/otel-ws-exporter
# or
yarn add @atrim/otel-ws-exporter
```

## Quick Start

### Browser (with WebTracerProvider)

```typescript
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { WebSocketTraceExporter } from '@atrim/otel-ws-exporter'

// Create exporter
const exporter = new WebSocketTraceExporter({
  url: 'wss://ui.atrim.ai/ws/traces',
  tenantId: 'my-tenant-123',
})

// Create provider and add span processor
const provider = new WebTracerProvider()
provider.addSpanProcessor(new BatchSpanProcessor(exporter))
provider.register()

// Use tracing
const tracer = provider.getTracer('my-app')
const span = tracer.startSpan('operation')
span.end()
```

### Node.js

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { WebSocketTraceExporter } from '@atrim/otel-ws-exporter'

const exporter = new WebSocketTraceExporter({
  url: 'ws://localhost:4321/ws/traces',
  tenantId: 'my-tenant-123',
})

const provider = new NodeTracerProvider()
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
provider.register()
```

## Configuration

### WebSocketExporterConfig

```typescript
interface WebSocketExporterConfig {
  /**
   * WebSocket URL
   * @default 'ws://localhost:4321/ws/traces' (development)
   */
  url?: string

  /**
   * Tenant ID for isolation (REQUIRED)
   */
  tenantId: string

  /**
   * Connection configuration (optional)
   */
  connection?: {
    /** Enable automatic reconnection @default true */
    enableReconnect?: boolean

    /** Maximum reconnection attempts (0 = infinite) @default 5 */
    maxReconnectAttempts?: number

    /** Initial reconnection delay in ms @default 1000 */
    reconnectDelayMs?: number

    /** Maximum reconnection delay in ms @default 30000 */
    maxReconnectDelayMs?: number

    /** Connection timeout in ms @default 5000 */
    connectionTimeoutMs?: number

    /** Enable handshake protocol @default true */
    enableHandshake?: boolean
  }
}
```

### Environment Variables

The exporter supports environment variables for configuration:

**Node.js:**

```bash
ATRIM_WS_ENDPOINT=wss://ui.atrim.ai/ws/traces
ATRIM_TENANT_ID=my-tenant-123
```

**Browser (Vite):**

```bash
VITE_ATRIM_WS_ENDPOINT=wss://ui.atrim.ai/ws/traces
VITE_ATRIM_TENANT_ID=my-tenant-123
```

**Browser (runtime):**

```javascript
window.ATRIM_WS_ENDPOINT = 'wss://ui.atrim.ai/ws/traces'
```

## Advanced Usage

### Custom Reconnection Strategy

```typescript
import { WebSocketTraceExporter } from '@atrim/otel-ws-exporter'

const exporter = new WebSocketTraceExporter({
  url: 'wss://ui.atrim.ai/ws/traces',
  tenantId: 'my-tenant-123',
  connection: {
    enableReconnect: true,
    maxReconnectAttempts: 10, // Retry up to 10 times
    reconnectDelayMs: 2000, // Start with 2 second delay
    maxReconnectDelayMs: 60000, // Max delay of 1 minute
  },
})
```

### Disable Handshake (for backends that don't require it)

```typescript
const exporter = new WebSocketTraceExporter({
  url: 'ws://localhost:8080/traces',
  tenantId: 'my-tenant-123',
  connection: {
    enableHandshake: false, // Skip init-request/init-response
  },
})
```

### Factory Function

```typescript
import { createWebSocketTraceExporter } from '@atrim/otel-ws-exporter'

const exporter = createWebSocketTraceExporter({
  url: 'wss://ui.atrim.ai/ws/traces',
  tenantId: 'my-tenant-123',
})
```

## Message Format

The exporter sends traces in Atrim's WebSocket message format:

```json
{
  "tenantId": "my-tenant-123",
  "traces": {
    "resourceSpans": [
      // OTLP JSON format
    ]
  }
}
```

## Integration with @atrim/instrument-web

The exporter works seamlessly with `@atrim/instrument-web`:

```typescript
import { initializeSdk } from '@atrim/instrument-web'
import { WebSocketTraceExporter } from '@atrim/otel-ws-exporter'

await initializeSdk({
  serviceName: 'my-app',
  exporter: new WebSocketTraceExporter({
    url: 'wss://ui.atrim.ai/ws/traces',
    tenantId: 'my-tenant-123',
  }),
})
```

## API Reference

### Classes

#### `WebSocketTraceExporter`

Implements `SpanExporter` interface for WebSocket-based trace export.

**Methods:**

- `export(spans, resultCallback)` - Export spans via WebSocket
- `shutdown()` - Close WebSocket connection and cleanup
- `forceFlush()` - No-op for WebSocket (sends immediately)

#### `WebSocketTransport`

Implements `IExporterTransport` for WebSocket communication.

**Methods:**

- `send(data, timeout)` - Send OTLP data via WebSocket
- `shutdown()` - Close WebSocket connection

#### `WebSocketConnection`

Manages WebSocket lifecycle, handshake, and reconnection.

**Methods:**

- `connect()` - Establish WebSocket connection
- `send(data)` - Send string data through WebSocket
- `close()` - Close connection gracefully
- `getState()` - Get current connection state

### Utilities

#### `ExponentialBackoffStrategy`

Implements exponential backoff for reconnection attempts.

#### `formatAtrimMessage(tenantId, otlpData)`

Formats OTLP data in Atrim's WebSocket message format.

#### `isValidTenantId(tenantId)`

Validates tenant ID format.

## Development

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
pnpm test:coverage
```

### Type Check

```bash
pnpm typecheck
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/atrim-ai/instrumentation).

## Support

For questions and support, please [open an issue](https://github.com/atrim-ai/instrumentation/issues).
