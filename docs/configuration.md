# Configuration Reference

Complete reference for `instrumentation.yaml` configuration.

## Schema Overview

```yaml
version: string              # Config schema version (currently "1.0")

instrumentation:
  enabled: boolean           # Global enable/disable
  description?: string       # Optional description

  instrument_patterns:       # Spans to create
    - pattern: string        # Regex pattern
      enabled?: boolean      # Enable/disable this pattern (default: true)
      description?: string   # Optional description

  ignore_patterns:           # Spans to drop (takes precedence)
    - pattern: string        # Regex pattern
      description?: string   # Optional description

effect?:                     # Optional Effect-TS config
  auto_extract_metadata: boolean
```

## Field Details

### `version`

**Type:** `string`
**Required:** Yes
**Example:** `"1.0"`

The configuration schema version. Currently only `"1.0"` is supported.

```yaml
version: "1.0"
```

---

### `instrumentation.enabled`

**Type:** `boolean`
**Required:** Yes
**Default:** `true`

Global enable/disable flag for instrumentation. When `false`, all spans are dropped regardless of patterns.

```yaml
instrumentation:
  enabled: true  # Enable instrumentation
```

Use cases:
- Disable instrumentation in development: `enabled: false`
- Enable only in production: `enabled: true`

---

### `instrumentation.description`

**Type:** `string`
**Required:** No
**Example:** `"Production instrumentation config"`

Optional human-readable description of this configuration.

```yaml
instrumentation:
  enabled: true
  description: "Production config with health check filtering"
```

---

### `instrumentation.instrument_patterns`

**Type:** `array` of `PatternConfig`
**Required:** Yes (can be empty array)

List of regex patterns matching spans that should be created/exported.

**Pattern matching logic:**
1. Check `ignore_patterns` first (highest priority)
2. If no ignore match, check `instrument_patterns`
3. If no pattern matches, **fail-open** (create span anyway)

#### PatternConfig Fields

- **`pattern`** (string, required): Regular expression to match span names
- **`enabled`** (boolean, optional): Enable/disable this pattern (default: `true`)
- **`description`** (string, optional): Human-readable description

#### Examples

**Basic patterns:**

```yaml
instrument_patterns:
  # Match all spans starting with "app."
  - pattern: "^app\\."
    enabled: true
    description: "Application operations"

  # Match HTTP server operations
  - pattern: "^http\\.server\\."
    enabled: true
    description: "HTTP server requests"

  # Match database operations
  - pattern: "^db\\."
    enabled: true
    description: "Database queries"
```

**Advanced patterns:**

```yaml
instrument_patterns:
  # Match multiple prefixes with alternation
  - pattern: "^(app|api|service)\\."
    description: "Application layer operations"

  # Match specific operations
  - pattern: "\\.create$"
    description: "Create operations across all services"

  # Match with wildcards
  - pattern: "^user\\..*\\.important$"
    description: "Important user operations"
```

**Temporarily disable a pattern:**

```yaml
instrument_patterns:
  - pattern: "^app\\."
    enabled: true

  - pattern: "^experimental\\."
    enabled: false  # Disabled but kept in config
    description: "Experimental features (disabled)"
```

---

### `instrumentation.ignore_patterns`

**Type:** `array` of `PatternConfig`
**Required:** Yes (can be empty array)

List of regex patterns matching spans that should be **dropped** (not created/exported).

**⚠️ Important:** Ignore patterns take precedence over instrument patterns.

#### Examples

**Common ignore patterns:**

```yaml
ignore_patterns:
  # Health checks
  - pattern: "^health\\."
    description: "Health check endpoints"

  - pattern: "^/health$"
    description: "Health check HTTP requests"

  # Internal operations
  - pattern: "^internal\\."
    description: "Internal utility operations"

  # Test utilities
  - pattern: "^test\\."
    description: "Test utilities"

  # Metrics collection (prevent instrumentation loops)
  - pattern: "^metrics\\."
    description: "Metrics collection spans"
```

