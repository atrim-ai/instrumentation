# @atrim/instrumentation - AI Assistant Context

## Project Overview

This is the `@atrim/instrumentation` library - a universal OpenTelemetry instrumentation package for Node.js applications. The library provides zero-config auto-instrumentation with flexible configuration options for centralized management.

## Core Principles

### Universal Design
- Works with **any Node.js runtime** (Node.js 18+, Bun 1.0+, Deno 1.40+)
- Works with **any framework** (Express, Fastify, Koa, Hono, vanilla TypeScript)
- **Optional** Effect-TS integration (not required)
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
- `target/test-results/` - Integration test results (Playwright)
- `target/playwright-report/` - Playwright HTML reports
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
- `vitest.config.ts` - Set `coverage.reportsDirectory: 'target/coverage'`
- `playwright.config.ts` - Set `outputDir: 'target/test-results'`, reporter paths

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

### Review-Before-Implementation Process

**IMPORTANT:** Before making any major changes, creating PR descriptions, or making significant design/implementation decisions, you MUST:

1. **Create a proposal file** in `./tmp/[DATE]` directory with a descriptive name (e.g., `./tmp/2025-11-12/fiberset-tracing-fix-proposal.md`, `./tmp/2025-11-12/pr-body-draft.md`)
2. **Document the proposal** including:
   - Problem statement
   - Proposed solution(s)
   - Files to be changed
   - Design decisions and trade-offs
   - Examples of changes
3. **Wait for user approval** before proceeding with implementation
4. **Only after approval** should you implement changes or take next steps

**Examples of what requires review:**
- Adding new documentation sections (e.g., to TROUBLESHOOTING.md)
- Creating PR descriptions or commit messages
- Major refactoring or architectural changes
- New features or significant bug fixes
- Changes affecting public API
- Documentation structure changes

**Examples of what does NOT require review:**
- Reading files for investigation
- Running tests
- Searching codebase
- Small typo fixes
- Formatting changes

This workflow ensures alignment on design decisions before implementation and prevents wasted effort on unapproved approaches.

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
