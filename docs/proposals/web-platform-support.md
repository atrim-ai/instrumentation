# Proposal: Web Platform Support (@atrim/instrument-web)

**Date**: 2025-11-13
**Status**: Proposal
**Target Version**: v1.0.0 (post monorepo migration)

## Naming Convention

This proposal adopts a platform-based naming convention for better scalability:

- **`@atrim/instrument-web`** - Browser/web platform support (this proposal)
- **`@atrim/instrument-node`** - Node.js platform (current package, will rename)
- **`@atrim/instrument-python`** - Python platform (future, separate repo)
- **`@atrim/instrument-go`** - Go platform (future, separate repo)

The current `@atrim/instrumentation` package will be renamed to `@atrim/instrument-node`, with a deprecation path for existing users.

## Problem Statement

The `@atrim/instrumentation` library currently supports only Node.js-based backends (Express, Fastify, Effect-TS, etc.). However, modern full-stack applications need observability across the entire stack:

- **Backend** (already supported): API servers, microservices, background jobs
- **Frontend** (NOT supported): React SPAs, Next.js client-side, browser applications

Without frontend support:
- ❌ No visibility into client-side performance (page loads, user interactions)
- ❌ No end-to-end trace correlation (browser → API → database)
- ❌ Inconsistent instrumentation patterns across frontend and backend
- ❌ Teams must use different tools/approaches for each layer

## Goals

1. **Code Reuse**: Leverage existing core logic (config loading, pattern matching, schema validation)
2. **Consistency**: Same `instrumentation.yaml` configuration for frontend and backend
3. **Universal API**: Similar developer experience across Node.js and browser environments
4. **Zero-Config**: Works out of the box with sensible defaults
5. **Framework Agnostic**: Works with React, Vue, Svelte, vanilla JS (React is priority)

## Proposed Solution

### Architecture Overview

```
@atrim/instrumentation
├── src/
│   ├── core/                           # Shared (Node.js + Browser)
│   │   ├── config-loader.ts           # ✅ Reusable (add browser fetch)
│   │   ├── pattern-matcher.ts         # ✅ Fully reusable
│   │   ├── instrumentation-schema.ts  # ✅ Fully reusable
│   │   └── span-processor.ts          # ⚠️  Needs browser variant
│   ├── integrations/
│   │   ├── node/                      # Node.js specific (rename from standard/)
│   │   │   ├── sdk-initializer.ts
│   │   │   └── tracer-provider.ts
│   │   ├── browser/                   # NEW: Browser specific
│   │   │   ├── sdk-initializer.ts    # WebTracerProvider + auto-instrumentations
│   │   │   ├── span-processor.ts     # Browser-compatible BatchSpanProcessor
│   │   │   └── performance-helpers.ts # Web Vitals, Navigation Timing
│   │   ├── react/                     # NEW: React specific
│   │   │   ├── hooks.ts              # useTraceSpan(), usePerformance()
│   │   │   ├── components.ts         # <TracedComponent>, <ErrorBoundary>
│   │   │   └── router-integration.ts # React Router auto-instrumentation
│   │   └── effect/                    # Existing Effect-TS
│   └── api/
│       ├── node.ts                    # Node.js API (current api.ts)
│       ├── browser.ts                 # NEW: Browser API
│       └── react.ts                   # NEW: React API
```

### Package Structure Options

We have two options for structuring this:

#### Option A: New Separate Package (Recommended)

Create `@atrim/instrument-web` as a new package:

```json
// @atrim/instrument-web package.json
{
  "name": "@atrim/instrument-web",
  "exports": {
    ".": {
      "types": "./target/dist/index.d.ts",
      "import": "./target/dist/index.js"
    },
    "./react": {
      "types": "./target/dist/integrations/react/index.d.ts",
      "import": "./target/dist/integrations/react/index.js"
    }
  }
}
```

