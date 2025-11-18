/**
 * Browser configuration loader using Effect Platform
 *
 * Provides HttpClient layer for the core ConfigLoader service
 * (No FileSystem in browser)
 */

import { Effect, Layer } from 'effect'
import { FetchHttpClient } from '@effect/platform'
import { ConfigLoader, ConfigLoaderLive, type InstrumentationConfig } from '@atrim/instrument-core'

/**
 * Complete ConfigLoader layer with browser platform dependencies
 *
 * Provides:
 * - ConfigLoader service
 * - HttpClient (from FetchHttpClient)
 * - No FileSystem (browser doesn't have filesystem access)
 */
export const WebConfigLoaderLive = ConfigLoaderLive.pipe(Layer.provide(FetchHttpClient.layer))

/**
 * Load configuration from URI (Promise-based convenience API)
 *
 * Automatically provides browser platform layers (HttpClient only)
 *
 * @param uri - Configuration URI (http://, https://, or relative path)
 * @returns Promise that resolves to validated configuration
 */
export async function loadConfig(uri: string): Promise<InstrumentationConfig> {
  const program = Effect.gen(function* () {
    const loader = yield* ConfigLoader
    return yield* loader.loadFromUri(uri)
  })

  return Effect.runPromise(program.pipe(Effect.provide(WebConfigLoaderLive)))
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
  const program = Effect.gen(function* () {
    const loader = yield* ConfigLoader
    return yield* loader.loadFromInline(content)
  })

  return Effect.runPromise(program.pipe(Effect.provide(WebConfigLoaderLive)))
}
