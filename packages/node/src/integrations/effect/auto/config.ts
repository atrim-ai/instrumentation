/**
 * Auto-Tracing Configuration Loader
 *
 * Loads tracing configuration from instrumentation.yaml for Effect 4.x.
 * This is a simplified version that focuses on synchronous config loading
 * needed for layer initialization.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'yaml'
// Import directly from core submodules to avoid loading ConfigLoader service
import type {
  AutoInstrumentationConfig,
  InstrumentationConfig,
  ExporterConfig
} from '@atrim/instrument-core/instrumentation-schema'
import {
  InstrumentationConfigSchema,
  defaultConfig
} from '@atrim/instrument-core/instrumentation-schema'
import { logger } from '@atrim/instrument-core/logger'

// ============================================================================
// Types
// ============================================================================

/**
 * Re-export config type for convenience
 */
export type { AutoInstrumentationConfig }

/**
 * Default auto-tracing configuration when not specified in instrumentation.yaml
 */
export const defaultAutoTracingConfig: AutoInstrumentationConfig = {
  enabled: false,
  granularity: 'fiber',
  span_naming: {
    default: 'effect.fiber.{fiber_id}',
    infer_from_source: true,
    rules: []
  },
  span_relationships: {
    type: 'parent-child'
  },
  filter: {
    include: [],
    exclude: []
  },
  performance: {
    sampling_rate: 1.0,
    min_duration: '0ms',
    max_concurrent: 0
  },
  metadata: {
    fiber_info: true,
    source_location: true,
    parent_fiber: true
  }
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load the full instrumentation config synchronously
 *
 * This is needed for layers that initialize at module load time.
 * Falls back to default config if file doesn't exist.
 */
export const loadFullConfigSync = (): InstrumentationConfig => {
  const defaultPath = path.join(process.cwd(), 'instrumentation.yaml')

  try {
    if (fs.existsSync(defaultPath)) {
      const content = fs.readFileSync(defaultPath, 'utf-8')
      const parsed = yaml.parse(content)
      const result = InstrumentationConfigSchema.safeParse(parsed)

      if (result.success) {
        logger.log(`@atrim/auto-trace: Loaded config from ${defaultPath}`)
        return result.data
      } else {
        logger.log(`@atrim/auto-trace: Invalid config, using defaults: ${result.error.message}`)
        return defaultConfig
      }
    }
  } catch (error) {
    logger.log(`@atrim/auto-trace: Failed to load config: ${error}`)
  }

  logger.log('@atrim/auto-trace: No config found, using defaults')
  return defaultConfig
}

/**
 * Default exporter configuration
 */
export const defaultExporterConfig: ExporterConfig = {
  type: 'otlp',
  processor: 'batch',
  batch: {
    scheduled_delay_millis: 1000,
    max_export_batch_size: 100
  }
}
