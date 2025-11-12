# Migration Guide

Guide for migrating to `@atrim/instrumentation` from manual OpenTelemetry instrumentation.

## Overview

`@atrim/instrumentation` provides centralized, pattern-based span filtering. This guide helps you migrate from:

- Manual span creation with scattered filtering logic
- Hard-coded instrumentation decisions
- Inconsistent span attributes across services

To:

- Centralized YAML configuration
- Pattern-based automatic filtering
- Consistent span helpers and attributes

## Benefits of Migrating

✅ **Centralized Configuration** - Control all instrumentation from a single YAML file
✅ **Pattern-Based Filtering** - Filter spans by regex patterns, not hard-coded logic
✅ **Consistent Attributes** - Standardized span helpers across your codebase
✅ **Remote Configuration** - Update instrumentation patterns without deployments
✅ **Zero Breaking Changes** - Works alongside existing OpenTelemetry setup

## Migration Steps

### Step 1: Install the Library

```bash
npm install @atrim/instrumentation
```

### Step 2: Create Configuration

Create `instrumentation.yaml` in your project root:

```yaml
version: "1.0"

instrumentation:
  enabled: true

  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
    - pattern: "^http\\."
      enabled: true

  ignore_patterns:
    - pattern: "^health\\."
    - pattern: "^internal\\."
```

### Step 3: Initialize in Your App

Add initialization at startup (before any span creation):

```typescript
// At the top of your entry point (index.ts, server.ts, etc.)
import { initializeInstrumentation } from '@atrim/instrumentation'

await initializeInstrumentation()

// Rest of your application...
```

### Step 4: Gradually Adopt Span Helpers (Optional)

Replace manual span attribute setting with helpers:

**Before:**

```typescript
span.setAttribute('http.method', 'GET')
span.setAttribute('http.url', '/api/users')
span.setAttribute('http.status_code', 200)
span.setStatus({ code: SpanStatusCode.OK })
```

**After:**

```typescript
import { annotateHttpRequest } from '@atrim/instrumentation'

annotateHttpRequest(span, 'GET', '/api/users', 200)
```

---

## Migration Scenarios

### Scenario 1: Manual If/Else Filtering

**Before:**

```typescript
function createSpan(name: string) {
  // Manual filtering logic scattered throughout codebase
  if (name.startsWith('health.')) {
    return null // Don't create span
  }

  if (name.startsWith('test.')) {
    return null
  }

  // Create span for everything else
  await tracer.startActiveSpan(name, async (span) => {
    return span
  })
}
```

**After:**

```typescript
// No manual filtering needed - handled by configuration

async function createSpan(name: string) {
  return await tracer.startActiveSpan(name, async (span) => {
    return span
  })
}
```

```yaml
# instrumentation.yaml
ignore_patterns:
  - pattern: "^health\\."
  - pattern: "^test\\."
```

**Benefits:**
- ✅ Filtering logic centralized in YAML
- ✅ Easy to update without code changes
- ✅ Consistent across all services

---

### Scenario 2: Environment-Specific Instrumentation

**Before:**

```typescript
function shouldInstrument(spanName: string): boolean {
  if (process.env.NODE_ENV === 'production') {
    // Only instrument critical paths in production
    return spanName.startsWith('app.critical.')
  } else {
    // Instrument everything in development
    return true
  }
}
```

**After:**

```typescript
// No environment checks needed - use config files

const env = process.env.NODE_ENV || 'development'
await initializeInstrumentation({
  configPath: `./config/instrumentation.${env}.yaml`
})
```

```yaml
# instrumentation.production.yaml
instrumentation:
  instrument_patterns:
    - pattern: "^app\\.critical\\."
```

```yaml
# instrumentation.development.yaml
instrumentation:
  instrument_patterns:
    - pattern: "^app\\."  # All app operations
```

**Benefits:**
- ✅ Environment-specific configs without code changes
- ✅ Easy to test production filtering in dev
- ✅ Configuration versioned with code

---

### Scenario 3: Inconsistent Span Attributes

**Before:**

```typescript
// Service A
span.setAttribute('http_method', 'GET')  // Underscore
span.setAttribute('url', '/api/users')

// Service B
span.setAttribute('http.method', 'GET')  // Dot notation
span.setAttribute('http.url', '/api/users')

// Service C
span.setAttribute('method', 'GET')       // Short form
span.setAttribute('endpoint', '/api/users')
```

**After:**

```typescript
// All services use the same helper
import { annotateHttpRequest } from '@atrim/instrumentation'

annotateHttpRequest(span, 'GET', '/api/users', 200)
// Always sets: http.method, http.url, http.status_code
```

**Benefits:**
- ✅ Consistent attribute names across all services
- ✅ Automatic status code handling (marks error if >= 400)
- ✅ Single source of truth for attribute naming

---

### Scenario 4: Multi-Service Instrumentation

**Before:**

Each service has its own filtering logic:

```typescript
// service-a/instrumentation.ts
if (spanName.startsWith('health')) return null

// service-b/instrumentation.ts
if (spanName.includes('health')) return null

// service-c/instrumentation.ts
if (spanName === '/health') return null
```

**After:**

All services share a remote configuration:

```typescript
// All services
await initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000  // 5 minutes
})
```

```yaml
# https://config.company.com/instrumentation.yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Shared config for all microservices"

  instrument_patterns:
    - pattern: "^app\\."
    - pattern: "^http\\."

  ignore_patterns:
    - pattern: "^health\\."
    - pattern: "^metrics\\."
```

