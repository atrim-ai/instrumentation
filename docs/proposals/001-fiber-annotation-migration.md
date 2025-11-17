# Fiber Annotation Work Migration Proposal

**Date:** 2025-11-16
**Status:** Pending Review
**Author:** Claude Code

## Problem Statement

The `@atrim/instrumentation` library currently has stub implementations for Effect-specific span annotation helpers and a simplified metadata extraction system. Meanwhile, the main Atrim project (`~/projects/atrim/src/platform-introspection/`) has a fully-implemented, production-tested version of:

1. **Automatic fiber metadata extraction** (`effect-auto-tracer.ts`)
2. **Rich span annotation helpers** (`span-helpers.ts`)
3. **Effect context bridging** for proper parent-child span relationships
4. **HTTP request filtering** to prevent OTLP trace loops

We need to migrate the universally applicable features from the Atrim project into this library so that all users of `@atrim/instrumentation` can benefit from these features.

## Analysis of Atrim Platform Introspection Code

### Files Reviewed

1. **`~/projects/atrim/src/platform-introspection/effect-auto-tracer.ts`**
   - Automatic Effect metadata extraction using `Fiber.getCurrentFiber()` and `Effect.currentSpan`
   - `extractEffectMetadata()` - Extracts fiber ID, status, parent span info
   - `autoEnrichSpan()` - Auto-annotates current span with Effect metadata
   - `withAutoEnrichedSpan()` - Wrapper that combines Effect.withSpan + auto-enrichment

2. **`~/projects/atrim/src/platform-introspection/span-helpers.ts`**
   - Production-tested annotation helpers for common patterns
   - All use `Effect.annotateCurrentSpan()` for proper Effect integration
   - Helpers: `annotateUser`, `annotateDataSize`, `annotateBatch`, `annotateLLM`, `annotateQuery`, `annotateHttpRequest`, `annotateError`, `annotatePriority`, `annotateCache`

3. **`~/projects/atrim/src/platform-introspection/instrumentation.ts`**
   - HTTP request filtering configuration
   - Pattern-based filtering for preventing OTLP export loops
   - Integration with NodeSDK auto-instrumentation

4. **`~/projects/atrim/src/platform-introspection/CLAUDE.md`**
   - Documents the `tracerContext` callback pattern for bridging Effect context to OpenTelemetry global context
   - Critical for proper parent-child relationships between Effect spans and auto-instrumented HTTP clients

### Universally Applicable Features

✅ **INCLUDE - Core Features:**
1. **Automatic fiber metadata extraction** - Uses public Effect APIs (`Fiber.getCurrentFiber()`, `Effect.currentSpan`)
2. **Rich span annotation helpers** - Generic helpers useful for any Effect-TS user
3. **Auto-enrichment utilities** - `autoEnrichSpan()` and `withAutoEnrichedSpan()`
4. **HTTP request filtering for OTLP endpoints** - Prevents trace loops (universal problem)

✅ **INCLUDE - Documentation:**
1. **`tracerContext` pattern** - Document in README/examples for proper Effect context bridging
2. **Best practices** - Auto-enrichment patterns, annotation conventions

❌ **EXCLUDE - Atrim-Specific:**
1. **AnnotationService** - Project-specific annotation storage system (ClickHouse-based)
2. **DiagnosticsSessionManager** - Feature flag testing framework (too specific)
3. **IntrospectionService Layer** - Atrim platform-specific service layer
4. **Anti-contamination validation** - Project-specific test data concerns

### Current State of @atrim/instrumentation

**Files that need implementation:**

1. **`src/integrations/effect/metadata-extractor.ts`** (47 lines currently)
   - Has basic structure but simplified/incomplete implementation
   - Missing: Actual fiber status extraction, parent span detection
   - Needs: Full implementation using `Fiber.getCurrentFiber()` and `Effect.currentSpan`

2. **`src/integrations/effect/effect-helpers.ts`** (48 lines currently)
   - All functions are stubs with `// TODO: Implement`
   - Needs: Full implementation of all 9 annotation helpers

3. **Missing entirely:**
   - Auto-enrichment utilities (`autoEnrichSpan`, `withAutoEnrichedSpan`)
   - HTTP request filtering hooks for OTLP endpoints
   - Documentation of `tracerContext` pattern

## Proposed Solution

### Phase 1: Core Metadata Extraction

**File:** `src/integrations/effect/metadata-extractor.ts`

