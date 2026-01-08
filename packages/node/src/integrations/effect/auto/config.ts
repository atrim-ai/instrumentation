/**
 * Auto-Tracing Configuration Loader
 *
 * Loads auto-tracing configuration from instrumentation.yaml
 * and provides a typed Effect service for accessing it.
 */

import { Effect, Context, Layer } from 'effect'
import {
  type AutoInstrumentationConfig,
  type InstrumentationConfig,
  type ExporterConfig,
  AutoInstrumentationConfigSchema,
  defaultConfig,
  logger
} from '@atrim/instrument-core'
import { loadConfigWithOptions, type ConfigLoaderOptions } from '../../../core/config-loader.js'

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
// Service Definition
// ============================================================================

/**
 * Service tag for auto-tracing configuration
 */
export class AutoTracingConfig extends Context.Tag('AutoTracingConfig')<
  AutoTracingConfig,
  AutoInstrumentationConfig
>() {}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load auto-tracing configuration from instrumentation.yaml
 *
 * Returns the config from effect.auto_instrumentation section,
 * or defaults if not specified.
 */
export const loadAutoTracingConfig = (
  options?: ConfigLoaderOptions
): Effect.Effect<AutoInstrumentationConfig, never, never> =>
  Effect.gen(function* () {
    // Load full config
    const config = yield* Effect.tryPromise({
      try: () => loadConfigWithOptions(options),
      catch: (error) => {
        logger.log(`@atrim/auto-trace: Failed to load config: ${error}`)
        return error
      }
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (!config) {
      logger.log('@atrim/auto-trace: No config found, using defaults')
      return defaultAutoTracingConfig
    }

    // Extract auto_instrumentation section
    const autoConfig = config.effect?.auto_instrumentation

    if (!autoConfig) {
      logger.log('@atrim/auto-trace: No auto_instrumentation config, using defaults')
      return defaultAutoTracingConfig
    }

    // Validate and merge with defaults
    const parsed = AutoInstrumentationConfigSchema.safeParse(autoConfig)
    if (!parsed.success) {
      logger.log(`@atrim/auto-trace: Invalid config, using defaults: ${parsed.error.message}`)
      return defaultAutoTracingConfig
    }

    logger.log('@atrim/auto-trace: Loaded config from instrumentation.yaml')
    return parsed.data
  })

/**
 * Load auto-tracing configuration synchronously from cache or default
 *
 * Note: This is a synchronous fallback when Effect runtime isn't available.
 * Prefer loadAutoTracingConfig() when possible.
 */
export const loadAutoTracingConfigSync = (): AutoInstrumentationConfig => {
  // For synchronous loading, we can only return defaults
  // The async version should be used for actual config loading
  return defaultAutoTracingConfig
}

// ============================================================================
// Layer
// ============================================================================

/**
 * Layer that provides auto-tracing configuration
 */
export const AutoTracingConfigLive = Layer.effect(AutoTracingConfig, loadAutoTracingConfig())

/**
 * Layer that provides custom auto-tracing configuration
 */
export const AutoTracingConfigLayer = (
  config: AutoInstrumentationConfig
): Layer.Layer<AutoTracingConfig> => Layer.succeed(AutoTracingConfig, config)

// ============================================================================
// Full Config Loading
// ============================================================================

/**
 * Load the full instrumentation config from instrumentation.yaml
 *
 * Returns the complete config including exporter settings for setting up
 * the full auto-instrumentation pipeline.
 */
export const loadFullConfig = (
  options?: ConfigLoaderOptions
): Effect.Effect<InstrumentationConfig, never, never> =>
  Effect.gen(function* () {
    const config = yield* Effect.tryPromise({
      try: () => loadConfigWithOptions(options),
      catch: (error) => {
        logger.log(`@atrim/auto-trace: Failed to load config: ${error}`)
        return error
      }
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (!config) {
      logger.log('@atrim/auto-trace: No config found, using defaults')
      return defaultConfig
    }

    return config
  })

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
