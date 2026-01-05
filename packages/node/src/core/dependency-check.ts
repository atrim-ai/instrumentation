/**
 * Runtime dependency validation
 *
 * Checks that required peer dependencies are installed and provides
 * helpful error messages if they're missing.
 */

import { createRequire } from 'module'
import { Effect } from 'effect'
import { InitializationError } from './errors.js'

// Create a require function that works in ESM context
// This is needed because tsup's require polyfill doesn't support require.resolve
const require = createRequire(import.meta.url)

/**
 * Validates that @opentelemetry/api is installed (required peer dependency)
 */
export function validateOpenTelemetryApi(): void {
  try {
    // Dynamic import check - this will throw if not installed
    require.resolve('@opentelemetry/api')
  } catch {
    throw new Error(
      '@atrim/instrument-node requires @opentelemetry/api as a peer dependency.\n\n' +
        'Install it with:\n' +
        '  npm install @opentelemetry/api\n\n' +
        'Or with your preferred package manager:\n' +
        '  pnpm add @opentelemetry/api\n' +
        '  yarn add @opentelemetry/api\n' +
        '  bun add @opentelemetry/api'
    )
  }
}

/**
 * Validates Effect ecosystem dependencies (optional, for Effect integration)
 * Returns true if all Effect dependencies are available
 */
export function validateEffectDependencies(): boolean {
  const packages = ['effect', '@effect/opentelemetry', '@effect/platform']

  for (const pkg of packages) {
    try {
      require.resolve(pkg)
    } catch {
      return false
    }
  }

  return true
}

/**
 * Effect-based dependency validation
 */
export const validateDependencies: Effect.Effect<void, InitializationError> = Effect.try({
  try: () => validateOpenTelemetryApi(),
  catch: (error) =>
    new InitializationError({
      reason: error instanceof Error ? error.message : 'Dependency validation failed',
      cause: error
    })
})

/**
 * Check if Effect integration is available
 */
export const isEffectAvailable = Effect.sync(() => validateEffectDependencies())