**Changes:**
1. Replace simplified implementation with full implementation from `effect-auto-tracer.ts`
2. Add proper fiber ID extraction using `FiberId.threadName()`
3. Add fiber status extraction using `Fiber.status()`
4. Add parent span detection using `Effect.currentSpan.pipe(Effect.option)`
5. Add detection for nested vs. root operations
6. Add parent trace/span ID extraction

**Key differences from Atrim version:**
- Remove dependency on `shouldInstrumentEffectSpan()` (that's config-specific to Atrim)
- Make it configuration-agnostic (users control via pattern matching in their YAML)

### Phase 2: Span Annotation Helpers

**File:** `src/integrations/effect/effect-helpers.ts`

**Changes:**
1. Implement all 9 annotation helper functions using code from `span-helpers.ts`
2. Match function signatures exactly (already exported in `index.ts`)
3. All helpers use `Effect.annotateCurrentSpan()` for proper Effect integration
4. Add JSDoc documentation from source code

**Functions to implement:**
- `annotateUser(userId, email?, username?)`
- `annotateDataSize(bytes, items, compressionRatio?)`
- `annotateBatch(totalItems, batchSize, successCount?, failureCount?)`
- `annotateLLM(model, provider, tokens?)`
- `annotateQuery(query, duration?, rowCount?, database?)`
- `annotateHttpRequest(method, url, statusCode?, contentLength?)`
- `annotateError(error, recoverable, errorType?)`
- `annotatePriority(priority, reason?)`
- `annotateCache(hit, key, ttl?)`

### Phase 3: Auto-Enrichment Utilities

**New file:** `src/integrations/effect/auto-enrichment.ts`

**Exports:**
1. `extractEffectMetadata(spanName: string): Effect.Effect<EffectMetadata>` - Extract metadata from current fiber
2. `autoEnrichSpan(spanName: string): Effect.Effect<void>` - Auto-annotate current span
3. `withAutoEnrichedSpan<A, E, R>(spanName, options?): (Effect<A, E, R>) => Effect<A, E, R>` - Wrapper combining withSpan + enrichment

**Update:** `src/integrations/effect/index.ts` to export these

### Phase 4: HTTP Request Filtering

**File:** `src/core/http-filtering.ts` (new)

**Purpose:** Provide utilities to prevent OTLP trace loops by filtering requests to OTLP endpoints

**Exports:**
1. `createOtlpRequestFilter(): (url: string) => boolean` - Returns true if URL should be filtered
2. `getOtlpEndpointPatterns(): string[]` - Returns array of OTLP endpoint patterns to filter
3. Integration hooks for NodeSDK auto-instrumentation

**Patterns to filter:**
- `/v1/traces`
- `/v1/metrics`
- `/v1/logs`
- Any URL matching `baseUrl` from config

### Phase 5: Documentation & Examples

**Files to update:**
1. **`README.md`** - Add section on Effect context bridging with `tracerContext` pattern
2. **`examples/effect-app/`** - Add example showing `tracerContext` usage
3. **`docs/effect-integration.md`** (new) - Comprehensive Effect integration guide

**Key documentation:**
- How to use `tracerContext` callback in `Otlp.layer()` for proper span parenting
- How to use auto-enrichment utilities
- Best practices for annotation helpers
- How to prevent OTLP trace loops

## Files to Be Changed

### Core Implementation

1. **`src/integrations/effect/metadata-extractor.ts`** - Full rewrite with proper fiber metadata extraction
2. **`src/integrations/effect/effect-helpers.ts`** - Implement all 9 stub functions
3. **`src/integrations/effect/auto-enrichment.ts`** - NEW FILE - Auto-enrichment utilities
4. **`src/integrations/effect/index.ts`** - Export new auto-enrichment functions
5. **`src/core/http-filtering.ts`** - NEW FILE - HTTP request filtering utilities

### Documentation

6. **`README.md`** - Add Effect context bridging section
7. **`examples/effect-app/src/index.ts`** - Add `tracerContext` example
8. **`docs/effect-integration.md`** - NEW FILE - Comprehensive guide

### Tests

9. **`test/unit/effect/metadata-extraction.test.ts`** - Tests for fiber metadata extraction
10. **`test/unit/effect/annotation-helpers.test.ts`** - Tests for all annotation helpers
11. **`test/unit/effect/auto-enrichment.test.ts`** - Tests for auto-enrichment utilities
12. **`test/integration/effect/context-bridging.test.ts`** - Integration test for `tracerContext` pattern

## Design Decisions & Trade-offs

### 1. Keep Auto-Enrichment Optional

**Decision:** Don't force auto-enrichment on users. Provide utilities but let them opt-in.

**Reasoning:**
- Users may want manual control over what metadata is extracted
- Keeps library flexible and non-opinionated
- Matches "zero-config but configurable" philosophy

**Implementation:**
- Provide `autoEnrichSpan()` and `withAutoEnrichedSpan()` as opt-in utilities
- Don't automatically call them in `EffectInstrumentationLive` layer

### 2. Remove Atrim-Specific Configuration Dependencies

**Decision:** Remove `shouldInstrumentEffectSpan()` dependency from metadata extraction.

**Reasoning:**
- That function depends on Atrim's specific YAML config structure
- This library has its own config system (pattern-based via `instrumentation.yaml`)
- Users control instrumentation via pattern matching, not inside metadata extraction

**Implementation:**
- `extractEffectMetadata()` always extracts all metadata
- Users control which spans get created via YAML patterns
- Once a span is created, all metadata is extracted

### 3. HTTP Filtering as Utility, Not Auto-Configuration

**Decision:** Provide HTTP filtering utilities but don't auto-configure them.

**Reasoning:**
- Users may have different OTLP endpoints
- Auto-configuration could be surprising behavior
- Better to provide tools and document how to use them

**Implementation:**
- Provide `createOtlpRequestFilter()` utility
- Document in README how to use with NodeSDK auto-instrumentation
- Provide example in `examples/effect-app/`

### 4. Match Atrim Function Signatures Where Possible

**Decision:** Keep function signatures from `span-helpers.ts` as closely as possible.

**Reasoning:**
- Already battle-tested in production
- Familiar to Atrim developers
- Follows OpenTelemetry semantic conventions

**Exceptions:**
- Change `Effect.Effect<void, never, never>` return types to match Effect-TS best practices
- Adjust parameter names for consistency (e.g., `items` vs `count`)

## Implementation Plan

### Step 1: Implement Core Metadata Extraction
1. Rewrite `metadata-extractor.ts` with full fiber metadata extraction
2. Add unit tests for `extractEffectMetadata()`
3. Verify fiber ID, status, and parent span extraction work correctly

### Step 2: Implement Annotation Helpers
1. Implement all 9 annotation helper functions
2. Add unit tests for each helper
3. Verify they work with `Effect.annotateCurrentSpan()`

### Step 3: Add Auto-Enrichment Utilities
1. Create `auto-enrichment.ts` with utilities
2. Export from `index.ts`
3. Add unit tests
4. Add integration test demonstrating usage

### Step 4: Add HTTP Filtering Utilities
1. Create `http-filtering.ts` with OTLP request filtering
2. Add unit tests
3. Document usage patterns

### Step 5: Documentation & Examples
1. Update README with Effect context bridging section
2. Add comprehensive Effect integration guide
3. Update `examples/effect-app/` with best practices
4. Add `tracerContext` example

### Step 6: Testing & Validation
1. Run all unit tests
2. Run integration tests
3. Validate examples work end-to-end
4. Test in a real Effect-TS application

## Success Metrics

✅ **Implementation Complete:**
- All 9 annotation helpers implemented with tests
- Metadata extraction fully implemented with tests
- Auto-enrichment utilities implemented with tests
- HTTP filtering utilities implemented with tests

✅ **Documentation Complete:**
- README has Effect context bridging section
- Comprehensive Effect integration guide exists
- Examples demonstrate all features
- `tracerContext` pattern documented

✅ **Quality Metrics:**
- All tests pass (unit + integration)
- Test coverage >80% for new code
- No breaking changes to existing API
- Examples run successfully

## Next Steps

1. **User review and approval** of this proposal
2. **Implement changes** in phases as outlined above
3. **Test thoroughly** at each phase
4. **Update documentation** as features are implemented
5. **Create PR** with all changes for final review

## Questions for User

1. **Scope confirmation:** Does this cover all the fiber annotation work you wanted migrated?
2. **API surface:** Are there any function signatures you'd like changed from the Atrim version?
3. **Priority:** Which phase should we tackle first? (I recommend Phase 1 → Phase 2 → Phase 3)
4. **Breaking changes:** Are you okay with the current stub implementations being replaced? (No existing users should be affected since they're all stubs)
5. **HTTP filtering:** Should this be in core or Effect integration? (I proposed core since it's useful for all users)

## References

- **Source code:** `~/projects/atrim/src/platform-introspection/`
- **Related issue:** #316 (Effect auto-instrumentation)
- **Current library:** `/Users/croach/projects/atrim-instrumentation/`
- **Effect-TS docs:** https://effect.website/docs/observability/tracing/
- **OpenTelemetry docs:** https://opentelemetry.io/docs/specs/semconv/
