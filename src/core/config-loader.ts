/**
 * Configuration loading from file, URL, or environment
 *
 * Priority order (highest to lowest):
 * 1. Explicit config object (passed programmatically)
 * 2. Environment variable (ATRIM_INSTRUMENTATION_CONFIG)
 * 3. Project root file (./instrumentation.yaml)
 * 4. Default config (built-in defaults)
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parse as parseYAML } from 'yaml'
import { InstrumentationConfigSchema, type InstrumentationConfig } from './instrumentation-schema.js'

export interface ConfigLoaderOptions {
  configPath?: string
  configUrl?: string
  config?: InstrumentationConfig
  cacheTimeout?: number
}

// Security constraints
const SECURITY_DEFAULTS = {
  maxConfigSize: 1_000_000, // 1MB
  requestTimeout: 5_000, // 5 seconds
  maxRedirects: 3,
  allowedProtocols: ['https:'], // Only HTTPS for remote configs
  cacheTimeout: 300_000 // 5 minutes
}

// In-memory cache for remote configs
const configCache = new Map<
  string,
  {
    config: InstrumentationConfig
    timestamp: number
  }
>()

/**
 * Load configuration with priority order
 */
export async function loadConfig(options: ConfigLoaderOptions = {}): Promise<InstrumentationConfig> {
  // Priority 1: Explicit config object
  if (options.config) {
    return validateConfig(options.config)
  }

  // Priority 2: Environment variable
  const envConfigPath = process.env.ATRIM_INSTRUMENTATION_CONFIG
  if (envConfigPath) {
    if (envConfigPath.startsWith('http://') || envConfigPath.startsWith('https://')) {
      return loadConfigFromUrl(envConfigPath, options.cacheTimeout)
    }
    return loadConfigFromFile(envConfigPath)
  }

  // Priority 3: Explicit options
  if (options.configUrl) {
    return loadConfigFromUrl(options.configUrl, options.cacheTimeout)
  }
  if (options.configPath) {
    return loadConfigFromFile(options.configPath)
  }

  // Priority 4: Project root file
  const defaultPath = join(process.cwd(), 'instrumentation.yaml')
  if (existsSync(defaultPath)) {
    return loadConfigFromFile(defaultPath)
  }

  // Priority 5: Default config
  return getDefaultConfig()
}

/**
 * Load configuration from local file
 */
function loadConfigFromFile(filePath: string): InstrumentationConfig {
  try {
    const fileContents = readFileSync(filePath, 'utf8')

    // Security: Check file size
    if (fileContents.length > SECURITY_DEFAULTS.maxConfigSize) {
      throw new Error(`Config file exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`)
    }

    const rawConfig = parseYAML(fileContents)
    return validateConfig(rawConfig)
  } catch (error) {
    throw new Error(
      `Failed to load config from file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Load configuration from remote URL
 */
async function loadConfigFromUrl(
  url: string,
  cacheTimeout: number = SECURITY_DEFAULTS.cacheTimeout
): Promise<InstrumentationConfig> {
  // Security: Validate protocol
  const urlObj = new URL(url)
  if (!SECURITY_DEFAULTS.allowedProtocols.includes(urlObj.protocol)) {
    throw new Error(
      `Insecure protocol ${urlObj.protocol}. Only ${SECURITY_DEFAULTS.allowedProtocols.join(', ')} are allowed for remote configs.`
    )
  }

  // Check cache
  const cached = configCache.get(url)
  if (cached && Date.now() - cached.timestamp < cacheTimeout) {
    return cached.config
  }

  try {
    // Fetch with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SECURITY_DEFAULTS.requestTimeout)

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/yaml, text/yaml, text/x-yaml'
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Security: Check content length
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > SECURITY_DEFAULTS.maxConfigSize) {
      throw new Error(`Config exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`)
    }

    const text = await response.text()

    // Security: Double-check actual size
    if (text.length > SECURITY_DEFAULTS.maxConfigSize) {
      throw new Error(`Config exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`)
    }

    const rawConfig = parseYAML(text)
    const config = validateConfig(rawConfig)

    // Cache the result
    configCache.set(url, { config, timestamp: Date.now() })

    return config
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Config fetch timeout after ${SECURITY_DEFAULTS.requestTimeout}ms`)
    }
    throw new Error(
      `Failed to load config from URL ${url}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Validate configuration against schema
 */
function validateConfig(rawConfig: unknown): InstrumentationConfig {
  try {
    return InstrumentationConfigSchema.parse(rawConfig)
  } catch (error) {
    throw new Error(`Invalid configuration: ${error instanceof Error ? error.message : String(error)}`)
  }
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
      auto_extract_metadata: true
    }
  }
}

/**
 * Clear the config cache (useful for testing)
 */
export function clearConfigCache(): void {
  configCache.clear()
}