**Benefits:**
- ✅ Cleaner separation of Node.js vs Web dependencies
- ✅ Smaller bundle sizes (no Node.js code in web builds)
- ✅ Follows platform-based naming convention
- ✅ Easier to share core logic via internal packages or git submodules
- ✅ Clear migration path (existing users unaffected)

**Drawbacks:**
- ⚠️ Need strategy for sharing core code (config loader, pattern matcher)
- ⚠️ Two packages to maintain

#### Option B: Unified Package with Subpath Exports

Keep everything in a single package with platform-specific exports:

```json
// @atrim/instrument package.json (hypothetical unified package)
{
  "name": "@atrim/instrument",
  "exports": {
    ".": {
      "types": "./target/dist/index.d.ts",
      "import": "./target/dist/index.js",
      "require": "./target/dist/index.cjs"
    },
    "./web": {
      "types": "./target/dist/integrations/web/index.d.ts",
      "import": "./target/dist/integrations/web/index.js"
    },
    "./web/react": {
      "types": "./target/dist/integrations/react/index.d.ts",
      "import": "./target/dist/integrations/react/index.js"
    },
    "./effect": {
      "types": "./target/dist/integrations/effect/index.d.ts",
      "import": "./target/dist/integrations/effect/index.js",
      "require": "./target/dist/integrations/effect/index.cjs"
    }
  }
}
```

**Benefits:**
- ✅ Single package to maintain
- ✅ Code sharing is trivial (same repo)
- ✅ One version number for all platforms

**Drawbacks:**
- ❌ Larger package size (includes both Node.js and web code)
- ❌ Dependency management is trickier (optionalDependencies)
- ❌ Doesn't follow the `instrument-node`, `instrument-web`, `instrument-python` naming convention

**Recommendation:** **Option A** - Separate `@atrim/instrument-web` package

This aligns with the naming convention and provides cleaner separation.

### Code Sharing Strategy

Since we're creating separate packages, we need a strategy for sharing core logic (config loader, pattern matcher, schema validation). Here are the options:

#### Strategy 1: Monorepo with Internal Core Package (Recommended)

```
packages/
├── core/                           # @atrim/instrument-core (private)
│   ├── src/
│   │   ├── config-loader.ts
│   │   ├── pattern-matcher.ts
│   │   └── instrumentation-schema.ts
│   └── package.json
├── node/                           # @atrim/instrument-node (public)
│   ├── src/
│   │   ├── integrations/node/
│   │   ├── integrations/effect/
│   │   └── index.ts
│   └── package.json                # depends on @atrim/instrument-core
├── web/                            # @atrim/instrument-web (public)
│   ├── src/
│   │   ├── integrations/browser/
│   │   ├── integrations/react/
│   │   └── index.ts
│   └── package.json                # depends on @atrim/instrument-core
```

**Tools:** Use pnpm workspaces, npm workspaces, or Turborepo

**Benefits:**
- ✅ Single source of truth for core logic
- ✅ Easy to maintain consistency
- ✅ Simple versioning (bump core, both packages get update)
- ✅ Shared tooling (ESLint, TypeScript, Vitest configs)

**Drawbacks:**
- ⚠️ Requires monorepo setup
- ⚠️ More complex release process

#### Strategy 2: Keep Current Package as `@atrim/instrument-node`

Instead of creating a new repo, rename the current package and add web as a sibling:

```
atrim-instrumentation/ (monorepo)
├── packages/
│   ├── core/      # Shared
│   ├── node/      # Current package (renamed)
│   └── web/       # New package
```

**Migration Path:**
1. Current users keep using `@atrim/instrumentation` (aliased to `@atrim/instrument-node`)
2. New users use explicit `instrument-node` or `instrument-web` packages
3. Eventually deprecate the `@atrim/instrumentation` alias

**Benefits:**
- ✅ Smooth migration for existing users
- ✅ Monorepo benefits
- ✅ Clear platform separation

