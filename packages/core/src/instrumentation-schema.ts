/**
 * Configuration schema using Zod
 */
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'

export const PatternConfigSchema = z.object({
  pattern: z.string(),
  enabled: z.boolean().optional(),
  description: z.string().optional()
})

/**
 * Configuration for automatic span isolation in Effect operations
 *
 * This prevents context leakage when using FiberSet.run, Effect.fork, etc.
 * while maintaining logical parent relationships via span links.
 */
export const AutoIsolationConfigSchema = z.object({
  // Global enable/disable for auto-isolation
  enabled: z.boolean().default(false),

  // Which operators to auto-isolate
  operators: z
    .object({
      fiberset_run: z.boolean().default(true),
      effect_fork: z.boolean().default(true),
      effect_fork_daemon: z.boolean().default(true),
      effect_fork_in: z.boolean().default(false)
    })
    .default({}),

  // Virtual parent tracking configuration
  tracking: z
    .object({
      use_span_links: z.boolean().default(true),
      use_attributes: z.boolean().default(true),
      capture_logical_parent: z.boolean().default(true)
    })
    .default({}),

  // Span categorization
  attributes: z
    .object({
      category: z.string().default('background_task'),
      add_metadata: z.boolean().default(true)
    })
    .default({})
})

/**
 * HTTP instrumentation filtering configuration
 *
 * Allows filtering of HTTP requests to prevent noisy traces
 * (e.g., health checks, OTLP exports, internal endpoints)
 */
/**
 * Span naming rule for auto-instrumentation
 *
 * Allows matching fibers based on file path, function name, etc.
 * and applying custom span names with template variables.
 */
export const SpanNamingRuleSchema = z.object({
  // Match criteria (all specified criteria must match)
  match: z.object({
    // Regex pattern to match file path
    file: z.string().optional(),
    // Regex pattern to match function name
    function: z.string().optional(),
    // Regex pattern to match module name
    module: z.string().optional()
  }),
  // Span name template with variables:
  // {fiber_id} - Fiber ID
  // {function} - Function name
  // {module} - Module name
  // {file} - File path
  // {line} - Line number
  // {operator} - Effect operator (gen, all, forEach, etc.)
  // {match:field:N} - Captured regex group from match
  name: z.string()
})

/**
 * Auto-instrumentation configuration for Effect operations
 *
 * Enables automatic tracing of all Effect fibers without manual
 * Effect.withSpan() calls. Configuration-driven via instrumentation.yaml.
 */
export const AutoInstrumentationConfigSchema = z.object({
  // Enable/disable auto-instrumentation
  enabled: z.boolean().default(false),

  // Tracing granularity
  // - 'fiber': Trace at fiber creation (recommended, lower overhead)
  // - 'operator': Trace each Effect operator (higher granularity, more overhead)
  granularity: z.enum(['fiber', 'operator']).default('fiber'),

  // Smart span naming configuration
  span_naming: z
    .object({
      // Default span name template when no rules match
      default: z.string().default('effect.fiber.{fiber_id}'),

      // Infer span names from source code (requires stack trace parsing)
      // Adds ~50-100μs overhead per fiber
      infer_from_source: z.boolean().default(true),

      // Naming rules (first match wins)
      rules: z.array(SpanNamingRuleSchema).default([])
    })
    .default({}),

  // Pattern-based filtering
  filter: z
    .object({
      // Only trace spans matching these patterns (empty = trace all)
      include: z.array(z.string()).default([]),

      // Never trace spans matching these patterns
      exclude: z.array(z.string()).default([])
    })
    .default({}),

  // Performance controls
  performance: z
    .object({
      // Sample rate (0.0 - 1.0)
      sampling_rate: z.number().min(0).max(1).default(1.0),

      // Skip fibers shorter than this duration (e.g., "10ms", "100 millis")
      min_duration: z.string().default('0ms'),

      // Maximum concurrent traced fibers (0 = unlimited)
      max_concurrent: z.number().default(0)
    })
    .default({}),

  // Automatic metadata extraction
  metadata: z
    .object({
      // Extract Effect fiber information
      fiber_info: z.boolean().default(true),

      // Extract source location (file:line)
      source_location: z.boolean().default(true),

      // Extract parent fiber information
      parent_fiber: z.boolean().default(true)
    })
    .default({})
})

export type AutoInstrumentationConfig = z.infer<typeof AutoInstrumentationConfigSchema>
export type SpanNamingRule = z.infer<typeof SpanNamingRuleSchema>

/**
 * HTTP instrumentation filtering configuration
 *
 * Allows filtering of HTTP requests to prevent noisy traces
 * (e.g., health checks, OTLP exports, internal endpoints)
 */
