# @atrim/instrumentation - AI Assistant Context

## Project Overview

This is the `@atrim/instrumentation` library - a universal OpenTelemetry instrumentation package for Node.js applications. The library provides zero-config auto-instrumentation with flexible configuration options for centralized management.

## Core Principles

### Effect-First Architecture

**IMPORTANT:** This is primarily an **Effect-TS project**. The core library implementation should use Effect-TS for all async operations, error handling, and business logic.

**When to use Effect:**
- ✅ **Core library code** (`src/core/`, `src/integrations/effect/`)
- ✅ **Public API** (`src/api.ts` - Effect APIs are primary)
- ✅ **Async operations** (file I/O, network I/O, initialization)
- ✅ **Error handling** (typed errors using `Data.TaggedError`)
- ✅ **Resource management** (use Effect's Scope for cleanup)

**When Promises are acceptable:**
- ✅ **Examples** (`examples/express/`, `examples/vanilla/`, etc.) - Intentionally Promise-based to demonstrate library compatibility with traditional Node.js applications
- ✅ **Test infrastructure** (`test/`) - Vitest test framework is Promise-based
- ✅ **Backward compatibility APIs** (`*Async()` functions) - Bridge to Promise-based users
- ✅ **OpenTelemetry API compliance** - Where OTel spec requires Promise-based interfaces

**Key principle:** While the library is **universal** and works with any framework, the **internal implementation** is Effect-first. Examples remain Promise-based to prove compatibility, NOT because Promises are preferred.

### Effect-TS Development Best Practices

**CRITICAL:** When implementing core library functionality, ALWAYS use Effect-TS patterns and primitives.

#### 1. Layer-Based Architecture

**Always organize code using Effect Layers for dependency injection:**

```typescript
// ❌ BAD: Direct implementation without layers
export const configLoader = {
  load: async (path: string) => { /* ... */ }
}

// ✅ GOOD: Layer-based with proper service definition
export class ConfigLoader extends Context.Tag("ConfigLoader")<
  ConfigLoader,
  {
    readonly load: (path: string) => Effect.Effect<Config, ConfigError>
  }
>() {}

export const ConfigLoaderLive = Layer.effect(
  ConfigLoader,
  Effect.gen(function* () {
    return {
      load: (path) => Effect.gen(function* () {
        // Implementation using Effect primitives
      })
    }
  })
)
```

#### 2. Separate Abstraction Layers

**Keep layers decoupled and composable:**

```typescript
// Layer 1: Low-level file system access
export const FileSystemLive = Layer.succeed(FileSystem, {
  read: (path) => Effect.tryPromise({
    try: () => fs.readFile(path, 'utf-8'),
    catch: (error) => new FileReadError({ path, cause: error })
  })
})

// Layer 2: Configuration loading (depends on FileSystem)
export const ConfigLoaderLive = Layer.effect(
  ConfigLoader,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    return {
      load: (path) => fs.read(path).pipe(
        Effect.flatMap(content => parseYaml(content))
      )
    }
  })
)

// Layer 3: SDK initialization (depends on ConfigLoader)
export const SdkInitializerLive = Layer.effect(
  SdkInitializer,
  Effect.gen(function* () {
    const configLoader = yield* ConfigLoader
    return {
      initialize: (options) => configLoader.load(options.configPath).pipe(
        Effect.flatMap(config => setupTracing(config))
      )
    }
  })
)

// Compose layers
export const AppLive = Layer.mergeAll(
  FileSystemLive,
  ConfigLoaderLive,
  SdkInitializerLive
)
```

#### 3. Initialization vs. Implementation

**Separate initialization logic from runtime logic:**

```typescript
// ❌ BAD: Mixed initialization and runtime logic
export const loadConfig = async (path: string) => {
  const content = await fs.readFile(path, 'utf-8')  // I/O during call
  return parseConfig(content)
}

// ✅ GOOD: Initialization happens once, runtime is pure
export const makeConfigLoader = (options: ConfigOptions) =>
  Effect.gen(function* () {
    // Initialization: Load and parse config once
    const content = yield* FileSystem.read(options.path)
    const config = yield* parseConfig(content)

    // Return runtime service that uses pre-loaded config
    return {
      getConfig: () => Effect.succeed(config),
      isEnabled: (pattern: string) =>
        Effect.sync(() => config.patterns.includes(pattern))
    }
  })

// Usage: Initialize once at app startup
export const ConfigLoaderLive = Layer.effect(
  ConfigLoader,
  makeConfigLoader({ path: './instrumentation.yaml' })
)
```

#### 4. Use Effect MCP Server for Validation

**MANDATORY:** Before implementing any new Effect-based functionality, use the Effect MCP server to:

1. **Search for Effect-native patterns:**
```
Use mcp__effect-docs__effect_docs_search to find relevant Effect patterns
Example: Search "layer composition", "resource management", "error handling"
```

2. **Validate your approach:**
```
After finding relevant docs, use mcp__effect-docs__get_effect_doc to read full documentation
Verify your planned approach matches Effect best practices
```

3. **Find Effect-native alternatives:**
```
Before using Promise.all(), Array.map(), etc., search Effect docs for:
- Effect.all() for concurrent operations
- Effect.forEach() for iteration
- Effect.cached() for caching
- Effect.retry() for retries
- Ref.make() for mutable state
```

**Example workflow:**

```typescript
// Step 1: Search Effect docs before implementing
// Use: mcp__effect-docs__effect_docs_search with query "concurrent requests"

// Step 2: You find Effect.all() is the Effect-native way

// ❌ BAD: Using Promise.all()
const results = await Promise.all([
  fetchConfig1(),
  fetchConfig2()
])

// ✅ GOOD: Using Effect.all()
const results = yield* Effect.all([
  fetchConfig1(),
  fetchConfig2()
], { concurrency: "unbounded" })
```

#### 5. Common Effect Patterns to Use

**File I/O:**
```typescript
// Use Effect.tryPromise for Node.js APIs
const readFile = (path: string) =>
  Effect.tryPromise({
    try: () => fs.readFile(path, 'utf-8'),
    catch: (error) => new FileReadError({ path, cause: error })
  })
```

**HTTP requests:**
```typescript
// Use Effect.tryPromise for fetch
const fetchConfig = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(url).then(r => r.text()),
    catch: (error) => new FetchError({ url, cause: error })
  })
```

**Resource management:**
```typescript
// Use Effect.acquireRelease for cleanup
const withFile = (path: string) =>
  Effect.acquireRelease(
    Effect.tryPromise(() => fs.open(path)),
    (fd) => Effect.tryPromise(() => fd.close())
  )
```

**Caching:**
```typescript
// Use Effect.cached for memoization
const cachedConfig = yield* loadConfig().pipe(
  Effect.cached,
  Effect.flatMap(cached => cached)
)
```

**Retries:**
```typescript
// Use Effect.retry with Schedule
const robustFetch = fetchConfig(url).pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(3))
  ))
)
```

**Error handling:**
```typescript
// Use Data.TaggedError for typed errors
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly path: string
  readonly cause: unknown
}> {}

// Use Effect.catchTag for typed error handling
const config = yield* loadConfig(path).pipe(
  Effect.catchTag("ConfigError", (error) =>
    Effect.logError(`Failed to load config from ${error.path}`).pipe(
      Effect.as(defaultConfig)
    )
  )
)
```

#### 6. When to Check Effect MCP Server

**ALWAYS check Effect docs before:**
- Implementing concurrent operations
- Managing resources (files, connections, etc.)
- Handling errors
- Adding caching or memoization
- Implementing retry logic
- Working with async operations
- Creating new layers or services

**Example searches to use:**
- "layer dependency injection"
- "concurrent effects"
- "error handling tagged errors"
- "resource management"
- "caching memoization"
- "retry schedule"
- "tracing opentelemetry"

### Universal Design
- Works with **any Node.js runtime** (Node.js 18+, Bun 1.0+, Deno 1.40+)
- Works with **any framework** (Express, Fastify, Koa, Hono, vanilla TypeScript)
- **Effect-TS is optional for users** - Library works without Effect knowledge
- No framework dependencies in core library

### Zero-Config Philosophy
- Automatically looks for `instrumentation.yaml` in project root
- Provides sensible defaults if no config found
- Multiple configuration sources (file, URL, env var, programmatic)

### Focused Responsibility
- ✅ Pattern-based span filtering (which spans to create)
- ✅ Automatic metadata extraction (Effect-TS fiber info, etc.)
- ✅ Centralized configuration (YAML-based filtering)
- ❌ Does NOT manage OTLP export (users configure via standard OpenTelemetry)

## Architecture

### Directory Structure

```
src/
├── core/                          # Framework-agnostic core
│   ├── config-loader.ts          # Configuration loading (file/URL)
│   ├── pattern-matcher.ts        # Pattern compilation & matching
│   ├── instrumentation-schema.ts # Schema validation
│   └── span-processor.ts         # Pattern-based span filtering
├── integrations/
│   ├── effect/                   # Optional Effect-TS integration
│   │   ├── effect-tracer.ts     # Effect-TS tracer integration
│   │   ├── metadata-extractor.ts # Auto metadata extraction
│   │   └── effect-helpers.ts    # Effect-specific helpers
│   ├── standard/                 # Standard OpenTelemetry
│   │   ├── tracer-provider.ts   # Standard OTel TracerProvider
│   │   └── span-helpers.ts      # Generic span helpers
│   └── index.ts
├── api.ts                        # Public API surface
└── index.ts                      # Main entry point
```

### Build Artifacts

**IMPORTANT:** All build artifacts must be output to the `target/` directory to keep the project root clean and simplify `.gitignore` management.

**Build artifact locations:**
- `target/dist/` - Compiled TypeScript output (tsup)
- `target/coverage/` - Test coverage reports (vitest)
- `target/.tsbuildinfo` - TypeScript incremental build info

**Why `target/`?**
- Single `.gitignore` entry (`target/`) instead of multiple entries
- Standard convention in many build systems (Maven, Gradle, etc.)
- Clear separation between source and generated files
- Easier to clean (`rm -rf target/`)

**Configuration files to update:**
- `package.json` - Update `exports`, `main`, `module`, `types`, `files`
- `tsup.config.ts` - Set `outDir: 'target/dist'`
- `tsconfig.json` - Set `outDir: './target/dist'`, `tsBuildInfoFile: './target/.tsbuildinfo'`
- `vitest.config.ts` - Set `coverage.reportsDirectory: 'target/coverage'` (unit tests)
- `vitest.integration.config.ts` - Integration test configuration

### Package Exports

```json
{
  "exports": {
    ".": {
      "import": "./target/dist/index.js",
      "require": "./target/dist/index.cjs"
    },
    "./effect": {
      "import": "./target/dist/integrations/effect/index.js",
      "require": "./target/dist/integrations/effect/index.cjs"
    }
  }
}
```

## Configuration System

### Priority Order (Highest to Lowest)

1. **Explicit Config Object** - Passed programmatically via API
2. **Environment Variable** - `ATRIM_INSTRUMENTATION_CONFIG` (file path or URL)
3. **Project Root File** - `./instrumentation.yaml` (zero-config default)
4. **Default Config** - Built-in defaults if no config found

### Configuration Schema

```yaml
version: "1.0"

instrumentation:
  enabled: true
  description: "Centralized OpenTelemetry span filtering"

  # Patterns to instrument (applied to ALL spans)
  instrument_patterns:
    - pattern: "^app\\."
      enabled: true
      description: "Application operations"
    - pattern: "^storage\\."
      enabled: true
      description: "Storage layer"

  # Patterns to ignore (takes precedence)
  ignore_patterns:
    - pattern: "^test\\."
      description: "Test utilities"
    - pattern: "^internal\\."
      description: "Internal operations"

# Effect-TS specific features (optional)
effect:
  auto_extract_metadata: true  # Only used if Effect integration is loaded
```

### TypeScript Schema

Using Zod for validation (no Effect dependency in core):

```typescript
import { z } from 'zod'

export const PatternConfigSchema = z.object({
  pattern: z.string(),
  enabled: z.boolean().optional(),
  description: z.string().optional()
})

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

## Public API Design

### Core Exports (Standard OpenTelemetry)

Works with **any Node.js application**:

```typescript
// Main entry: @atrim/instrumentation

// Initialize instrumentation (call once at startup)
export function initializeInstrumentation(options?: {
  configPath?: string
  configUrl?: string
  config?: InstrumentationConfig
  cacheTimeout?: number
}): void

// Span processor that filters based on patterns
export class PatternSpanProcessor implements SpanProcessor {
  // Automatically filters spans based on instrumentation.yaml
}

// Generic span helpers (no Effect dependency)
export function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean>
): void

