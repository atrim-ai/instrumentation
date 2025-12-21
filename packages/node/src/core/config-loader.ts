/**
 * Node.js configuration loader using Effect Platform
 *
 * Provides FileSystem and HttpClient layers for the core ConfigLoader service
 */

import { Effect, Layer } from 'effect'
import { NodeContext } from '@effect/platform-node'
import { FetchHttpClient } from '@effect/platform'
import {
  ConfigLoader,
  ConfigLoaderLive,
  type InstrumentationConfig,
  type ConfigLoaderService
} from '@atrim/instrument-core'

/**
 * Complete ConfigLoader layer with all Node.js platform dependencies
 *
 * Provides:
 * - ConfigLoader service
 * - FileSystem (from NodeContext)
 * - HttpClient (from FetchHttpClient)
 */
export const NodeConfigLoaderLive = ConfigLoaderLive.pipe(
  Layer.provide(Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer))
)

/**
 * Singleton cached config loader for sharing cache across calls
 */
let cachedLoaderPromise: Promise<ConfigLoaderService> | null = null

function getCachedLoader(): Promise<ConfigLoaderService> {
  if (!cachedLoaderPromise) {
    cachedLoaderPromise = Effect.runPromise(
      Effect.gen(function* () {
        return yield* ConfigLoader
      }).pipe(Effect.provide(NodeConfigLoaderLive))
    )
  }
  return cachedLoaderPromise
}

/**
 * Reset the cached loader (for testing purposes)
 * @internal
 */
export function _resetConfigLoaderCache(): void {
  cachedLoaderPromise = null
}

/**
 * Load configuration from URI (Promise-based convenience API)
 *
 * Automatically provides Node.js platform layers (FileSystem + HttpClient)
 *
 * @param uri - Configuration URI (file://, http://, https://, or relative path)
 * @param options - Optional loading options (e.g., to disable caching)
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfig(
  uri: string,
  options?: { cacheTimeout?: number }
): Promise<InstrumentationConfig> {
  // If cacheTimeout is 0, bypass cache
  if (options?.cacheTimeout === 0) {
    const program = Effect.gen(function* () {
      const loader = yield* ConfigLoader
      return yield* loader.loadFromUri(uri)
    })
    return Effect.runPromise(program.pipe(Effect.provide(NodeConfigLoaderLive)))
  }

  const loader = await getCachedLoader()
  return Effect.runPromise(loader.loadFromUri(uri))
}

/**
 * Load configuration from inline content (Promise-based convenience API)
 *
 * @param content - YAML string, JSON string, or plain object
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfigFromInline(
  content: string | unknown
): Promise<InstrumentationConfig> {
  const loader = await getCachedLoader()
  return Effect.runPromise(loader.loadFromInline(content))
}

/**
 * Legacy options interface for backward compatibility
 */
export interface ConfigLoaderOptions {
  configPath?: string
  configUrl?: string
  config?: InstrumentationConfig
  cacheTimeout?: number
}

/**
 * Get default configuration
 */
function getDefaultConfig(): InstrumentationConfig {
  return {
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
      auto_extract_metadata: true
    }
  }
}

/**
 * Load configuration with priority order (backward compatible API)
 *
 * Priority order (highest to lowest):
 * 1. Explicit config object (options.config)
 * 2. Environment variable (ATRIM_INSTRUMENTATION_CONFIG)
 * 3. Explicit path/URL (options.configPath or options.configUrl)
 * 4. Project root file (./instrumentation.yaml)
 * 5. Default config (built-in defaults)
 *
 * @param options - Configuration options
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfigWithOptions(
  options: ConfigLoaderOptions = {}
): Promise<InstrumentationConfig> {
  // Extract cacheTimeout option
  const loadOptions =
    options.cacheTimeout !== undefined ? { cacheTimeout: options.cacheTimeout } : undefined

  // Priority 1: Explicit config object
  if (options.config) {
    return loadConfigFromInline(options.config)
  }

  // Priority 2: Environment variable
  const envConfigPath = process.env.ATRIM_INSTRUMENTATION_CONFIG
  if (envConfigPath) {
    return loadConfig(envConfigPath, loadOptions)
  }

  // Priority 3: Explicit options
  if (options.configUrl) {
    return loadConfig(options.configUrl, loadOptions)
  }
  if (options.configPath) {
    return loadConfig(options.configPath, loadOptions)
  }

  // Priority 4: Project root file
  const { existsSync } = await import('fs')
  const { join } = await import('path')

  const defaultPath = join(process.cwd(), 'instrumentation.yaml')
  if (existsSync(defaultPath)) {
    return loadConfig(defaultPath, loadOptions)
  }

  // Priority 5: Default config
  return getDefaultConfig()
}