**Advanced ignore patterns:**

```yaml
ignore_patterns:
  # Ignore specific HTTP endpoints
  - pattern: "^GET /api/(health|readiness|liveness)$"
    description: "Kubernetes probes"

  # Ignore static assets
  - pattern: "\\.(css|js|png|jpg|svg|ico)$"
    description: "Static file requests"

  # Ignore spans matching multiple criteria
  - pattern: "^(test|debug|internal)\\."
    description: "Non-production operations"
```

---

### `effect.auto_extract_metadata`

**Type:** `boolean`
**Required:** No (only if using Effect-TS integration)
**Default:** `true`

> **⚠️ Not Implemented:** This configuration option is currently **not implemented**. The config flag is parsed but never consulted at runtime. Metadata extraction requires explicit function calls. See below for usage.

**Intended behavior (not yet implemented):** Automatically extract Effect-TS fiber metadata for all spans.

**Current behavior:** You must explicitly call `autoEnrichSpan()` or use `withAutoEnrichedSpan()`:

```typescript
import { autoEnrichSpan, withAutoEnrichedSpan } from '@atrim/instrument-node/effect'

// Option 1: Explicit call inside span
const operation = Effect.gen(function* () {
  yield* autoEnrichSpan()  // Adds fiber metadata to current span
  // ... your logic
}).pipe(Effect.withSpan('app.operation'))

// Option 2: Use convenience wrapper
const operation = withAutoEnrichedSpan('app.operation')(
  Effect.gen(function* () {
    // ... your logic (fiber metadata added automatically)
  })
)
```

**Available metadata when using explicit calls:**
- `effect.fiber.id` - Unique fiber thread name
- `effect.fiber.status` - Current fiber status
- `effect.operation.root` / `effect.operation.nested` - Operation hierarchy
- `effect.parent.span.id`, `effect.parent.span.name`, `effect.parent.trace.id` - Parent span info

---

## Pattern Syntax

Patterns use JavaScript regular expressions (ECMAScript flavor).

### Common Patterns

```yaml
# Exact match
pattern: "^app\\.operation$"         # Matches only "app.operation"

# Prefix match
pattern: "^app\\."                   # Matches "app.*"

# Suffix match
pattern: "\\.create$"                # Matches "*.create"

# Contains
pattern: "user"                      # Matches any span containing "user"

# Alternation (OR)
pattern: "^(app|api|service)\\."     # Matches "app.", "api.", or "service."

# Character class
pattern: "^http\\.[a-z]+\\."         # Matches "http.server.", "http.client.", etc.

# Optional parts
pattern: "^app(\\.(dev|staging))?\\." # Matches "app.", "app.dev.", "app.staging."
```

### Escaping Rules

**In YAML, backslashes must be doubled:**

```yaml
# ✅ Correct
pattern: "^app\\."           # Matches "app."

# ❌ Incorrect
pattern: "^app\."            # Won't work as expected in YAML
```

**Common escape sequences:**

| Character | Regex | YAML Pattern |
|-----------|-------|--------------|
| `.` (dot) | `\.` | `"\\."` |
| `$` (end) | `$` | `"$"` |
| `^` (start) | `^` | `"^"` |
| `\` (backslash) | `\\` | `"\\\\"` |
| `(` `)` | `\(` `\)` | `"\\("` `"\\)"` |

---

## Complete Examples

### Minimal Configuration

```yaml
version: "1.0"

instrumentation:
  enabled: true
  instrument_patterns: []
  ignore_patterns: []