export function recordException(
  span: Span,
  error: Error,
  context?: Record<string, string | number | boolean>
): void
```

### Effect-TS Integration (Optional)

Only required if using Effect-TS:

```typescript
// Effect integration: @atrim/instrumentation/effect

// Main Layer (zero-config, auto metadata extraction)
export const EffectInstrumentationLive: Layer.Layer<
  Tracer.Tracer,
  ConfigError,
  never
>

// Factory function (custom config)
export function createEffectInstrumentation(options?: {
  configPath?: string
  configUrl?: string
  config?: InstrumentationConfig
  cacheTimeout?: number
}): Layer.Layer<Tracer.Tracer, ConfigError, never>

// Effect-specific span helpers
export {
  annotateUser,
  annotateDataSize,
  annotateBatch,
  annotateLLM,
  annotateQuery,
  annotateHttpRequest,
  annotateError,
  annotatePriority,
  annotateCache
} from './effect-helpers.js'
```

## OTLP Export Strategy

**IMPORTANT:** This library does NOT manage OTLP export configuration.

### What This Library Does
- ✅ Pattern-based span filtering (which spans to create)
- ✅ Automatic metadata extraction (Effect-TS fiber info, etc.)
- ✅ Centralized configuration (YAML-based filtering)

### What Users Configure Separately
- ❌ OTLP export endpoints
- ❌ OTLP protocols (HTTP/gRPC)
- ❌ Export headers, authentication
- ❌ Batch sizes, timeouts

### Standard OpenTelemetry Export Setup

Users configure export using **standard OpenTelemetry environment variables**:

```bash
# OTLP/HTTP (default in most setups)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Service name
export OTEL_SERVICE_NAME=my-service
```

### Why Separate Export Configuration

**Keeps library universal and focused:**
- ✅ Works with any OpenTelemetry exporter (HTTP, gRPC, Zipkin, Jaeger)
- ✅ Works with any collector setup (local, cloud, SaaS)
- ✅ Users have full control over export configuration
- ✅ No assumptions about infrastructure
- ✅ Smaller dependency footprint

## Pattern Matching Logic

### Compilation
```typescript
// Patterns are compiled once and cached
const compiledPattern = new RegExp(pattern.pattern)
```

### Matching Rules
1. **Check ignore patterns first** (takes precedence)
2. **Check instrument patterns second**
3. **Default behavior:** If no patterns match, span is created (fail-open)

### Performance Considerations
- Pattern compilation is cached
- Regex matching is O(n) where n is pattern count
- Target: <1ms per span decision
- Bulk operations should batch pattern checks

## Dependencies

### Runtime Dependencies (Core)

**Required** (for all users):
- `@opentelemetry/api` ^1.9.0 - OpenTelemetry API
- `zod` ^3.22.0 - Configuration validation
- `yaml` ^2.3.0 - YAML parsing

**Optional** (for remote config):
- Uses built-in `fetch` (Node.js 18+, Bun, Deno)
- No additional dependencies needed

### Optional Dependencies (Effect Integration)

**Only required if using Effect-TS features:**
- `effect` ^3.0.0 (peer dependency)
- `@effect/opentelemetry` ^0.40.0 (peer dependency)

### Development Dependencies
- `typescript` ^5.7
- `vitest` - Testing framework
- `@types/node` - Node.js types
- `typedoc` - API documentation generation
- `prettier` + `eslint` - Code quality
- `tsup` - Build tool

## Security Considerations

### Remote Configuration Risks
- ❌ MITM attacks on config URL
- ❌ Malicious config injection
- ❌ Denial of service via large configs

### Mitigations
- ✅ Require HTTPS for remote URLs
- ✅ Validate config schema strictly
- ✅ Set max config file size (1MB limit)
- ✅ Timeout remote requests (5 seconds)
- ✅ Cache configs to reduce requests
- ✅ Fallback to default config on errors

## Integration with Atrim Onboarding CLI

This library works seamlessly with the **Atrim Onboarding CLI**:

**Atrim CLI:** Analyzes codebases and generates setup code
- Detects architecture (Express-first, Effect-first, hybrid)
- Identifies gotchas and anti-patterns
- Recommends instrumentation strategy
- **Generates `instrumentation.yaml` configuration**
- **Recommends installing `@atrim/instrumentation`**
- Verifies instrumentation is working

**Library (this):** Provides runtime auto-instrumentation
- Loads `instrumentation.yaml` configuration
- Auto-instruments Effect.withSpan() calls
- Extracts Effect metadata automatically
- Zero code changes required after setup

## Testing Strategy

### Test Organization

**IMPORTANT:** Tests are organized in two locations with different purposes:

1. **`packages/*/test/`** - Core library tests
   - `test/unit/` - Unit tests for library internals
   - `test/integration/` - Integration tests using testcontainers (isolated OTel collector)
   - Run via `pnpm test` and `pnpm test:integration` from package or root
   - These tests validate library correctness

2. **`examples/*/`** - Example applications with integration tests
   - Each example can have its own `*.integration.test.ts` files
   - These tests export spans to a **live OTLP endpoint** (Atrim, local collector, etc.)
   - Run via `pnpm test` from within the example directory
   - Used to demonstrate library features and validate spans appear in Atrim

**When to use which:**
- New library feature → Add tests in `packages/*/test/`
- New example or demo → Add tests in `examples/*/` that export to live OTLP

### Unit Tests
- Configuration loading (file, URL, defaults)
- Pattern matching (80%+ coverage)
- Schema validation
- Error handling (network, invalid config)

### Integration Tests
- Node.js 18+, 20+, 22+
- Bun 1.0+
- Deno 1.40+
- Express integration
- Fastify integration
- Effect-TS integration
- Vanilla TypeScript

**Running Tests:**

Integration tests use Vitest (migrated from Playwright) with an optimized OTel collector configuration:

```bash
# Run unit tests only
pnpm test

