/**
 * Configuration schema using Zod
 */
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
    logging: z.enum(['on', 'off', 'minimal']).optional().default('on'),
    instrument_patterns: z.array(PatternConfigSchema),
    ignore_patterns: z.array(PatternConfigSchema)
  }),
  effect: z
    .object({
      auto_extract_metadata: z.boolean()
    })
    .optional()
})

export type InstrumentationConfig = z.infer<typeof InstrumentationConfigSchema>
export type PatternConfig = z.infer<typeof PatternConfigSchema>