export const HttpFilteringConfigSchema = z.object({
  // Patterns to ignore for outgoing HTTP requests (string patterns only in YAML)
  ignore_outgoing_urls: z.array(z.string()).optional(),

  // Patterns to ignore for incoming HTTP requests (string patterns only in YAML)
  ignore_incoming_paths: z.array(z.string()).optional(),

  // Require parent span for outgoing requests (prevents root spans for HTTP calls)
  require_parent_for_outgoing_spans: z.boolean().optional(),

  // Trace context propagation configuration
  // Controls which cross-origin requests receive W3C Trace Context headers (traceparent, tracestate)
  propagate_trace_context: z
    .object({
      // Strategy for trace propagation
      // - "all": Propagate to all cross-origin requests (may cause CORS errors)
      // - "none": Never propagate trace headers
      // - "same-origin": Only propagate to same-origin requests (default, safe)
      // - "patterns": Propagate based on include_urls patterns
      strategy: z.enum(['all', 'none', 'same-origin', 'patterns']).default('same-origin'),

      // URL patterns to include when strategy is "patterns"
      // Supports regex patterns (e.g., "^https://api\\.myapp\\.com")
      include_urls: z.array(z.string()).optional()
    })
    .optional()
})

/**
 * Exporter configuration for OpenTelemetry tracing
 *
 * Allows configuring how traces are exported via instrumentation.yaml
 */
export const ExporterConfigSchema = z.object({
  // Exporter type: 'otlp' | 'console' | 'none'
  // - 'otlp': Export to OTLP endpoint (production)
  // - 'console': Log spans to console (development)
  // - 'none': No export (disable tracing)
  type: z.enum(['otlp', 'console', 'none']).default('otlp'),

  // OTLP endpoint URL (for type: otlp)
  // Defaults to OTEL_EXPORTER_OTLP_ENDPOINT env var or http://localhost:4318
  endpoint: z.string().optional(),

  // Span processor type
  // - 'batch': Batch spans for export (production, lower overhead)
  // - 'simple': Export immediately (development, no batching delay)
  processor: z.enum(['batch', 'simple']).default('batch'),

  // Batch processor settings (for processor: batch)
  batch: z
    .object({
      // Max time to wait before exporting (milliseconds)
      scheduled_delay_millis: z.number().default(1000),
      // Max batch size
      max_export_batch_size: z.number().default(100)
    })
    .optional()
})

export type ExporterConfig = z.infer<typeof ExporterConfigSchema>

export const InstrumentationConfigSchema = z.object({
  version: z.string(),
  instrumentation: z.object({
    enabled: z.boolean(),
    description: z.string().optional(),
    logging: z.enum(['on', 'off', 'minimal']).optional().default('on'),
    instrument_patterns: z.array(PatternConfigSchema),
    ignore_patterns: z.array(PatternConfigSchema)
  }),
  effect: z
    .object({
      // Enable/disable Effect tracing entirely
      // When false, EffectInstrumentationLive returns Layer.empty
      enabled: z.boolean().default(true),
      // Exporter mode (legacy - use exporter.type instead):
      // - "unified": Use global TracerProvider from Node SDK (recommended, enables filtering)
      // - "standalone": Use Effect's own OTLP exporter (bypasses Node SDK filtering)
      exporter: z.enum(['unified', 'standalone']).default('unified'),
      // Exporter configuration (for auto-instrumentation)
      exporter_config: ExporterConfigSchema.optional(),
      auto_extract_metadata: z.boolean(),
      auto_isolation: AutoIsolationConfigSchema.optional(),
      // Auto-instrumentation: automatic tracing of all Effect fibers
      auto_instrumentation: AutoInstrumentationConfigSchema.optional()
    })
    .optional(),
  http: HttpFilteringConfigSchema.optional()
})

export type InstrumentationConfig = z.infer<typeof InstrumentationConfigSchema>
export type PatternConfig = z.infer<typeof PatternConfigSchema>
export type AutoIsolationConfig = z.infer<typeof AutoIsolationConfigSchema>
export type HttpFilteringConfig = z.infer<typeof HttpFilteringConfigSchema>

/**
 * Default configuration when no config file is found
 */
export const defaultConfig: InstrumentationConfig = {
  version: '1.0',
  instrumentation: {
    enabled: true,
    logging: 'on',
    description: 'Default instrumentation configuration',
    instrument_patterns: [
      { pattern: '^app\\.', enabled: true, description: 'Application operations' },
      { pattern: '^http\\.server\\.', enabled: true, description: 'HTTP server operations' },
      { pattern: '^http\\.client\\.', enabled: true, description: 'HTTP client operations' }
    ],
    ignore_patterns: [
      { pattern: '^test\\.', description: 'Test utilities' },
      { pattern: '^internal\\.', description: 'Internal operations' },
      { pattern: '^health\\.', description: 'Health checks' }
    ]
  },
  effect: {
    enabled: true,
    exporter: 'unified' as const,
    auto_extract_metadata: true
  }
}

/**
 * Parse and validate configuration content (YAML string, JSON string, or object)
 *
 * @param content - YAML string, JSON string, or plain object
 * @returns Validated InstrumentationConfig
 * @throws Error if parsing or validation fails
 */
export function parseAndValidateConfig(content: string | unknown): InstrumentationConfig {
  let parsed: unknown

  // If string, parse as YAML (YAML is a superset of JSON)
  if (typeof content === 'string') {
    parsed = parseYaml(content)
  } else {
    parsed = content
  }

  // Validate with schema
  return InstrumentationConfigSchema.parse(parsed)
}
