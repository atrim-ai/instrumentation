# Dependency Strategy - Conservative Approach

## Philosophy

**Minimize Required Dependencies - Maximize User Control**

The `@atrim/instrumentation` library follows an extremely conservative dependency strategy to ensure:
- ✅ Users control their own OpenTelemetry SDK versions
- ✅ Backwards compatibility with older OTel versions
- ✅ No forced dependency upgrades
- ✅ Minimal impact on user application dependency trees
- ✅ No version conflicts with user's existing dependencies

## Dependency Categories

### 1. Core Required Dependencies (Absolute Minimum)

**Only what's truly essential:**
- `zod` - Configuration validation (no alternatives, stable API)
- `yaml` - YAML parsing (no alternatives, stable API)

**That's it. Everything else is peer or optional.**

### 2. Peer Dependencies (User Provides)

**OpenTelemetry Core:**
- `@opentelemetry/api` - **User provides their version**
- `@opentelemetry/sdk-trace-base` - **User provides their version**
- `@opentelemetry/sdk-node` - **User provides their version** (optional)
- `@opentelemetry/exporter-trace-otlp-http` - **User provides** (optional)

**Effect-TS (Optional):**
- `effect` - **User provides their version** (only if using Effect features)
- `@effect/opentelemetry` - **User provides** (only if using Effect features)

### 3. Development Dependencies

**Only for building/testing the library itself:**
- TypeScript, Vitest, ESLint, Prettier, etc.

## Why This Matters

### Problem: Traditional Approach

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-trace-base": "^1.25.0",
    "@opentelemetry/sdk-node": "^0.52.0"
  }
}
```

**Issues:**
- ❌ Forces users to use our chosen OTel versions
- ❌ Breaks if user needs older version for compatibility
- ❌ Creates version conflicts in user's dependency tree
- ❌ Prevents users from upgrading OTel independently

### Solution: Peer Dependencies

```json
{
  "dependencies": {
    "zod": "^3.22.0",
    "yaml": "^2.3.0"
  },
  "peerDependencies": {
    "@opentelemetry/api": "^1.0.0",
    "@opentelemetry/sdk-trace-base": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@opentelemetry/api": {
      "optional": false  // Required
    },
    "@opentelemetry/sdk-trace-base": {
      "optional": true   // Optional (only if using advanced features)
    }
  }
}
```

**Benefits:**
- ✅ Users control OTel versions
- ✅ Works with OTel 1.0+ (wide compatibility range)
- ✅ No version conflicts
- ✅ Users can upgrade OTel independently
- ✅ Backwards compatible with older OTel versions

## Implementation Guidelines

### Rule 1: Only Import TypeScript Types from OTel

```typescript
// ✅ GOOD - Import only types
import type { Span, SpanProcessor } from '@opentelemetry/api'

// ❌ BAD - Import runtime code
import { trace } from '@opentelemetry/api'
```

**Why:** Type imports are stripped at runtime, so they don't create runtime dependencies.

### Rule 2: Use Duck Typing for Interfaces

```typescript
// ✅ GOOD - Duck typing interface
interface SpanLike {
  setAttribute(key: string, value: unknown): void
  recordException(exception: Error): void
  end(): void
}

export function setSpanAttributes(span: SpanLike, attrs: Record<string, unknown>) {
  // Works with any object that has these methods
}

// ❌ BAD - Require specific OTel types
export function setSpanAttributes(span: Span, attrs: Record<string, unknown>) {
  // Forces users to use our OTel version
}
```

### Rule 3: Lazy Loading for Optional Features

```typescript
// ✅ GOOD - Lazy load optional dependencies
export async function createNodeSDKProcessor() {
  // Only imported when user calls this function
  const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base')
  return new BatchSpanProcessor(/* ... */)
}

// ❌ BAD - Top-level import
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
```

### Rule 4: Provide Multiple Import Paths

```typescript
// Core (minimal dependencies)
import { initializeInstrumentation } from '@atrim/instrumentation'

// Effect integration (requires Effect peer deps)
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

