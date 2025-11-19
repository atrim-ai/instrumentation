/**
 * ConfigLoader service using Effect Platform
 *
 * Provides URI-based configuration loading with pluggable platform services:
 * - FileSystem for file:// URIs (Node.js/Bun/Deno)
 * - HttpClient for http:// and https:// URIs (universal)
 *
 * This service has NO Node.js-specific dependencies - it depends only on
 * abstract Effect Platform services that are provided by environment-specific layers.
 */

import { Effect, Context, Layer } from 'effect'
import { FileSystem } from '@effect/platform/FileSystem'
import * as HttpClient from '@effect/platform/HttpClient'
import * as HttpClientRequest from '@effect/platform/HttpClientRequest'
import { parse as parseYAML } from 'yaml'
import {
  InstrumentationConfigSchema,
  type InstrumentationConfig
} from '../instrumentation-schema.js'
import { ConfigError, ConfigFileError, ConfigUrlError, ConfigValidationError } from '../errors.js'

// Security constraints
const SECURITY_DEFAULTS = {
  maxConfigSize: 1_000_000, // 1MB
  requestTimeout: 5_000 // 5 seconds
} as const

/**
 * ConfigLoader service interface
 */
export interface ConfigLoaderService {
  /**
   * Load configuration from a URI
   *
   * Supports:
   * - file:// URIs (uses FileSystem if available)
   * - http:// and https:// URIs (uses HttpClient)
   * - Relative paths (treated as file:// in Node, http:// in browser)
   *
   * @param uri - Configuration URI
   * @returns Effect that resolves to validated configuration (NO requirements)
   */
  readonly loadFromUri: (
    uri: string
  ) => Effect.Effect<
    InstrumentationConfig,
    ConfigError | ConfigFileError | ConfigUrlError | ConfigValidationError
  >

  /**
   * Load configuration from inline content (YAML, JSON, or object)
   *
   * @param content - YAML string, JSON string, or plain object
   * @returns Effect that resolves to validated configuration
   */
  readonly loadFromInline: (
    content: string | unknown
  ) => Effect.Effect<InstrumentationConfig, ConfigError | ConfigValidationError>
}

/**
 * ConfigLoader service tag
 */
export class ConfigLoader extends Context.Tag('ConfigLoader')<
  ConfigLoader,
  ConfigLoaderService
>() {}

/**
 * Parse and validate YAML content
 */
const parseYamlContent = (
  content: string,
  uri?: string
): Effect.Effect<InstrumentationConfig, ConfigValidationError> =>
  Effect.gen(function* () {
    // Parse YAML
    const parsed = yield* Effect.try({
      try: () => parseYAML(content),
      catch: (error) =>
        new ConfigValidationError({
          reason: uri ? `Failed to parse YAML from ${uri}` : 'Failed to parse YAML',
          cause: error
        })
    })

    // Validate schema
    return yield* Effect.try({
      try: () => InstrumentationConfigSchema.parse(parsed),
      catch: (error) =>
        new ConfigValidationError({
          reason: uri ? `Invalid configuration schema from ${uri}` : 'Invalid configuration schema',
          cause: error
        })
    })
  })

/**
 * Load configuration from file using captured FileSystem service
 */
const loadFromFileWithFs = (
  fs: FileSystem,
  path: string,
  uri: string
): Effect.Effect<InstrumentationConfig, ConfigFileError | ConfigValidationError> =>
  Effect.gen(function* () {
    // Read file
    const content = yield* fs.readFileString(path).pipe(
      Effect.mapError(
        (error) =>
          new ConfigFileError({
            reason: `Failed to read config file at ${uri}`,
            cause: error
          })
      )
    )

    // Security: Check file size
    if (content.length > SECURITY_DEFAULTS.maxConfigSize) {
      return yield* Effect.fail(
        new ConfigFileError({
          reason: `Config file exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`
        })
      )
    }

    // Parse and validate
    return yield* parseYamlContent(content, uri)
  })

/**
 * Load configuration from http using captured HttpClient service
 */
