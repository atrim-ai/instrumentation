/**
 * Service Detection Utilities
 *
 * Auto-detects service name and version from environment variables and package.json
 * Uses Effect for typed error handling and composability
 */

import { Effect } from 'effect'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ServiceDetectionError } from './errors.js'

export interface ServiceInfo {
  name: string
  version?: string | undefined
}

/**
 * Detect service name and version (Effect version)
 *
 * Priority order:
 * 1. OTEL_SERVICE_NAME environment variable
 * 2. package.json name field
 * 3. Fallback to 'unknown-service'
 *
 * Version:
 * 1. OTEL_SERVICE_VERSION environment variable
 * 2. package.json version field
 * 3. undefined (not set)
 *
 * @returns Effect that yields ServiceInfo or ServiceDetectionError
 */
export const detectServiceInfo: Effect.Effect<ServiceInfo, ServiceDetectionError> = Effect.gen(
  function* () {
    // Try environment variables first
    const envServiceName = process.env.OTEL_SERVICE_NAME
    const envServiceVersion = process.env.OTEL_SERVICE_VERSION

    if (envServiceName) {
      return {
        name: envServiceName,
        version: envServiceVersion
      }
    }

    // Try package.json
    const packageJsonPath = join(process.cwd(), 'package.json')

    const packageJsonContent = yield* Effect.tryPromise({
      try: () => readFile(packageJsonPath, 'utf-8'),
      catch: (error) =>
        new ServiceDetectionError({
          reason: `Failed to read package.json at ${packageJsonPath}`,
          cause: error
        })
    })

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(packageJsonContent)
    } catch (error) {
      yield* Effect.fail(
        new ServiceDetectionError({
          reason: 'Invalid JSON in package.json',
          cause: error
        })
      )
    }

    // Extract name and version
    if (typeof parsed === 'object' && parsed !== null) {
      const packageJson = parsed as {
        name?: string
        version?: string
      }

      if (packageJson.name) {
        return {
          name: packageJson.name,
          version: envServiceVersion || packageJson.version
        }
      }
    }

    // If package.json exists but has no name, fail with error
    return yield* Effect.fail(
      new ServiceDetectionError({
        reason: 'package.json exists but has no "name" field'
      })
    )
  }
)

/**
 * Get service name with fallback (Effect version)
 *
 * Never fails - returns 'unknown-service' if detection fails
 */
export const getServiceName: Effect.Effect<string, never> = detectServiceInfo.pipe(
  Effect.map((info) => info.name),
  Effect.catchAll(() => Effect.succeed('unknown-service'))
)

/**
 * Get service version with fallback (Effect version)
 *
 * Never fails - returns undefined if detection fails
 */
export const getServiceVersion: Effect.Effect<string | undefined, never> = detectServiceInfo.pipe(
  Effect.map((info) => info.version),
  Effect.catchAll(() => Effect.succeed(undefined))
)

/**
 * Get service info with fallback (Effect version)
 *
 * Never fails - returns default ServiceInfo if detection fails
 */
export const getServiceInfoWithFallback: Effect.Effect<ServiceInfo, never> = detectServiceInfo.pipe(
  Effect.catchAll(() =>
    Effect.succeed({
      name: 'unknown-service',
      version: process.env.OTEL_SERVICE_VERSION
    })
  )
)

// ============================================================================
// Promise API (Backward Compatible)
// ============================================================================

/**
 * Detect service name and version (Promise version)
 *
 * @deprecated Use `detectServiceInfo` Effect API for better error handling
 * @returns Promise that resolves to ServiceInfo with fallback
 */
export async function detectServiceInfoAsync(): Promise<ServiceInfo> {
  return Effect.runPromise(getServiceInfoWithFallback)
}

/**
 * Get service name with fallback (Promise version)
 *
 * @deprecated Use `getServiceName` Effect API
 */
export async function getServiceNameAsync(): Promise<string> {
  return Effect.runPromise(getServiceName)
}

/**
 * Get service version if available (Promise version)
 *
 * @deprecated Use `getServiceVersion` Effect API
 */
export async function getServiceVersionAsync(): Promise<string | undefined> {
  return Effect.runPromise(getServiceVersion)
}