#### Strategy 3: Separate Repos (Not Recommended)

Keep packages in separate repos and duplicate core code.

**Benefits:**
- ✅ Complete independence

**Drawbacks:**
- ❌ Code duplication
- ❌ Harder to maintain consistency
- ❌ Version drift risk

**Final Recommendation:** **Strategy 1 or 2** - Monorepo with shared core package

This provides the best balance of code reuse and platform separation.

### Dependencies

#### New Runtime Dependencies (Browser)

```json
{
  "dependencies": {
    "@opentelemetry/sdk-trace-web": "^1.30.0",
    "@opentelemetry/instrumentation-document-load": "^0.42.0",
    "@opentelemetry/instrumentation-fetch": "^0.56.0",
    "@opentelemetry/instrumentation-xml-http-request": "^0.56.0",
    "@opentelemetry/instrumentation-user-interaction": "^0.42.0",
    "@opentelemetry/context-zone": "^1.30.0",
    "web-vitals": "^4.2.0"
  },
  "peerDependencies": {
    "react": ">=16.8.0",
    "react-router-dom": ">=5.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    },
    "react-router-dom": {
      "optional": true
    }
  }
}
```

**Note**: These will be conditionally imported based on environment detection.

### API Design

#### 1. Browser API (Vanilla JS)

```typescript
// @atrim/instrument-web

import { initializeInstrumentation } from '@atrim/instrument-web'

// Zero-config initialization
await initializeInstrumentation()

// With custom config
await initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  serviceName: 'my-app-frontend',
  otlp: {
    endpoint: 'https://otel-collector.company.com:4318/v1/traces'
  },

  // Browser-specific options
  autoInstrument: {
    documentLoad: true,      // Page load performance
    fetch: true,             // Fetch API calls
    xmlHttpRequest: true,    // XHR calls
    userInteraction: true    // Clicks, form submits
  },

  // Web Vitals tracking
  webVitals: {
    enabled: true,
    reportAllChanges: false  // Only report final values
  }
})
```

#### 2. React Hooks API

```typescript
// @atrim/instrument-web/react

import { useTraceSpan, usePerformance } from '@atrim/instrument-web/react'

function MyComponent() {
  // Automatic span for component lifecycle
  const span = useTraceSpan('MyComponent.render')

  // Track performance metrics
  const performance = usePerformance()

  useEffect(() => {
    span.setAttribute('user.id', userId)
    performance.mark('data-fetched')
  }, [])

  return <div>...</div>
}
```

#### 3. React Components API

```typescript
// @atrim/instrument-web/react

import { TracedComponent, TracedErrorBoundary } from '@atrim/instrument-web/react'

// Automatic tracing wrapper
function App() {
  return (
    <TracedErrorBoundary fallback={<ErrorPage />}>
      <TracedComponent name="app.dashboard">
        <Dashboard />
      </TracedComponent>
    </TracedErrorBoundary>
  )
}
```

#### 4. React Router Integration

```typescript
// @atrim/instrument-web/react

import { BrowserRouter } from 'react-router-dom'
import { TraceableRouter } from '@atrim/instrument-web/react'

function App() {
  return (
    <TraceableRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </TraceableRouter>
  )
}
// Automatically creates spans for route transitions
```

### Configuration Schema Extensions

```yaml
# instrumentation.yaml

version: "1.0"

instrumentation:
  enabled: true
  description: "Centralized OpenTelemetry span filtering"

  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
    - pattern: "^api\\."
      enabled: true

  ignore_patterns:
    - pattern: "^test\\."

# NEW: Browser-specific configuration
browser:
  # Auto-instrumentation settings
  auto_instrument:
    document_load: true
    fetch: true
    xhr: true
    user_interaction: true

  # Web Vitals tracking
  web_vitals:
    enabled: true
    metrics:
      - LCP  # Largest Contentful Paint
      - FID  # First Input Delay
      - CLS  # Cumulative Layout Shift
      - FCP  # First Contentful Paint
      - TTFB # Time to First Byte

  # Propagate traces to backend
  propagation:
    enabled: true
    cors_urls:
      - "https://api.company.com/*"
      - "https://api.staging.company.com/*"

  # React-specific settings (optional)
  react:
    component_tracking: true
    router_integration: true
    error_boundary: true

# Effect-TS (existing, unchanged)
effect:
  auto_extract_metadata: true
```