const loadFromHttpWithClient = (
  client: HttpClient.HttpClient,
  url: string
): Effect.Effect<InstrumentationConfig, ConfigUrlError | ConfigValidationError> =>
  Effect.scoped(
    Effect.gen(function* () {
      // Security: Reject non-HTTPS URLs
      if (url.startsWith('http://')) {
        return yield* Effect.fail(
          new ConfigUrlError({
            reason: 'Insecure protocol: only HTTPS URLs are allowed'
          })
        )
      }

      // Create request
      const request = HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeaders({
          Accept: 'application/yaml, text/yaml, application/x-yaml'
        })
      )

      // Execute request with timeout
      const response = yield* client.execute(request).pipe(
        Effect.timeout(`${SECURITY_DEFAULTS.requestTimeout} millis`),
        Effect.mapError((error) => {
          if (error._tag === 'TimeoutException') {
            return new ConfigUrlError({
              reason: `Config fetch timeout after ${SECURITY_DEFAULTS.requestTimeout}ms from ${url}`
            })
          }
          return new ConfigUrlError({
            reason: `Failed to load config from URL: ${url}`,
            cause: error
          })
        })
      )

      // Check HTTP status
      if (response.status >= 400) {
        return yield* Effect.fail(
          new ConfigUrlError({
            reason: `HTTP ${response.status} from ${url}`
          })
        )
      }

      // Get response text
      const text = yield* response.text.pipe(
        Effect.mapError(
          (error) =>
            new ConfigUrlError({
              reason: `Failed to read response body from ${url}`,
              cause: error
            })
        )
      )

      // Security: Check size
      if (text.length > SECURITY_DEFAULTS.maxConfigSize) {
        return yield* Effect.fail(
          new ConfigUrlError({
            reason: `Config exceeds maximum size of ${SECURITY_DEFAULTS.maxConfigSize} bytes`
          })
        )
      }

      // Parse and validate
      return yield* parseYamlContent(text, url)
    })
  )

/**
 * ConfigLoader service implementation
 *
 * Captures FileSystem and HttpClient dependencies at construction time
 */
const makeConfigLoader = Effect.gen(function* () {
  // Capture dependencies at construction time
  const fs = yield* Effect.serviceOption(FileSystem)
  const http = yield* HttpClient.HttpClient

  // Create the loadFromUri function
  const loadFromUriUncached = (uri: string) =>
    Effect.gen(function* () {
      // file:// protocol
      if (uri.startsWith('file://')) {
        const path = uri.slice(7) // Remove "file://"

        if (fs._tag === 'None') {
          return yield* Effect.fail(
            new ConfigFileError({
              reason: 'FileSystem not available (browser environment?)',
              cause: { uri }
            })
          )
        }

        return yield* loadFromFileWithFs(fs.value, path, uri)
      }

      // http:// or https:// protocol
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        return yield* loadFromHttpWithClient(http, uri)
      }

      // Relative path - try FileSystem first, fallback to HTTP
      if (fs._tag === 'Some') {
        // FileSystem available (Node.js environment)
        return yield* loadFromFileWithFs(fs.value, uri, uri)
      } else {
        // No FileSystem (browser environment) - treat as HTTP
        // Relative URLs will be resolved by browser fetch to current origin
        return yield* loadFromHttpWithClient(http, uri)
      }
    })

  // Cache the loadFromUri function with 5 minute TTL (default cache timeout)
  const loadFromUriCached = yield* Effect.cachedFunction(loadFromUriUncached)

  return ConfigLoader.of({
    loadFromUri: loadFromUriCached,

    loadFromInline: (content: string | unknown) =>
      Effect.gen(function* () {
        // If string, parse as YAML
        if (typeof content === 'string') {
          return yield* parseYamlContent(content)
        }

        // Already an object - just validate schema
        return yield* Effect.try({
          try: () => InstrumentationConfigSchema.parse(content),
          catch: (error) =>
            new ConfigValidationError({
              reason: 'Invalid configuration schema',
              cause: error
            })
        })
      })
  })
})

/**
 * ConfigLoader Live layer
 *
 * Provides ConfigLoader service implementation.
 * Requires HttpClient to be provided by platform-specific layers.
 * FileSystem is optional (for browser compatibility).
 */
export const ConfigLoaderLive = Layer.effect(ConfigLoader, makeConfigLoader)
