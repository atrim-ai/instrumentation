/**
 * Configuration loading from file, URL, or environment
 *
 * Priority order (highest to lowest):
 * 1. Explicit config object (passed programmatically)
 * 2. Environment variable (ATRIM_INSTRUMENTATION_CONFIG)
 * 3. Project root file (./instrumentation.yaml)
 * 4. Default config (built-in defaults)
 *
 * Uses Effect for typed error handling, automatic caching, retry logic, and timeouts.
 */

import { Effect, Duration, Schedule, Cache } from 'effect'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parse as parseYAML } from 'yaml'
import {
  InstrumentationConfigSchema,
  type InstrumentationConfig
} from './instrumentation-schema.js'
import { ConfigError, ConfigFileError, ConfigUrlError, ConfigValidationError } from './errors.js'

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
} as const

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
 * Validate configuration against schema (Effect version)
 */
const validateConfigEffect = (
  rawConfig: unknown
): Effect.Effect<InstrumentationConfig, ConfigValidationError> =>
  Effect.try({
    try: () => InstrumentationConfigSchema.parse(rawConfig),
    catch: (error) =>
      new ConfigValidationError({
        reason: 'Invalid configuration schema',
        cause: error
      })
  })

/**
 * Load configuration from local file (Effect version)
 */
const loadConfigFromFileEffect = (
  filePath: string
): Effect.Effect<InstrumentationConfig, ConfigFileError | ConfigValidationError> =>
  Effect.gen(function* () {
    // Read file
    const fileContents = yield* Effect.try({
      try: () => readFileSync(filePath, 'utf8'),
      catch: (error) =>
        new ConfigFileError({
          reason: `Failed to read config file at ${filePath}`,
          cause: error
        })
    })

    // Security: Check file size
    if (fileContents.length > SECURITY_DEFAULTS.maxConfigSize) {
      return yield* Effect.fail(
        new ConfigFileError({
          reason: `Config file exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`
        })
      )
    }

    // Parse YAML
    let rawConfig: unknown
    try {
      rawConfig = parseYAML(fileContents)
    } catch (error) {
      return yield* Effect.fail(
        new ConfigValidationError({
          reason: 'Invalid YAML syntax',
          cause: error
        })
      )
    }

    // Validate schema
    return yield* validateConfigEffect(rawConfig)
  })

/**
 * Fetch and parse config from URL (Effect version)
 */
const fetchAndParseConfig = (
  url: string
): Effect.Effect<InstrumentationConfig, ConfigUrlError | ConfigValidationError> =>
  Effect.gen(function* () {
    // Security: Validate protocol
    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch (error) {
      return yield* Effect.fail(
        new ConfigUrlError({
          reason: `Invalid URL: ${url}`,
          cause: error
        })
      )
    }

    if (!SECURITY_DEFAULTS.allowedProtocols.includes(urlObj.protocol as 'https:')) {
      return yield* Effect.fail(
        new ConfigUrlError({
          reason: `Insecure protocol ${urlObj.protocol}. Only ${SECURITY_DEFAULTS.allowedProtocols.join(', ')} are allowed`
        })
      )
    }

    // Fetch with timeout and retry
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          redirect: 'follow',
          headers: {
            Accept: 'application/yaml, text/yaml, text/x-yaml'
          }
        }),
      catch: (error) =>
        new ConfigUrlError({
          reason: `Failed to load config from URL ${url}`,
          cause: error
        })
    }).pipe(
      Effect.timeout(Duration.millis(SECURITY_DEFAULTS.requestTimeout)),
      Effect.retry({
        times: 3,
        schedule: Schedule.exponential(Duration.millis(100))
      }),
      Effect.catchAll((error) => {
        // Handle timeout separately
        if (error._tag === 'TimeoutException') {
          return Effect.fail(
            new ConfigUrlError({
              reason: `Config fetch timeout after ${SECURITY_DEFAULTS.requestTimeout}ms`
            })
          )
        }
        return Effect.fail(error as ConfigUrlError)
      })
    )

    // Validate response
    if (!response.ok) {
      return yield* Effect.fail(
        new ConfigUrlError({
          reason: `HTTP ${response.status}: ${response.statusText}`
        })
      )
    }

    // Security: Check content length
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > SECURITY_DEFAULTS.maxConfigSize) {
      return yield* Effect.fail(
        new ConfigUrlError({
          reason: `Config exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`
        })
      )
    }

    // Read response text
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new ConfigUrlError({
          reason: 'Failed to read response body',
          cause: error
        })
    })

    // Security: Double-check actual size
    if (text.length > SECURITY_DEFAULTS.maxConfigSize) {
      return yield* Effect.fail(
        new ConfigUrlError({
          reason: `Config exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`
        })
      )
    }

    // Parse YAML
    let rawConfig: unknown
    try {
      rawConfig = parseYAML(text)
    } catch (error) {
      return yield* Effect.fail(
        new ConfigValidationError({
          reason: 'Invalid YAML syntax',
          cause: error
        })
      )
    }

    // Validate schema
    return yield* validateConfigEffect(rawConfig)
  })