### Build System Updates

#### tsup Configuration

```typescript
// tsup.config.ts

export default defineConfig([
  // Node.js build (existing)
  {
    entry: {
      'index': 'src/index.ts',
      'integrations/effect/index': 'src/integrations/effect/index.ts'
    },
    format: ['esm', 'cjs'],
    target: 'node18',
    // ...
  },

  // Browser build (NEW)
  {
    entry: {
      'api/browser': 'src/api/browser.ts',
      'api/react': 'src/api/react.ts'
    },
    format: ['esm'], // Only ESM for browsers
    target: 'es2020', // Modern browsers
    platform: 'browser',
    outDir: 'target/dist',
    dts: true,
    clean: false
  }
])
```

### Core Code Reuse Strategy

#### 1. Config Loader (Minimal Changes)

```typescript
// src/core/config-loader.ts

export async function loadConfig(options: ConfigLoaderOptions = {}): Promise<InstrumentationConfig> {
  // Existing logic works in both Node.js and browser
  // Both environments have native fetch() in 2025

  // Environment detection
  const isBrowser = typeof window !== 'undefined'

  if (isBrowser && !options.configPath && !options.configUrl && !options.config) {
    // In browser, default to remote config or embedded config
    // Cannot read local files in browser for security reasons
    options.configUrl = options.configUrl || process.env.ATRIM_CONFIG_URL
  }

  // Rest of existing logic unchanged
}
```

#### 2. Pattern Matcher (No Changes)

```typescript
// src/core/pattern-matcher.ts

// ✅ Fully reusable in browser
// No Node.js-specific APIs used
// Pure TypeScript logic
```

#### 3. Schema Validation (Additive Changes)

```typescript
// src/core/instrumentation-schema.ts

// ✅ Add browser-specific schemas
export const BrowserConfigSchema = z.object({
  auto_instrument: z.object({
    document_load: z.boolean().default(true),
    fetch: z.boolean().default(true),
    xhr: z.boolean().default(true),
    user_interaction: z.boolean().default(true)
  }).optional(),

  web_vitals: z.object({
    enabled: z.boolean().default(true),
    metrics: z.array(z.enum(['LCP', 'FID', 'CLS', 'FCP', 'TTFB'])).optional()
  }).optional(),

  propagation: z.object({
    enabled: z.boolean().default(true),
    cors_urls: z.array(z.string()).optional()
  }).optional(),

  react: z.object({
    component_tracking: z.boolean().default(true),
    router_integration: z.boolean().default(true),
    error_boundary: z.boolean().default(true)
  }).optional()
})

export const InstrumentationConfigSchema = z.object({
  version: z.string(),
  instrumentation: z.object({
    // ... existing
  }),
  effect: z.object({
    // ... existing
  }).optional(),
  browser: BrowserConfigSchema.optional() // NEW
})
```

### Examples to Provide

#### 1. React SPA with Express Backend

```typescript
// frontend/src/instrumentation.ts
import { initializeInstrumentation } from '@atrim/instrument-web'

await initializeInstrumentation({
  configUrl: '/instrumentation.yaml', // Served from backend
  serviceName: 'my-app-frontend',
  otlp: {
    endpoint: 'https://otel-collector.company.com:4318/v1/traces'
  }
})

// backend/src/index.ts
import { initializeInstrumentation } from '@atrim/instrument-node'

await initializeInstrumentation({
  configPath: './instrumentation.yaml',
  serviceName: 'my-app-backend'
})
```

