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
      auto_isolation: AutoIsolationConfigSchema.optional()
    })
    .optional()
})

export type InstrumentationConfig = z.infer<typeof InstrumentationConfigSchema>
export type PatternConfig = z.infer<typeof PatternConfigSchema>
export type AutoIsolationConfig = z.infer<typeof AutoIsolationConfigSchema>
