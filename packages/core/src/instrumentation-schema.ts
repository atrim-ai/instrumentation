/**
 * Configuration schema using Zod
 */
import { z } from 'zod'

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
 * Span naming rule for auto-tracing
 *
 * Matches effects based on patterns and applies a name template
 */
export const SpanNamingRuleSchema = z.object({
  // Match conditions (all specified conditions must match)
  match: z.object({
    // Match by file path pattern (regex)
    file: z.string().optional(),
    // Match by function name pattern (regex)
    function: z.string().optional(),
    // Match by operator type (gen, all, forEach, etc.)
    operator: z.string().optional(),
    // Match by call stack pattern (regex)
    stack: z.string().optional(),
    // Match by fiber annotation key
    annotation: z.string().optional()
  }),
  // Name template with substitution variables
  // Available: {operator}, {function}, {module}, {file}, {line}, {class}, {match:N}
  name: z.string()
})

/**
 * Auto-tracing configuration for Effect operations
 *
 * Enables automatic span creation for all Effect operations
 * when using the auto-traced Effect import
 */
export const AutoTracingConfigSchema = z.object({
  // Global enable/disable for auto-tracing
  enabled: z.boolean().default(true),

  // Span naming configuration
  span_naming: z
    .object({
      // Default name template when no rules match
      default: z.string().default('effect.{operator}'),

      // Custom naming rules (applied in order, first match wins)
      rules: z.array(SpanNamingRuleSchema).default([])
    })
    .default({}),

  // Pattern filtering
  filter_patterns: z
    .object({
      // Only trace spans matching these patterns
      include: z.array(z.string()).default([]),
      // Exclude spans matching these patterns (takes precedence)
      exclude: z.array(z.string()).default([])
    })
    .default({}),

  // Sampling configuration
  sampling: z
    .object({
      // Sampling rate (0.0 to 1.0)
      rate: z.number().min(0).max(1).default(1.0),
      // Only trace effects with duration > this value
      min_duration: z.string().default('0 millis')
    })
    .default({})
})

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
      auto_extract_metadata: z.boolean(),
      auto_isolation: AutoIsolationConfigSchema.optional(),
      auto_tracing: AutoTracingConfigSchema.optional()
    })
    .optional(),
  http: HttpFilteringConfigSchema.optional()
})

export type InstrumentationConfig = z.infer<typeof InstrumentationConfigSchema>
export type PatternConfig = z.infer<typeof PatternConfigSchema>
export type AutoIsolationConfig = z.infer<typeof AutoIsolationConfigSchema>
export type AutoTracingConfig = z.infer<typeof AutoTracingConfigSchema>
export type SpanNamingRule = z.infer<typeof SpanNamingRuleSchema>
export type HttpFilteringConfig = z.infer<typeof HttpFilteringConfigSchema>