**Benefits:**
- ✅ Update all services from one location
- ✅ No deployments needed to change patterns
- ✅ Consistent filtering across services
- ✅ Cached for performance (default 5min)

---

## Complete Before/After Examples

### Express Application

**Before:**

```typescript
import express from 'express'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')
const app = express()

app.get('/api/users', async (req, res) => {
  // Manual span creation and filtering
  if (!req.path.startsWith('/health')) {
    await tracer.startActiveSpan('GET /api/users', async (span) => {
      try {
        const users = await getUsers()

        // Manual attributes
        span.setAttribute('http.method', 'GET')
        span.setAttribute('http.url', req.path)
        span.setAttribute('http.status_code', 200)
        span.setStatus({ code: 1 }) // OK

        res.json(users)
      } catch (error) {
        span.recordException(error)
        span.setStatus({ code: 2, message: 'Error' })
        res.status(500).json({ error: 'Internal error' })
      } finally {
        span.end()
      }
    })
  } else {
    // No span for health checks
    res.json({ status: 'ok' })
  }
})
```

**After:**

```typescript
import express from 'express'
import { trace } from '@opentelemetry/api'
import { initializeInstrumentation, annotateHttpRequest, markSpanError } from '@atrim/instrumentation'

// Initialize once at startup
await initializeInstrumentation()

const tracer = trace.getTracer('my-service')
const app = express()

app.get('/api/users', async (req, res) => {
  // Pattern filtering handled automatically
  await tracer.startActiveSpan('http.server.GET /api/users', async (span) => {
    try {
      const users = await getUsers()

      // Helper sets all HTTP attributes + marks success
      annotateHttpRequest(span, 'GET', req.path, 200)

      res.json(users)
    } catch (error) {
      span.recordException(error)
      markSpanError(span, 'Error fetching users')
      res.status(500).json({ error: 'Internal error' })
    } finally {
      span.end()
    }
  })
})

app.get('/health', async (req, res) => {
  // Span created but automatically dropped by ignore pattern
  await tracer.startActiveSpan('health.check', async (span) => {
    res.json({ status: 'ok' })
    span.end()
  })
})
```

```yaml
# instrumentation.yaml
version: "1.0"

instrumentation:
  enabled: true

  instrument_patterns:
    - pattern: "^http\\.server\\."

  ignore_patterns:
    - pattern: "^health\\."
```

**Improvements:**
- ✅ 40% less code
- ✅ No manual filtering logic
- ✅ Consistent attribute names
- ✅ Easier to maintain

---

## Compatibility

### Works Alongside Existing OpenTelemetry Setup

The library doesn't replace your OpenTelemetry setup - it enhances it:

```typescript
// Your existing NodeSDK setup
const sdk = new NodeSDK({
  spanProcessor: batchProcessor,
  instrumentations: [
    getNodeAutoInstrumentations()
  ]
})

sdk.start()

// Add @atrim/instrumentation
await initializeInstrumentation()

// Both work together ✅
```

### Gradual Migration

You can migrate incrementally:

1. **Week 1**: Add library, keep existing code
2. **Week 2**: Move filtering to YAML
3. **Week 3**: Adopt span helpers for new code
4. **Week 4**: Refactor old code to use helpers

No breaking changes - the library is purely additive.

---

## Common Pitfalls

### ❌ Forgetting to Escape Regex in YAML

**Wrong:**

```yaml
pattern: "^app."  # Matches "app" followed by ANY character
```

**Correct:**

```yaml
pattern: "^app\\."  # Matches "app."
```

### ❌ Initializing Too Late

**Wrong:**

```typescript
await tracer.startActiveSpan('app.operation', async (span) => {
  // Pattern matcher not ready!
})
await initializeInstrumentation()
```

**Correct:**

```typescript
await initializeInstrumentation()  // Initialize FIRST
await tracer.startActiveSpan('app.operation', async (span) => {
  // Now pattern matcher is ready
})
```

### ❌ Not Understanding Fail-Open Behavior

The library **fails open** - if no patterns match, the span is **still created**.

To drop all unmatched spans:

```yaml
instrument_patterns:
  - pattern: "^app\\."  # Only app.* spans

# Add catch-all ignore if you want to drop everything else
ignore_patterns:
  - pattern: "^(?!app\\.).*"  # Negative lookahead: ignore anything NOT starting with "app."
```

---

## Rollback Plan

If you need to rollback:

1. **Remove initialization:**

```typescript
// await initializeInstrumentation()  // Comment out
```

2. **Remove helper imports:**

```typescript
// import { annotateHttpRequest } from '@atrim/instrumentation'  // Remove
```

3. Your existing OpenTelemetry setup continues to work unchanged.

**The library is purely additive - removing it doesn't break anything.**

---

## Getting Help

- [GitHub Issues](https://github.com/atrim-ai/instrumentation/issues)
- [API Reference](./api-reference.md)
- [Configuration Reference](./configuration.md)
- [Examples](../examples/)

---

## Summary

**Migration Checklist:**

- [ ] Install `@atrim/instrumentation`
- [ ] Create `instrumentation.yaml` with your patterns
- [ ] Add `await initializeInstrumentation()` at startup
- [ ] (Optional) Gradually adopt span helpers
- [ ] (Optional) Move to remote config for multi-service deployments

**Expected Results:**

- ✅ Less code (typically 30-50% reduction)
- ✅ Centralized configuration
- ✅ Consistent attribute naming
- ✅ Easier to maintain and update
- ✅ No breaking changes