# Run integration tests
pnpm test:integration

# Run all tests (unit + integration)
pnpm test:all

# Watch mode for integration tests (useful during development)
pnpm test:integration:watch
```

**Span Export Configuration for Tests:**

Integration tests use `OTEL_BSP_SCHEDULE_DELAY=500` to configure the BatchSpanProcessor in test apps to export spans every 500ms (instead of the default 5000ms). This is already configured in the `test:integration` script in `package.json`.

**Note:** The test collector config is unchanged from defaults and doesn't need modification - the key is configuring the **test apps** to export quickly via `OTEL_BSP_SCHEDULE_DELAY`.

### Performance Tests
- Overhead <5% target
- Pattern matching <1ms per span
- Config loading <100ms (cached)
- Remote config with caching

## Common Patterns

### Express Application

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

// Initialize once at startup
initializeInstrumentation()

// Your existing OpenTelemetry code works as-is
const tracer = trace.getTracer('my-service')
```

### Effect-TS Application

```typescript
import { EffectInstrumentationLive } from '@atrim/instrumentation/effect'

const app = Effect.gen(function* () {
  yield* myOperation()
}).pipe(
  Effect.withSpan('app.operation'),
  Effect.provide(EffectInstrumentationLive)
)
```

### Bun Runtime

```typescript
// Works exactly the same as Node.js
import { initializeInstrumentation } from '@atrim/instrumentation'
initializeInstrumentation()
```