```

With empty patterns, all spans are created (fail-open behavior).

---

### Production Configuration

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Production instrumentation for my-service"

  instrument_patterns:
    # Application layer
    - pattern: "^app\\."
      enabled: true
      description: "Core application operations"

    # API layer
    - pattern: "^api\\.client\\."
      enabled: true
      description: "External API calls"

    # Database layer
    - pattern: "^db\\."
      enabled: true
      description: "Database operations"

    # Cache layer
    - pattern: "^cache\\."
      enabled: true
      description: "Cache operations"

  ignore_patterns:
    # Health checks
    - pattern: "^health\\."
      description: "Health check endpoints"

    # Metrics (prevent instrumentation loops)
    - pattern: "^metrics\\."
      description: "Metrics collection"

    # Internal utilities
    - pattern: "^internal\\."
      description: "Internal utility functions"

    # Static assets
    - pattern: "\\.(css|js|png|jpg|gif|svg|ico|woff|woff2)$"
      description: "Static file requests"
```

---

### Multi-Environment Configuration

**Development (`instrumentation.dev.yaml`):**

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Development config - verbose logging"

  instrument_patterns:
    - pattern: "^app\\."
      description: "All app operations for debugging"

    - pattern: "^test\\."
      enabled: true
      description: "Include test operations in dev"

  ignore_patterns:
    - pattern: "^health\\."
      description: "Skip health checks"
```

**Production (`instrumentation.prod.yaml`):**

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Production config - optimized performance"

  instrument_patterns:
    - pattern: "^app\\.critical\\."
      description: "Only critical operations"

    - pattern: "^app\\.user\\."
      description: "User-facing operations"

  ignore_patterns:
    - pattern: "^health\\."
      description: "Skip health checks"

    - pattern: "^test\\."
      description: "Skip test operations"

    - pattern: "^internal\\."
      description: "Skip internal operations"
```

Load environment-specific config:

```typescript
const env = process.env.NODE_ENV || 'development'
await initializeInstrumentation({
  configPath: `./config/instrumentation.${env}.yaml`
})
```

---

### Centralized Remote Configuration

For multi-service deployments, use a shared remote config:

```yaml
# https://config.company.com/instrumentation.yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Shared config for all microservices"

  instrument_patterns:
    # Common patterns across all services
    - pattern: "^app\\."
      description: "Application operations"

    - pattern: "^http\\.(server|client)\\."
      description: "HTTP operations"

  ignore_patterns:
    # Common ignore patterns
    - pattern: "^(health|metrics)\\."
      description: "Infrastructure endpoints"
```

Load in each service:

```typescript
await initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000 // 5 minutes
})
```

---

## Priority Order

When multiple configuration sources are available:

1. **Explicit config object** (highest)
2. **Environment variable** (`ATRIM_INSTRUMENTATION_CONFIG`)
3. **Explicit path/URL** (via `configPath` or `configUrl`)
4. **Project root file** (`./instrumentation.yaml`)
5. **Default config** (lowest)

Example:

```typescript
// Priority: Explicit > Env > File > Default
process.env.ATRIM_INSTRUMENTATION_CONFIG = './config/env.yaml'

await initializeInstrumentation({
  config: { /* ... */ }  // This takes precedence over env var
})
```

---

## Validation

All configurations are validated against the schema:

```typescript
import { z } from 'zod'

export const InstrumentationConfigSchema = z.object({
  version: z.string(),
  instrumentation: z.object({
    enabled: z.boolean(),
    description: z.string().optional(),
    instrument_patterns: z.array(PatternConfigSchema),
    ignore_patterns: z.array(PatternConfigSchema)
  }),
  effect: z.object({
    auto_extract_metadata: z.boolean()
  }).optional()
})
```

Invalid configurations will throw an error with details:

```
Invalid configuration: Expected boolean, received string at path "instrumentation.enabled"
```

---

## Security Considerations

### Remote Configurations

- **HTTPS only**: HTTP URLs are rejected
- **Size limit**: 1MB maximum
- **Timeout**: 5 seconds
- **Caching**: 5 minutes default (configurable)

### File Configurations

- **Size limit**: 1MB maximum
- **Validation**: Strict schema validation
- **Error handling**: Fails gracefully with clear error messages

---

## See Also

- [Getting Started Guide](./getting-started.md)
- [API Reference](./api-reference.md)
- [Examples](../examples/)
