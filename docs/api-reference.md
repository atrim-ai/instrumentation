# API Reference

Complete TypeScript API reference for `@atrim/instrumentation`.

## Main Entry Point

### `initializeInstrumentation()`

Initialize pattern-based instrumentation with configuration loading.

```typescript
function initializeInstrumentation(options?: ConfigLoaderOptions): Promise<void>
```

**Parameters:**
- `options` (optional): Configuration options

**Returns:** `Promise<void>`

**Throws:** Error if configuration is invalid or cannot be loaded

**Example:**

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

// Zero-config (looks for ./instrumentation.yaml)
await initializeInstrumentation()

// With options
await initializeInstrumentation({
  configPath: './config/custom.yaml',
  cacheTimeout: 300_000
})
```

---

### `isInitialized()`

Check if instrumentation has been initialized.

```typescript
function isInitialized(): boolean
```

**Returns:** `true` if initialized, `false` otherwise

**Example:**

```typescript
import { isInitialized } from '@atrim/instrumentation'

if (!isInitialized()) {
  await initializeInstrumentation()
}
```

---

### `resetInitialization()`

Reset initialization state (useful for testing).

```typescript
function resetInitialization(): void
```

**Example:**

```typescript
import { resetInitialization } from '@atrim/instrumentation'

// In tests
beforeEach(() => {
  resetInitialization()
})
```

---

## Configuration Types

### `ConfigLoaderOptions`

Options for loading configuration.

```typescript
interface ConfigLoaderOptions {
  configPath?: string           // Path to local YAML file
  configUrl?: string            // URL to remote YAML file
  config?: InstrumentationConfig // Explicit config object
  cacheTimeout?: number         // Cache timeout in ms (default: 300000)
}
```

**Examples:**

```typescript
// Local file
{ configPath: './my-config.yaml' }

// Remote URL
{ configUrl: 'https://config.company.com/instrumentation.yaml' }

// Programmatic
{ config: { version: '1.0', /* ... */ } }

// With custom cache timeout
{ configUrl: 'https://...', cacheTimeout: 600_000 } // 10 minutes
```

---

### `InstrumentationConfig`

Full configuration schema.

```typescript
interface InstrumentationConfig {
  version: string
  instrumentation: {
    enabled: boolean
    description?: string
    instrument_patterns: PatternConfig[]
    ignore_patterns: PatternConfig[]
  }
  effect?: {
    auto_extract_metadata: boolean
  }
}
```

---

### `PatternConfig`

Pattern configuration for matching spans.

```typescript
interface PatternConfig {
  pattern: string       // Regex pattern
  enabled?: boolean     // Enable/disable (default: true)
  description?: string  // Human-readable description
}
```

**Example:**

```typescript
const pattern: PatternConfig = {
  pattern: '^app\\.',
  enabled: true,
  description: 'Application operations'
}
```

---

## Pattern Matching

### `shouldInstrumentSpan()`

Check if a span should be instrumented based on patterns.

```typescript
function shouldInstrumentSpan(spanName: string): boolean
```

**Parameters:**
- `spanName`: The name of the span to check

**Returns:** `true` if span should be created, `false` if it should be dropped

**Matching Logic:**
1. Check ignore patterns (highest priority)
2. Check instrument patterns
3. Default: fail-open (return `true`)

**Example:**

```typescript
import { shouldInstrumentSpan } from '@atrim/instrumentation'

if (shouldInstrumentSpan('app.operation')) {
  const span = tracer.startSpan('app.operation')
  // ... use span
  span.end()
}
```

---

### `PatternMatcher`

Class for pattern matching with compiled regex caching.

```typescript
class PatternMatcher {
  constructor(config: InstrumentationConfig)

  shouldInstrument(spanName: string): boolean

  getStats(): {
    enabled: boolean
    ignorePatternCount: number
    instrumentPatternCount: number
  }
}
```

**Example:**

```typescript
import { PatternMatcher } from '@atrim/instrumentation'

const matcher = new PatternMatcher(config)

// Check if span should be instrumented
if (matcher.shouldInstrument('app.operation')) {
  // Create span
}

// Get statistics
const stats = matcher.getStats()
console.log(`Enabled: ${stats.enabled}`)
console.log(`Patterns: ${stats.instrumentPatternCount} instrument, ${stats.ignorePatternCount} ignore`)
```

---

### `getPatternMatcher()`

Get the global pattern matcher instance.

```typescript
function getPatternMatcher(): PatternMatcher | null
```

**Returns:** Global `PatternMatcher` instance or `null` if not initialized

**Example:**

```typescript
import { getPatternMatcher } from '@atrim/instrumentation'

const matcher = getPatternMatcher()
if (matcher) {
  const stats = matcher.getStats()
  console.log('Pattern matcher stats:', stats)
}
```

---

## Span Processor

### `PatternSpanProcessor`

OpenTelemetry SpanProcessor that filters spans based on patterns.

```typescript
class PatternSpanProcessor implements SpanProcessor {
  constructor(
    config: InstrumentationConfig,
    wrappedProcessor: SpanProcessor
  )

  onStart(span: Span, parentContext: Context): void
  onEnd(span: ReadableSpan): void
  shutdown(): Promise<void>
  forceFlush(): Promise<void>
  getPatternMatcher(): PatternMatcher
}
```

**Example:**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PatternSpanProcessor } from '@atrim/instrumentation'

const exporter = new OTLPTraceExporter({ /* ... */ })
const batchProcessor = new BatchSpanProcessor(exporter)

// Wrap batch processor with pattern filtering
const patternProcessor = new PatternSpanProcessor(config, batchProcessor)

const sdk = new NodeSDK({
  spanProcessor: patternProcessor
})

sdk.start()
```