Both share the same `instrumentation.yaml` file!

#### 2. Next.js App (App Router)

```typescript
// app/instrumentation.ts (Next.js 13+ instrumentation hook)
export async function register() {
  if (typeof window === 'undefined') {
    // Server-side (Node.js)
    const { initializeInstrumentation } = await import('@atrim/instrument-node')
    await initializeInstrumentation()
  } else {
    // Client-side (Browser)
    const { initializeInstrumentation } = await import('@atrim/instrument-web')
    await initializeInstrumentation()
  }
}
```

#### 3. React with Effect-TS (Full Stack)

```typescript
// Frontend: React + Effect (if Effect works in browser)
import { useMemo } from 'react'
import { Effect, Layer } from 'effect'
import { EffectInstrumentationLive } from '@atrim/instrument-web/effect'

function DataFetcher() {
  const fetchData = useMemo(() =>
    Effect.gen(function* () {
      const data = yield* Effect.tryPromise(() => fetch('/api/data'))
      return data
    }).pipe(
      Effect.withSpan('app.fetchData'),
      Effect.provide(EffectInstrumentationLive)
    )
  , [])

  // ... use fetchData
}

// Backend: Node.js + Effect
import { Effect } from 'effect'
import { EffectInstrumentationLive } from '@atrim/instrument-node/effect'

const app = Effect.gen(function* () {
  yield* processData()
}).pipe(
  Effect.withSpan('app.main'),
  Effect.provide(EffectInstrumentationLive)
)
```

### Testing Strategy

#### Unit Tests (Vitest)

- ✅ Config loading in browser environment (jsdom)
- ✅ Pattern matching (reuse existing tests)
- ✅ Browser schema validation
- ✅ React hooks behavior (React Testing Library)
- ✅ Component rendering (React Testing Library)

#### Integration Tests (Playwright)

```typescript
// test/integration/browser/react-spa.spec.ts

test('React SPA generates traces', async ({ page }) => {
  // Start test app with instrumentation
  const app = await startReactApp()

  // Navigate to app
  await page.goto('http://localhost:3000')

  // Verify spans sent to collector
  const spans = await collector.getSpans()

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'documentLoad',
      attributes: expect.objectContaining({
        'navigation.type': 'navigate'
      })
    })
  )
})

test('End-to-end trace propagation', async ({ page }) => {
  // Frontend click → API call → backend span
  await page.click('[data-testid="fetch-button"]')

  const traces = await collector.getTraces()
  const trace = traces[0]

  // Verify trace contains both frontend and backend spans
  expect(trace.spans).toContainEqual(
    expect.objectContaining({ name: 'userInteraction' })
  )
  expect(trace.spans).toContainEqual(
    expect.objectContaining({ name: 'GET /api/data' })
  )
})
```

#### Runtime Tests

- Node.js 18+, 20+, 22+ (existing)
- Modern browsers (Chrome, Firefox, Safari via Playwright)
- React 16.8+, 17, 18, 19 (hooks support)
- Next.js 13+, 14+ (App Router)

### Migration Path

#### Phase 1: Core Browser Support (v0.2.0-alpha.1)

- [ ] Browser SDK initialization
- [ ] Config loading in browser
- [ ] Pattern matching (reused)
- [ ] Basic auto-instrumentation (fetch, XHR, document load)
- [ ] OTLP export over HTTP
- [ ] Vanilla JS example

#### Phase 2: React Integration (v0.2.0-beta.1)

- [ ] React hooks (useTraceSpan, usePerformance)
- [ ] React components (TracedComponent, ErrorBoundary)
- [ ] React Router integration
- [ ] Web Vitals tracking
- [ ] React SPA example
- [ ] Next.js example

#### Phase 3: Advanced Features (v0.2.0)

