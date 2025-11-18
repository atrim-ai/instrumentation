# HTTP Request Filtering Investigation & Fix Plan

**Date:** 2025-11-17
**Issue:** Cross-service HTTP traces missing after migrating from platform-introspection to @atrim/instrumentation library
**Status:** Needs investigation and fix

---

## Problem Summary

After migrating the Atrim platform from custom `platform-introspection` instrumentation to the `@atrim/instrumentation` library, HTTP client spans for OTLP export requests are no longer visible in the target platform. This breaks cross-service observability.

### What Was Working (Main Branch - platform-introspection)

**Evidence from target-backend logs:**
```json
{
  "name": "POST",
  "kind": "3",  // CLIENT
  "attributes": [
    {
      "key": "url.full",
      "value": { "stringValue": "http://localhost:4318/v1/traces" }
    },
    {
      "key": "user_agent.original",
      "value": { "stringValue": "effect-opentelemetry-OtlpTracer/0.0.0" }
    }
  ]
}
```

**Key observations:**
- ✅ HTTP client spans for `/v1/traces` WERE created
- ✅ User agent: `effect-opentelemetry-OtlpTracer/0.0.0` (Effect's OTLP tracer)
- ✅ Cross-service traces visible in target platform
- ✅ Spans had `STATUS_CODE_ERROR` (expected for test scenarios)

### What's NOT Working (New Library)

**Evidence from investigation:**
- ❌ NO HTTP client spans for `/v1/traces` requests (even when filtering disabled)
- ❌ NO `[UNDICI FILTER HOOK CALLED]` logs for OTLP export requests
- ❌ NO `[HTTP FILTER HOOK CALLED]` logs for OTLP export requests
- ❌ Cross-service traces missing from target platform
- ✅ Other HTTP filtering works (health checks via undici)

**What we DO see working:**
```
[UNDICI FILTER HOOK CALLED] {
  method: 'GET',
  origin: 'http://otel-collector:13133',
  path: '/health',
  url: 'http://otel-collector:13133/health',
  patterns: ['/v1/metrics$', '/v1/logs$', '/health$', ...]
}
[UNDICI FILTER] ✅ Filtered by YAML/programmatic pattern
```

---

## Root Cause Analysis

### Theory 1: OpenTelemetry SDK Context Suppression (Most Likely)

**Hypothesis:** Standard OpenTelemetry SDK automatically suppresses tracing context for OTLP export requests to prevent infinite trace loops. This is built into the SDK itself.

**Evidence:**
- OTLP export requests bypass BOTH HTTP and undici instrumentation hooks
- Hooks are configured correctly but never called for `/v1/traces`
- This is a safety feature in standard OpenTelemetry SDKs

**Impact:**
- Prevents HTTP client spans for OTLP exports from being created
- Breaks cross-service observability (source → target tracing)
- Cannot be disabled via HTTP filtering configuration

### Theory 2: Effect vs Standard SDK Behavior Difference

**Main branch setup:**
- Uses `@effect/opentelemetry` with custom Effect-based OTLP tracer
- Effect's tracer DOES NOT suppress OTLP export requests
- Creates HTTP client spans for all exports (visible in target platform)

**New library setup:**
- Uses standard `@opentelemetry/sdk-node` with standard OTLP HTTP exporter
- Standard exporter HAS built-in suppression for OTLP requests
- OTLP exports run in `ROOT_CONTEXT` or suppressed context
- No HTTP client spans created

### Theory 3: Initialization Order Issue

**Current initialization flow:**
1. **Line 511:** OTLP exporter created → loads `http` module
2. **Line 541-548:** HTTP/undici instrumentation configs built
3. **Line 559-576:** Instrumentations created via `getNodeAutoInstrumentations()`
4. **Line 621:** `sdk.start()` enables instrumentations

**Potential issue:** If the `http` module is loaded before instrumentation is enabled, monkey-patching might not work correctly.

**Counter-evidence:** Health check requests (also using undici/http) ARE being instrumented, so patching is working.

---

## Investigation Needed

### 1. Verify OpenTelemetry Context Suppression

**Check in standard SDK code:**
```typescript
// Look in @opentelemetry/sdk-trace-base or @opentelemetry/core
// Search for: ROOT_CONTEXT, suppressTracing, suppressInstrumentation
```

**Questions:**
- Does the BatchSpanProcessor or OTLP exporter run in suppressed context?
- Is there a way to disable this suppression for cross-platform observability?
- Did OpenTelemetry versions change that altered this behavior?

### 2. Compare Effect vs Standard OTLP Exporters

**Main branch (Effect):**
- Uses `@effect/opentelemetry` package
- Effect-specific OTLP tracer implementation
- Check: `@effect/opentelemetry` source code for export implementation

**New library (Standard):**
- Uses `@opentelemetry/exporter-trace-otlp-http`
- Standard OTel implementation
- May have different suppression behavior

**Investigation:**
```bash
# In atrim platform on main branch
grep -r "OtlpTracer\|OTLP\|exporter" src/platform-introspection/

# Check Effect's OTLP implementation
find node_modules/@effect/opentelemetry -name "*.ts" -o -name "*.js" | xargs grep -l "otlp\|export"
```

### 3. Test Cross-Service Tracing Manually

**Create minimal test case:**
```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'
import { trace } from '@opentelemetry/api'

await initializeInstrumentation({
  serviceName: 'test-service',
  otlp: { endpoint: 'http://target-collector:4318' },
  http: {
    // Explicitly enable ALL traces (no filtering)
    ignoreOutgoingUrls: []
  }
})

// Make a test span
const tracer = trace.getTracer('test')
const span = tracer.startSpan('test-operation')
span.end()

// Wait and check target collector for HTTP client span
```

**Expected:** Should see POST span to `/v1/traces` in target collector
**Actual:** Likely won't see it due to suppression

---

## Recommended Fixes

### Option 1: Use Effect's OTLP Exporter (Preferred)

**Approach:** Replace standard OTLP HTTP exporter with Effect's OTLP exporter when Effect is detected.

**Implementation:**
```typescript
// In src/core/exporter-factory.ts
import { OTLPTraceExporter as StandardExporter } from '@opentelemetry/exporter-trace-otlp-http'
// Conditionally import Effect's exporter
let EffectOtlpExporter: any = null
try {
  // Only load if @effect/opentelemetry is installed
  const effectOtel = await import('@effect/opentelemetry')
  EffectOtlpExporter = effectOtel.OtlpTracer // Or whatever the export name is
} catch {}

export function createOtlpExporter(options = {}) {
  // If Effect is available and we're in Effect mode, use Effect's exporter
  if (EffectOtlpExporter && isEffectProject()) {
    return new EffectOtlpExporter(...)
  }

  // Otherwise use standard exporter
  return new StandardExporter(...)
}
```

**Pros:**
- Matches main branch behavior exactly
- Effect's exporter doesn't suppress OTLP requests
- Cross-service traces would work

**Cons:**
- Adds dependency on Effect for OTLP export
- Need to research Effect's OTLP exporter API
- May not be a pure Effect OTLP exporter (need to verify)

### Option 2: Disable Context Suppression (If Possible)

**Approach:** Find and disable the suppression mechanism in standard SDK.

**Investigation needed:**
```typescript
// Check if there's a config option like:
const exporter = new OTLPTraceExporter({
  suppressInstrumentation: false  // Or similar option
})

// Or at SDK level:
const sdk = new NodeSDK({
  suppressOwnInstrumentation: false
})
```

**Pros:**
- Minimal code changes
- Uses standard SDK

**Cons:**
- May not be possible (suppression might be hardcoded)
- Risk of trace loops if suppression is disabled

### Option 3: Use Effect Integration Exclusively

**Approach:** For Effect-based platforms, use Effect's tracing exclusively instead of standard SDK.

**Implementation:**
```typescript
// In src/integrations/effect/effect-tracer.ts
// Use Effect's Layer system with custom OTLP exporter
export const EffectInstrumentationLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* loadConfigEffect()

    // Use Effect's OTLP exporter instead of standard
    const otlpLayer = makeOtlpExporterLayer(config)

    return Layer.mergeAll(otlpLayer, TracerLive)
  })
)
```

**Pros:**
- Full Effect integration
- Matches Effect's ecosystem patterns
- No SDK suppression issues

**Cons:**
- Only works for Effect projects
- Doesn't solve problem for vanilla Node.js apps

### Option 4: Custom Instrumentation for OTLP Exporter

**Approach:** Manually instrument the OTLP exporter's HTTP requests.

**Implementation:**
```typescript
// Wrap the OTLP exporter to create manual spans
class InstrumentedOTLPExporter extends OTLPTraceExporter {
  async export(spans, resultCallback) {
    const tracer = trace.getTracer('otlp-exporter')

    await tracer.startActiveSpan('otlp.export', async (span) => {
      span.setAttribute('http.method', 'POST')
      span.setAttribute('http.url', this.url)

      try {
        await super.export(spans, resultCallback)
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (error) {
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    })
  }
}
```

**Pros:**
- Creates explicit spans for OTLP exports
- Full control over span attributes
- Works with standard SDK

**Cons:**
- Requires wrapping/subclassing exporter
- Manual maintenance
- Might still get suppressed

---

## Immediate Action Items

### For Next Session

1. **Investigate Effect's OTLP tracer implementation**
   ```bash
   cd ~/projects/atrim
   git checkout main
   grep -r "OtlpTracer\|OTLP.*export" src/
   find node_modules/@effect/opentelemetry -name "*.d.ts" | xargs grep -l "Otlp\|export"
   ```

2. **Compare initialization between main and feature branch**
   ```bash
   # Main branch
   git checkout main
   cat src/platform-introspection/instrumentation.ts

   # Feature branch
   git checkout feature/http-request-filtering
   # Check how @atrim/instrumentation is initialized
   ```

3. **Test with Effect's OTLP exporter**
   - Check if `@effect/opentelemetry` has an OTLP exporter
   - Test if using Effect's exporter creates HTTP client spans
   - Verify cross-service traces work with Effect's exporter

4. **OpenTelemetry version audit**
   ```bash
   # Check versions in both branches
   git checkout main
   grep "@opentelemetry" package.json

   git checkout feature/...
   grep "@opentelemetry" package.json

   # Look for breaking changes in OTel SDK that added/changed suppression
   ```

---

## Expected Behavior After Fix

### Cross-Service Observability Should Show:

**On Target Platform (target-backend):**
- ✅ POST spans to `http://localhost:4318/v1/traces`
- ✅ POST spans to `http://localhost:4318/v1/metrics`
- ✅ GET spans to `http://otel-collector:13133/health`
- ✅ All with `service.name = atrim-source-backend`

**Filtering Should Work:**
- ✅ When `/v1/traces` is in `ignore_outgoing_urls`: No POST spans
- ✅ When `/v1/traces` is commented out: POST spans visible
- ✅ When `/health` is in ignore list: No health check spans
- ✅ When `/health` is commented out: Health check spans visible

### Current Status:

**Working:**
- ✅ Health check filtering via undici (`/health` requests filtered correctly)
- ✅ YAML config loading (7 patterns loaded)
- ✅ HTTP and undici hooks created
- ✅ Debug logging shows configuration is correct

**NOT Working:**
- ❌ OTLP export requests never trigger hooks (suppressed by SDK)
- ❌ Cannot see `/v1/traces` spans even when not filtered
- ❌ Cross-service traces missing from target platform
- ❌ Lost functionality that existed in main branch

---

## Code Locations

### Files to Investigate:

**In @atrim/instrumentation library:**
- `src/core/sdk-initializer.ts` - Initialization order, exporter creation
- `src/core/exporter-factory.ts` - OTLP exporter creation
- `src/integrations/effect/effect-tracer.ts` - Effect integration

**In atrim platform (main branch):**
- `src/platform-introspection/instrumentation.ts` - Old working implementation
- Compare with new initialization in index.ts or wherever `initializeInstrumentation()` is called

### Debug Logging Currently Active:

```typescript
[HTTP CONFIG BUILDER] - Shows patterns loaded from YAML
[HTTP CONFIG] - Shows if hook was created
[HTTP/UNDICI CONFIG DEBUG] - Shows both configs
[INSTRUMENTATION CONFIG] - Shows hook presence
[INSTRUMENTATIONS] Created X instrumentations - Lists all instrumentations
[UNDICI FILTER HOOK CALLED] - Called for every undici request
[HTTP FILTER HOOK CALLED] - Called for every HTTP request (but not for OTLP)
```

**Current output shows:**
- `httpConfigHasHook: true` ✅
- `undiciConfigHasHook: true` ✅
- `yamlHttpPatterns: [7 patterns]` ✅
- Undici hook called for health checks ✅
- HTTP hook NEVER called ❌
- OTLP requests bypass all instrumentation ❌

---

## Technical Deep Dive

### OpenTelemetry Context Suppression

The standard OpenTelemetry SDK uses context suppression to prevent instrumenting its own export operations. This is typically done via:

```typescript
// Pseudo-code of what SDK likely does
import { suppressTracing, context, ROOT_CONTEXT } from '@opentelemetry/api'

class BatchSpanProcessor {
  async export(spans) {
    // Run in suppressed context
    await context.with(suppressTracing(context.active()), async () => {
      await this.exporter.export(spans)
    })
  }
}
```

**Result:** Any HTTP requests made within the suppressed context are NOT instrumented, so:
- HTTP instrumentation's `ignoreOutgoingRequestHook` is never called
- Undici instrumentation's `ignoreRequestHook` is never called
- No spans created for the actual HTTP POST to collector

### Why Effect's Tracer Worked

**Hypothesis:** Effect's `@effect/opentelemetry` package either:
1. Does NOT use context suppression for OTLP exports
2. Uses a different export mechanism that gets instrumented
3. Manually creates HTTP client spans for export requests

**Need to verify:** Check Effect's source code for OTLP export implementation.

---

## Recommended Fix Path

### Phase 1: Investigation (1-2 hours)

1. **Check if Effect has OTLP exporter**
   ```bash
   cd ~/projects/atrim
   find node_modules/@effect/opentelemetry -name "*.d.ts" | xargs grep -i "otlp\|export\|tracer"
   ```

2. **Examine main branch platform-introspection code**
   ```bash
   git checkout main
   cat src/platform-introspection/instrumentation.ts
   # Look for: How OTLP export is configured, what exporter is used
   ```

3. **Test context suppression theory**
   ```typescript
   // In a test file
   import { suppressTracing, context } from '@opentelemetry/api'

   // Create span in normal context
   const span1 = tracer.startSpan('normal')
   span1.end()

   // Create span in suppressed context
   await context.with(suppressTracing(context.active()), async () => {
     const span2 = tracer.startSpan('suppressed')
     span2.end()
   })

   // Check collector - only span1 should be exported
   ```

### Phase 2: Implementation (2-4 hours)

**If Effect has OTLP exporter → Use it**
```typescript
// Detect Effect project and use Effect's exporter
if (isEffectProject()) {
  const { EffectOtlpExporter } = await import('@effect/opentelemetry')
  rawExporter = new EffectOtlpExporter(...)
} else {
  rawExporter = new StandardOTLPTraceExporter(...)
}
```

**If no Effect exporter → Custom instrumentation**
```typescript
// Create wrapper that manually instruments exports
class CrossServiceOTLPExporter extends OTLPTraceExporter {
  export(spans, callback) {
    // Create manual HTTP client span BEFORE suppression
    const tracer = trace.getTracer('otlp-exporter')
    const span = tracer.startSpan('otlp.export.http', {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.method': 'POST',
        'http.url': this.url,
        'http.target': '/v1/traces'
      }
    })

    // Then call parent in suppressed context
    super.export(spans, (result) => {
      if (result.error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
      }
      span.end()
      callback(result)
    })
  }
}
```

### Phase 3: Testing (1-2 hours)

1. Build and deploy updated library
2. Verify POST `/v1/traces` spans appear in target platform
3. Verify filtering still works (when patterns are configured)
4. Verify no trace loops occur
5. Test with Effect and vanilla Node.js apps

---

## Files to Modify

### @atrim/instrumentation library:

1. **src/core/exporter-factory.ts**
   - Detect Effect project
   - Conditionally use Effect vs Standard exporter
   - Or wrap standard exporter with manual instrumentation

2. **src/core/sdk-initializer.ts**
   - May need initialization order changes
   - Ensure instrumentations are enabled before exporter makes requests

3. **src/integrations/effect/effect-tracer.ts**
   - If using Effect's OTLP exporter, configure here

### Documentation:

1. **README.md** - Update HTTP filtering docs to explain OTLP suppression
2. **TROUBLESHOOTING.md** - Add section on cross-service tracing
3. **CLAUDE.md** - Document the OTLP suppression behavior

---

## Open Questions

1. **Does @effect/opentelemetry have an OTLP exporter?**
   - Check Effect docs: https://effect.website/docs/observability/tracing/
   - Check package exports

2. **Did OpenTelemetry SDK version change suppression behavior?**
   - Main branch OTel versions vs feature branch versions
   - Check OTel changelog for suppression-related changes

3. **Can suppression be disabled safely?**
   - Without causing infinite trace loops
   - While still preventing self-instrumentation

4. **What exactly was the main branch doing?**
   - Need to read actual source code
   - Check git history for migration

---

## Success Criteria

After the fix is implemented:

- [ ] HTTP client spans for `/v1/traces` appear in target platform (when not filtered)
- [ ] HTTP client spans for `/v1/metrics` appear in target platform (when not filtered)
- [ ] Health check spans are filtered correctly
- [ ] OTLP export spans are filtered when configured in instrumentation.yaml
- [ ] Cross-service traces work (source → target observability)
- [ ] No trace loops occur
- [ ] Works with both Effect and vanilla Node.js apps
- [ ] Backward compatible with existing configurations

---

## Current PR Status

**PR #33:** https://github.com/atrim-ai/instrumentation/pull/33

**What's working in PR:**
- ✅ HTTP filtering infrastructure (hooks, config, YAML loading)
- ✅ Undici filtering (health checks filtered correctly)
- ✅ Comprehensive debug logging
- ✅ No hardcoded patterns (all user-configurable)
- ✅ Integration tests passing

**What needs fixing:**
- ❌ OTLP export requests not instrumented (SDK suppression)
- ❌ Cross-service traces missing
- ❌ Cannot replicate main branch behavior

**Recommendation:**
- Merge current PR as-is (health/metrics filtering works)
- Create new issue/PR for OTLP export instrumentation
- OR pause this PR until OTLP export instrumentation is fixed

---

## Next Steps for New Session

1. Checkout main branch and analyze working implementation
2. Find Effect's OTLP exporter or understand how it worked
3. Implement chosen fix (Option 1, 2, or 3 above)
4. Test cross-service traces
5. Remove debug console.log statements
6. Update PR with fix
