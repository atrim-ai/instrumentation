/**
 * Public API for standard OpenTelemetry usage
 *
 * This module provides the main entry point for initializing pattern-based
 * span filtering in any Node.js application.
 */

import { loadConfig, type ConfigLoaderOptions } from './core/config-loader.js'
import { initializePatternMatcher } from './core/pattern-matcher.js'

/**
 * Global initialization state
 */
let initialized = false

/**
 * Initialize pattern-based instrumentation
 *
 * This function loads the configuration and sets up the global pattern matcher.
 * Call this once at application startup before creating any spans.
 *
 * Configuration priority (highest to lowest):
 * 1. Explicit config object (options.config)
 * 2. Environment variable (ATRIM_INSTRUMENTATION_CONFIG)
 * 3. Explicit path/URL (options.configPath or options.configUrl)
 * 4. Project root file (./instrumentation.yaml)
 * 5. Default config (built-in defaults)
 *
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * // Zero-config (looks for ./instrumentation.yaml)
 * initializeInstrumentation()
 *
 * // With explicit config file
 * initializeInstrumentation({
 *   configPath: './config/custom-instrumentation.yaml'
 * })
 *
 * // With remote config URL
 * initializeInstrumentation({
 *   configUrl: 'https://config.company.com/instrumentation.yaml',
 *   cacheTimeout: 300_000 // 5 minutes
 * })
 *
 * // With programmatic config
 * initializeInstrumentation({
 *   config: {
 *     version: '1.0',
 *     instrumentation: {
 *       enabled: true,
 *       instrument_patterns: [{ pattern: '^app\\.' }],
 *       ignore_patterns: [{ pattern: '^test\\.' }]
 *     }
 *   }
 * })
 * ```
 */
export async function initializeInstrumentation(options: ConfigLoaderOptions = {}): Promise<void> {
  if (initialized) {
    console.warn('@atrim/instrumentation: Already initialized. Skipping re-initialization.')
    return
  }

  try {
    // Load configuration
    const config = await loadConfig(options)

    // Initialize pattern matcher
    initializePatternMatcher(config)

    // Mark as initialized
    initialized = true

    // Log initialization
    if (config.instrumentation.enabled) {
      const instrumentCount = config.instrumentation.instrument_patterns.filter(
        (p) => p.enabled !== false
      ).length
      const ignoreCount = config.instrumentation.ignore_patterns.length

      console.log('@atrim/instrumentation: Initialized successfully')
      console.log(`  - Enabled: true`)
      console.log(`  - Instrument patterns: ${instrumentCount}`)
      console.log(`  - Ignore patterns: ${ignoreCount}`)

      if (config.instrumentation.description) {
        console.log(`  - Description: ${config.instrumentation.description}`)
      }
    } else {
      console.log('@atrim/instrumentation: Initialized (disabled via config)')
    }
  } catch (error) {
    console.error(
      '@atrim/instrumentation: Failed to initialize:',
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

/**
 * Check if instrumentation has been initialized
 */
export function isInitialized(): boolean {
  return initialized
}

/**
 * Reset initialization state (useful for testing)
 */
export function resetInitialization(): void {
  initialized = false
}