/**
 * Create cached config loader with Effect.cached
 */
const makeConfigCache = () =>
  Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(5),
    lookup: (url: string) => fetchAndParseConfig(url)
  })

// Global cache instance
let cacheInstance: Cache.Cache<
  string,
  InstrumentationConfig,
  ConfigUrlError | ConfigValidationError
> | null = null

/**
 * Get or create cache instance
 */
const getCache = Effect.gen(function* () {
  if (!cacheInstance) {
    cacheInstance = yield* makeConfigCache()
  }
  return cacheInstance
})

/**
 * Load configuration from URL with caching (Effect version)
 */
const loadConfigFromUrlEffect = (
  url: string,
  cacheTimeout: number = SECURITY_DEFAULTS.cacheTimeout
): Effect.Effect<InstrumentationConfig, ConfigUrlError | ConfigValidationError> =>
  Effect.gen(function* () {
    // Bypass cache if timeout is 0
    if (cacheTimeout === 0) {
      return yield* fetchAndParseConfig(url)
    }

    // Use cache
    const cache = yield* getCache
    return yield* cache.get(url)
  })

/**
 * Load configuration with priority order (Effect version)
 */
export const loadConfigEffect = (
  options: ConfigLoaderOptions = {}
): Effect.Effect<
  InstrumentationConfig,
  ConfigError | ConfigFileError | ConfigUrlError | ConfigValidationError
> =>
  Effect.gen(function* () {
    // Priority 1: Explicit config object
    if (options.config) {
      return yield* validateConfigEffect(options.config)
    }

    // Priority 2: Environment variable
    const envConfigPath = process.env.ATRIM_INSTRUMENTATION_CONFIG
    if (envConfigPath) {
      if (envConfigPath.startsWith('http://') || envConfigPath.startsWith('https://')) {
        return yield* loadConfigFromUrlEffect(envConfigPath, options.cacheTimeout)
      }
      return yield* loadConfigFromFileEffect(envConfigPath)
    }

    // Priority 3: Explicit options
    if (options.configUrl) {
      return yield* loadConfigFromUrlEffect(options.configUrl, options.cacheTimeout)
    }
    if (options.configPath) {
      return yield* loadConfigFromFileEffect(options.configPath)
    }

    // Priority 4: Project root file
    const defaultPath = join(process.cwd(), 'instrumentation.yaml')
    const exists = yield* Effect.sync(() => existsSync(defaultPath))

    if (exists) {
      return yield* loadConfigFromFileEffect(defaultPath)
    }

    // Priority 5: Default config
    return getDefaultConfig()
  })

// ============================================================================
// Promise API (Backward Compatible)
// ============================================================================

/**
 * Load configuration with priority order (Promise version)
 *
 * Throws errors for backward compatibility with existing behavior.
 * Use `loadConfigEffect` for typed error handling in error channel.
 */
export async function loadConfig(
  options: ConfigLoaderOptions = {}
): Promise<InstrumentationConfig> {
  return Effect.runPromise(
    loadConfigEffect(options).pipe(
      // Convert typed errors to regular Error with reason message for backward compatibility
      Effect.mapError((error) => {
        const message = error.reason
        const newError = new Error(message)
        newError.cause = error.cause
        return newError
      })
    )
  )
}

/**
 * Clear the config cache (useful for testing)
 */
export function clearConfigCache(): void {
  cacheInstance = null
}