---

## Span Helpers

### `setSpanAttributes()`

Set multiple attributes on a span at once.

```typescript
function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean>
): void
```

**Example:**

```typescript
import { setSpanAttributes } from '@atrim/instrumentation'

setSpanAttributes(span, {
  'user.id': '123',
  'operation.type': 'create',
  'request.size': 1024
})
```

---

### `recordException()`

Record an exception on a span with optional context.

```typescript
function recordException(
  span: Span,
  error: Error,
  context?: Record<string, string | number | boolean>
): void
```

**Example:**

```typescript
import { recordException } from '@atrim/instrumentation'

try {
  await riskyOperation()
} catch (error) {
  recordException(span, error, {
    'error.context': 'user_operation',
    'error.recoverable': false
  })
}
```

---

### `markSpanSuccess()`

Mark a span as successful (OK status).

```typescript
function markSpanSuccess(span: Span): void
```

**Example:**

```typescript
import { markSpanSuccess } from '@atrim/instrumentation'

try {
  await operation()
  markSpanSuccess(span)
} catch (error) {
  // handle error
}
```

---

### `markSpanError()`

Mark a span as failed with an optional error message.

```typescript
function markSpanError(span: Span, message?: string): void
```

**Example:**

```typescript
import { markSpanError } from '@atrim/instrumentation'

try {
  await operation()
} catch (error) {
  markSpanError(span, 'Operation failed')
}
```

---

### `annotateHttpRequest()`

Add HTTP-specific attributes to a span.

```typescript
function annotateHttpRequest(
  span: Span,
  method: string,
  url: string,
  statusCode?: number
): void
```

**Behavior:**
- Sets `http.method`, `http.url`, `http.status_code` attributes
- If `statusCode >= 400`, marks span as error
- Otherwise, marks span as success

**Example:**

```typescript
import { annotateHttpRequest } from '@atrim/instrumentation'

const span = tracer.startSpan('http.client.request')
annotateHttpRequest(span, 'GET', '/api/users', 200)
span.end()
```

---

### `annotateDbQuery()`

Add database-specific attributes to a span.

```typescript
function annotateDbQuery(
  span: Span,
  system: string,
  statement: string,
  table?: string
): void
```

**Example:**

```typescript
import { annotateDbQuery } from '@atrim/instrumentation'

const span = tracer.startSpan('db.query')
annotateDbQuery(
  span,
  'postgresql',
  'SELECT * FROM users WHERE id = $1',
  'users'
)
span.end()
```

---

### `annotateCacheOperation()`

Add cache-specific attributes to a span.

```typescript
function annotateCacheOperation(
  span: Span,
  operation: 'get' | 'set' | 'delete' | 'clear',
  key: string,
  hit?: boolean
): void
```

**Example:**

```typescript
import { annotateCacheOperation } from '@atrim/instrumentation'

const span = tracer.startSpan('cache.get')
annotateCacheOperation(span, 'get', 'user:123', true) // cache hit
span.end()
```

---

## TypeScript Types

All types are exported from the main entry point:

```typescript
import type {
  InstrumentationConfig,
  PatternConfig,
  ConfigLoaderOptions
} from '@atrim/instrumentation'
```

### Full Type Definitions

```typescript
// Pattern configuration
export interface PatternConfig {
  pattern: string
  enabled?: boolean
  description?: string
}

// Full configuration
export interface InstrumentationConfig {
  version: string
  instrumentation: {
    enabled: boolean
    description?: string
    instrument_patterns: PatternConfig[]
    ignore_patterns: PatternConfig[]
  }
  effect?: {
    auto_extract_metadata: boolean
  }
}

// Config loader options
export interface ConfigLoaderOptions {
  configPath?: string
  configUrl?: string
  config?: InstrumentationConfig
  cacheTimeout?: number
}
```

---

## Error Handling

### Configuration Errors

**Invalid configuration:**

```typescript
try {
  await initializeInstrumentation({ config: invalidConfig })
} catch (error) {
  // Error: Invalid configuration: Expected boolean, received string at path "instrumentation.enabled"
}
```

**File not found:**

```typescript
try {
  await initializeInstrumentation({ configPath: './missing.yaml' })
} catch (error) {
  // Error: Failed to load config from file ./missing.yaml: ENOENT: no such file or directory
}
```

**Network errors:**

```typescript
try {
  await initializeInstrumentation({ configUrl: 'https://invalid-domain.com/config.yaml' })
} catch (error) {
  // Error: Failed to load config from URL: fetch failed
}
```

**Security errors:**

```typescript
try {
  await initializeInstrumentation({ configUrl: 'http://insecure.com/config.yaml' })
} catch (error) {
  // Error: Insecure protocol http:. Only https: are allowed for remote configs.
}
```

---

## Runtime Compatibility

### Node.js

```typescript
// Works with Node.js 18+ (native fetch)
import { initializeInstrumentation } from '@atrim/instrumentation'
await initializeInstrumentation()
```

### Bun

```typescript
// Works with Bun 1.0+
import { initializeInstrumentation } from '@atrim/instrumentation'
await initializeInstrumentation()
```

### Deno

```typescript
// Works with Deno 1.40+ (via npm specifiers)
import { initializeInstrumentation } from 'npm:@atrim/instrumentation'
await initializeInstrumentation()
```

---

## See Also

- [Getting Started Guide](./getting-started.md)
- [Configuration Reference](./configuration.md)
- [Examples](../examples/)
- [Migration Guide](./migration-guide.md)