### Remote Configuration

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

initializeInstrumentation({
  configUrl: 'https://config.company.com/instrumentation.yaml',
  cacheTimeout: 300_000 // 5 minutes
})
```

## Key Implementation Notes

1. **Effect is optional** - Core library has no Effect dependencies
2. **Fail-open design** - If patterns don't match, span is still created
3. **Performance first** - Pattern compilation is cached, matching is fast
4. **Security by default** - Remote configs validated, rate-limited, cached
5. **Standard compliance** - Uses standard OpenTelemetry APIs throughout
6. **Zero breaking changes** - Works alongside existing OpenTelemetry setup

## AI Assistant Workflow Guidelines

See `~/.claude/CLAUDE.md` for global development principles. This project has stricter requirements:

### Review-Before-Implementation (Stricter than global)

Before major changes, create proposal files in `./tmp/[DATE]/`:

```bash
mkdir -p tmp/$(date +%Y-%m-%d)
# Create proposal: tmp/2025-11-12/feature-proposal.md
```

**Requires review:** Major changes, PR descriptions, new features, API changes, architecture changes
**No review needed:** Reading files, running tests, small typo/formatting fixes

### Git Commits Require Explicit Approval

**CRITICAL:** Never auto-commit. Always ask user for approval before committing.

**Analysis documents:** Files in `./tmp/[DATE]/` are for analysis only - NEVER commit to git.

## Gotchas and Common Issues

### Pattern Escaping
YAML requires double backslashes for regex escape sequences:
```yaml
# Correct
pattern: "^app\\."

