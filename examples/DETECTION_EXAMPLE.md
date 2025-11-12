# OpenTelemetry Detection Example

The `@atrim/instrumentation` library automatically detects if OpenTelemetry is already initialized in your application and gracefully adapts its behavior.

## Scenario 1: No Existing OpenTelemetry Setup

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

// Full initialization - sets up everything
await initializeInstrumentation({
  serviceName: 'my-service'
})
```

**Output:**
```
@atrim/instrumentation: SDK initialized successfully
  - Service: my-service v1.0.0
  - Pattern filtering: enabled
    - Instrument patterns: 8
    - Ignore patterns: 4
  - Auto-instrumentation: enabled
  - OTLP endpoint: http://localhost:4318/v1/traces
```

**What happens:**
- ✅ Creates OTLP exporter
- ✅ Initializes NodeSDK
- ✅ Sets up auto-instrumentations (Express, HTTP, etc.)
- ✅ Configures pattern-based filtering
- ✅ Registers shutdown handlers

---

## Scenario 2: Existing OpenTelemetry Setup

```typescript
// User's existing setup
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  serviceName: 'my-service',
  traceExporter: new OTLPTraceExporter({
    url: 'https://my-custom-endpoint.com/v1/traces'
  })
})
sdk.start()

// Later, they add @atrim/instrumentation
import { initializeInstrumentation } from '@atrim/instrumentation'

// Smart detection - only sets up pattern filtering
await initializeInstrumentation()
```

**Output:**
```
@atrim/instrumentation: Detected existing OpenTelemetry initialization.
  - Skipping NodeSDK setup
  - Setting up pattern-based filtering only

@atrim/instrumentation: Pattern filtering initialized
  ⚠️  Note: Pattern filtering will only work with manual spans
  ⚠️  Auto-instrumentation must be configured separately
```

**What happens:**
- ✅ Detects existing TracerProvider
- ✅ Skips NodeSDK initialization (avoids conflicts)
- ✅ Only sets up pattern matching for manual spans
- ⚠️ User's existing OTLP endpoint is preserved
- ⚠️ User's existing configuration is not modified

---

## Scenario 3: Multiple Calls to initializeInstrumentation()

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

// First call - full initialization
await initializeInstrumentation({ serviceName: 'service-1' })

// Second call - returns existing instance
await initializeInstrumentation({ serviceName: 'service-2' })
```

**Output:**
```
@atrim/instrumentation: SDK initialized successfully
  - Service: service-1
  ...

@atrim/instrumentation: SDK already initialized by this library. Returning existing instance.
```

**What happens:**
- ✅ First call initializes everything
- ✅ Second call returns the same SDK instance
- ✅ No duplicate initialization
- ⚠️ Second call's options are ignored

---

## How Detection Works

The library checks if a TracerProvider has been registered globally:

```typescript
function isTracingAlreadyInitialized(): boolean {
  try {
    const provider = trace.getTracerProvider()
    // Check if the provider has been explicitly set
    // (not the default NoopTracerProvider)
    return (provider as any).resource !== undefined
  } catch {
    return false
  }
}
```

This detects:
- ✅ NodeSDK initialization
- ✅ Manual TracerProvider registration
- ✅ Other OpenTelemetry libraries
- ✅ Framework-specific OpenTelemetry integrations

---

## Best Practices

### 1. For New Projects
Just use `@atrim/instrumentation`:

```typescript
await initializeInstrumentation()
```

### 2. For Existing Projects with OpenTelemetry
Add `@atrim/instrumentation` to get pattern-based filtering:

```typescript
// Your existing OpenTelemetry setup stays the same
const sdk = new NodeSDK({...})
sdk.start()

// Add pattern filtering
await initializeInstrumentation()
// Now you can use instrumentation.yaml for filtering!
```

### 3. For Migration
Gradually migrate by letting the library take over:

```typescript
// Step 1: Keep your setup, add pattern filtering
// const sdk = new NodeSDK({...})  // Comment out
// sdk.start()                     // Comment out
await initializeInstrumentation() // Replaces your setup

// Step 2: Remove your old setup completely
```

---

## Benefits of Detection

1. **Zero Breaking Changes** - Doesn't interfere with existing setups
2. **Gradual Migration** - Add pattern filtering without rewriting code
3. **Framework Compatibility** - Works with any OpenTelemetry setup
4. **Safety** - Prevents duplicate initialization errors
5. **Flexibility** - Users keep full control of their configuration