- [ ] End-to-end trace correlation
- [ ] Performance monitoring (LCP, FID, CLS)
- [ ] Error tracking with source maps
- [ ] Session replay integration hooks
- [ ] Effect-TS browser support (if feasible)

#### Phase 4: Stable Release (v1.0.0)

- [ ] All integration tests passing
- [ ] Documentation complete
- [ ] 80%+ test coverage
- [ ] Performance benchmarks
- [ ] Migration guide

### Breaking Changes

**None for existing users!**

- Node.js API remains unchanged
- Effect-TS API remains unchanged
- All existing examples continue to work
- New exports are additive only

### Documentation Updates

#### New Guides

1. **Browser Getting Started**
   - Zero-config setup
   - Custom configuration
   - CORS setup for trace propagation

2. **React Integration Guide**
   - Hooks API
   - Component API
   - Router integration
   - Error boundaries

3. **Full-Stack Observability**
   - Shared configuration
   - End-to-end tracing
   - Trace correlation
   - Performance monitoring

4. **Web Vitals Tracking**
   - Core Web Vitals (LCP, FID, CLS)
   - Custom performance marks
   - User-centric metrics

#### Updated Guides

- README: Add browser/React examples
- Installation: Add browser-specific dependencies
- Configuration: Document browser schema
- Examples: Add 4+ browser examples

### Success Metrics

#### Technical

- ✅ Works in modern browsers (Chrome, Firefox, Safari)
- ✅ Works with React 16.8+ (hooks)
- ✅ Works with Next.js 13+ (App Router)
- ✅ Code reuse >70% from existing library
- ✅ Zero-config works for browser
- ✅ Performance overhead <3% (browser is more sensitive)
- ✅ Bundle size <50KB (gzipped, with tree-shaking)

#### User Experience

- ✅ Same configuration file works for frontend and backend
- ✅ Trace propagation works automatically
- ✅ React API feels natural and idiomatic
- ✅ Getting started in <10 minutes

#### Documentation

- ✅ Browser getting started guide
- ✅ React integration guide
- ✅ 4+ example projects
- ✅ Migration guide (none needed - non-breaking)

### Open Questions

1. **Effect-TS in Browser**: Effect-TS works in browser, but is it a common use case?
   - **Decision**: Support it in Phase 3 if there's demand