# Incorrect (will not match)
pattern: "^app."
```

### Effect Peer Dependencies
Effect integration requires peer dependencies to be installed:
```bash
npm install effect @effect/opentelemetry
```

### Remote Config Caching
Remote configs are cached for 5 minutes by default. To force refresh:
```typescript
initializeInstrumentation({
  configUrl: '...',
  cacheTimeout: 0  // Disable caching
})
```

## Versioning Strategy

- **v0.1.0-alpha.1** - Initial alpha release (internal testing)
- **v0.1.0-beta.1** - Beta release (feature complete)
- **v1.0.0** - Stable release (production ready)

## Success Metrics

### Technical
- ✅ Works with vanilla TypeScript/JavaScript (no Effect required)
- ✅ Works with Express, Fastify, and other frameworks
- ✅ Works with Node.js 18+, Bun 1.0+, and Deno 1.40+
- ✅ Zero-config installation works
- ✅ Pattern-based span filtering works correctly
- ✅ Unit tests >80% coverage
- ✅ Performance overhead <5%

### Documentation
- ✅ README with installation instructions
- ✅ Getting started guide (5 minutes to working)
- ✅ Complete API reference
- ✅ 4+ example projects
- ✅ Migration guide

## Additional Resources

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Effect-TS Tracing Documentation](https://effect.website/docs/observability/tracing/)
- [OpenTelemetry JavaScript SDK](https://github.com/open-telemetry/opentelemetry-js)