// Advanced features (requires additional OTel peer deps)
import { createNodeSDKProcessor } from '@atrim/instrumentation/sdk'
```

## Version Compatibility Matrix

### OpenTelemetry API Support

| OTel API Version | Supported | Notes |
|-----------------|-----------|-------|
| 1.0.x | ✅ | Minimum supported version |
| 1.1.x - 1.8.x | ✅ | Full compatibility |
| 1.9.x | ✅ | Current recommended |
| 2.0.x | 🔮 | Future - will support when stable |

### Effect-TS Support

| Effect Version | Supported | Notes |
|---------------|-----------|-------|
| 2.x | ❌ | Not supported |
| 3.0.x - 3.9.x | ✅ | Minimum supported version |
| 3.10.x+ | ✅ | Current recommended |

## User Installation Scenarios

### Scenario 1: Vanilla TypeScript (Minimal)

```bash
# User installs
npm install @atrim/instrumentation
npm install @opentelemetry/api@1.4.0  # User chooses version

# Result: Only 3 packages in their node_modules
# - @atrim/instrumentation
# - @opentelemetry/api
# - zod, yaml (transitive from @atrim/instrumentation)
```

### Scenario 2: Effect-TS User

```bash
# User installs
npm install @atrim/instrumentation
npm install @opentelemetry/api@1.9.0
npm install effect@3.10.0
npm install @effect/opentelemetry@0.40.0

# Result: They control all version numbers
```

### Scenario 3: User with Legacy OTel

```bash
# User has existing app with OTel 1.2.0
npm install @atrim/instrumentation

# Works! Uses their existing @opentelemetry/api@1.2.0
# No conflicts, no forced upgrades
```

## Testing Strategy

### Test Against Multiple Versions

CI matrix should test against:
- Node.js: 18, 20, 22
- Bun: 1.0, 1.1, latest
- OTel API: 1.0.x, 1.4.x, 1.9.x
- Effect: 3.0.x, 3.10.x, latest

### Mock External Dependencies in Tests

```typescript
// Use vitest mocks for OTel types
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: vi.fn()
    })
  }
}))
```

## Documentation for Users

### Installation Docs

**Always show peer dependency installation:**

```markdown
# Install the library
npm install @atrim/instrumentation

# Install OpenTelemetry peer dependencies
npm install @opentelemetry/api

# Optional: For Effect-TS users
npm install effect @effect/opentelemetry
```

### Version Compatibility Warning

```markdown
**Note:** This library requires `@opentelemetry/api` >= 1.0.0.
You provide your own version to maintain backwards compatibility with your application.
```

## Security Considerations

### Dependency Audit

With minimal dependencies:
- ✅ Smaller attack surface (only 2 runtime deps: zod + yaml)
- ✅ Easier to audit for vulnerabilities
- ✅ Less maintenance burden
- ✅ Users responsible for OTel security updates (they control versions)

### Supply Chain Security

```bash
# Verify minimal dependency tree
npm ls --all --depth=1

# Should show:
# @atrim/instrumentation@0.1.0
# ├── zod@3.22.0
# └── yaml@2.3.0
# (peer dependencies not in tree)
```

## Breaking Changes Policy

### Version Policy

**Major version bump required if:**
- Minimum required peer dependency version increases
- Breaking API changes
- New required dependencies added

**Minor version safe:**
- New optional features
- New optional peer dependencies
- Bug fixes
- Performance improvements

**Example:**
```
v1.0.0 → v1.1.0  # Added optional Effect integration (safe)
v1.1.0 → v2.0.0  # Minimum OTel API: 1.0 → 2.0 (breaking)
```

## Future Considerations

### When to Add a Dependency

**Only add a required dependency if:**
1. ✅ No reasonable alternative exists
2. ✅ Package is stable (not in rapid development)
3. ✅ Package has no dependencies itself (or minimal)
4. ✅ Package solves a problem users can't solve themselves
5. ✅ Cost/benefit analysis strongly favors inclusion

**Examples:**
- ✅ `zod` - Schema validation essential, no good alternatives
- ✅ `yaml` - YAML parsing essential, no good alternatives
- ❌ `lodash` - Users can provide their own utilities
- ❌ `axios` - Use native fetch, let users choose HTTP client
- ❌ `@opentelemetry/*` - Users must control OTel versions

## Summary

**Conservative Dependency Strategy:**
1. **Absolute minimum** required dependencies (zod + yaml only)
2. **Everything else** is peer dependencies (user controls versions)
3. **Type-only imports** from peer dependencies when possible
4. **Lazy loading** for optional features
5. **Wide version ranges** for peer dependencies (1.0+)
6. **Test against multiple versions** in CI
7. **Clear documentation** about peer dependencies

**Result:**
- Users have full control over OpenTelemetry versions
- Backwards compatible with older OTel versions
- No dependency conflicts
- Minimal impact on user dependency trees
- Library can be used across different tech stacks without version conflicts
