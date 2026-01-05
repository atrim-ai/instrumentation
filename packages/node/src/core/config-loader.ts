/**
 * Node.js configuration loader
 *
 * Provides configuration loading using native Node.js APIs (fs, fetch)
 * This module doesn't require Effect Platform, making it work without Effect installed.
 */

import { Effect } from 'effect'
import {
  type InstrumentationConfig,
  parseAndValidateConfig,
  defaultConfig
} from '@atrim/instrument-core'

/**
 * Load configuration from a file path using native Node.js fs
 */
async function loadFromFile(filePath: string): Promise<InstrumentationConfig> {
  const { readFile } = await import('fs/promises')
  const content = await readFile(filePath, 'utf-8')
  return parseAndValidateConfig(content)
}

/**
 * Load configuration from a URL using native fetch
 */
async function loadFromUrl(url: string): Promise<InstrumentationConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch config from ${url}: ${response.statusText}`)
  }
  const content = await response.text()
  return parseAndValidateConfig(content)
}

/**
 * Load configuration from URI (file path or URL)
 *
 * @param uri - Configuration URI (file://, http://, https://, or relative path)
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfig(
  uri: string,
  _options?: { cacheTimeout?: number }
): Promise<InstrumentationConfig> {
  // Handle URL protocols
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return loadFromUrl(uri)
  }

  // Handle file:// protocol
  if (uri.startsWith('file://')) {
    const filePath = uri.slice(7) // Remove 'file://'
    return loadFromFile(filePath)
  }

  // Treat as file path
  return loadFromFile(uri)
}

/**
 * Load configuration from inline content
 *
 * @param content - YAML string, JSON string, or plain object
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfigFromInline(
  content: string | unknown
): Promise<InstrumentationConfig> {
  return parseAndValidateConfig(content)
}

/**
 * Reset the config loader cache (no-op for native implementation)
 * @internal
 */
export function _resetConfigLoaderCache(): void {
  // No cache in native implementation
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
  // Priority 1: Explicit config object
  if (options.config) {
    return loadConfigFromInline(options.config)
  }

  // Priority 2: Environment variable
  const envConfigPath = process.env.ATRIM_INSTRUMENTATION_CONFIG
  if (envConfigPath) {
    return loadConfig(envConfigPath, options)
  }

  // Priority 3: Explicit options
  if (options.configUrl) {
    return loadConfig(options.configUrl, options)
  }
  if (options.configPath) {
    return loadConfig(options.configPath, options)
  }

  // Priority 4: Project root file
  const { existsSync } = await import('fs')
  const { join } = await import('path')

  const defaultPath = join(process.cwd(), 'instrumentation.yaml')
  if (existsSync(defaultPath)) {
    return loadConfig(defaultPath, options)
  }

  // Priority 5: Default config
  return defaultConfig
}

// ============================================================================
// Effect-Based API (for Effect users)
// ============================================================================

/**
 * Load configuration from URI (Effect version)
 */
export const loadConfigEffect = (
  uri: string,
  options?: { cacheTimeout?: number }
): Effect.Effect<InstrumentationConfig, Error> =>
  Effect.tryPromise({
    try: () => loadConfig(uri, options),
    catch: (error) => (error instanceof Error ? error : new Error(String(error)))
  })

/**
 * Load configuration from inline content (Effect version)
 */
export const loadConfigFromInlineEffect = (
  content: string | unknown
): Effect.Effect<InstrumentationConfig, Error> =>
  Effect.tryPromise({
    try: () => loadConfigFromInline(content),
    catch: (error) => (error instanceof Error ? error : new Error(String(error)))
  })

/**
 * Load configuration with priority order (Effect version)
 */
export const loadConfigWithOptionsEffect = (
  options: ConfigLoaderOptions = {}
): Effect.Effect<InstrumentationConfig, Error> =>
  Effect.tryPromise({
    try: () => loadConfigWithOptions(options),
    catch: (error) => (error instanceof Error ? error : new Error(String(error)))
  })