2. **Web Vitals Library**: Use `web-vitals` npm package or implement ourselves?
   - **Recommendation**: Use `web-vitals` (Google's official library)

3. **Source Maps**: Should we integrate with source map tools for error tracking?
   - **Recommendation**: Phase 3 or later

4. **Session Replay**: Integrate with session replay tools (LogRocket, FullStory)?
   - **Recommendation**: Provide hooks for integration, don't bundle

5. **Mobile React Native**: Should we support React Native?
   - **Recommendation**: Separate library or Phase 4

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser OpenTelemetry is experimental | High | Document clearly, provide fallbacks |
| Bundle size too large | Medium | Tree-shaking, code splitting, peer deps |
| CORS issues with trace propagation | High | Clear documentation, validation utilities |
| React version compatibility | Medium | Test against React 16.8+, 17, 18, 19 |
| Performance overhead in browser | High | Careful profiling, sampling, lazy loading |

### Alternative Approaches Considered

#### 1. Separate Package (`@atrim/instrumentation-browser`)

**Pros:**
- Cleaner separation of concerns
- Smaller bundle for Node.js-only users
- Independent versioning

**Cons:**
- ❌ Code duplication (config, patterns)
- ❌ Harder to maintain consistency
- ❌ More confusing for users

**Decision**: Use same package with separate exports

#### 2. Framework-Specific Packages

**Pros:**
- Smaller bundles (only React code for React users)
- Easier to optimize per framework

**Cons:**
- ❌ More packages to maintain
- ❌ Code duplication across packages
- ❌ Inconsistent APIs

**Decision**: One package, optional peer dependencies

#### 3. No Configuration Reuse

**Pros:**
- Simpler implementation
- No need to adapt config loader

**Cons:**
- ❌ Users maintain 2 config files
- ❌ Inconsistent patterns
- ❌ Defeats "universal" goal

**Decision**: Reuse configuration (core value prop)

## Recommendation

**Proceed with the platform-based naming approach** using a monorepo structure:

### Recommended Architecture

1. **Create monorepo** with packages: `core/`, `node/`, `web/`
2. **Rename current package** from `@atrim/instrumentation` to `@atrim/instrument-node`
3. **Create new package** `@atrim/instrument-web` for browser support
4. **Share core logic** via `@atrim/instrument-core` (private package)
5. **Maintain backward compatibility** via package alias/redirect

### Why This Approach?

1. ✅ **Scalable Naming**: Sets up for future `-python`, `-go`, `-java` packages
2. ✅ **Maximum Code Reuse**: 70%+ of core logic is shared via internal package
3. ✅ **Unified Developer Experience**: Same config, same patterns, same API style
4. ✅ **Clean Separation**: No platform code pollution (Node.js deps in web, etc.)
5. ✅ **Non-Breaking Migration**: Existing users can continue using `@atrim/instrumentation`
6. ✅ **Market Need**: Full-stack observability is a common requirement
7. ✅ **OpenTelemetry Ready**: Browser support exists (though experimental)
8. ✅ **Clear Phasing**: Can ship incrementally (vanilla → React → advanced)

## Next Steps

If approved, here's the implementation roadmap:

### Phase 0: Monorepo Setup 

1. **Create monorepo structure**
   - Set up pnpm workspaces (or npm workspaces)
   - Create `packages/core/`, `packages/node/`, `packages/web/` directories
   - Configure Turborepo for build orchestration

2. **Extract core logic**
   - Move config loader, pattern matcher, schema to `packages/core/`
   - Update imports in current code
   - Set up build pipeline for core package

3. **Rename current package**
   - Move current code to `packages/node/`
   - Update package.json to `@atrim/instrument-node`
   - Set up package alias for backward compatibility

4. **Update CI/CD**
   - Configure GitHub Actions for monorepo
   - Set up changesets for versioning
   - Configure npm publish for multiple packages

### Phase 1: Core Web Support 

1. **Create `@atrim/instrument-web` package**
2. **Implement browser SDK initialization**
3. **Add basic auto-instrumentation** (fetch, XHR, document load)
4. **Set up OTLP export over HTTP**
5. **Create vanilla JS example**
6. **Write unit tests** (config loading, pattern matching)

### Phase 2: React Integration 

1. **Implement React hooks** (useTraceSpan, usePerformance)
2. **Create React components** (TracedComponent, ErrorBoundary)
3. **Add React Router integration**
4. **Implement Web Vitals tracking**
5. **Create React SPA example**
6. **Create Next.js example**

### Phase 3: Advanced Features 

1. **End-to-end trace correlation** testing
2. **Performance monitoring** (LCP, FID, CLS)
3. **Error tracking** with source maps
4. **Session replay integration** hooks
5. **Effect-TS browser support** (if feasible)

### Phase 4: Documentation & Release 

1. **Write comprehensive documentation**
2. **Create migration guide**
3. **Publish v1.0.0 releases**
4. **Announce launch**

### GitHub Issues to Create

1. **Epic: Monorepo Migration** (#X)
   - Task: Set up pnpm workspaces
   - Task: Extract core package
   - Task: Rename to instrumentation-node
   - Task: Configure changesets

2. **Epic: Web Platform Support** (#Y)
   - Task: Browser SDK initialization
   - Task: Auto-instrumentation (fetch, XHR, document load)
   - Task: OTLP export
   - Task: Vanilla JS example

3. **Epic: React Integration** (#Z)
   - Task: React hooks
   - Task: React components
   - Task: React Router integration
   - Task: Web Vitals
   - Task: Examples (SPA, Next.js)

---



