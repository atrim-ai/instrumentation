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
      // Enable/disable Effect tracing entirely
      // When false, EffectInstrumentationLive returns Layer.empty
      enabled: z.boolean().default(true),
      // Exporter mode:
      // - "unified": Use global TracerProvider from Node SDK (recommended, enables filtering)
      // - "standalone": Use Effect's own OTLP exporter (bypasses Node SDK filtering)
      exporter: z.enum(['unified', 'standalone']).default('unified'),
      auto_extract_metadata: z.boolean(),
      // Auto-bridge OpenTelemetry context to Effect spans
      // When true, Effect spans automatically become children of the active OTel span
      // (e.g., HTTP request span from auto-instrumentation)
      // This is essential for proper trace hierarchy when using Effect with HTTP frameworks
      auto_bridge_context: z.boolean().default(true),
      auto_isolation: AutoIsolationConfigSchema.optional()
    })
    .optional(),
  http: HttpFilteringConfigSchema.optional()
})

export type InstrumentationConfig = z.infer<typeof InstrumentationConfigSchema>
export type PatternConfig = z.infer<typeof PatternConfigSchema>
export type AutoIsolationConfig = z.infer<typeof AutoIsolationConfigSchema>
export type HttpFilteringConfig = z.infer<typeof HttpFilteringConfigSchema>
